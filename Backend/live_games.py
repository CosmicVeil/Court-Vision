"""
live_games.py  —  NBA live game data via stats.nba.com (SportRadar-backed)

WHAT CHANGED vs original:
  - cdn.nba.com was returning SSL cert errors + 403s. Dropped entirely.
  - Uses stats.nba.com endpoints which are the same data, more stable, and
    don't require Playwright or browser fingerprinting.
  - scoreboard:  /stats/scoreboardv3         (replaces todaysScoreboard CDN)
  - boxscore:    /stats/boxscoretraditionalv3 (replaces CDN boxscore JSON)
  - schedule:    /stats/scheduleleaguev2      (replaces CDN schedule JSON)
  - All three endpoints need the same nba-stats headers (Origin + Referer +
    x-nba-stats-token). Without them you get 403s, same as before.
  - Public interface (_fmt_player_live, get_todays_games, get_upcoming_games,
    get_top_pra_player, _roster_from_pkl) is 100% unchanged so callers don't
    need to be updated.

SportRadar boxscore shape (what we actually receive):
  {
    "player_stats": {
      "SAS": [ { "name": "...", "position": "G", "stats": { "points": 6, "rebounds": 1, ... } }, ... ],
      "OKC": [ ... ]
    },
    "home": "SAS",
    "away": "OKC",
    ...
  }
  Fields inside stats{}: points, rebounds, assists, steals, blocks,
  field_goals_made/att, three_points_made/att, free_throws_made/att,
  turnovers, pls_min  (NOT reboundsTotal, NOT minutesCalculated, etc.)
"""

import requests
import time
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional, Any

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

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

# stats.nba.com endpoints  (no CDN, no SSL issues)
_BASE        = "https://stats.nba.com/stats"
_SCOREBOARD  = f"{_BASE}/scoreboardv3"
_BOXSCORE    = f"{_BASE}/boxscoretraditionalv3"
_SCHEDULE    = f"{_BASE}/scheduleleaguev2"

# ---------------------------------------------------------------------------
# HTTP session — must send these headers or stats.nba.com returns 403
# ---------------------------------------------------------------------------

def _make_session() -> requests.Session:
    s = requests.Session()
    s.headers.update({
        "Host":               "stats.nba.com",
        "User-Agent":         (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        ),
        "Accept":             "application/json, text/plain, */*",
        "Accept-Language":    "en-US,en;q=0.9",
        "Accept-Encoding":    "gzip, deflate, br",
        "x-nba-stats-origin": "stats",
        "x-nba-stats-token":  "true",
        "Origin":             "https://www.nba.com",
        "Referer":            "https://www.nba.com/",
        "Connection":         "keep-alive",
        "Sec-Fetch-Dest":     "empty",
        "Sec-Fetch-Mode":     "cors",
        "Sec-Fetch-Site":     "same-site",
    })
    return s

_SESSION = _make_session()

# ---------------------------------------------------------------------------
# Simple TTL cache (same contract as original _cache)
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
        r = _SESSION.get(url, params=params, timeout=10)
        r.raise_for_status()
        data = r.json()
        _cache[cache_key] = {"data": data, "ts": now}
        return data
    except Exception as exc:
        print(f"[live_games] fetch error ({url}): {exc}")
        return None


# ---------------------------------------------------------------------------
# scoreboardv3 helpers
# ---------------------------------------------------------------------------

def _parse_scoreboard_game(g: Dict) -> Dict:
    """
    scoreboardv3 game object → our internal game dict.
    Mirrors the structure the original code produced from the CDN payload.
    """
    game_id     = g.get("gameId", "")
    status_num  = g.get("gameStatus", 1)
    status_text = g.get("gameStatusText", "").strip()
    period      = g.get("period", 0)
    game_clock  = g.get("gameClock", "")
    arena       = g.get("arenaName", "")
    game_time   = g.get("gameTimeEst", g.get("gameEt", ""))

    def _team(key: str) -> Dict:
        t = g.get(key, {})
        tri = t.get("teamTricode", "")
        wins   = t.get("wins",   t.get("record", {}).get("wins",   0))
        losses = t.get("losses", t.get("record", {}).get("losses", 0))
        periods = t.get("periods", [])
        quarters = [
            {"q": p.get("period", i + 1), "score": p.get("score", 0)}
            for i, p in enumerate(periods)
        ]
        return {
            "tricode":  tri,
            "name":     t.get("teamName", ""),
            "city":     t.get("teamCity", ""),
            "score":    t.get("score", 0),
            "logo":     TEAM_LOGOS.get(tri, ""),
            "quarters": quarters,
            "record":   f"{wins}-{losses}",
        }

    return {
        "gameId":     game_id,
        "status":     status_num,
        "statusText": status_text,
        "gameTime":   game_time,
        "arena":      arena,
        "home":       _team("homeTeam"),
        "away":       _team("awayTeam"),
        "period":     period,
        "gameClock":  game_clock,
        "players":    {"home": [], "away": []},
    }


def _todays_date_str() -> str:
    """Return today's date in MM/DD/YYYY format (ET assumed)."""
    return datetime.now(timezone(timedelta(hours=-4))).strftime("%m/%d/%Y")


def _fetch_scoreboard() -> List[Dict]:
    """Call scoreboardv3 for today and return raw game list."""
    data = _get(_SCOREBOARD, params={
        "GameDate":  _todays_date_str(),
        "LeagueID":  "00",
        "DayOffset": "0",
    })
    if not data:
        return []
    # v3 nests under scoreboard → games
    return data.get("scoreboard", {}).get("games", [])


# ---------------------------------------------------------------------------
# boxscoretraditionalv3 helpers
# ---------------------------------------------------------------------------

def _fmt_player_live(p: Dict) -> Dict:
    """
    Format a player entry from the SportRadar boxscore → our internal format.

    SportRadar nests stats under p['stats'] (not p['statistics']), and uses
    snake_case field names that differ from the old NBA CDN format:
      rebounds        (not reboundsTotal)
      field_goals_made/att  (not fieldGoalsMade/Attempted)
      three_points_made/att (not threePointersMade/Attempted)
      free_throws_made/att  (not freeThrowsMade/Attempted)
      pls_min               (plus/minus, not plusMinusPoints)
    Minutes are not provided; we leave as "–".
    """
    s = p.get("stats", {})
    return {
        "personId":  p.get("personId"),
        "name":      p.get("name", ""),
        "jerseyNum": p.get("jerseyNum", ""),
        "position":  p.get("position", ""),
        "status":    p.get("status", "ACTIVE"),
        "oncourt":   p.get("oncourt", False),
        "pts":       s.get("points", 0),
        "reb":       s.get("rebounds", 0),
        "ast":       s.get("assists", 0),
        "stl":       s.get("steals", 0),
        "blk":       s.get("blocks", 0),
        "fgm":       s.get("field_goals_made", 0),
        "fga":       s.get("field_goals_att", 0),
        "fg3m":      s.get("three_points_made", 0),
        "fg3a":      s.get("three_points_att", 0),
        "ftm":       s.get("free_throws_made", 0),
        "fta":       s.get("free_throws_att", 0),
        "tov":       s.get("turnovers", 0),
        "min":       "–",
        "plusMinus": s.get("pls_min", 0),
    }


def _fetch_boxscore(game_id: str) -> Optional[Dict]:
    """
    Fetch boxscore for game_id from stats.nba.com/stats/boxscoretraditionalv3.

    The response will be parsed by _players_from_boxscore which handles
    both this shape AND the SportRadar shape (player_stats keyed by tricode)
    so that get_todays_games works whether we hit the API or use cached data.
    """
    return _get(_BOXSCORE, params={
        "GameID":      game_id,
        "StartPeriod": 0,
        "EndPeriod":   10,
        "RangeType":   0,
        "StartRange":  0,
        "EndRange":    0,
    })


def _players_from_boxscore(box: Dict, home_tri: str, away_tri: str) -> Dict[str, List[Dict]]:
    """
    Extract formatted home/away player lists from a boxscore response.

    Handles two shapes:
    1. SportRadar shape (what fetch_sports_data returns):
         { "player_stats": { "SAS": [...], "OKC": [...] }, "home": "SAS", "away": "OKC" }
    2. boxscoretraditionalv3 shape (from stats.nba.com):
         { "game": { "homeTeam": { "players": [...] }, "awayTeam": { "players": [...] } } }
    """
    # Shape 1: SportRadar — keyed by team tricode under "player_stats"
    if "player_stats" in box:
        ps = box["player_stats"]
        return {
            "home": [_fmt_player_live(p) for p in ps.get(home_tri, [])],
            "away": [_fmt_player_live(p) for p in ps.get(away_tri, [])],
        }

    # Shape 2: boxscoretraditionalv3 — nested under game.homeTeam/awayTeam
    game = box.get("game", {})
    return {
        "home": [_fmt_player_live(p) for p in game.get("homeTeam", {}).get("players", [])],
        "away": [_fmt_player_live(p) for p in game.get("awayTeam", {}).get("players", [])],
    }


# ---------------------------------------------------------------------------
# Roster from pkl (unchanged logic, same signature)
# ---------------------------------------------------------------------------

def _roster_from_pkl(tricode: str, nba_data: Optional[List[Dict]]) -> List[Dict]:
    """Build a zeroed-out game roster from pkl season data for a given team."""
    if not nba_data:
        return []
    players = [p for p in nba_data if p.get("TEAM") == tricode]
    result = []
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


# ---------------------------------------------------------------------------
# Public API (identical signatures to original)
# ---------------------------------------------------------------------------

def get_todays_games(nba_data: Optional[List[Dict]] = None) -> List[Dict]:
    """Return today's games with live scores and player stats where available."""
    raw_games = _fetch_scoreboard()
    if not raw_games:
        return []

    result = []
    for g in raw_games:
        game_obj = _parse_scoreboard_game(g)
        status   = game_obj["status"]
        game_id  = game_obj["gameId"]

        home_tri = game_obj["home"]["tricode"]
        away_tri = game_obj["away"]["tricode"]

        if status in (2, 3):
            # Live or final: try real boxscore, fall back to season roster
            box = _fetch_boxscore(game_id)
            if box:
                game_obj["players"] = _players_from_boxscore(box, home_tri, away_tri)
            # If boxscore fetch failed or returned empty, fall back to pkl
            if not game_obj["players"]["home"] and not game_obj["players"]["away"]:
                game_obj["players"]["home"] = _roster_from_pkl(home_tri, nba_data)
                game_obj["players"]["away"] = _roster_from_pkl(away_tri, nba_data)
        else:
            # Scheduled later today: show season rosters
            game_obj["players"]["home"] = _roster_from_pkl(home_tri, nba_data)
            game_obj["players"]["away"] = _roster_from_pkl(away_tri, nba_data)

        result.append(game_obj)

    return result


def get_upcoming_games(days: int = 7, nba_data: Optional[List[Dict]] = None) -> List[Dict]:
    """Return scheduled games in the next *days* days with season roster context."""
    data = _get(_SCHEDULE, params={
        "LeagueID": "00",
        "Season":   _current_season(),
    })
    if not data:
        return []

    today    = datetime.now(timezone.utc).date()
    upcoming = []

    # scheduleleaguev2 nests under leagueSchedule → gameDates
    game_dates = data.get("leagueSchedule", {}).get("gameDates", [])
    for gd in game_dates:
        try:
            date_str = gd.get("gameDate", "")[:10]
            sep      = "/" if "/" in date_str else "-"
            fmt      = "%m/%d/%Y" if sep == "/" else "%Y-%m-%d"
            game_date = datetime.strptime(date_str, fmt).date()
        except Exception:
            continue

        delta = (game_date - today).days
        if delta <= 0 or delta > days:
            continue

        for g in gd.get("games", []):
            home = g.get("homeTeam", {})
            away = g.get("awayTeam", {})
            home_tri = home.get("teamTricode", "")
            away_tri = away.get("teamTricode", "")

            upcoming.append({
                "gameId":     g.get("gameId", ""),
                "status":     1,
                "statusText": game_date.strftime("%b %d"),
                "gameTime":   g.get("gameDateTimeEst", ""),
                "arena":      g.get("arenaName", ""),
                "home": {
                    "tricode":  home_tri,
                    "name":     home.get("teamName", ""),
                    "city":     home.get("teamCity", ""),
                    "score":    0,
                    "logo":     TEAM_LOGOS.get(home_tri, ""),
                    "quarters": [],
                    "record":   "",
                },
                "away": {
                    "tricode":  away_tri,
                    "name":     away.get("teamName", ""),
                    "city":     away.get("teamCity", ""),
                    "score":    0,
                    "logo":     TEAM_LOGOS.get(away_tri, ""),
                    "quarters": [],
                    "record":   "",
                },
                "period":    0,
                "gameClock": "",
                "players": {
                    "home": _roster_from_pkl(home_tri, nba_data),
                    "away": _roster_from_pkl(away_tri, nba_data),
                },
            })

    return upcoming[:20]


def get_top_pra_player(
    nba_data: List[Dict], days: int = 7
) -> Optional[Dict]:
    """Return the player with highest PPG+RPG+APG from pkl season data."""
    if not nba_data:
        return None
    best = max(
        nba_data,
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
# Internal helpers
# ---------------------------------------------------------------------------

def _current_season() -> str:
    """Return the current NBA season string, e.g. '2024-25'."""
    now = datetime.now()
    year = now.year
    # NBA season starts in October; before October we're still in the prior season
    if now.month < 10:
        return f"{year - 1}-{str(year)[2:]}"
    return f"{year}-{str(year + 1)[2:]}"


# ---------------------------------------------------------------------------
# Quick smoke test
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    print("🏀 Testing live_games.py …\n")

    games = get_todays_games()
    if games:
        print(f"Today's games ({len(games)}):")
        for g in games:
            h, a = g["home"], g["away"]
            status = g["statusText"]
            print(f"  {a['tricode']} {a['score']}  @  {h['tricode']} {h['score']}  [{status}]")
            n_players = len(g["players"]["home"]) + len(g["players"]["away"])
            print(f"    Player entries: {n_players}")
    else:
        print("No games today (or API blocked in this environment).")

    print(f"\nCurrent season: {_current_season()}")