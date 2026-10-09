"""
One player ID across the app: the NBA.com person ID (e.g. LeBron James = 2544).

Season data, search results, live box scores (ESPN) and the game archive all
identify players by this ID. Names are resolved with, in priority order:
  1. NBA_PLAYER_ID values the scraper stored in the multi-season data (from NBA.com
     game logs — covers two-way and undrafted players, newest season wins)
  2. nba_api's bundled list of every NBA player (active players, then newest ID, win)
"""
import pickle
import threading
import zlib
from typing import Dict, Optional

from app.utils.player_names import normalize_player_name

# ESPN / Basketball Reference spellings that differ from NBA.com, as normalized keys.
NAME_ALIASES = {
    "ron holland": "ronald holland",
    "egor dmin": "egor demin",  # 'Egor Dёmin' is spelled with a Cyrillic ё in the season data
}

FALLBACK_ID_BASE = 900_000_000

_index: Optional[Dict[str, int]] = None
_lock = threading.Lock()


def _season_data() -> Dict:
    from app import config, state  # lazy: state imports modules that import this one
    if state.multi_season_data:
        return state.multi_season_data
    try:
        with open(config.data_path(config.MULTI_SEASON_DATA_FILE), "rb") as handle:
            return pickle.load(handle)
    except (OSError, pickle.UnpicklingError) as exc:
        print(f"[player_ids] multi-season data unavailable: {exc}")
        return {}


def _build_index() -> Dict[str, int]:
    index: Dict[str, int] = {}
    try:
        from nba_api.stats.static import players
        for player in sorted(players.get_players(), key=lambda p: (p["is_active"], p["id"])):
            index[normalize_player_name(player["full_name"])] = player["id"]
    except Exception as exc:
        print(f"[player_ids] nba_api player list unavailable: {exc}")

    seasons = _season_data()
    for season in sorted(seasons):
        for player in seasons[season] or []:
            player_id = player.get("NBA_PLAYER_ID")
            if player_id and player.get("PLAYER_NAME"):
                index[normalize_player_name(player["PLAYER_NAME"])] = int(player_id)
    return index


def nba_player_id(name: str) -> Optional[int]:
    """NBA.com person ID for a player name from any source, or None if unknown."""
    global _index
    if _index is None:
        with _lock:
            if _index is None:
                _index = _build_index()
    key = normalize_player_name(name)
    return _index.get(key) or _index.get(NAME_ALIASES.get(key, ""))


def player_id_for(name: str) -> int:
    """NBA.com ID, or a stable fallback (900,000,000+, never a real NBA ID) for unknown names."""
    player_id = nba_player_id(name)
    if player_id:
        return player_id
    return FALLBACK_ID_BASE + zlib.crc32(normalize_player_name(name).encode()) % 99_999_999


def reset_index() -> None:
    """Rebuild on next lookup (after the season data is reloaded)."""
    global _index
    _index = None
