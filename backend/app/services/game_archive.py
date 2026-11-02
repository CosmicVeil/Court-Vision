"""
game_archive.py — store finished NBA games in PostgreSQL for per-game model training.

Each completed game is fetched once from ESPN's summary endpoint and written to:
  games              one row per game (date, teams, score, quarters, venue, betting line)
  team_game_stats    one row per team per game (shooting, rebounds, paint/fast-break points, ...)
  player_game_stats  one row per player per game (full box score line, starter, DNP reason)
  game_raw_summaries the trimmed ESPN JSON (box score, header, odds, play-by-play), so new
                     features can be extracted later without re-downloading

The view player_game_features adds leakage-free context for training (rest days,
back-to-backs, rolling averages over *previous* games only).

Games are archived three ways:
  - automatically, in the background, when /api/games/today sees a game go final
  - by a recent-days catch-up at startup, every 24 hours while the server runs, and at most
    hourly from the live-games feed
  - via scripts/archive_games.py (daily catch-up and historical backfill)
"""

import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone
from typing import Dict, Iterable, List, Optional, Tuple
from zoneinfo import ZoneInfo

import requests
from psycopg.types.json import Jsonb

from app import db
from app.services.live_games import TEAM_IDS
from app.utils.player_ids import nba_player_id
from app.utils.player_names import normalize_player_name

_ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba"
_SCOREBOARD = f"{_ESPN_BASE}/scoreboard"
_SUMMARY = f"{_ESPN_BASE}/summary"
_ET = ZoneInfo("America/New_York")

# Sections of the ESPN summary kept in game_raw_summaries (~35 KB compressed per game).
# News, articles, standings and injuries are dropped: they reflect the fetch date, not the game.
RAW_SECTIONS = ("header", "boxscore", "gameInfo", "pickcenter", "plays", "format")

ESPN_TO_TRICODE = {"GS": "GSW", "SA": "SAS", "NO": "NOP", "NY": "NYK", "WSH": "WAS", "UTAH": "UTA"}

# Set by state.initialize() once the database is ready; off in tests and scripts.
auto_archive_enabled = False

SCHEMA = """
CREATE TABLE IF NOT EXISTS games (
    game_id         TEXT PRIMARY KEY,
    season          INTEGER NOT NULL,          -- ESPN season year: 2026 = 2025-26
    season_label    TEXT NOT NULL,             -- '2025-26'
    season_type     INTEGER NOT NULL,          -- 1 preseason, 2 regular, 3 playoffs, 5 play-in
    game_date       DATE NOT NULL,             -- US Eastern date of tip-off
    tipoff          TIMESTAMPTZ,
    home_team       TEXT NOT NULL,
    away_team       TEXT NOT NULL,
    home_score      INTEGER,
    away_score      INTEGER,
    home_periods    INTEGER[],
    away_periods    INTEGER[],
    num_periods     INTEGER,                   -- 4 = regulation, 5+ = overtime
    neutral_site    BOOLEAN,
    venue           TEXT,
    venue_city      TEXT,
    attendance      INTEGER,
    home_record     TEXT,
    away_record     TEXT,
    spread          NUMERIC,                   -- closing line from the home team's view
    over_under      NUMERIC,
    home_moneyline  INTEGER,
    away_moneyline  INTEGER,
    officials       TEXT[],
    archived_at     TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS games_game_date_idx ON games (game_date);

CREATE TABLE IF NOT EXISTS team_game_stats (
    game_id         TEXT NOT NULL REFERENCES games(game_id) ON DELETE CASCADE,
    team            TEXT NOT NULL,
    opponent        TEXT NOT NULL,
    is_home         BOOLEAN NOT NULL,
    won             BOOLEAN,
    pts             INTEGER,
    fgm INTEGER, fga INTEGER, fg3m INTEGER, fg3a INTEGER, ftm INTEGER, fta INTEGER,
    oreb INTEGER, dreb INTEGER, reb INTEGER,
    ast INTEGER, stl INTEGER, blk INTEGER, tov INTEGER, team_tov INTEGER,
    pf INTEGER, technical_fouls INTEGER, flagrant_fouls INTEGER,
    pts_off_tov     INTEGER,
    fast_break_pts  INTEGER,
    paint_pts       INTEGER,
    largest_lead    INTEGER,
    lead_changes    INTEGER,
    PRIMARY KEY (game_id, team)
);

CREATE TABLE IF NOT EXISTS player_game_stats (
    game_id         TEXT NOT NULL REFERENCES games(game_id) ON DELETE CASCADE,
    espn_player_id  BIGINT NOT NULL,
    nba_player_id   BIGINT,                    -- NBA.com ID, the app-wide player ID (app.utils.player_ids)
    player_name     TEXT NOT NULL,
    player_key      TEXT NOT NULL,             -- normalize_player_name(), joins to the season .pkl data
    team            TEXT NOT NULL,
    opponent        TEXT NOT NULL,
    is_home         BOOLEAN NOT NULL,
    game_date       DATE NOT NULL,
    season          INTEGER NOT NULL,
    season_type     INTEGER NOT NULL,
    position        TEXT,
    jersey          TEXT,
    starter         BOOLEAN,
    did_not_play    BOOLEAN,
    dnp_reason      TEXT,
    ejected         BOOLEAN,
    minutes         REAL,
    pts INTEGER, fgm INTEGER, fga INTEGER, fg3m INTEGER, fg3a INTEGER, ftm INTEGER, fta INTEGER,
    oreb INTEGER, dreb INTEGER, reb INTEGER,
    ast INTEGER, stl INTEGER, blk INTEGER, tov INTEGER, pf INTEGER,
    plus_minus      INTEGER,
    PRIMARY KEY (game_id, espn_player_id)
);
CREATE INDEX IF NOT EXISTS player_game_stats_player_idx ON player_game_stats (espn_player_id, game_date);
CREATE INDEX IF NOT EXISTS player_game_stats_key_idx ON player_game_stats (player_key);
ALTER TABLE player_game_stats ADD COLUMN IF NOT EXISTS nba_player_id BIGINT;
CREATE INDEX IF NOT EXISTS player_game_stats_nba_idx ON player_game_stats (nba_player_id, game_date);

CREATE TABLE IF NOT EXISTS game_raw_summaries (
    game_id     TEXT PRIMARY KEY REFERENCES games(game_id) ON DELETE CASCADE,
    payload     JSONB NOT NULL,
    fetched_at  TIMESTAMPTZ DEFAULT now()
);

-- Birth date, height and weight for players missing from the season .pkl (rookies),
-- from ESPN's athlete API. Birth date rather than age, so it never goes stale.
CREATE TABLE IF NOT EXISTS player_bios (
    espn_player_id  BIGINT PRIMARY KEY,
    birth_date      DATE,
    height_in       REAL,
    weight_lb       REAL,
    fetched_at      TIMESTAMPTZ DEFAULT now()
);

-- One row per player-game that was actually played, with context known *before* tip-off.
-- Rolling windows end at the previous game, so they never include the game being predicted.
DROP VIEW IF EXISTS player_game_features;
CREATE VIEW player_game_features AS
WITH played AS (
    SELECT p.*, g.tipoff, g.spread, g.over_under, g.num_periods,
           CASE WHEN p.is_home THEN g.spread ELSE -g.spread END AS team_spread
    FROM player_game_stats p
    JOIN games g USING (game_id)
    WHERE NOT p.did_not_play AND p.minutes > 0
)
SELECT
    played.*,
    game_date - LAG(game_date) OVER w                          AS rest_days,
    COALESCE(game_date - LAG(game_date) OVER w = 1, FALSE)     AS back_to_back,
    ROW_NUMBER() OVER w - 1                                    AS games_before,
    AVG(minutes) OVER last5  AS min_last5,  AVG(minutes) OVER last10 AS min_last10,
    AVG(pts)     OVER last5  AS pts_last5,  AVG(pts)     OVER last10 AS pts_last10,
    AVG(reb)     OVER last5  AS reb_last5,  AVG(reb)     OVER last10 AS reb_last10,
    AVG(ast)     OVER last5  AS ast_last5,  AVG(ast)     OVER last10 AS ast_last10,
    AVG(stl)     OVER last10 AS stl_last10, AVG(blk)     OVER last10 AS blk_last10,
    AVG(tov)     OVER last10 AS tov_last10, AVG(fg3m)    OVER last10 AS fg3m_last10,
    AVG(fga)     OVER last10 AS fga_last10, AVG(fta)     OVER last10 AS fta_last10,
    AVG(pts)     OVER season_to_date AS pts_season_avg,
    AVG(reb)     OVER season_to_date AS reb_season_avg,
    AVG(ast)     OVER season_to_date AS ast_season_avg,
    AVG(minutes) OVER season_to_date AS min_season_avg,
    AVG(starter::int) OVER last10    AS starter_rate_last10
FROM played
WINDOW
    w              AS (PARTITION BY espn_player_id ORDER BY game_date, game_id),
    last5          AS (w ROWS BETWEEN 5 PRECEDING AND 1 PRECEDING),
    last10         AS (w ROWS BETWEEN 10 PRECEDING AND 1 PRECEDING),
    season_to_date AS (PARTITION BY espn_player_id, season ORDER BY game_date, game_id
                       ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING);
"""


def init_archive_tables(conn) -> None:
    conn.execute(SCHEMA)


# ---------------------------------------------------------------------------
# Parsing (pure functions — no network or database)
# ---------------------------------------------------------------------------

def _tricode(abbr: str) -> str:
    return ESPN_TO_TRICODE.get(abbr, abbr)


def _int(value) -> Optional[int]:
    try:
        return int(float(str(value).replace("+", "")))
    except (TypeError, ValueError):
        return None


def _float(value) -> Optional[float]:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def parse_player_bio(payload: Dict) -> Dict:
    """Birth date, height (in) and weight (lb) from an ESPN core athlete payload; missing -> None."""
    try:
        birth_date = date.fromisoformat(str(payload["dateOfBirth"])[:10])
    except (KeyError, TypeError, ValueError):
        birth_date = None
    return {"birth_date": birth_date, "height_in": _float(payload.get("height")),
            "weight_lb": _float(payload.get("weight"))}


def _age_on(birth_date: Optional[date], today: date) -> Optional[int]:
    if birth_date is None:
        return None
    return today.year - birth_date.year - ((today.month, today.day) < (birth_date.month, birth_date.day))


def _made_att(value):
    try:
        made, att = str(value).split("-")
        return int(made), int(att)
    except (TypeError, ValueError):
        return None, None


def _minutes(value) -> Optional[float]:
    """ESPN gives whole minutes ('34') or occasionally 'MM:SS'."""
    if value in (None, "", "--"):
        return None
    text = str(value)
    if ":" in text:
        mins, secs = text.split(":", 1)
        return round(int(mins) + int(secs) / 60, 2)
    return float(text)


def season_label(season_year: int) -> str:
    return f"{season_year - 1}-{str(season_year)[2:]}"


def _tipoff(value: str) -> Optional[datetime]:
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (AttributeError, ValueError):
        return None


def _parse_odds(pickcenter: List[Dict]) -> Dict:
    odds = {"spread": None, "over_under": None, "home_moneyline": None, "away_moneyline": None}
    if not pickcenter:
        return odds
    line = pickcenter[0]
    odds["spread"] = line.get("spread")
    odds["over_under"] = line.get("overUnder")
    odds["home_moneyline"] = _int((line.get("homeTeamOdds") or {}).get("moneyLine"))
    odds["away_moneyline"] = _int((line.get("awayTeamOdds") or {}).get("moneyLine"))
    return odds


_TEAM_STAT_FIELDS = {
    "totalRebounds": "reb", "offensiveRebounds": "oreb", "defensiveRebounds": "dreb",
    "assists": "ast", "steals": "stl", "blocks": "blk", "turnovers": "tov",
    "teamTurnovers": "team_tov", "fouls": "pf", "technicalFouls": "technical_fouls",
    "flagrantFouls": "flagrant_fouls", "turnoverPoints": "pts_off_tov",
    "fastBreakPoints": "fast_break_pts", "pointsInPaint": "paint_pts",
    "largestLead": "largest_lead", "leadChanges": "lead_changes",
}

_PLAYER_STAT_FIELDS = {
    "points": "pts", "rebounds": "reb", "offensiveRebounds": "oreb",
    "defensiveRebounds": "dreb", "assists": "ast", "steals": "stl", "blocks": "blk",
    "turnovers": "tov", "fouls": "pf", "plusMinus": "plus_minus",
}

_SHOOTING_FIELDS = {
    "fieldGoalsMade-fieldGoalsAttempted": ("fgm", "fga"),
    "threePointFieldGoalsMade-threePointFieldGoalsAttempted": ("fg3m", "fg3a"),
    "freeThrowsMade-freeThrowsAttempted": ("ftm", "fta"),
}


def parse_summary(summary: Dict) -> Optional[Dict]:
    """Turn an ESPN summary into {'game', 'teams', 'players'} rows, or None if not final."""
    header = summary.get("header") or {}
    comp = (header.get("competitions") or [{}])[0]
    status = (comp.get("status") or {}).get("type") or {}
    if not status.get("completed"):
        return None

    game_id = str(header.get("id") or comp.get("id"))
    season = header.get("season") or {}
    tipoff = _tipoff(comp.get("date", ""))
    game_date = tipoff.astimezone(_ET).date() if tipoff else None

    sides = {}
    for competitor in comp.get("competitors", []):
        side = competitor.get("homeAway")
        records = competitor.get("record") or []
        sides[side] = {
            "team": _tricode((competitor.get("team") or {}).get("abbreviation", "")),
            "espn_team_id": str(competitor.get("id", "")),
            "score": _int(competitor.get("score")),
            "won": competitor.get("winner"),
            "periods": [_int(ls.get("displayValue")) or 0 for ls in competitor.get("linescores", [])],
            "record": records[0].get("summary") if records else None,
        }
    home, away = sides.get("home", {}), sides.get("away", {})
    if not home or not away:
        return None

    info = summary.get("gameInfo") or {}
    venue = info.get("venue") or {}
    game = {
        "game_id": game_id,
        "season": season.get("year"),
        "season_label": season_label(season.get("year")),
        "season_type": season.get("type"),
        "game_date": game_date,
        "tipoff": tipoff,
        "home_team": home["team"], "away_team": away["team"],
        "home_score": home["score"], "away_score": away["score"],
        "home_periods": home["periods"], "away_periods": away["periods"],
        "num_periods": max(len(home["periods"]), len(away["periods"])) or None,
        "neutral_site": comp.get("neutralSite"),
        "venue": venue.get("fullName"),
        "venue_city": (venue.get("address") or {}).get("city"),
        "attendance": _int(info.get("attendance")),
        "home_record": home["record"], "away_record": away["record"],
        "officials": [o.get("displayName") for o in info.get("officials", []) if o.get("displayName")],
        **_parse_odds(summary.get("pickcenter") or []),
    }

    box = summary.get("boxscore") or {}
    team_by_side = {"home": home, "away": away}
    opponent_of = {"home": away["team"], "away": home["team"]}

    teams = []
    for team_obj in box.get("teams", []):
        side = team_obj.get("homeAway")
        if side not in team_by_side:
            continue
        row = {
            "game_id": game_id, "team": team_by_side[side]["team"], "opponent": opponent_of[side],
            "is_home": side == "home", "won": team_by_side[side]["won"],
            "pts": team_by_side[side]["score"],
        }
        for stat in team_obj.get("statistics", []):
            name, value = stat.get("name"), stat.get("displayValue")
            if name in _SHOOTING_FIELDS:
                row.update(zip(_SHOOTING_FIELDS[name], _made_att(value)))
            elif name in _TEAM_STAT_FIELDS:
                row[_TEAM_STAT_FIELDS[name]] = _int(value)
        teams.append(row)

    side_by_espn_team = {s["espn_team_id"]: name for name, s in team_by_side.items()}
    side_by_tricode = {s["team"]: name for name, s in team_by_side.items()}
    players = []
    for team_obj in box.get("players", []):
        team_info = team_obj.get("team") or {}
        side = side_by_espn_team.get(str(team_info.get("id", ""))) or \
            side_by_tricode.get(_tricode(team_info.get("abbreviation", "")))
        if side is None:
            continue
        for group in team_obj.get("statistics", []):
            keys = group.get("keys") or []
            for entry in group.get("athletes", []):
                athlete = entry.get("athlete") or {}
                if not athlete.get("id"):
                    continue
                stats = dict(zip(keys, entry.get("stats") or []))
                dnp = bool(entry.get("didNotPlay")) or not stats
                position = athlete.get("position")
                row = {
                    "game_id": game_id,
                    "espn_player_id": int(athlete["id"]),
                    "nba_player_id": nba_player_id(athlete.get("displayName", "")),
                    "player_name": athlete.get("displayName", ""),
                    "player_key": normalize_player_name(athlete.get("displayName", "")),
                    "team": team_by_side[side]["team"], "opponent": opponent_of[side],
                    "is_home": side == "home",
                    "game_date": game_date, "season": game["season"], "season_type": game["season_type"],
                    "position": position.get("abbreviation") if isinstance(position, dict) else None,
                    "jersey": athlete.get("jersey"),
                    "starter": bool(entry.get("starter")),
                    "did_not_play": dnp,
                    "dnp_reason": (entry.get("reason") or None) if dnp else None,
                    "ejected": bool(entry.get("ejected")),
                    "minutes": _minutes(stats.get("minutes")),
                }
                for key, column in _PLAYER_STAT_FIELDS.items():
                    row[column] = _int(stats.get(key))
                for key, columns in _SHOOTING_FIELDS.items():
                    row.update(zip(columns, _made_att(stats.get(key))))
                players.append(row)

    return {"game": game, "teams": teams, "players": players}


# ---------------------------------------------------------------------------
# Database writes
# ---------------------------------------------------------------------------

def _upsert(conn, table: str, row: Dict, key: Iterable[str]) -> None:
    columns = list(row)
    updates = [c for c in columns if c not in key]
    conn.execute(
        f"INSERT INTO {table} ({', '.join(columns)}) VALUES ({', '.join(['%s'] * len(columns))}) "
        f"ON CONFLICT ({', '.join(key)}) DO UPDATE SET "
        + ", ".join(f"{c} = EXCLUDED.{c}" for c in updates),
        [row[c] for c in columns],
    )


def save_game(conn, parsed: Dict, raw: Optional[Dict] = None) -> None:
    """Write one parsed game. Re-saving a game replaces its rows (picks up stat corrections)."""
    game_id = parsed["game"]["game_id"]
    with conn.transaction():
        _upsert(conn, "games", {**parsed["game"], "archived_at": datetime.now().astimezone()}, ["game_id"])
        conn.execute("DELETE FROM team_game_stats WHERE game_id = %s", (game_id,))
        conn.execute("DELETE FROM player_game_stats WHERE game_id = %s", (game_id,))
        for row in parsed["teams"]:
            _upsert(conn, "team_game_stats", row, ["game_id", "team"])
        for row in parsed["players"]:
            _upsert(conn, "player_game_stats", row, ["game_id", "espn_player_id"])
        if raw is not None:
            payload = {k: raw[k] for k in RAW_SECTIONS if k in raw}
            _upsert(conn, "game_raw_summaries",
                    {"game_id": game_id, "payload": Jsonb(payload), "fetched_at": datetime.now().astimezone()},
                    ["game_id"])
    conn.commit()


def relink_player_ids(conn) -> int:
    """Fill nba_player_id on rows stored before their player could be resolved."""
    rows = conn.execute(
        "SELECT DISTINCT espn_player_id, player_name FROM player_game_stats WHERE nba_player_id IS NULL"
    ).fetchall()
    linked = 0
    for row in rows:
        player_id = nba_player_id(row["player_name"])
        if player_id:
            conn.execute(
                "UPDATE player_game_stats SET nba_player_id = %s WHERE espn_player_id = %s AND nba_player_id IS NULL",
                (player_id, row["espn_player_id"]),
            )
            linked += 1
    conn.commit()
    return linked


def fill_missing_bios(conn, limit: int = 50, pause: float = 0.3) -> int:
    """Fetch bios for players season_player_averages shows that are missing from the .pkl; at most `limit` per run."""
    from app import state

    rows = conn.execute("""
        SELECT DISTINCT p.espn_player_id, p.nba_player_id
        FROM player_game_stats p
        LEFT JOIN player_bios b ON b.espn_player_id = p.espn_player_id
        WHERE p.season = (SELECT max(season) FROM player_game_stats)
            AND p.season_type = 2 AND NOT p.did_not_play
            AND p.nba_player_id IS NOT NULL AND b.espn_player_id IS NULL
    """).fetchall()
    known = {p.get('PLAYER_ID') for p in state.nba_data or []}
    missing = [r["espn_player_id"] for r in rows if r["nba_player_id"] not in known][:limit]
    fetched = 0
    for espn_id in missing:
        try:
            bio = _fetch_player_bio(espn_id)
        except Exception as exc:
            print(f"[game_archive] player bio fetch failed ({espn_id}): {exc}")
            continue
        # Stored even when every field is null, so the player isn't refetched each run.
        _upsert(conn, "player_bios",
                {"espn_player_id": espn_id, **bio, "fetched_at": datetime.now().astimezone()},
                ["espn_player_id"])
        fetched += 1
        time.sleep(pause)
    conn.commit()
    return fetched


def archived_game_ids(conn, game_ids: Iterable[str]) -> set:
    ids = [str(g) for g in game_ids]
    if not ids:
        return set()
    rows = conn.execute("SELECT game_id FROM games WHERE game_id = ANY(%s)", (ids,)).fetchall()
    return {r["game_id"] for r in rows}


# ---------------------------------------------------------------------------
# Reads for the player popup
# ---------------------------------------------------------------------------

def season_player_averages(conn, season_year: int) -> List[Dict]:
    """Regular-season archive totals in the shape consumed by season-stat routes."""
    from app import state

    rows = conn.execute("""
        SELECT p.nba_player_id, COUNT(*) AS games,
            (array_agg(p.team ORDER BY p.game_date DESC, g.tipoff DESC NULLS LAST))[1] AS team,
            (array_agg(p.player_name ORDER BY p.game_date DESC, g.tipoff DESC NULLS LAST))[1] AS player_name,
            (array_agg(p.position ORDER BY p.game_date DESC, g.tipoff DESC NULLS LAST)
                FILTER (WHERE p.position IS NOT NULL))[1] AS position,
            SUM(p.minutes) AS minutes, SUM(p.pts) AS pts, SUM(p.reb) AS reb,
            SUM(p.ast) AS ast, SUM(p.stl) AS stl, SUM(p.blk) AS blk, SUM(p.tov) AS tov,
            SUM(p.fgm) AS fgm, SUM(p.fga) AS fga, SUM(p.fg3m) AS fg3m,
            SUM(p.fg3a) AS fg3a, SUM(p.ftm) AS ftm, SUM(p.fta) AS fta,
            (array_agg(b.birth_date) FILTER (WHERE b.espn_player_id IS NOT NULL))[1] AS birth_date,
            (array_agg(b.height_in) FILTER (WHERE b.espn_player_id IS NOT NULL))[1] AS height_in,
            (array_agg(b.weight_lb) FILTER (WHERE b.espn_player_id IS NOT NULL))[1] AS weight_lb
        FROM player_game_stats p JOIN games g USING (game_id)
        LEFT JOIN player_bios b ON b.espn_player_id = p.espn_player_id
        WHERE p.season = %s AND p.season_type = 2 AND NOT p.did_not_play
            AND p.nba_player_id IS NOT NULL
        GROUP BY p.nba_player_id
    """, (season_year,)).fetchall()
    players = {p['PLAYER_ID']: p for p in state.nba_data or [] if p.get('PLAYER_ID')}
    today = datetime.now(_ET).date()
    averages = []
    for row in rows:
        if row['nba_player_id'] is None:
            continue
        player_id = int(row['nba_player_id'])
        player = players.get(player_id)
        games = int(row['games'])
        result = {
            'PLAYER_ID': player_id,
            'PLAYER_NAME': player['PLAYER_NAME'] if player else row['player_name'],
            'TEAM': row['team'],
            'POSITION': player.get('POSITION', 'UNK') if player else row['position'] or 'UNK',
            'AGE': (player.get('AGE', 0) or 0) + 1 if player else _age_on(row.get('birth_date'), today),
            'GAMES_PLAYED_LAST': games,
        }
        if player:
            for key in ('HEIGHT', 'WEIGHT'):
                if key in player:
                    result[key] = player[key]
        else:
            for key, column in (('HEIGHT', 'height_in'), ('WEIGHT', 'weight_lb')):
                if row.get(column) is not None:
                    result[key] = row[column]
        for key, column in (('PPG', 'pts'), ('RPG', 'reb'), ('APG', 'ast'),
                            ('SPG', 'stl'), ('BPG', 'blk'), ('TOV', 'tov'), ('MIN', 'minutes')):
            result[f'{key}_LAST'] = float(row[column] or 0) / games
        for key, made, attempted in (('FG', 'fgm', 'fga'), ('FG3', 'fg3m', 'fg3a'), ('FT', 'ftm', 'fta')):
            result[f'{key}_PCT_LAST'] = float(row[made] or 0) / float(row[attempted]) if row[attempted] else 0
        averages.append(result)
    return averages


def latest_player_teams(conn) -> Dict[int, str]:
    """Return each player's team from their latest archived game with an NBA team."""
    rows = conn.execute("""
        SELECT DISTINCT ON (p.nba_player_id)
            p.nba_player_id, p.team, p.game_date, g.tipoff
        FROM player_game_stats p JOIN games g USING (game_id)
        WHERE p.nba_player_id IS NOT NULL
            AND p.team = ANY(%s)
        ORDER BY p.nba_player_id, p.game_date DESC, g.tipoff DESC NULLS LAST
    """, (list(TEAM_IDS),)).fetchall()
    latest = {}
    for row in rows:
        if row["nba_player_id"] is None or row["team"] not in TEAM_IDS:
            continue
        player_id = int(row["nba_player_id"])
        recency = (row["game_date"], row["tipoff"] or datetime.min.replace(tzinfo=timezone.utc))
        if player_id not in latest or recency > latest[player_id][0]:
            latest[player_id] = (recency, row["team"])
    return {player_id: team for player_id, (_, team) in latest.items()}


_LOG_FIELDS = ("starter", "did_not_play", "dnp_reason", "minutes", "pts", "reb", "oreb", "dreb", "ast",
               "stl", "blk", "tov", "pf", "fgm", "fga", "fg3m", "fg3a", "ftm", "fta", "plus_minus")


def _pct(made: int, attempted: int) -> Optional[float]:
    return round(100 * made / attempted, 1) if attempted else None


def _averages(games: List[Dict]) -> Optional[Dict]:
    if not games:
        return None
    total = lambda key: sum(g[key] or 0 for g in games)
    averages = {"games": len(games)}
    for key in ("minutes", "pts", "reb", "ast", "stl", "blk", "tov", "fg3m"):
        averages[key] = round(total(key) / len(games), 1)
    averages["fg_pct"] = _pct(total("fgm"), total("fga"))
    averages["fg3_pct"] = _pct(total("fg3m"), total("fg3a"))
    averages["ft_pct"] = _pct(total("ftm"), total("fta"))
    return averages


# Oldest season ESPN's athlete gamelog endpoint has data for (1993-94).
FIRST_GAME_LOG_SEASON = 1994


def current_season_year(today: Optional[date] = None) -> int:
    """ESPN season year (the year the season ends) in effect on `today`.

    Rolls over on October 1, when preseason starts, so the empty summer months
    still show the season that just finished.
    """
    today = today or datetime.now(_ET).date()
    return today.year + 1 if today.month >= 10 else today.year


def available_seasons(today: Optional[date] = None) -> List[str]:
    """Game log season labels, newest first, e.g. ['2026-2027', ..., '1993-1994']."""
    newest = current_season_year(today)
    return [f"{year - 1}-{year}" for year in range(newest, FIRST_GAME_LOG_SEASON - 1, -1)]


_espn_athlete_cache: Dict[Tuple[int, int], List[Dict]] = {}
_espn_id_cache: Dict[int, int] = {}
_ESPN_CORE = "https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba"
_espn_absence_cache: Dict[Tuple[int, int], Tuple[List[str], Optional[Dict]]] = {}
_espn_team_tricode_cache: Dict[str, str] = {}
_REASON_ACRONYMS = {"ACL", "MCL", "PCL", "LCL"}


def _format_dnp_reason(reason: Optional[str]) -> Optional[str]:
    if not reason:
        return None
    return " ".join(word.upper() if word.upper() in _REASON_ACRONYMS else word
                    for word in reason.lower().capitalize().split())


def _fetch_player_bio(espn_id: int) -> Dict:
    response = requests.get(f"{_ESPN_CORE}/athletes/{espn_id}", timeout=6)
    response.raise_for_status()
    return parse_player_bio(response.json())


def _espn_team_tricode(espn_team_id: str) -> Optional[str]:
    if espn_team_id in _espn_team_tricode_cache:
        return _espn_team_tricode_cache[espn_team_id]
    try:
        response = requests.get(f"{_ESPN_BASE}/teams/{espn_team_id}", timeout=6)
        if response.status_code != 200:
            return None
        team = _tricode(response.json().get("team", {}).get("abbreviation", ""))
        if team:
            _espn_team_tricode_cache[espn_team_id] = team
            return team
    except Exception as exc:
        print(f"[game_archive] ESPN team lookup error: {exc}")
    return None


def _espn_dnp_reason(event_id: str, espn_id: int) -> Tuple[Optional[str], bool]:
    """Return the reason and whether the summary lookup succeeded."""
    try:
        response = requests.get(_SUMMARY, params={"event": event_id}, timeout=6)
        if response.status_code != 200:
            return None, False
        for team in response.json().get("boxscore", {}).get("players", []):
            for statistics in team.get("statistics", []):
                for entry in statistics.get("athletes", []):
                    if str(entry.get("athlete", {}).get("id")) == str(espn_id) and entry.get("didNotPlay"):
                        return _format_dnp_reason(entry.get("reason")), True
    except Exception as exc:
        print(f"[game_archive] ESPN DNP reason error: {exc}")
        return None, False
    return None, True


def _fetch_espn_season_absence(espn_id: int, season_year: int) -> Tuple[List[str], Optional[Dict]]:
    """Historical roster and sampled DNP reasons for a season with no games played."""
    cache_key = (espn_id, season_year)
    if cache_key in _espn_absence_cache:
        return _espn_absence_cache[cache_key]
    try:
        response = requests.get(
            f"{_ESPN_CORE}/seasons/{season_year}/athletes/{espn_id}/eventlog",
            params={"limit": 100}, timeout=6,
        )
        if response.status_code != 200:
            return [], None
        data = response.json()
        events = data.get("events", {})
        items = events.get("items", [])
        if not items or any(item.get("played") for item in items):
            _espn_absence_cache[cache_key] = ([], None)
            return [], None

        team_ids = []
        for team_id in [item.get("teamId") for item in items] + list(data.get("teams", {})):
            if team_id is not None and str(team_id) not in team_ids:
                team_ids.append(str(team_id))
        teams = []
        team_lookup_failed = False
        for team_id in team_ids:
            team = _espn_team_tricode(team_id)
            if team is None:
                team_lookup_failed = True
            if team in TEAM_IDS and team not in teams:
                teams.append(team)
        if not teams:
            if not team_lookup_failed:
                _espn_absence_cache[cache_key] = ([], None)
            return [], None

        reasons = []
        summary_lookup_failed = False
        for index in sorted({0, len(items) // 2, len(items) - 1}):
            ref = items[index].get("competition", {}).get("$ref", "")
            event_id = ref.split("?", 1)[0].rstrip("/").rsplit("/", 1)[-1]
            if event_id:
                reason, succeeded = _espn_dnp_reason(event_id, espn_id)
                if not succeeded:
                    summary_lookup_failed = True
                if reason and reason not in reasons:
                    reasons.append(reason)
        absence = {"reason": reasons[0] if reasons else None, "reasons": reasons,
                   "games_missed": events.get("count", len(items))}
        if not team_lookup_failed and not summary_lookup_failed:
            _espn_absence_cache[cache_key] = (teams, absence)
        return teams, absence
    except Exception as exc:
        print(f"[game_archive] ESPN season absence error: {exc}")
        return [], None


def _espn_season_type(display_name: Optional[str]) -> int:
    """Map an ESPN gamelog displayName to its numeric season type."""
    name = display_name or ""
    if "Play-In" in name:
        return 5
    if "Preseason" in name:
        return 1
    if "Postseason" in name or "Playoff" in name:
        return 3
    return 2


def _resolve_season(val: Optional[str]) -> Tuple[int, str]:
    """Convert '2026-2027', '2025-2026', '2026-27', '2026', etc. to (espn_season_year, label)."""
    current = current_season_year()
    if not val or str(val).lower() in ("current", "latest"):
        return current, f"{current - 1}-{current}"
    s = str(val).strip()
    if "-" in s:
        parts = s.split("-")
        try:
            start_yr = int(parts[0])
            end_yr = start_yr + 1 if len(parts[1]) in (2, 4) else int(parts[1])
            return end_yr, f"{start_yr}-{end_yr}"
        except ValueError:
            pass
    try:
        y = int(s)
        if y > 2000:
            return y, f"{y - 1}-{y}"
    except ValueError:
        pass
    return current, f"{current - 1}-{current}"


def _get_espn_athlete_id(conn, player_id: int) -> Optional[int]:
    """Look up ESPN athlete ID for an NBA player ID via DB, name index, or ESPN search."""
    if player_id in _espn_id_cache:
        return _espn_id_cache[player_id]

    try:
        row = conn.execute(
            "SELECT espn_player_id FROM player_game_stats WHERE nba_player_id = %s AND espn_player_id IS NOT NULL LIMIT 1",
            (player_id,),
        ).fetchone()
        if row and row.get("espn_player_id"):
            eid = int(row["espn_player_id"])
            _espn_id_cache[player_id] = eid
            return eid
    except Exception:
        pass

    # Resolve player name from state to search ESPN
    from app import state
    name = None
    if state.nba_data:
        for p in state.nba_data:
            if p.get("PLAYER_ID") == player_id:
                name = p.get("PLAYER_NAME")
                break
    if not name and state.multi_season_data:
        for s_players in state.multi_season_data.values():
            for p in s_players or []:
                if p.get("NBA_PLAYER_ID") == player_id:
                    name = p.get("PLAYER_NAME")
                    break
            if name:
                break

    if name:
        try:
            search_res = requests.get(
                f"https://site.web.api.espn.com/apis/search/v2?query={requests.utils.quote(name)}&limit=3&type=player",
                timeout=4,
            ).json()
            for res in search_res.get("results", []):
                for item in res.get("contents", []):
                    uid = item.get("uid", "")
                    if "~a:" in uid:
                        eid = int(uid.split("~a:")[-1])
                        _espn_id_cache[player_id] = eid
                        return eid
        except Exception as exc:
            print(f"[game_archive] ESPN player search error ({name}): {exc}")

    return None


def _fetch_espn_athlete_gamelog(espn_player_id: int, season_year: int) -> List[Dict]:
    """Fetch and parse all game log entries for an athlete and season from ESPN."""
    cache_key = (espn_player_id, season_year)
    if cache_key in _espn_athlete_cache:
        return _espn_athlete_cache[cache_key]

    url = f"https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/{espn_player_id}/gamelog?season={season_year}"
    try:
        res = requests.get(url, timeout=6)
        if res.status_code != 200:
            return []
        data = res.json()
        labels = data.get("labels", [])
        events_map = data.get("events", {})
        games = []

        for st in data.get("seasonTypes", []):
            st_type = _espn_season_type(st.get("displayName"))
            for cat in st.get("categories", []):
                for ev in cat.get("events", []):
                    eid = str(ev.get("eventId", ""))
                    ev_meta = events_map.get(eid, {})
                    stats_list = ev.get("stats", [])
                    stat_dict = dict(zip(labels, stats_list))

                    fgm, fga = None, None
                    if "FG" in stat_dict and "-" in str(stat_dict["FG"]):
                        parts = str(stat_dict["FG"]).split("-")
                        try:
                            fgm, fga = int(parts[0]), int(parts[1])
                        except Exception:
                            pass

                    fg3m, fg3a = None, None
                    if "3PT" in stat_dict and "-" in str(stat_dict["3PT"]):
                        parts = str(stat_dict["3PT"]).split("-")
                        try:
                            fg3m, fg3a = int(parts[0]), int(parts[1])
                        except Exception:
                            pass

                    ftm, fta = None, None
                    if "FT" in stat_dict and "-" in str(stat_dict["FT"]):
                        parts = str(stat_dict["FT"]).split("-")
                        try:
                            ftm, fta = int(parts[0]), int(parts[1])
                        except Exception:
                            pass

                    dt = ev_meta.get("gameDate", "")
                    date_str = dt[:10] if dt else ""
                    team = _tricode((ev_meta.get("team") or {}).get("abbreviation", "")) or "UNK"
                    opp_team = ev_meta.get("opponent", {}).get("abbreviation", "UNK")
                    is_home = (ev_meta.get("atVs") == "vs")
                    res_str = ev_meta.get("gameResult", "")
                    score = ev_meta.get("score", "")

                    mins_raw = stat_dict.get("MIN", "0")
                    try:
                        mins = float(mins_raw)
                    except Exception:
                        mins = 0.0

                    def _safe_int(key):
                        v = stat_dict.get(key)
                        try:
                            return int(v) if v is not None else 0
                        except Exception:
                            return 0

                    games.append({
                        "game_id": eid,
                        "date": date_str,
                        "season_type": st_type,
                        "team": team,
                        "opponent": opp_team,
                        "is_home": is_home,
                        "result": res_str,
                        "score": score,
                        "minutes": mins,
                        "pts": _safe_int("PTS"),
                        "reb": _safe_int("REB"),
                        "oreb": None,
                        "dreb": None,
                        "ast": _safe_int("AST"),
                        "stl": _safe_int("STL"),
                        "blk": _safe_int("BLK"),
                        "tov": _safe_int("TO"),
                        "pf": _safe_int("PF"),
                        "fgm": fgm, "fga": fga,
                        "fg3m": fg3m, "fg3a": fg3a,
                        "ftm": ftm, "fta": fta,
                        "plus_minus": None,
                        "starter": True,
                        "did_not_play": False,
                        "dnp_reason": None,
                    })

        games.sort(key=lambda g: g["date"], reverse=True)
        _espn_athlete_cache[cache_key] = games
        return games
    except Exception as exc:
        print(f"[game_archive] ESPN athlete gamelog error: {exc}")
        return []


def _season_teams(games: List[Dict]) -> List[str]:
    """Distinct known teams by first appearance in a newest-first game log."""
    teams = []
    for game in reversed(games):
        team = game.get("team")
        if team in TEAM_IDS and team not in teams:
            teams.append(team)
    return teams


def player_game_log(conn, player_id: int, limit: int = 10, season: Optional[str] = None) -> Dict:
    """Games for an NBA.com player ID and season, newest first, with averages."""
    is_mock = getattr(conn, "_is_mock", False) or "Mock" in conn.__class__.__name__

    if season is not None:
        target_year, target_label = _resolve_season(season)
        rows = conn.execute(
            """
            SELECT p.*, g.season_label, g.home_score, g.away_score
            FROM player_game_stats p JOIN games g USING (game_id)
            WHERE p.nba_player_id = %s
              AND (p.season = %s OR g.season_label = %s)
            ORDER BY p.game_date DESC, g.tipoff DESC
            """,
            (player_id, target_year, target_label),
        ).fetchall()
        active_label = target_label
    else:
        target_year, target_label = _resolve_season(None)
        rows = conn.execute(
            """
            SELECT p.*, g.season_label, g.home_score, g.away_score
            FROM player_game_stats p JOIN games g USING (game_id)
            WHERE p.nba_player_id = %s
              AND p.season = (SELECT max(season) FROM player_game_stats WHERE nba_player_id = %s)
            ORDER BY p.game_date DESC, g.tipoff DESC
            """,
            (player_id, player_id),
        ).fetchall()
        active_label = rows[0]["season_label"] if rows else target_label

    games = []
    for row in rows:
        team_score, opp_score = (row["home_score"], row["away_score"]) if row["is_home"] else \
            (row["away_score"], row["home_score"])
        games.append({
            "game_id": row["game_id"], "date": row["game_date"].isoformat(),
            "team": row.get("team") or "UNK",
            "season_type": row["season_type"], "opponent": row["opponent"], "is_home": row["is_home"],
            "result": "W" if team_score > opp_score else "L", "score": f"{team_score}-{opp_score}",
            **{key: row[key] for key in _LOG_FIELDS},
        })

    # If DB had no games for the requested season and this is not a mock unit test, query ESPN
    teams, absence = _season_teams(games), None
    if not games and not is_mock:
        espn_id = _get_espn_athlete_id(conn, player_id)
        if espn_id:
            games = _fetch_espn_athlete_gamelog(espn_id, target_year)
            teams = _season_teams(games)
            if not games:
                teams, absence = _fetch_espn_season_absence(espn_id, target_year)

    played = [g for g in games if not g.get("did_not_play")]
    counted = [g for g in played if g.get("season_type") != 1] or played
    return {
        "player_id": player_id,
        "season": active_label,
        "teams": teams,
        "absence": absence,
        "available_seasons": available_seasons(),
        "games": games[:limit],
        "averages": {
            "last5": _averages(counted[:5]),
            "last10": _averages(counted[:10]),
            "season": _averages(counted),
        },
    }


# ---------------------------------------------------------------------------
# Fetching (uncached — a season backfill would otherwise fill live_games' cache)
# ---------------------------------------------------------------------------

def _fetch_json(url: str, params: Dict, retries: int = 3) -> Optional[Dict]:
    for attempt in range(retries):
        try:
            response = requests.get(url, params=params, timeout=15)
            response.raise_for_status()
            return response.json()
        except Exception as exc:
            if attempt == retries - 1:
                print(f"[game_archive] fetch error ({url} {params}): {exc}")
                return None
            time.sleep(1 + attempt * 2)


def archive_game(conn, game_id: str) -> bool:
    """Fetch and store one game. Returns False if it is not final or could not be fetched."""
    summary = _fetch_json(_SUMMARY, {"event": game_id})
    if not summary:
        return False
    parsed = parse_summary(summary)
    if not parsed or not parsed["players"]:
        return False
    save_game(conn, parsed, summary)
    return True


def completed_game_ids_on(day: date) -> List[str]:
    data = _fetch_json(_SCOREBOARD, {"dates": day.strftime("%Y%m%d"), "limit": 100})
    if not data:
        return []
    return [
        str(event["id"]) for event in data.get("events", [])
        if (event.get("status", {}).get("type") or {}).get("completed")
    ]


def archive_dates(conn, start: date, end: date, refresh: bool = False, pause: float = 0.3) -> Dict[str, int]:
    """Archive every completed game from start to end (inclusive, US Eastern dates)."""
    counts = {"archived": 0, "skipped": 0, "failed": 0}
    day = start
    while day <= end:
        game_ids = completed_game_ids_on(day)
        done = set() if refresh else archived_game_ids(conn, game_ids)
        for game_id in game_ids:
            if game_id in done:
                counts["skipped"] += 1
                continue
            if archive_game(conn, game_id):
                counts["archived"] += 1
            else:
                counts["failed"] += 1
            time.sleep(pause)
        if game_ids:
            print(f"[game_archive] {day}: {len(game_ids)} completed games")
        day += timedelta(days=1)
    return counts


def catch_up_recent_games(conn, days: int = 3, today: Optional[date] = None,
                          start: Optional[date] = None) -> Dict[str, int]:
    """Catch missed completed games through today, using US Eastern dates.

    `start` widens the window back to that date (a one-off backfill); it never narrows it.
    """
    today = today or datetime.now(_ET).date()
    first = today - timedelta(days=days)
    return archive_dates(conn, min(first, start) if start else first, today)


# ---------------------------------------------------------------------------
# Automatic archiving from the live-games feed
# ---------------------------------------------------------------------------

_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="game-archive")
_seen_lock = threading.Lock()
_seen: set = set()  # game ids queued or stored by this process
CATCH_UP_INTERVAL = 3600
_clock = time.monotonic
_catch_up_lock = threading.Lock()
_last_catch_up = _clock()


def schedule_catch_up(force: bool = False, start: Optional[date] = None) -> bool:
    """Queue catch-up at most hourly per process; startup can force the first run."""
    global _last_catch_up
    with _catch_up_lock:
        now = _clock()
        if not force and now - _last_catch_up < CATCH_UP_INTERVAL:
            return False
        _last_catch_up = now
        _executor.submit(_catch_up_in_background, start)
    return True


DAILY_CATCH_UP_INTERVAL = 24 * 3600
_daily_stop = threading.Event()
_daily_thread: Optional[threading.Thread] = None


def start_daily_catch_up() -> bool:
    """Queue a catch-up every 24 hours for as long as this process runs, even with no traffic."""
    global _daily_thread
    if _daily_thread is not None and _daily_thread.is_alive():
        return False
    # A daemon thread never holds the process open, so restarts and deploys aren't delayed.
    _daily_thread = threading.Thread(target=_daily_catch_up_loop, args=(_daily_stop, DAILY_CATCH_UP_INTERVAL),
                                     name="game-archive-daily", daemon=True)
    _daily_thread.start()
    return True


def _daily_catch_up_loop(stop: threading.Event, interval: float) -> None:
    while not stop.wait(interval):  # wait() returns True only once stop is set
        try:
            schedule_catch_up(force=True)
        except Exception as exc:
            print(f"[game_archive] daily catch-up could not be queued: {exc}")


def _catch_up_in_background(start: Optional[date] = None) -> None:
    conn = None
    try:
        conn = db.get_db()
        counts = catch_up_recent_games(conn, start=start)
        linked = 0
        try:
            linked = relink_player_ids(conn)
        except Exception as exc:
            conn.rollback()  # Clear a failed transaction so the reload can still query.
            print(f"[game_archive] player relink failed: {exc}")
        if linked > 0:
            print(f"[game_archive] relinked {linked} players")
        bios = 0
        try:
            bios = fill_missing_bios(conn)
        except Exception as exc:
            conn.rollback()
            print(f"[game_archive] player bio fetch failed: {exc}")
        if bios > 0:
            print(f"[game_archive] fetched {bios} player bios")
        if counts['archived'] > 0 or linked > 0 or bios > 0:
            from app import state
            state.load_current_season(conn)
    except Exception as exc:
        print(f"[game_archive] background catch-up failed: {exc}")
    finally:
        if conn:
            conn.close()


def _archive_in_background(game_id: str) -> None:
    conn = None
    try:
        conn = db.get_db()
        if archived_game_ids(conn, [game_id]):
            return
        if archive_game(conn, game_id):
            from app import state
            state.load_current_season(conn)
            return
    except Exception as exc:
        print(f"[game_archive] background archive failed ({game_id}): {exc}")
    finally:
        if conn:
            conn.close()
    with _seen_lock:  # not stored yet (e.g. ESPN not marked final) — retry on a later request
        _seen.discard(game_id)


def archive_finished_games(games: List[Dict]) -> None:
    """Queue newly-final games (status 3) from get_todays_games() for storage. Never blocks."""
    if not auto_archive_enabled:
        return
    for game in games:
        game_id = str(game.get("gameId", ""))
        if game.get("status") != 3 or not game_id:
            continue
        with _seen_lock:
            if game_id in _seen:
                continue
            _seen.add(game_id)
        _executor.submit(_archive_in_background, game_id)
    schedule_catch_up()
