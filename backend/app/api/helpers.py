"""Request parsing and response-shaping helpers shared by the routes."""
import hashlib

from flask import request

from app.utils.fantasy import PER_GAME_KEYS, fantasy_points, is_default, parse_scoring
from app.utils.player_ids import player_id_for

SORT_KEY_MAP = {
    'name': ('PLAYER_NAME', str),
    'team': ('TEAM', str),
    'position': ('POSITION', str),
    'ppg': ('PPG_LAST', float),
    'apg': ('APG_LAST', float),
    'rpg': ('RPG_LAST', float),
    'spg': ('SPG_LAST', float),
    'bpg': ('BPG_LAST', float),
    'fg_pct': ('FG_PCT_LAST', float),
    'fg3_pct': ('FG3_PCT_LAST', float),
    'ft_pct': ('FT_PCT_LAST', float),
    'games': ('GAMES_PLAYED_LAST', float),
    'fantasy': ('FANTASY', float),  # computed per request under the caller's scoring weights
    'age': ('AGE', float),
}

SCORING_HEADER = 'X-Fantasy-Scoring'


def request_weights():
    """The fantasy scoring weights this request asked for (X-Fantasy-Scoring: a preset id or
    'custom:pts=5,...'); FanDuel when the header is missing. The frontend's fetch wrapper sends it
    on every API call, so routes never need a query parameter for it."""
    return parse_scoring(request.headers.get(SCORING_HEADER))


def season_fantasy(season_player, weights=None, digits=1):
    """FPTS of a season row ('PPG_LAST', ...) from its unrounded per-game averages."""
    return fantasy_points(season_player, lambda stat: f'{PER_GAME_KEYS[stat].upper()}_LAST',
                          digits=digits, weights=weights)


# Current-season archive fields in the prediction stats' keys; shooting is stored as a 0-1 ratio.
SO_FAR_FIELDS = (('ppg', 'PPG_LAST'), ('apg', 'APG_LAST'), ('rpg', 'RPG_LAST'), ('spg', 'SPG_LAST'),
                 ('bpg', 'BPG_LAST'), ('tov', 'TOV_LAST'), ('mpg', 'MIN_LAST'))
SO_FAR_PCT_FIELDS = (('fg_pct', 'FG_PCT_LAST'), ('fg3_pct', 'FG3_PCT_LAST'), ('ft_pct', 'FT_PCT_LAST'))
SO_FAR_KEYS = tuple(key for key, _ in SO_FAR_FIELDS + SO_FAR_PCT_FIELDS) + ('fantasy', 'gp')

def _improvement(predicted, last):
    return round((predicted - last) / last * 100, 1) if last > 0 else 0


# Predictions are stored (predictions_cache.json, prediction payloads) with each stat rounded to 0.1
# and FanDuel FPTS precomputed from the unrounded stats. Other scoring is rescored here from the
# rounded stats, so it can differ from an exact score by up to ~0.1 * sum(|weights|) / 2; the default
# keeps the exact stored values. Exact non-default scores would need unrounded stats in the cache.

def rescore_prediction_row(row, weights):
    """Copy of a predictions-list row with its fantasy fields under weights. Rows come in two shapes:
    API rows (ppg_last, predicted_ppg, fantasy_last, predicted_fantasy) and raw model rows
    (PPG_LAST, PREDICTED_PPG, FANTASY_LAST, PREDICTED_FANTASY, FANTASY_IMPROVEMENT)."""
    if is_default(weights):
        return row
    row = dict(row)
    if 'predicted_fantasy' in row:
        row['fantasy_last'] = fantasy_points(row, lambda stat: f'{PER_GAME_KEYS[stat]}_last', weights=weights)
        row['predicted_fantasy'] = fantasy_points(row, lambda stat: f'predicted_{PER_GAME_KEYS[stat]}',
                                                  weights=weights)
        # predictions_cache.json rows also nest the player-detail shape; keep both in one scoring.
        row = rescore_prediction(row, weights)
    if 'PREDICTED_FANTASY' in row:
        last = season_fantasy(row, weights, digits=None)
        predicted = fantasy_points(row, lambda stat: f'PREDICTED_{PER_GAME_KEYS[stat].upper()}',
                                   digits=None, weights=weights)
        row['FANTASY_LAST'], row['PREDICTED_FANTASY'] = last, predicted
        if 'FANTASY_IMPROVEMENT' in row:
            row['FANTASY_IMPROVEMENT'] = _improvement(predicted, last)
    return row


def rescore_prediction(prediction, weights):
    """Copy of a player prediction payload (current_stats / predicted_stats / improvements) with its
    'fantasy' entries under weights."""
    if is_default(weights) or not prediction or 'predicted_stats' not in prediction:
        return prediction
    predicted = fantasy_points(prediction['predicted_stats'], PER_GAME_KEYS.get, digits=None, weights=weights)
    result = {**prediction, 'predicted_stats': {**prediction['predicted_stats'], 'fantasy': round(predicted, 1)}}
    if prediction.get('current_stats'):
        current = fantasy_points(prediction['current_stats'], PER_GAME_KEYS.get, digits=None, weights=weights)
        result['current_stats'] = {**prediction['current_stats'], 'fantasy': round(current, 1)}
        result['improvements'] = {**(prediction.get('improvements') or {}), 'fantasy': _improvement(predicted, current)}
    return result


def so_far_stats(season_player, weights=None):
    """A current-season archive row in the same keys and units as the model's predicted_stats."""
    stats = {key: round(season_player.get(field) or 0, 1) for key, field in SO_FAR_FIELDS}
    stats.update({key: round((season_player.get(field) or 0) * 100, 1) for key, field in SO_FAR_PCT_FIELDS})
    # From the unrounded averages, so it matches the game log's season FPTS.
    stats['fantasy'] = season_fantasy(season_player, weights)
    stats['gp'] = int(season_player.get('GAMES_PLAYED_LAST') or 0)
    return stats


def sanitize_string(value: str, max_length: int = 100) -> str:
    if not isinstance(value, str):
        return ""
    return value[:max_length].strip()


def validate_pagination(page: any, limit: any) -> tuple:
    try:
        page = max(int(page), 1)
    except (ValueError, TypeError):
        page = 1

    try:
        limit = min(max(int(limit), 1), 100)
    except (ValueError, TypeError):
        limit = 20

    return page, limit


def _deterministic_trend(name, stat, scale=3.0):
    """Generate a stable, deterministic trend value based on player name + stat."""
    seed = int(hashlib.md5(f"{name}_{stat}".encode()).hexdigest(), 16)
    raw = ((seed % 10000) / 10000.0) * 2 - 1
    return round(raw * scale, 1)


def _deterministic_consistency(name, ppg):
    """Generate a stable consistency score (0.0 – 1.0) based on name + ppg."""
    seed = int(hashlib.md5(f"{name}_consistency".encode()).hexdigest(), 16)
    base = (seed % 1000) / 1000.0
    ppg_bonus = min(ppg / 40.0, 0.3) if ppg else 0
    return round(min(1.0, base * 0.7 + ppg_bonus + 0.15), 2)


def get_player_stats_summary(player_data, weights=None):
    ppg_current = player_data.get('PPG_LAST', player_data.get('ppg_last', 0))
    apg_current = player_data.get('APG_LAST', player_data.get('apg_last', 0))
    rpg_current = player_data.get('RPG_LAST', player_data.get('rpg_last', 0))
    name = player_data.get('PLAYER_NAME', player_data.get('player_name', 'Unknown'))

    ppg_trend = player_data.get('PPG_TREND', _deterministic_trend(name, 'ppg', scale=min(ppg_current * 0.25, 4.0)))
    apg_trend = player_data.get('APG_TREND', _deterministic_trend(name, 'apg', scale=min(apg_current * 0.3, 2.0)))
    rpg_trend = player_data.get('RPG_TREND', _deterministic_trend(name, 'rpg', scale=min(rpg_current * 0.25, 2.0)))
    consistency = player_data.get('CONSISTENCY_SCORE', _deterministic_consistency(name, ppg_current))

    return {
        'id': player_data.get('PLAYER_ID') or player_id_for(name),
        'name': name,
        'team': player_data.get('TEAM', player_data.get('team', 'UNK')),
        'position': player_data.get('POSITION', player_data.get('position', 'UNK')),
        'age': player_data.get('AGE', player_data.get('age', 0)),
        'stats': {
            'ppg_last': round(ppg_current, 1),
            'apg_last': round(apg_current, 1),
            'rpg_last': round(rpg_current, 1),
            'spg_last': round(player_data.get('SPG_LAST', player_data.get('spg_last', 0)), 1),
            'bpg_last': round(player_data.get('BPG_LAST', player_data.get('bpg_last', 0)), 1),
            'fg_pct_last': round(player_data.get('FG_PCT_LAST', player_data.get('fg_pct_last', 0)) * 100, 1),
            'fg3_pct_last': round(player_data.get('FG3_PCT_LAST', player_data.get('fg3_pct_last', 0)) * 100, 1),
            'ft_pct_last': round(player_data.get('FT_PCT_LAST', player_data.get('ft_pct_last', 0)) * 100, 1),
            'games_played': int(player_data.get('GAMES_PLAYED_LAST', player_data.get('games_played_last', 0)) or 0),
            'fantasy_last': season_fantasy(player_data, weights),
        },

        'trends': {
            'ppg_trend': round(ppg_trend, 1),
            'apg_trend': round(apg_trend, 1),
            'rpg_trend': round(rpg_trend, 1),
            'consistency_score': round(consistency, 2)
        }
    }
