import traceback

from flask import Blueprint, jsonify, request

from app import state
from app.api.helpers import sanitize_string, validate_pagination
from app.services.recommendations import get_top_performers

bp = Blueprint('predictions', __name__, url_prefix='/api')

AI_UNAVAILABLE = {'error': 'AI predictions not available', 'ai_available': False}


@bp.route('/ai-predictions', methods=['GET'])
def get_ai_predictions():
    if not state.ai_available:
        return jsonify(AI_UNAVAILABLE), 503

    try:
        if state.is_render and state.predictions_cache:
            predictions = state.predictions_cache.get('bundle', {})
        else:
            state.ai.initialize_nba_ai()
            predictions = state.ai.get_ai_predictions_bundle(10)

        return jsonify({
            'predictions': predictions,
            'ai_available': True
        })
    except Exception as e:
        trace_str = traceback.format_exc()
        print(f"AI prediction error: {trace_str}")
        return jsonify({
            'error': f'Error generating predictions: {str(e)}',
            'trace': trace_str,
            'ai_available': True
        }), 500


def _prediction_rows_from_model():
    state.ai.initialize_nba_ai()
    predictions_df = state.ai.nba_ai_system.build_predictions_df()
    if predictions_df is None:
        return None

    results = []
    for _, row in predictions_df.iterrows():
        player_name = row['PLAYER_NAME']
        result = {
            'id': int(row.get('PLAYER_ID', abs(hash(player_name)) % (10**9))),
            'name': player_name,
            'team': row.get('TEAM', 'UNK'),
            'position': row.get('POSITION', 'UNK'),
            'age': int(row.get('AGE', 0)),
        }
        for key in ('ppg', 'apg', 'rpg', 'spg', 'bpg', 'tov'):
            result[f'{key}_last'] = round(float(row.get(f'{key.upper()}_LAST', 0)), 1)
            result[f'predicted_{key}'] = round(float(row.get(f'PREDICTED_{key.upper()}', 0)), 1)
        result['mpg_last'] = round(float(row.get('MIN_LAST', 0)), 1)
        result['predicted_mpg'] = round(float(row.get('PREDICTED_MPG', 0)), 1)
        for key, column in (
            ('fg_pct', 'FG_PCT'),
            ('fg3_pct', 'FG3_PCT'),
            ('ft_pct', 'FT_PCT'),
        ):
            result[f'{key}_last'] = round(float(row.get(f'{column}_LAST', 0)) * 100, 1)
            result[f'predicted_{key}'] = round(float(row.get(f'PREDICTED_{column}', 0)) * 100, 1)
        results.append(result)
    return results


@bp.route('/predictions', methods=['GET'])
def get_all_predictions_paginated():
    if not state.ai_available:
        return jsonify(AI_UNAVAILABLE), 503

    try:
        if state.is_render and state.predictions_cache:
            results = state.predictions_cache.get('all_players_list', [])
        else:
            results = _prediction_rows_from_model()
            if results is None:
                return jsonify({'error': 'Failed to generate predictions'}), 500

        search = sanitize_string(request.args.get('search', ''), 50).lower()
        team = sanitize_string(request.args.get('team', ''), 10).upper()
        position = sanitize_string(request.args.get('position', ''), 10).upper()
        sort_by = request.args.get('sort_by', 'name')
        sort_order = request.args.get('sort_order', 'asc')

        filtered = results
        if search:
            filtered = [p for p in filtered if search in p['name'].lower()]
        if team:
            filtered = [p for p in filtered if p['team'] == team]
        if position:
            filtered = [p for p in filtered if p['position'] == position]

        reverse = (sort_order == 'desc')
        text_sort_keys = {'name', 'team', 'position'}
        numeric_sort_keys = {
            'ppg_last',
            'predicted_ppg', 'predicted_apg', 'predicted_rpg',
            'predicted_spg', 'predicted_bpg', 'predicted_tov', 'predicted_mpg',
            'predicted_fg_pct', 'predicted_fg3_pct', 'predicted_ft_pct',
        }
        if sort_by in text_sort_keys:
            filtered.sort(key=lambda p: p[sort_by].lower(), reverse=reverse)
        elif sort_by in numeric_sort_keys:
            filtered.sort(key=lambda p: p[sort_by], reverse=reverse)
        else:
            filtered.sort(key=lambda p: p['name'].lower(), reverse=reverse)

        page = request.args.get('page', 1)
        limit = request.args.get('limit', 20)
        page, limit = validate_pagination(page, limit)

        start_idx = (page - 1) * limit
        end_idx = start_idx + limit
        page_results = filtered[start_idx:end_idx]

        return jsonify({
            'predictions': page_results,
            'pagination': {
                'page': page,
                'limit': limit,
                'total': len(filtered),
                'total_pages': (len(filtered) + limit - 1) // limit
            }
        })
    except Exception as e:
        print(f"Error in get_predictions endpoint: {e}")
        return jsonify({'error': str(e)}), 500


@bp.route('/player-prediction/<string:player_name>', methods=['GET'])
def get_player_prediction_api(player_name):
    if not state.ai_available:
        return jsonify(AI_UNAVAILABLE), 503

    player_name_clean = sanitize_string(player_name, 50)
    if not player_name_clean:
        return jsonify({'error': 'Invalid player name'}), 400

    try:
        if state.is_render or state.predictions_cache:
            prediction = state.get_cached_player_prediction(player_name_clean)
            if not prediction:
                return jsonify({'error': 'Player not found in cache'}), 404
        else:
            prediction = state.ai.get_player_prediction(player_name_clean)
        return jsonify({
            'prediction': prediction,
            'ai_available': True
        })
    except Exception as e:
        print(f"Player prediction error: {e}")
        return jsonify({
            'error': 'Error generating prediction',
            'ai_available': True
        }), 500


@bp.route('/recommendations/<stat>', methods=['GET'])
def recommendations(stat):
    if not state.ai_available and not state.is_render:
        return jsonify(AI_UNAVAILABLE), 503

    stat_clean = sanitize_string(stat, 10).upper()
    if stat_clean not in ('PPG', 'APG', 'RPG', 'PRA'):
        return jsonify({'error': 'Invalid stat. Use PPG, APG, RPG, or PRA.'}), 400

    try:
        cache = state.predictions_cache
        recommendations_cache = cache.get('recommendations', {}) if isinstance(cache, dict) else {}
        cached_data = (
            recommendations_cache.get(stat_clean)
            if isinstance(recommendations_cache, dict)
            else None
        )

        if (
            state.is_render
            and isinstance(recommendations_cache, dict)
            and stat_clean in recommendations_cache
            and isinstance(cached_data, list)
        ):
            data = cached_data
        else:
            data = get_top_performers(stat_clean)
        return jsonify(data), 200
    except Exception as e:
        print(f"Error in recommendations: {e}")
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500
