"""
injuries.py — league-wide NBA injury report, cached in memory for 15 minutes.

Source is ESPN's public injuries API, the same provider as live games and
standings. One request returns every listed player in the league, so the whole
report is cached as a dict keyed by NBA.com player ID; a popup or roster lookup
is then a dict read rather than a network call.

ESPN names players, not NBA.com IDs, so rows are matched by name through
nba_player_id(), the same resolver the live box scores use. Names it cannot
resolve are dropped (a fix goes in NAME_ALIASES in app/utils/player_ids.py).

Each entry:
    {
      "status": "Out" | "Day-To-Day" | "Suspension" | ...,
      "status_abbr": "OUT" | "DTD" | "SUSP" | ...,
      "injury": "Foot",                     # body part, "" if ESPN gives none
      "detail": "Fracture",                 # "" if none
      "side": "Left",                       # "" if none / not applicable
      "return_date": "2026-12-12" | None,   # ESPN's expected return, if given
      "note": "Gueye (foot) is ready ...",  # ESPN's short comment
      "updated": "2026-11-13T00:06Z",
      "espnId": 4712863 | None,
      "name": "Mouhamed Gueye",             # ESPN's spelling
      "team": "ATL" | "",                   # our tricode for ESPN's team
      "position": "F" | "",                 # ESPN's position abbreviation
    }

Not stored in Postgres: the report is a "right now" snapshot. Keeping a history
(e.g. as a future model feature) would need a table and a refresh job.
"""

import re
import threading
import time
from typing import Dict, Optional

import requests

from app.services.live_games import _normalize_tricode
from app.utils.player_ids import nba_player_id

CACHE_TTL = 900  # 15 minutes: statuses change through the day, but not by the minute
_ESPN_INJURIES = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/injuries"

_cache: Optional[Dict] = None  # {"data": {player_id: entry}, "ts": float}
_lock = threading.Lock()

# ESPN's fantasyStatus abbreviation is "OUT" / "GTD" etc.; these are the labels the UI shows.
_STATUS_ABBR = {
    "out": "OUT",
    "day-to-day": "DTD",
    "suspension": "SUSP",
    "questionable": "Q",
    "doubtful": "D",
    "probable": "P",
}

_ESPN_ID_RE = re.compile(r"/id/(\d+)|/players/full/(\d+)\.png")


def _espn_id(athlete: Dict) -> Optional[int]:
    """ESPN's athlete ID. The injuries feed only carries it inside link and headshot URLs."""
    urls = [link.get("href", "") for link in athlete.get("links") or []]
    urls.append((athlete.get("headshot") or {}).get("href", ""))
    for url in urls:
        match = _ESPN_ID_RE.search(url or "")
        if match:
            return int(match.group(1) or match.group(2))
    return None


def _status_abbr(status: str) -> str:
    return _STATUS_ABBR.get(status.strip().lower(), status.strip().upper()[:4])


def parse_injuries(payload: Dict) -> Dict[int, Dict]:
    """ESPN injuries JSON -> {nba_player_id: entry}. Malformed rows are skipped."""
    report: Dict[int, Dict] = {}
    for team in (payload or {}).get("injuries") or []:
        for row in team.get("injuries") or []:
            try:
                athlete = row.get("athlete") or {}
                player_id = nba_player_id(athlete.get("displayName") or "")
                status = (row.get("status") or "").strip()
                if not player_id or not status:
                    continue
                details = row.get("details") or {}
                entry = {
                    "status": status,
                    "status_abbr": _status_abbr(status),
                    "injury": details.get("type") or "",
                    "detail": details.get("detail") or "",
                    "side": details.get("side") or "",
                    "return_date": details.get("returnDate") or None,
                    "note": row.get("shortComment") or "",
                    "updated": row.get("date") or None,
                    "espnId": _espn_id(athlete),
                    "name": athlete.get("displayName") or "",
                    "team": _normalize_tricode((athlete.get("team") or {}).get("abbreviation") or ""),
                    "position": (athlete.get("position") or {}).get("abbreviation") or "",
                }
            except (AttributeError, TypeError, ValueError) as exc:
                print(f"[injuries] skipping malformed row: {exc}")
                continue
            # A player listed twice keeps the newest update (ISO strings sort by time).
            previous = report.get(player_id)
            if previous is None or (entry["updated"] or "") >= (previous["updated"] or ""):
                report[player_id] = entry
    return report


def _fetch() -> Dict[int, Dict]:
    response = requests.get(_ESPN_INJURIES, timeout=10)
    response.raise_for_status()
    return parse_injuries(response.json())


def get_injuries(force_refresh: bool = False) -> Dict[int, Dict]:
    """The whole report, refreshed at most once per CACHE_TTL.

    Never raises: on a failed refresh it serves the last good report, or {} if
    there has never been one, so an ESPN outage only hides the badges."""
    global _cache
    cached = _cache
    if not force_refresh and cached is not None and time.time() - cached["ts"] < CACHE_TTL:
        return cached["data"]

    with _lock:
        # Another thread may have refreshed while we waited for the lock.
        cached = _cache
        if not force_refresh and cached is not None and time.time() - cached["ts"] < CACHE_TTL:
            return cached["data"]
        try:
            data = _fetch()
        except Exception as exc:
            print(f"[injuries] refresh failed: {exc}")
            if cached is not None:
                # Retry after a full TTL rather than on every request while ESPN is down.
                _cache = {"data": cached["data"], "ts": time.time()}
                return cached["data"]
            _cache = {"data": {}, "ts": time.time()}
            return {}
        _cache = {"data": data, "ts": time.time()}
        return data


def injury_for(player_id) -> Optional[Dict]:
    """This player's current injury entry, or None if they are not on the report."""
    return get_injuries().get(player_id)
