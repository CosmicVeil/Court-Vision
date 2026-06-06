"""
live_games.py — NBA game data via ESPN's public API

Switched from stats.nba.com (blocked on cloud servers) to ESPN's public API
which works reliably from any hosting platform including Render.

Endpoints used:
  Scoreboard: site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard
  Summary:    site.api.espn.com/apis/site/v2/sports/basketball/nba/summary

Public interface is identical to the original:
  get_todays_games(nba_data)      -> List[Dict]
  get_upcoming_games(days, nba_data) -> List[Dict]
  get_top_pra_player(nba_data)    -> Optional[Dict]
"""

import requests
import time
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional, Any

# ---------------------------------------------------------------------------
# ESPN API endpoints
# ---------------------------------------------------------------------------
_ESPN_BASE  = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba"
_SCOREBOARD = f"{_ESPN_BASE}/scoreboard"
_SUMMARY    = f"{_ESPN_BASE}/summary"

# ESPN sometimes uses shortened abbreviations — map them to standard tricodes
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

# ---------------------------------------------------------------------------
# Simple TTL cache
# ---------------------------------------------------------------------------
_cache: Dict[str, Dict] = {}
CACHE_TTL = 30  # seconds


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

        period      = status_obj.get("period", 0)
        clock       = status_obj.get("displayClock", "")
        status_text = status_type.get("shortDetail", status_type.get("description", ""))

        competitors = competition.get("competitors", [])
        home_comp   = next((c for c in competitors if c.get("homeAway") == "home"), {})
        away_comp   = next((c for c in competitors if c.get("homeAway") == "away"), {})

        def _parse_team(comp: Dict) -> Dict:
            team    = comp.get("team", {})
            tri     = _normalize_tricode(team.get("abbreviation", ""))
            score   = int(comp.get("score", 0) or 0)
            records = comp.get("records", [])
            record  = records[0].get("summary", "") if records else ""

            linescores = comp.get("linescores", [])
            quarters   = [
                {"q": i + 1, "score": int(ls.get("value", 0) or 0)}
                for i, ls in enumerate(linescores)
            ]

            # Prefer NBA CDN logo (more consistent quality)
            logo = TEAM_LOGOS.get(tri) or team.get("logo", "")

            return {
                "tricode":  tri,
                "name":     team.get("shortDisplayName", team.get("name", "")),
                "city":     team.get("location", ""),
                "score":    score,
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

    # ESPN stat label order: MIN PTS FG 3PT FT REB AST TO STL BLK +/- ...
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
                    "personId":  int(ath.get("id", 0) or 0),
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


def _roster_from_pkl(tricode: str, nba_data: Optional[List[Dict]]) -> List[Dict]:
    """Build a zeroed-out game roster from pkl season data for a given team."""
    if not nba_data:
        return []
    players = [p for p in nba_data if p.get("TEAM") == tricode]
    result  = []
    for p in players:
        name = p.get("PLAYER_NAME", "")
        result.append({
            "personId":   p.get("PLAYER_ID", abs(hash(name)) % 10 ** 7),
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
    return datetime.now(timezone(timedelta(hours=-4))).strftime("%Y%m%d")


def _current_season() -> str:
    """Return the current NBA season string, e.g. '2024-25'."""
    now  = datetime.now()
    year = now.year
    if now.month < 10:
        return f"{year - 1}-{str(year)[2:]}"
    return f"{year}-{str(year + 1)[2:]}"


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
            # Live or final — fetch real boxscore
            players = _fetch_boxscore(game["gameId"], home_tri, away_tri)
            if players["home"] or players["away"]:
                game["players"] = players
            else:
                # Fall back to season rosters if boxscore is empty
                game["players"]["home"] = _roster_from_pkl(home_tri, nba_data)
                game["players"]["away"] = _roster_from_pkl(away_tri, nba_data)
        else:
            # Scheduled later today — show season rosters
            game["players"]["home"] = _roster_from_pkl(home_tri, nba_data)
            game["players"]["away"] = _roster_from_pkl(away_tri, nba_data)

        result.append(game)

    return result


def get_upcoming_games(days: int = 7, nba_data: Optional[List[Dict]] = None) -> List[Dict]:
    """Return scheduled games in the next *days* days with season roster context."""
    today    = datetime.now(timezone(timedelta(hours=-4))).date()
    upcoming = []

    for delta in range(1, min(days + 1, 8)):
        check_date = today + timedelta(days=delta)
        date_str   = check_date.strftime("%Y%m%d")

        data = _get(_SCOREBOARD, params={"dates": date_str})
        if not data:
            continue

        for event in data.get("events", []):
            game = _parse_espn_game(event)
            if not game:
                continue

            home_tri = game["home"]["tricode"]
            away_tri = game["away"]["tricode"]
            game["statusText"]      = check_date.strftime("%b %d")
            game["players"]["home"] = _roster_from_pkl(home_tri, nba_data)
            game["players"]["away"] = _roster_from_pkl(away_tri, nba_data)
            upcoming.append(game)

        if len(upcoming) >= 20:
            break

    return upcoming[:20]


def get_top_pra_player(
    nba_data: List[Dict], days: int = 7
) -> Optional[Dict]:
    """Return the highest PRA player from teams active in the next 'days'."""
    if not nba_data:
        return None

    # Find which teams are playing today or in the next 'days'
    active_teams = set()
    today = datetime.now(timezone(timedelta(hours=-4))).date()
    
    for delta in range(days):
        check_date = today + timedelta(days=delta)
        date_str = check_date.strftime("%Y%m%d")
        data = _get(_SCOREBOARD, params={"dates": date_str})
        if data:
            for event in data.get("events", []):
                competition = (event.get("competitions") or [{}])[0]
                competitors = competition.get("competitors", [])
                for comp in competitors:
                    team = comp.get("team", {})
                    tri = _normalize_tricode(team.get("abbreviation", ""))
                    if tri:
                        active_teams.add(tri)
    
    # Filter players to only those whose team is active (prevents eliminated players)
    if active_teams:
        eligible_players = [p for p in nba_data if p.get("TEAM") in active_teams]
        if not eligible_players:
            eligible_players = nba_data
    else:
        eligible_players = nba_data

    best = max(
        eligible_players,
        key=lambda p: (
            (p.get("PPG_LAST") or 0)
            + (p.get("RPG_LAST") or 0)
            + (p.get("APG_LAST") or 0)
        ),
    )
    ppg = round(best.get("PPG_LAST", 0), 1)
    rpg = round(best.get("RPG_LAST", 0), 1)
    apg = round(best.get("APG_LAST", 0), 1)
    return {
        "name":      best.get("PLAYER_NAME", ""),
        "team":      best.get("TEAM", ""),
        "position":  best.get("POSITION", ""),
        "ppg":       ppg,
        "rpg":       rpg,
        "apg":       apg,
        "pra":       round(ppg + rpg + apg, 1),
        "spg":       round(best.get("SPG_LAST", 0), 1),
        "bpg":       round(best.get("BPG_LAST", 0), 1),
        "player_id": best.get("PLAYER_ID"),
    }


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