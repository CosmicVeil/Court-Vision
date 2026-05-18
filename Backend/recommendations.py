import numpy as np
from nba_ai_system import STAT_SCALE, initialize_nba_ai, nba_ai_system

LIMIT = 20

STAT_SORT_COLUMNS = {
    'PPG': 'PPG_IMPROVEMENT',
    'APG': 'APG_IMPROVEMENT',
    'RPG': 'RPG_IMPROVEMENT',
    'PRA': 'PRA_IMPROVEMENT',
}

# Only include players the model projects at a meaningful level (avoids
# bench guys with tiny predicted stats and inflated % improvements).
STAT_MIN_PREDICTED = {
    'PPG': ('PREDICTED_PPG', 10),  
    'APG': ('PREDICTED_APG', 5), 
    'RPG': ('PREDICTED_RPG', 5), 
    'PRA': ('PREDICTED_PRA', 20),
}

def _ensure_ai():
    if not initialize_nba_ai():
        raise RuntimeError('AI system failed to initialize. Check nba_ai_model.pkl and nba_2025_26_data.pkl in Backend/.')

def _jsonify_records(records):
    out = []
    for row in records:
        clean = {}
        for key, value in row.items():
            if isinstance(value, (np.floating, np.integer)):
                clean[key] = value.item()
            elif value is None or (isinstance(value, float) and np.isnan(value)):
                clean[key] = None
            else:
                clean[key] = value
        out.append(clean)
    return out

def _build_predictions_df():
    """All players with predicted stats and % improvement per category."""
    _ensure_ai()
    X, _, df = nba_ai_system.prepare_data()
    preds = nba_ai_system.predict(X)
    if preds is None:
        return None

    results = df[['PLAYER_NAME', 'TEAM', 'POSITION', 'AGE', 'PPG_LAST', 'APG_LAST', 'RPG_LAST']].copy()
    results['PREDICTED_PPG'] = preds[:, 0] * STAT_SCALE
    results['PREDICTED_APG'] = preds[:, 1] * STAT_SCALE
    results['PREDICTED_RPG'] = preds[:, 2] * STAT_SCALE

    for last_col, pred_col, imp_col in (
        ('PPG_LAST', 'PREDICTED_PPG', 'PPG_IMPROVEMENT'),
        ('APG_LAST', 'PREDICTED_APG', 'APG_IMPROVEMENT'),
        ('RPG_LAST', 'PREDICTED_RPG', 'RPG_IMPROVEMENT'),
    ):
        results[imp_col] = np.where(
            results[last_col] > 0,
            (results[pred_col] - results[last_col]) / results[last_col] * 100,
            0,
        )

    results['PRA_LAST'] = results['PPG_LAST'] + results['APG_LAST'] + results['RPG_LAST']
    results['PREDICTED_PRA'] = results['PREDICTED_PPG'] + results['PREDICTED_APG'] + results['PREDICTED_RPG']
    results['PRA_IMPROVEMENT'] = np.where(
        results['PRA_LAST'] > 0,
        (results['PREDICTED_PRA'] - results['PRA_LAST']) / results['PRA_LAST'] * 100,
        0,
    )
    return results

def get_top_by_improvement(stat, limit=LIMIT):
    stat = stat.upper()
    sort_col = STAT_SORT_COLUMNS.get(stat)
    if not sort_col:
        return None

    results = _build_predictions_df()
    if results is None or len(results) == 0:
        return []

    pred_col, min_pred = STAT_MIN_PREDICTED[stat]
    filtered_results = results[results[pred_col] > min_pred]
    
    # Robust Fallback: If no players meet the strict threshold,
    # fall back to the full dataset so we still show the best breakout players!
    if len(filtered_results) == 0:
        filtered_results = results

    top = filtered_results.nlargest(limit, sort_col)
    return _jsonify_records(top.to_dict(orient='records'))

def get_top_performers(stat):
    return get_top_by_improvement(stat)

def get_top_ppg_predictions():
    return get_top_by_improvement('PPG')

def get_top_apg_predictions():
    return get_top_by_improvement('APG')

def get_top_rpg_predictions():
    return get_top_by_improvement('RPG')

def get_top_pra_predictions():
    return get_top_by_improvement('PRA')
