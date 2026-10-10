"""Runtime data shared by the API routes, loaded once by create_app()."""
import json
import os
import pickle
import unicodedata

from app import config, db
from app.services import game_archive
from app.utils import player_ids
from app.utils.player_names import fix_mojibake, normalize_player_name

is_render = False
ai_available = False
ai = None  # app.ml.nba_ai_system, loaded only outside low-memory mode
predictions_cache = None

nba_data = None
multi_season_data = None
nba_name_index = {}
multi_season_name_indexes = {}


def _repair_names(players):
    for player in players or []:
        if isinstance(player, dict) and 'PLAYER_NAME' in player:
            player['PLAYER_NAME'] = fix_mojibake(player['PLAYER_NAME'])
    return players


def _repair_predictions_cache(cache):
    if not isinstance(cache, dict):
        return cache
    for player in cache.get('all_players_list', []):
        if isinstance(player, dict):
            for key in ('name', 'PLAYER_NAME'):
                if key in player:
                    player[key] = fix_mojibake(player[key])
            if player.get('name'):
                player['id'] = player_ids.player_id_for(player['name'])
    bundle = cache.get('bundle', {})
    if isinstance(bundle, dict):
        bundle_values = bundle.values()
    elif isinstance(bundle, list):
        bundle_values = bundle
    else:
        bundle_values = []
    for entry in bundle_values:
        entries = entry if isinstance(entry, list) else [entry]
        for player in entries:
            if isinstance(player, dict):
                for key in ('name', 'PLAYER_NAME'):
                    if key in player:
                        player[key] = fix_mojibake(player[key])
    recommendations = cache.get('recommendations', {})
    if isinstance(recommendations, dict):
        for entries in recommendations.values():
            if not isinstance(entries, list):
                continue
            for player in entries:
                if isinstance(player, dict):
                    for key in ('name', 'PLAYER_NAME'):
                        if key in player:
                            player[key] = fix_mojibake(player[key])
    repaired_players = {}
    for key, value in cache.get('players', {}).items():
        if isinstance(value, dict):
            for name_key in ('name', 'PLAYER_NAME'):
                if name_key in value:
                    value[name_key] = fix_mojibake(value[name_key])
            if value.get('name'):
                value['id'] = player_ids.player_id_for(value['name'])
        repaired_players[normalize_player_name(key)] = value
    if 'players' in cache:
        cache['players'] = repaired_players
    return cache


def load_ai():
    """Low-memory (Render): serve the static predictions cache. Otherwise: use the full model."""
    global is_render, ai_available, ai, predictions_cache
    is_render = config.is_low_memory()
    if is_render:
        print("Running in low-memory environment (Render). Loading static AI predictions instead of full model.")
        try:
            with open(config.data_path(config.PREDICTIONS_CACHE_FILE), 'r') as f:
                predictions_cache = _repair_predictions_cache(json.load(f))
                ai_available = True
                print("Successfully loaded static predictions cache.")
        except Exception as e:
            print(f"Failed to load predictions_cache.json: {e}")
    else:
        try:
            from app.ml import nba_ai_system
            ai = nba_ai_system
            ai_available = True
        except ImportError as e:
            print(f"AI predictions module not available: {e}")


def get_cached_player_prediction(name: str):
    """Retrieve player prediction from static cache with case and accent normalization."""
    if not isinstance(predictions_cache, dict):
        return None
    players = predictions_cache.get('players', {})
    if not players or not name:
        return None
    name_clean = str(name).strip()
    name_lower = name_clean.lower()
    if name_lower in players:
        return players[name_lower]

    try:
        norm_target = unicodedata.normalize('NFKD', name_clean).encode('ascii', 'ignore').decode('ascii').lower()
        for k, v in players.items():
            norm_k = unicodedata.normalize('NFKD', k).encode('ascii', 'ignore').decode('ascii').lower()
            if norm_k == norm_target:
                return v
    except Exception:
        pass
    return None


def load_nba_data():
    global nba_data, nba_name_index
    try:
        with open(config.data_path(config.NBA_SEASON_DATA_FILE), 'rb') as f:
            seasonal_data = pickle.load(f)

        # Use the most recent season when the file holds several.
        nba_data = []
        if isinstance(seasonal_data, dict):
            most_recent_season = max(seasonal_data.keys())
            nba_data = _repair_names(seasonal_data[most_recent_season])
            print(f"Loaded {len(nba_data)} NBA players from {most_recent_season} season data")
        elif isinstance(seasonal_data, list):
            nba_data = _repair_names(seasonal_data)
            print(f"Loaded {len(nba_data)} NBA players from pickle file")
        else:
            print(f"Unexpected data format in pickle file: {type(seasonal_data)}")
            return False

        nba_name_index = {
            normalize_player_name(player.get('PLAYER_NAME')): player
            for player in nba_data
            if player.get('PLAYER_NAME')
        }
        return True
    except FileNotFoundError:
        print(f"NBA data file '{config.NBA_SEASON_DATA_FILE}' not found.")
        return False
    except Exception as e:
        print(f"Error loading NBA data: {e}")
        return False


def load_multi_season_data():
    global multi_season_data, multi_season_name_indexes
    try:
        data_file = config.data_path(config.MULTI_SEASON_DATA_FILE)
        if data_file.exists():
            with open(data_file, 'rb') as f:
                multi_season_data = pickle.load(f)
            for players in multi_season_data.values():
                _repair_names(players)
            multi_season_name_indexes = {
                season: {
                    normalize_player_name(player.get('PLAYER_NAME')): player
                    for player in players
                    if player.get('PLAYER_NAME')
                }
                for season, players in multi_season_data.items()
            }
            print(f"Loaded multi-season data for years: {list(multi_season_data.keys())}")
            return True
        else:
            print(f"Multi-season data file '{config.MULTI_SEASON_DATA_FILE}' not found.")
            return False
    except Exception as e:
        print(f"Error loading multi-season data: {e}")
        return False


def assign_player_ids():
    """Give every player the NBA.com ID (see app.utils.player_ids) as PLAYER_ID."""
    player_ids.reset_index()
    seasons = (multi_season_data or {}).values()
    for players in [nba_data or [], *seasons]:
        for player in players:
            if player.get('PLAYER_NAME'):
                player['PLAYER_ID'] = player_ids.player_id_for(player['PLAYER_NAME'])


def initialize():
    """Load everything the routes need. Runs once per process (including under Gunicorn)."""
    print("Loading NBA data...")
    load_nba_data()
    load_multi_season_data()
    assign_player_ids()
    load_ai()  # after the season data: the predictions cache is re-keyed by player ID
    db.init_db()
    game_archive.auto_archive_enabled = bool(os.environ.get('DATABASE_URL'))

    if ai_available and not is_render:
        try:
            print("Initializing AI system...")
            ai.initialize_nba_ai()
            ai.warm_predictions_cache()
            print(ai.nba_ai_system.print_season_accuracies())
            print("AI system initialized and predictions cached")
        except Exception as e:
            print(f"AI initialization failed (non-fatal): {e}")
