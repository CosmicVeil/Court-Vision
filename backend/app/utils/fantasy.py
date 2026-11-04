"""FanDuel / NBA.com fantasy scoring, shared by the game log and the predictions.

FPTS = PTS + 1.2*REB + 1.5*AST + 3*STL + 3*BLK - TOV. It is derived from box-score stats,
never predicted. Always score the unrounded stats and round once at the end: scoring averages
that were already rounded to 0.1 can be off by up to ~0.5 FPTS (six stats, weights summing to
10.7), which is how two pages would show different numbers for the same player and season.
"""

# Box-score stat -> points per unit.
FANTASY_WEIGHTS = {'pts': 1.0, 'reb': 1.2, 'ast': 1.5, 'stl': 3.0, 'blk': 3.0, 'tov': -1.0}

# Each box-score stat's per-game key, as the model and season lines name it ('PPG_LAST', 'ppg').
PER_GAME_KEYS = {'pts': 'ppg', 'reb': 'rpg', 'ast': 'apg', 'stl': 'spg', 'blk': 'bpg', 'tov': 'tov'}


def fantasy_points(stats, key=lambda stat: stat, digits=1):
    """Fantasy points from a dict of stats; key maps a box-score stat to its name in the dict
    ('pts' -> 'PPG_LAST'). Missing or None values count as 0. digits=None skips rounding."""
    total = sum(weight * float(stats.get(key(stat)) or 0) for stat, weight in FANTASY_WEIGHTS.items())
    return total if digits is None else round(total, digits)
