"""
live_games.py ΓÇö NBA game data via ESPN's public API

Switched from stats.nba.com (blocked on cloud servers) to ESPN's public API
which works reliably from any hosting platform including Render.

Endpoints used:
  Scoreboard: site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard
  Summary:    site.api.espn.com/apis/site/v2/sports/basketball/nba/summary

Public interface is identical to the original:
  get_todays_games(nba_data)      -> List[Dict]
  get_upcoming_games(days, nba_data) -> List[Dict]
  get_weekly_top_pra(now)         -> Dict
"""

import csv
import os
import requests
import threading
import time
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional, Any
from zoneinfo import ZoneInfo

from app import config
from app.utils.player_ids import player_id_for

# ---------------------------------------------------------------------------
# ESPN API endpoints
# ---------------------------------------------------------------------------
_ESPN_BASE  = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba"
_SCOREBOARD = f"{_ESPN_BASE}/scoreboard"
_SUMMARY    = f"{_ESPN_BASE}/summary"
_UPCOMING_CSV = str(config.data_path(config.UPCOMING_GAMES_CSV_FILE))
_UPCOMING_COLUMNS = [
    "cache_date",
    "game_date",
    "gameId",
    "status",
    "statusText",
    "gameTime",
    "arena",
    "home_tricode",
    "home_name",
    "home_city",
    "home_logo",
    "home_record",
    "away_tricode",
    "away_name",
    "away_city",
    "away_logo",
    "away_record",
]

# ESPN sometimes uses shortened abbreviations ΓÇö map them to standard tricodes
ESPN_TO_TRICODE = {
    "GS": "GSW", "SA": "SAS", "NO": "NOP", "NY": "NYK", "WSH": "WAS",
}

TEAM_IDS = {
    "ATL":1610612737,"BOS":1610612738,"BKN":1610612751,"CHA":1610612766,
    "CHI":1610612741,"CLE":1610612739,"DAL":1610612742,"DEN":1610612743,
    "DET":1610612765,"GSW":1610612744,"HOU":1610612745,"IND":1610612754,
    "LAC":1610612746,"LAL":1610612747,"MEM":1610612763,"MIA":1610612748,
    "MIL":1610612749,"MIN":1610612750,"NOP":1610612740,"NYK":1610612752,
    "OKC":1610612760,"ORL":1610612753,"PHI":1610612755,"PHX":1610612756,
    "POR":1610612757,"SAC":1610612758,"SAS":1610612759,"TOR":1610612761,
    "UTA":1610612762,"WAS":1610612764,
}

TEAM_LOGOS = {
    t: f"https://cdn.nba.com/logos/nba/{tid}/global/L/logo.svg"
    for t, tid in TEAM_IDS.items()
}
# ESPN tags each play's team with its own numeric team id (not the NBA.com id above).
# This maps ESPN team id -> our standard tricode so play-by-play can be coloured by team.
ESPN_TEAM_ID_TO_TRICODE = {
    "1": "ATL", "2": "BOS", "17": "BKN", "30": "CHA", "4": "CHI",
    "5": "CLE", "6": "DAL", "7": "DEN", "8": "DET", "9": "GSW",
    "10": "HOU", "11": "IND", "12": "LAC", "13": "LAL", "29": "MEM",
    "14": "MIA", "15": "MIL", "16": "MIN", "3": "NOP", "18": "NYK",
    "25": "OKC", "19": "ORL", "20": "PHI", "21": "PHX", "22": "POR",
    "23": "SAC", "24": "SAS", "28": "TOR", "26": "UTA", "27": "WAS",
}

# ---------------------------------------------------------------------------
# Simple TTL cache
# ---------------------------------------------------------------------------
_cache: Dict[str, Dict] = {}
CACHE_TTL = 30  # seconds
LIVE_BOX_TTL = 60
_ET = ZoneInfo("America/New_York")
_WEEK_BOX_CACHE: Dict[str, Dict] = {}
_WEEK_DAY_CACHE: Dict[str, Dict] = {}
_team_lock = threading.Lock()


def _get(url: str, params: Optional[Dict] = None) -> Optional[Any]:
    """GET with TTL cache. Returns parsed JSON or None on error."""
    cache_key = url + str(sorted((params or {}).items()))
    now = time.time()
    if cache_key in _cache and now - _cache[cache_key]["ts"] < CACHE_TTL:
        return _cache[cache_key]["data"]
    try:
        r = requests.get(url, params=params, timeout=10)
        r.raise_for_status()
        data = r.json()
        _cache[cache_key] = {"data": data, "ts": now}
        return data
    except Exception as exc:
        print(f"[live_games] fetch error ({url}): {exc}")
        return None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _normalize_tricode(espn_abbr: str) -> str:
    """Convert ESPN abbreviation to our standard tricode."""
    return ESPN_TO_TRICODE.get(espn_abbr, espn_abbr)


def _parse_espn_game(event: Dict) -> Optional[Dict]:
    """Convert an ESPN event object to our internal game dict."""
    try:
        game_id    = event.get("id", "")
        competition = (event.get("competitions") or [{}])[0]

        status_obj  = event.get("status", {})
        status_type = status_obj.get("type", {})
        state       = status_type.get("state", "pre")   # pre | in | post

        if state == "in":
            status_num = 2
        elif state == "post":
            status_num = 3
        else:
            status_num = 1

        period = status_obj.get("period", 0)
        clock = status_obj.get("displayClock", "")
        status_text = status_type.get("shortDetail", status_type.get("description", ""))

        competitors = competition.get("competitors", [])
        home_comp = next((c for c in competitors if c.get("homeAway") == "home"), {})
        away_comp = next((c for c in competitors if c.get("homeAway") == "away"), {})

        def _parse_team(comp: Dict) -> Dict:
            team = comp.get("team", {})
            tri = _normalize_tricode(team.get("abbreviation", ""))
            score = int(comp.get("score", 0) or 0)
            records = comp.get("records", [])
            record = records[0].get("summary", "") if records else ""

            linescores = comp.get("linescores", [])
            quarters = [
                {"q": i + 1, "score": int(ls.get("value", 0) or 0)}
                for i, ls in enumerate(linescores)
            ]

            # Prefer NBA CDN logo (more consistent quality)
            logo = TEAM_LOGOS.get(tri) or team.get("logo", "")

            return {
                "tricode": tri,
                "name":    team.get("shortDisplayName", team.get("name", "")),
                "city":    team.get("location", ""),
                "score":   score,
                "logo":     logo,
                "quarters": quarters,
                "record":   record,
            }

        venue = competition.get("venue", {})
        arena = venue.get("fullName", "")

        return {
            "gameId":     game_id,
            "status":     status_num,
            "statusText": status_text,
            "gameTime":   event.get("date", ""),
            "arena":      arena,
            "home":       _parse_team(home_comp),
            "away":       _parse_team(away_comp),
            "period":     period,
            "gameClock":  clock if status_num == 2 else "",
            "players":    {"home": [], "away": []},
        }
    except Exception as e:
        print(f"[live_games] Error parsing ESPN event: {e}")
        return None


def _fetch_boxscore(game_id: str, home_tri: str, away_tri: str) -> Dict[str, List]:
    """Fetch and parse player stats from ESPN summary endpoint."""
    data = _get(_SUMMARY, params={"event": game_id})
    if not data:
        return {"home": [], "away": []}

    home_players: List[Dict] = []
    away_players: List[Dict] = []

    # ESPN stat label order: MIN PTS FG 3PT FT REB AST TO STL BLK +/-
    LABEL_ORDER = ["MIN", "PTS", "FG", "3PT", "FT", "REB", "AST", "TO", "STL", "BLK"]

    try:
        teams_data = data.get("boxscore", {}).get("players", [])

        for team_obj in teams_data:
            team_info = team_obj.get("team", {})
            tri       = _normalize_tricode(team_info.get("abbreviation", ""))
            is_home   = (tri == home_tri)

            stat_groups = team_obj.get("statistics", [{}])
            stat_group  = stat_groups[0] if stat_groups else {}
            labels      = stat_group.get("labels", [])   # list of strings
            athletes    = stat_group.get("athletes", [])

            def _idx(label: str) -> int:
                try:
                    return labels.index(label)
                except ValueError:
                    return -1

            def _val(stats: List, label: str) -> str:
                i = _idx(label)
                return stats[i] if i >= 0 and i < len(stats) else "0"

            def _int_val(stats: List, label: str) -> int:
                try:
                    return int(float(_val(stats, label)))
                except:
                    return 0

            def _split_made_att(raw: str):
                try:
                    parts = raw.split("-")
                    return int(parts[0]), int(parts[1])
                except:
                    return 0, 0

            team_players = []
            for ath_obj in athletes:
                ath         = ath_obj.get("athlete", {})
                did_not_play = ath_obj.get("didNotPlay", False)
                stats       = ath_obj.get("stats", [])

                fgm, fga   = _split_made_att(_val(stats, "FG"))
                fg3m, fg3a = _split_made_att(_val(stats, "3PT"))
                ftm, fta   = _split_made_att(_val(stats, "FT"))

                pos_obj  = ath.get("position", {})
                position = pos_obj.get("abbreviation", "") if isinstance(pos_obj, dict) else ""

                # ESPN doesn't directly expose plus/minus in simple labels;
                # look for "+/-" label variant
                pm_val = 0
                for pm_label in ["+/-", "PLUSMINUS", "PM"]:
                    if pm_label in labels:
                        pm_val = _int_val(stats, pm_label)
                        break

                team_players.append({
                    "personId":  player_id_for(ath.get("displayName", "")),
                    "espnId":    int(ath.get("id", 0) or 0),
                    "name":      ath.get("displayName", ""),
                    "jerseyNum": ath.get("jersey", ""),
                    "position":  position,
                    "status":    "DNP" if did_not_play else "ACTIVE",
                    "oncourt":   False,
                    "pts":       _int_val(stats, "PTS"),
                    "reb":       _int_val(stats, "REB"),
                    "ast":       _int_val(stats, "AST"),
                    "stl":       _int_val(stats, "STL"),
                    "blk":       _int_val(stats, "BLK"),
                    "fgm": fgm, "fga": fga,
                    "fg3m": fg3m, "fg3a": fg3a,
                    "ftm": ftm, "fta": fta,
                    "tov":       _int_val(stats, "TO"),
                    "min":       _val(stats, "MIN"),
                    "plusMinus": pm_val,
                })

            if is_home:
                home_players = team_players
            else:
                away_players = team_players

    except Exception as e:
        print(f"[live_games] Boxscore parse error: {e}")

    return {"home": home_players, "away": away_players}


def _apply_boxscore_teams(players: Dict[str, List], home_tri: str, away_tri: str,
                         nba_data: Optional[List[Dict]]) -> None:
    """Apply observed teams to shared season players without rewriting unchanged teams."""
    if not nba_data:
        return
    by_id = {p.get("PLAYER_ID"): p for p in nba_data}
    for side, tricode in (("home", home_tri), ("away", away_tri)):
        if tricode not in TEAM_IDS:
            continue
        for box_player in players[side]:
            person_id = box_player.get("personId")
            player = by_id.get(person_id) if person_id else None
            if player is not None and player.get("TEAM") != tricode:
                with _team_lock:
                    if player.get("TEAM") != tricode:
                        player["TEAM"] = tricode


def _roster_from_pkl(tricode: str, nba_data: Optional[List[Dict]]) -> List[Dict]:
    """Build a zeroed-out game roster from pkl season data for a given team."""
    if not nba_data:
        return []
    players = [p for p in nba_data if p.get("TEAM") == tricode]
    result  = []
    for p in players:
        name = p.get("PLAYER_NAME", "")
        result.append({
            "personId":   p.get("PLAYER_ID") or player_id_for(name),
            "name":       name,
            "jerseyNum":  "",
            "position":   p.get("POSITION", ""),
            "status":     "ACTIVE",
            "oncourt":    False,
            "pts": 0, "reb": 0, "ast": 0, "stl": 0, "blk": 0,
            "fgm": 0, "fga": 0, "fg3m": 0, "fg3a": 0,
            "ftm": 0, "fta": 0, "tov": 0, "min": "0m", "plusMinus": 0,
            "season_ppg": round(p.get("PPG_LAST", 0), 1),
            "season_rpg": round(p.get("RPG_LAST", 0), 1),
            "season_apg": round(p.get("APG_LAST", 0), 1),
        })
    result.sort(key=lambda x: x["season_ppg"], reverse=True)
    return result


def _todays_date_str() -> str:
    """Return today's date in YYYYMMDD format (Eastern Time)."""
    return datetime.now(_ET).strftime("%Y%m%d")


def _current_season() -> str:
    """Return the current NBA season string, e.g. '2024-25'."""
    now  = datetime.now()
    year = now.year
    if now.month < 7:
        return f"{year - 1}-{str(year)[2:]}"
    return f"{year}-{str(year + 1)[2:]}"


def _filter_games_by_days(games: List[Dict], days: int) -> List[Dict]:
    today = datetime.now(_ET).date()
    cutoff = today + timedelta(days=days)
    filtered: List[Dict] = []

    for game in games:
        game_date_str = game.get("gameDate", "")
        if not game_date_str:
            continue
        try:
            game_date = datetime.strptime(game_date_str, "%Y%m%d").date()
        except ValueError:
            continue
        if today < game_date <= cutoff:
            filtered.append(game)

    return filtered


def _attach_rosters(games: List[Dict], nba_data: Optional[List[Dict]]) -> List[Dict]:
    for game in games:
        home_tri = game["home"]["tricode"]
        away_tri = game["away"]["tricode"]
        game["players"]["home"] = _roster_from_pkl(home_tri, nba_data)
        game["players"]["away"] = _roster_from_pkl(away_tri, nba_data)

    return games

def _game_to_csv_row(cache_date: str, game: Dict) -> Dict[str, str]:
    home = game.get("home", {})
    away = game.get("away", {})
    return {
        "cache_date": cache_date,
        "game_date": game.get("gameDate", ""),
        "gameId": str(game.get("gameId", "")),
        "status": str(game.get("status", 1)),
        "statusText": game.get("statusText", ""),
        "gameTime": game.get("gameTime", ""),
        "arena": game.get("arena", ""),
        "home_tricode": home.get("tricode", ""),
        "home_name": home.get("name", ""),
        "home_city": home.get("city", ""),
        "home_logo": home.get("logo", ""),
        "home_record": home.get("record", ""),
        "away_tricode": away.get("tricode", ""),
        "away_name": away.get("name", ""),
        "away_city": away.get("city", ""),
        "away_logo": away.get("logo", ""),
        "away_record": away.get("record", ""),
    }


def _game_from_csv_row(row: Dict[str, str]) -> Dict:
    return {
        "gameId": row.get("gameId", ""),
        "status": int(row.get("status", 1) or 1),
        "statusText": row.get("statusText", ""),
        "gameTime": row.get("gameTime", ""),
        "gameDate": row.get("game_date", ""),
        "arena": row.get("arena", ""),
        "period": 0,
        "gameClock": "",
        "home": {
            "tricode": row.get("home_tricode", ""),
            "name": row.get("home_name", ""),
            "city": row.get("home_city", ""),
            "score": 0,
            "logo": row.get("home_logo", ""),
            "quarters": [],
            "record": row.get("home_record", ""),
        },
        "away": {
            "tricode": row.get("away_tricode", ""),
            "name": row.get("away_name", ""),
            "city": row.get("away_city", ""),
            "score": 0,
            "logo": row.get("away_logo", ""),
            "quarters": [],
            "record": row.get("away_record", ""),
        },
        "players": {"home": [], "away": []},
    }


def _load_upcoming_csv(cache_date: str) -> Optional[List[Dict]]:
    if not os.path.exists(_UPCOMING_CSV):
        return None

    games: List[Dict] = []
    try:
        with open(_UPCOMING_CSV, newline="", encoding="utf-8") as handle:
            reader = csv.DictReader(handle)
            for row in reader:
                if row.get("cache_date") != cache_date:
                    return None
                games.append(_game_from_csv_row(row))
    except Exception as exc:
        print(f"[live_games] Error reading upcoming CSV: {exc}")
        return None

    # The cache date lives on each row, so a header-only file can't prove it is fresh.
    return games or None


def _write_upcoming_csv(cache_date: str, games: List[Dict]) -> None:
    try:
        with open(_UPCOMING_CSV, "w", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=_UPCOMING_COLUMNS)
            writer.writeheader()
            for game in games:
                writer.writerow(_game_to_csv_row(cache_date, game))
    except Exception as exc:
        print(f"[live_games] Error writing upcoming CSV: {exc}")


def _upcoming_month_events(start_date, end_date) -> Optional[List[Dict]]:
    """Fetch scoreboard events month by month (ESPN rejects YYYYMMDD-YYYYMMDD ranges).

    Returns None if any month fails, so a partial schedule is never cached.
    """
    events: List[Dict] = []
    year, month = start_date.year, start_date.month
    while (year, month) <= (end_date.year, end_date.month):
        data = _get(_SCOREBOARD, params={"dates": f"{year}{month:02d}", "limit": 1000})
        if data is None:
            return None
        events.extend(data.get("events", []))
        year, month = (year + 1, 1) if month == 12 else (year, month + 1)
    return events


def _fetch_upcoming_games(days: int, nba_data: Optional[List[Dict]]) -> Optional[List[Dict]]:
    """Return games from tomorrow through *days* ahead, or None if ESPN failed."""
    today = datetime.now(_ET).date()
    upcoming: List[Dict] = []

    start_date = today + timedelta(days=1)
    end_date = today + timedelta(days=days)

    events = _upcoming_month_events(start_date, end_date)
    if events is None:
        return None

    for event in events:
        game = _parse_espn_game(event)
        if not game:
            continue

        try:
            event_dt = datetime.fromisoformat(event.get("date", "").replace("Z", "+00:00"))
            et_dt = event_dt.astimezone(_ET)
            date_str = et_dt.strftime("%Y%m%d")
            status_text = et_dt.strftime("%b %d")
        except Exception:
            date_str = start_date.strftime("%Y%m%d")
            status_text = start_date.strftime("%b %d")

        # Month requests include days outside the window (e.g. earlier this month).
        if not start_date.strftime("%Y%m%d") <= date_str <= end_date.strftime("%Y%m%d"):
            continue

        home_tri = game["home"]["tricode"]
        away_tri = game["away"]["tricode"]
        game["gameDate"] = date_str
        game["statusText"] = status_text
        game["players"]["home"] = _roster_from_pkl(home_tri, nba_data)
        game["players"]["away"] = _roster_from_pkl(away_tri, nba_data)
        upcoming.append(game)

    return upcoming


# ---------------------------------------------------------------------------
# Public API (identical signatures to original)
# ---------------------------------------------------------------------------

def get_todays_games(nba_data: Optional[List[Dict]] = None) -> List[Dict]:
    """Return today's games with live scores and player stats where available."""
    data = _get(_SCOREBOARD, params={"dates": _todays_date_str()})
    if not data:
        return []

    result = []
    for event in data.get("events", []):
        game = _parse_espn_game(event)
        if not game:
            continue

        home_tri = game["home"]["tricode"]
        away_tri = game["away"]["tricode"]

        if game["status"] in (2, 3):
            # Live or final ΓÇö fetch real boxscore
            players = _fetch_boxscore(game["gameId"], home_tri, away_tri)
            if players["home"] or players["away"]:
                _apply_boxscore_teams(players, home_tri, away_tri, nba_data)
                game["players"] = players
            else:
                # Fall back to season rosters if boxscore is empty
                game["players"]["home"] = _roster_from_pkl(home_tri, nba_data)
                game["players"]["away"] = _roster_from_pkl(away_tri, nba_data)
        else:
            # Scheduled later today ΓÇö show season rosters
            game["players"]["home"] = _roster_from_pkl(home_tri, nba_data)
            game["players"]["away"] = _roster_from_pkl(away_tri, nba_data)

        result.append(game)

    return result


# ---------------------------------------------------------------------------
# Play-by-play + shot chart (ESPN summary `plays`)
# ---------------------------------------------------------------------------

# ESPN marks free throws as shooting plays but gives them a sentinel coordinate
# (int32 min, ~-2.1e9). Any coordinate this far out of range is not a court location.
_COORD_SENTINEL_LIMIT = 1000


def _play_category(type_text: str, description: str, score_value: int,
                   scoring: bool, shooting: bool) -> str:
    """Classify a play for ticker colour-coding.

    Returns one of: 'three', 'dunk', 'steal', 'block', 'score', 'miss', 'event'.
    A made 3PT always wins (that's the marquee event users want highlighted).
    ESPN has no standalone steal/block play types, so those are detected from the
    play description text ("... blocks ...", "... steals ...").
    """
    type_lower = (type_text or "").lower()
    desc_lower = (description or "").lower()
    combined = f"{type_lower} {desc_lower}"

    if shooting and scoring and score_value == 3:
        return "three"
    if "dunk" in combined or "alley" in combined:
        return "dunk"
    if "steal" in combined:
        return "steal"
    if "block" in combined:
        return "block"
    if shooting:
        return "score" if scoring else "miss"
    return "event"

def _parse_play(play: Dict) -> Optional[Dict]:
    """Convert one ESPN play object into our internal shape."""
    try:
        type_obj = play.get("type", {}) or {}
        type_text = type_obj.get("text", "")
        period_obj = play.get("period", {}) or {}
        clock_obj = play.get("clock", {}) or {}
        team_obj = play.get("team", {}) or {}

        shooting = bool(play.get("shootingPlay"))
        scoring = bool(play.get("scoringPlay"))
        score_value = int(play.get("scoreValue", 0) or 0)

        team_id = str(team_obj.get("id", "")) if team_obj else ""
        tricode = ESPN_TEAM_ID_TO_TRICODE.get(team_id, "")

        # Shot coordinate (field goals only - free throws carry a sentinel value).
        shot = None
        coord = play.get("coordinate") or {}
        cx, cy = coord.get("x"), coord.get("y")
        is_field_goal = shooting and "free throw" not in type_text.lower()
        if (is_field_goal and isinstance(cx, (int, float)) and isinstance(cy, (int, float))
                and abs(cx) <= _COORD_SENTINEL_LIMIT and abs(cy) <= _COORD_SENTINEL_LIMIT):
            shot = {
                "x": int(cx),
                "y": int(cy),
                "made": scoring,
                "value": score_value if score_value else (3 if "three" in type_text.lower() else 2),
                "type": type_text,
            }

        category = _play_category(type_text, play.get("text", ""), score_value, scoring, shooting)

        return {
            "id": str(play.get("id", "")),
            "sequence": int(play.get("sequenceNumber", 0) or 0),
            "period": int(period_obj.get("number", 0) or 0),
            "periodLabel": period_obj.get("displayValue", ""),
            "clock": clock_obj.get("displayValue", ""),
            "text": play.get("text", ""),
            "team": tricode,
            "teamId": team_id,
            "scoring": scoring,
            "shooting": shooting,
            "scoreValue": score_value,
            "awayScore": int(play.get("awayScore", 0) or 0),
            "homeScore": int(play.get("homeScore", 0) or 0),
            "category": category,
            "shot": shot,
        }
    except Exception as exc:
        print(f"[live_games] play parse error: {exc}")
        return None

def get_upcoming_games(days: int = 365, nba_data: Optional[List[Dict]] = None) -> List[Dict]:
    """Return scheduled games in the next *days* days, cached in nba_upcoming_data.csv."""
    cache_date = _todays_date_str()
    cached_games = _load_upcoming_csv(cache_date)

    if cached_games is not None:
        return _attach_rosters(_filter_games_by_days(cached_games, days), nba_data)

    upcoming = _fetch_upcoming_games(365, nba_data)
    if upcoming is None:
        # Don't cache a failure; the next request will retry ESPN.
        return []
    _write_upcoming_csv(cache_date, upcoming)
    return _attach_rosters(_filter_games_by_days(upcoming, days), nba_data)


def current_week_bounds(now=None):
    """Return the Monday/Sunday dates for the current US Eastern week."""
    if now is None:
        eastern = datetime.now(_ET)
    elif now.tzinfo is None:
        eastern = now.replace(tzinfo=_ET)
    else:
        eastern = now.astimezone(_ET)
    start = eastern.date() - timedelta(days=eastern.weekday())
    return start, start + timedelta(days=6)


def _is_started(event: Dict) -> bool:
    status_type = event.get("status", {}).get("type", {})
    state = status_type.get("state")
    return state == "in" or (state == "post" and status_type.get("completed") is True)


def _event_tipoff(event: Dict) -> datetime:
    value = event.get("date", "")
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)
    except (TypeError, ValueError):
        return datetime.max.replace(tzinfo=timezone.utc)


def _weekly_events(day, today):
    date_key = day.strftime("%Y%m%d")
    cached = _WEEK_DAY_CACHE.get(date_key)
    if cached is not None:
        return cached["events"]
    data = _get(_SCOREBOARD, params={"dates": date_key})
    if data is None:
        return []
    events = [event for event in data.get("events", []) if _is_started(event)]
    if day < today and all(event.get("status", {}).get("type", {}).get("state") != "in" for event in events):
        _WEEK_DAY_CACHE[date_key] = {"events": events}
    return events


def _weekly_boxscore(game: Dict, is_live: bool):
    game_id = str(game["gameId"])
    now_ts = time.time()
    cached = _WEEK_BOX_CACHE.get(game_id)
    if cached and (cached["final"] or (is_live and now_ts - cached["ts"] < LIVE_BOX_TTL)):
        return cached["players"]
    if not is_live:
        # A summary cached while the game was live must be refreshed once before
        # the final result is retained for the rest of this process.
        summary_key = _SUMMARY + str(sorted({"event": game_id}.items()))
        _cache.pop(summary_key, None)
    players = _fetch_boxscore(game_id, game["home"]["tricode"], game["away"]["tricode"])
    if players.get("home") or players.get("away"):
        _WEEK_BOX_CACHE[game_id] = {
            "players": players, "final": not is_live, "ts": now_ts,
        }
    return players


def get_weekly_top_pra(now=None) -> Dict:
    """Return this Eastern calendar week's best single-game PRA performance."""
    if now is None:
        eastern_now = datetime.now(_ET)
    elif now.tzinfo is None:
        eastern_now = now.replace(tzinfo=_ET)
    else:
        eastern_now = now.astimezone(_ET)
    week_start, week_end = current_week_bounds(eastern_now)
    result = {
        "player": None,
        "week_start": week_start.isoformat(),
        "week_end": week_end.isoformat(),
    }
    events = {}
    day = week_start
    while day <= min(eastern_now.date(), week_end):
        for event in _weekly_events(day, eastern_now.date()):
            events[str(event.get("id", ""))] = (event, day)
        day += timedelta(days=1)

    candidates = []
    for event, game_day in events.values():
        try:
            game = _parse_espn_game(event)
            if not game:
                continue
            is_live = game["status"] == 2
            players = _weekly_boxscore(game, is_live)
            for side, opponent_side in (("home", "away"), ("away", "home")):
                for player in players.get(side, []):
                    if player.get("status") == "DNP":
                        continue
                    pts = int(player.get("pts", 0) or 0)
                    reb = int(player.get("reb", 0) or 0)
                    ast = int(player.get("ast", 0) or 0)
                    candidate = {
                        "name": player.get("name", ""),
                        "team": game[side]["tricode"],
                        "position": player.get("position", ""),
                        "pts": pts, "reb": reb, "ast": ast,
                        "pra": pts + reb + ast,
                        "opponent": game[opponent_side]["tricode"],
                        "game_id": str(game["gameId"]),
                        "game_date": game_day.isoformat(),
                        "is_live": is_live,
                        "player_id": player.get("personId"),
                    }
                    candidates.append((candidate, _event_tipoff(event)))
        except Exception as exc:
            print(f"[live_games] weekly PRA game error ({event.get('id', '')}): {exc}")

    if candidates:
        result["player"] = min(
            candidates,
            key=lambda item: (-item[0]["pra"], item[1], item[0]["name"].casefold()),
        )[0]
    return result


# ---------------------------------------------------------------------------
# Quick smoke test
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    print("Testing live_games.py with ESPN API...\n")
    games = get_todays_games()
    if games:
        print(f"Today's games ({len(games)}):")
        for g in games:
            h, a = g["home"], g["away"]
            print(f"  {a['tricode']} {a['score']}  @  {h['tricode']} {h['score']}  [{g['statusText']}]")
            n = len(g["players"]["home"]) + len(g["players"]["away"])
            print(f"    Player entries: {n}")
    else:
        print("No games today.")

    print(f"\nCurrent season: {_current_season()}")
