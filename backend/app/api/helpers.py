"""Request parsing and response-shaping helpers shared by the routes."""
import hashlib

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
    'age': ('AGE', float),
}


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


def get_player_stats_summary(player_data):
    ppg_current = player_data.get('PPG_LAST', player_data.get('ppg_last', 0))
    apg_current = player_data.get('APG_LAST', player_data.get('apg_last', 0))
    rpg_current = player_data.get('RPG_LAST', player_data.get('rpg_last', 0))
    name = player_data.get('PLAYER_NAME', player_data.get('player_name', 'Unknown'))

    ppg_trend = player_data.get('PPG_TREND', _deterministic_trend(name, 'ppg', scale=min(ppg_current * 0.25, 4.0)))
    apg_trend = player_data.get('APG_TREND', _deterministic_trend(name, 'apg', scale=min(apg_current * 0.3, 2.0)))
    rpg_trend = player_data.get('RPG_TREND', _deterministic_trend(name, 'rpg', scale=min(rpg_current * 0.25, 2.0)))
    consistency = player_data.get('CONSISTENCY_SCORE', _deterministic_consistency(name, ppg_current))

    return {
        'id': player_data.get('PLAYER_ID', player_data.get('player_id', abs(hash(name)) % (10**9))),
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
            'games_played': int(player_data.get('GAMES_PLAYED_LAST', player_data.get('games_played_last', 0)) or 0)
        },

        'trends': {
            'ppg_trend': round(ppg_trend, 1),
            'apg_trend': round(apg_trend, 1),
            'rpg_trend': round(rpg_trend, 1),
            'consistency_score': round(consistency, 2)
        }
    }
