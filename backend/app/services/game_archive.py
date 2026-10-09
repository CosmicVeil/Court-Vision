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

Games are archived two ways:
  - automatically, in the background, when /api/games/today sees a game go final
  - via scripts/archive_games.py (daily catch-up and historical backfill)
"""

import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta
from typing import Dict, Iterable, List, Optional
from zoneinfo import ZoneInfo

import requests
from psycopg.types.json import Jsonb

from app import db
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


def archived_game_ids(conn, game_ids: Iterable[str]) -> set:
    ids = [str(g) for g in game_ids]
    if not ids:
        return set()
    rows = conn.execute("SELECT game_id FROM games WHERE game_id = ANY(%s)", (ids,)).fetchall()
    return {r["game_id"] for r in rows}


# ---------------------------------------------------------------------------
# Reads for the player popup
# ---------------------------------------------------------------------------

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


def player_game_log(conn, player_id: int, limit: int = 10) -> Dict:
    """Most recent season's games for an NBA.com player ID, newest first, with averages."""
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

    games = []
    for row in rows:
        team_score, opp_score = (row["home_score"], row["away_score"]) if row["is_home"] else \
            (row["away_score"], row["home_score"])
        games.append({
            "game_id": row["game_id"], "date": row["game_date"].isoformat(),
            "season_type": row["season_type"], "opponent": row["opponent"], "is_home": row["is_home"],
            "result": "W" if team_score > opp_score else "L", "score": f"{team_score}-{opp_score}",
            **{key: row[key] for key in _LOG_FIELDS},
        })

    played = [g for g in games if not g["did_not_play"]]
    # Preseason only counts while it is all there is (e.g. in October).
    counted = [g for g in played if g["season_type"] != 1] or played
    return {
        "player_id": player_id,
        "season": rows[0]["season_label"] if rows else None,
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


# ---------------------------------------------------------------------------
# Automatic archiving from the live-games feed
# ---------------------------------------------------------------------------

_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="game-archive")
_seen_lock = threading.Lock()
_seen: set = set()  # game ids queued or stored by this process


def _archive_in_background(game_id: str) -> None:
    conn = None
    try:
        conn = db.get_db()
        if archived_game_ids(conn, [game_id]) or archive_game(conn, game_id):
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
