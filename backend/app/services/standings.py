"""
standings.py — NBA conference standings, cached hourly server-side.

Primary source is ESPN's public standings API, the same provider used by
app.services.live_games. nba_api's LeagueStandings (stats.nba.com) is only a
fallback: that host is blocked on several cloud platforms (Render), where trying
it first made every uncached season wait out the full request timeout (~15s)
before ESPN was even asked.

Standings are available for any season the app has stats for: from
game_archive.FIRST_GAME_LOG_SEASON (1993-94) through the current season.

Public interface:
  get_standings(season=None, force_refresh=False) -> Dict with keys:
    {
      "east": [TeamStanding, ...],   # ordered by conference rank (seed 1..15)
      "west": [TeamStanding, ...],
      "season": 2026,                # ESPN end year (2026 == 2025-26)
      "season_label": "2025-26",
      "seasons": [2026, 2025, ...],  # every selectable end year, newest first
      "source": "nba_api" | "espn",
      "updated_at": ISO-8601 UTC string,
    }

  available_seasons() -> List[int]  # selectable end years, newest first

Each TeamStanding is:
    {
      "rank": int,            # conference playoff seed
      "team_id": int,
      "tricode": str,         # e.g. "BOS"
      "team": str,            # full name, e.g. "Boston Celtics"
      "logo": str,            # NBA CDN logo URL
      "logo_fallback": str,   # ESPN PNG logo, used if the NBA SVG fails to load
      "wins": int,
      "losses": int,
      "pct": float,           # win percentage, 0..1 (3 dp)
      "gb": float,            # games behind conference leader (0 for leader)
      "home": str,            # e.g. "12-4"
      "away": str,            # e.g. "8-6"
      "streak": str,          # e.g. "W3" / "L2"
      "l10": str,             # e.g. "7-3"
    }
"""

import threading
import time
from datetime import datetime, timezone
from typing import Dict, List, Optional

import requests

from app.services.game_archive import (
    FIRST_GAME_LOG_SEASON,
    current_season_year,
    season_label,
)
from app.services.live_games import TEAM_IDS, TEAM_LOGOS, _normalize_tricode

# ---------------------------------------------------------------------------
# Hourly cache, keyed by season end year
# ---------------------------------------------------------------------------
CACHE_TTL = 3600  # 1 hour
_cache: Dict[int, Dict] = {}
_lock = threading.Lock()

_ESPN_STANDINGS = "https://site.api.espn.com/apis/v2/sports/basketball/nba/standings"

# NBA team id -> tricode, for the nba_api path.
_ID_TO_TRICODE = {tid: tri for tri, tid in TEAM_IDS.items()}


def available_seasons() -> List[int]:
    """Selectable standings seasons as ESPN end years, newest first.

    Bounded by the app's own stats coverage: FIRST_GAME_LOG_SEASON (1993-94)
    through the current season.
    """
    newest = current_season_year()
    return list(range(newest, FIRST_GAME_LOG_SEASON - 1, -1))


def _resolve_season(season: Optional[object]) -> int:
    """Clamp a requested season (end year) into the available range.

    Accepts an int, a numeric string ('2015'), or None/'current' for the
    current season. Anything out of range is clamped to the nearest valid year.
    """
    seasons = available_seasons()
    newest, oldest = seasons[0], seasons[-1]
    if season is None or str(season).lower() in ("", "current", "latest"):
        return newest
    try:
        year = int(str(season).strip())
    except (TypeError, ValueError):
        return newest
    return max(oldest, min(newest, year))


def _pct(wins: int, losses: int) -> float:
    total = wins + losses
    return round(wins / total, 3) if total else 0.0


def _logo_for(tricode: str, fallback: str = "") -> str:
    return TEAM_LOGOS.get(tricode) or fallback


def _espn_logo_for(tricode: str) -> str:
    """ESPN's PNG team logo, keyed by lowercase tricode. Used as a reliable
    fallback when the NBA CDN SVG fails to load in the browser."""
    return f"https://a.espncdn.com/i/teamlogos/nba/500/{tricode.lower()}.png" if tricode else ""


# ---------------------------------------------------------------------------
# Fallback source: nba_api LeagueStandings (stats.nba.com)
# ---------------------------------------------------------------------------

def _fetch_from_nba_api(season_lbl: str) -> Optional[Dict[str, List[Dict]]]:
    try:
        from nba_api.stats.endpoints import leaguestandings
    except ImportError:
        return None

    try:
        resp = leaguestandings.LeagueStandings(
            season=season_lbl, season_type="Regular Season", timeout=15,
        )
        rows = resp.get_normalized_dict().get("Standings", [])
    except Exception as exc:
        print(f"[standings] nba_api fetch failed: {exc}")
        return None

    if not rows:
        return None

    east: List[Dict] = []
    west: List[Dict] = []
    for row in rows:
        try:
            team_id = int(row.get("TeamID"))
            tricode = _ID_TO_TRICODE.get(team_id, "")
            wins = int(row.get("WINS", 0) or 0)
            losses = int(row.get("LOSSES", 0) or 0)
            gb_raw = row.get("ConferenceGamesBack", 0) or 0
            try:
                gb = round(float(gb_raw), 1)
            except (TypeError, ValueError):
                gb = 0.0
            win_pct = row.get("WinPCT")
            try:
                pct = round(float(win_pct), 3)
            except (TypeError, ValueError):
                pct = _pct(wins, losses)

            team = {
                "rank": int(row.get("PlayoffRank", 0) or 0),
                "team_id": team_id,
                "tricode": tricode,
                "team": f"{row.get('TeamCity', '')} {row.get('TeamName', '')}".strip(),
                "logo": _logo_for(tricode),
                "logo_fallback": _espn_logo_for(tricode),
                "wins": wins,
                "losses": losses,
                "pct": pct,
                "gb": gb,
                "home": str(row.get("HOME", "") or ""),
                "away": str(row.get("ROAD", "") or ""),
                "streak": str(row.get("strCurrentStreak", "") or "").replace(" ", ""),
                "l10": str(row.get("L10", "") or ""),
            }
            conference = (row.get("Conference") or "").lower()
            (east if conference.startswith("east") else west).append(team)
        except Exception as exc:
            print(f"[standings] skipping nba_api row: {exc}")

    if not east or not west:
        return None

    east.sort(key=lambda t: t["rank"])
    west.sort(key=lambda t: t["rank"])
    return {"east": east, "west": west}


# ---------------------------------------------------------------------------
# Primary source: ESPN public standings API
# ---------------------------------------------------------------------------

def _espn_stat(entry: Dict, name: str, default="") -> str:
    for stat in entry.get("stats", []):
        if stat.get("name") == name or stat.get("type") == name:
            return stat.get("displayValue", default)
    return default


def _espn_stat_value(entry: Dict, name: str, default=0.0) -> float:
    for stat in entry.get("stats", []):
        if stat.get("name") == name or stat.get("type") == name:
            value = stat.get("value", default)
            try:
                return float(value)
            except (TypeError, ValueError):
                return default
    return default


def _fetch_from_espn(season_year: int) -> Optional[Dict[str, List[Dict]]]:
    try:
        r = requests.get(_ESPN_STANDINGS, params={"season": season_year}, timeout=15)
        r.raise_for_status()
        data = r.json()
    except Exception as exc:
        print(f"[standings] ESPN fetch failed: {exc}")
        return None

    conferences = {"east": [], "west": []}
    for child in data.get("children", []):
        name = (child.get("name") or "").lower()
        if "east" in name:
            key = "east"
        elif "west" in name:
            key = "west"
        else:
            continue

        entries = child.get("standings", {}).get("entries", [])
        for entry in entries:
            try:
                team_info = entry.get("team", {})
                tricode = _normalize_tricode(team_info.get("abbreviation", ""))
                wins = int(_espn_stat_value(entry, "wins", 0))
                losses = int(_espn_stat_value(entry, "losses", 0))
                gb_raw = _espn_stat(entry, "gamesBehind", "0")
                try:
                    gb = 0.0 if gb_raw in ("-", "") else round(float(gb_raw), 1)
                except ValueError:
                    gb = 0.0
                pct = round(_espn_stat_value(entry, "winPercent", _pct(wins, losses)), 3)
                seed = int(_espn_stat_value(entry, "playoffSeed", 0))

                conferences[key].append({
                    "rank": seed,
                    "team_id": TEAM_IDS.get(tricode, 0),
                    "tricode": tricode,
                    "team": team_info.get("displayName", ""),
                    "logo": _logo_for(tricode, _espn_logo(team_info)),
                    "logo_fallback": _espn_logo(team_info) or _espn_logo_for(tricode),
                    "wins": wins,
                    "losses": losses,
                    "pct": pct,
                    "gb": gb,
                    "home": _espn_stat(entry, "Home", "") or _espn_stat(entry, "home", ""),
                    "away": _espn_stat(entry, "Road", "") or _espn_stat(entry, "road", ""),
                    "streak": _espn_stat(entry, "streak", ""),
                    "l10": _espn_stat(entry, "Last Ten Games", "")
                            or _espn_stat(entry, "lasttengames", ""),
                })
            except Exception as exc:
                print(f"[standings] skipping ESPN entry: {exc}")

    if not conferences["east"] or not conferences["west"]:
        return None

    # ESPN already returns entries in seed order, but sort defensively. Fall back
    # to win% when a seed is missing so a 0 never floats to the top.
    for key in ("east", "west"):
        conferences[key].sort(key=lambda t: (t["rank"] if t["rank"] else 99, -t["pct"]))
        # Re-number ranks 1..N in case any seed was missing/zero.
        for i, team in enumerate(conferences[key], start=1):
            team["rank"] = i
    return conferences


def _espn_logo(team_info: Dict) -> str:
    logos = team_info.get("logos", [])
    if logos and isinstance(logos, list):
        return logos[0].get("href", "")
    return ""


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def _build(season_year: int) -> Dict:
    label = season_label(season_year)
    # ESPN first: it answers in well under a second everywhere, while
    # stats.nba.com hangs until timeout on hosts that block it.
    source = "espn"
    conferences = _fetch_from_espn(season_year)
    if conferences is None:
        source = "nba_api"
        conferences = _fetch_from_nba_api(label)
    if conferences is None:
        raise RuntimeError(f"Both ESPN and nba_api standings sources failed for {label}")

    return {
        "east": conferences["east"],
        "west": conferences["west"],
        "season": season_year,
        "season_label": label,
        "seasons": available_seasons(),
        "source": source,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }


def get_standings(season: Optional[object] = None, force_refresh: bool = False) -> Dict:
    """Return conference standings for a season, refreshing at most once per hour.

    season is an ESPN end year (2026 == 2025-26); None means the current season.
    Out-of-range values are clamped to the available range.
    """
    year = _resolve_season(season)
    now = time.time()
    cached = _cache.get(year)
    if not force_refresh and cached is not None and now - cached["ts"] < CACHE_TTL:
        return cached["data"]

    with _lock:
        # Another thread may have refreshed while we waited for the lock.
        now = time.time()
        cached = _cache.get(year)
        if not force_refresh and cached is not None and now - cached["ts"] < CACHE_TTL:
            return cached["data"]

        try:
            data = _build(year)
        except Exception as exc:
            # Serve stale data rather than failing if we have any.
            if cached is not None:
                print(f"[standings] refresh failed, serving stale cache: {exc}")
                return cached["data"]
            raise

        _cache[year] = {"data": data, "ts": time.time()}
        return data
