"""Fantasy scoring, shared by the game log, box scores, season lines and the predictions.

FanDuel is the default: FPTS = PTS + 1.2*REB + 1.5*AST + 3*STL + 3*BLK - TOV. Other presets and
custom user weights score the same six stats, because those are the ones the model predicts, so
actual and projected FPTS always use one formula. FPTS is derived from box-score stats, never
predicted. Always score the unrounded stats and round once at the end: scoring averages that were
already rounded to 0.1 can be off by up to ~0.5 FPTS (six stats, weights summing to 10.7), which is
how two pages would show different numbers for the same player and season.
"""

# Box-score stat -> points per unit (FanDuel, the default).
FANTASY_WEIGHTS = {'pts': 1.0, 'reb': 1.2, 'ast': 1.5, 'stl': 3.0, 'blk': 3.0, 'tov': -1.0}

# Each box-score stat's per-game key, as the model and season lines name it ('PPG_LAST', 'ppg').
PER_GAME_KEYS = {'pts': 'ppg', 'reb': 'rpg', 'ast': 'apg', 'stl': 'spg', 'blk': 'bpg', 'tov': 'tov'}

DEFAULT_PRESET = 'fanduel'

# Platform defaults restricted to the six stats above. 'exact' is False where the platform also
# scores stats the model does not predict (3PM, FGM/FGA, FTM/FTA, double-double bonuses), so the
# Profile page can say the preset is an approximation.
SCORING_PRESETS = {
    'fanduel': {'label': 'FanDuel', 'weights': FANTASY_WEIGHTS, 'exact': True},
    'draftkings': {'label': 'DraftKings', 'exact': False,
                   'weights': {'pts': 1.0, 'reb': 1.25, 'ast': 1.5, 'stl': 2.0, 'blk': 2.0, 'tov': -0.5}},
    'espn': {'label': 'ESPN Points', 'exact': False,
             'weights': {'pts': 1.0, 'reb': 1.0, 'ast': 2.0, 'stl': 4.0, 'blk': 4.0, 'tov': -2.0}},
    # Yahoo's season-long High Score format (REB 1, AST 2). STL/BLK/TOV are unconfirmed against a
    # real league, so it is marked approximate until checked (see issue #118).
    'yahoo': {'label': 'Yahoo High Score', 'exact': False,
              'weights': {'pts': 1.0, 'reb': 1.0, 'ast': 2.0, 'stl': 3.0, 'blk': 3.0, 'tov': 0.0}},
}

# Custom weights are clamped to this range so a typo cannot produce absurd rankings.
MAX_ABS_WEIGHT = 100.0


def fantasy_points(stats, key=lambda stat: stat, digits=1, weights=None):
    """Fantasy points from a dict of stats; key maps a box-score stat to its name in the dict
    ('pts' -> 'PPG_LAST'). Missing or None values count as 0. digits=None skips rounding.
    weights defaults to FanDuel."""
    weights = weights or FANTASY_WEIGHTS
    total = sum(weight * float(stats.get(key(stat)) or 0) for stat, weight in weights.items())
    return total if digits is None else round(total, digits)


def is_default(weights):
    return weights is None or weights == FANTASY_WEIGHTS


def parse_scoring(value):
    """Weights from a scoring spec: a preset id ('espn') or 'custom:pts=5,reb=1.2,...'.

    Unknown presets, malformed specs and missing stats fall back to the default preset's values,
    so a stale or hand-edited client setting can never break a page. Returns a full six-stat dict."""
    value = (value or '').strip().lower()
    if not value.startswith('custom:'):
        return dict(SCORING_PRESETS.get(value, SCORING_PRESETS[DEFAULT_PRESET])['weights'])
    weights = dict(FANTASY_WEIGHTS)
    for part in value[len('custom:'):].split(','):
        stat, _, raw = part.partition('=')
        stat = stat.strip()
        if stat not in weights:
            continue
        try:
            weight = float(raw)
        except ValueError:
            continue
        if weight == weight:  # NaN != NaN
            weights[stat] = max(-MAX_ABS_WEIGHT, min(MAX_ABS_WEIGHT, weight))
    return weights


def normalize_setting(setting):
    """A stored or submitted scoring setting, {'preset': id} or {'preset': 'custom', 'weights': {...}}
    with all six weights clamped. Returns None for anything unusable."""
    if not isinstance(setting, dict):
        return None
    preset = setting.get('preset')
    if preset in SCORING_PRESETS:
        return {'preset': preset}
    if preset != 'custom' or not isinstance(setting.get('weights'), dict):
        return None
    spec = ','.join(f'{stat}={weight}' for stat, weight in setting['weights'].items())
    return {'preset': 'custom', 'weights': parse_scoring(f'custom:{spec}')}


def describe_setting(setting):
    """A user's setting as the frontend uses it: {'preset', 'label', 'weights'}. The default when the
    setting is missing or unusable. The frontend keeps this copy, so it never needs its own preset table."""
    setting = normalize_setting(setting) or {'preset': DEFAULT_PRESET}
    if setting['preset'] == 'custom':
        return {'preset': 'custom', 'label': 'Custom', 'weights': setting['weights']}
    preset = SCORING_PRESETS[setting['preset']]
    return {'preset': setting['preset'], 'label': preset['label'], 'weights': dict(preset['weights'])}
