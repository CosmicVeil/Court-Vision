"""Per-game predictions for the next slate, read from data/game_predictions_cache.json.

Same free-account gate as the season predictions: signed-out visitors get a capped preview of
the list; the full list and the recommendations need a token.
"""
from datetime import datetime
from zoneinfo import ZoneInfo

from flask import Blueprint, jsonify, request

from app import state
from app.api.helpers import request_weights, sanitize_string, validate_pagination
from app.api.routes.predictions import PUBLIC_PREVIEW_LIMIT
from app.auth import optional_auth, require_auth
from app.services import game_predictions
from app.utils.player_names import normalize_player_name

bp = Blueprint('game_predictions', __name__, url_prefix='/api')

_ET = ZoneInfo('America/New_York')
UNAVAILABLE = {'error': 'Per-game predictions not available', 'available': False}


def _cache():
    cache = state.current_game_predictions()
    return cache if isinstance(cache, dict) and isinstance(cache.get('players'), list) else None


def _slate(cache):
    """What every response carries about the slate itself.

    stale: the slate's day has passed (US Eastern), i.e. the daily run has not replaced it yet,
    so the pages can say these are no longer the next games instead of presenting them as such."""
    today = datetime.now(_ET).date().isoformat()
    return {
        **{key: cache.get(key) for key in ('slate_date', 'generated_at', 'model', 'accuracy')},
        'games': [game_predictions.with_logos(game) for game in cache.get('games') or []],
        'stale': bool(cache.get('slate_date')) and cache['slate_date'] < today,
    }


@bp.route('/game-predictions', methods=['GET'])
@optional_auth
def get_game_predictions():
    cache = _cache()
    if cache is None:
        return jsonify(UNAVAILABLE), 503

    weights = request_weights()
    rows = [game_predictions.enrich(row, weights) for row in cache['players']]
    rows = game_predictions.filter_rows(
        rows,
        search=sanitize_string(request.args.get('search', ''), 50),
        team=sanitize_string(request.args.get('team', ''), 10).upper(),
        game_id=sanitize_string(request.args.get('game_id', ''), 20),
    )
    rows = game_predictions.sort_rows(rows, request.args.get('sort_by', 'predicted_pts'),
                                      request.args.get('sort_order', 'desc'))

    page, limit = validate_pagination(request.args.get('page', 1), request.args.get('limit', 20))
    is_authenticated = request.user_id is not None
    if not is_authenticated:
        rows = rows[:PUBLIC_PREVIEW_LIMIT]
        page = 1
        limit = min(limit, PUBLIC_PREVIEW_LIMIT)

    start = (page - 1) * limit
    return jsonify({
        **_slate(cache),
        'available': True,
        'predictions': rows[start:start + limit],
        'preview': not is_authenticated,
        'pagination': {
            'page': page,
            'limit': limit,
            'total': len(rows),
            'total_pages': (len(rows) + limit - 1) // limit,
        },
    })


@bp.route('/game-recommendations', methods=['GET'])
@require_auth
def get_game_recommendations():
    cache = _cache()
    if cache is None:
        return jsonify(UNAVAILABLE), 503

    try:
        limit = min(max(int(request.args.get('limit', game_predictions.DEFAULT_PICKS)), 1), game_predictions.MAX_PICKS)
    except (TypeError, ValueError):
        limit = game_predictions.DEFAULT_PICKS
    weights = request_weights()
    rows = [game_predictions.enrich(row, weights) for row in cache['players']]
    return jsonify({
        **_slate(cache),
        'available': True,
        'min_average_minutes': game_predictions.MIN_AVERAGE_MINUTES,
        'recommendations': game_predictions.recommendations(rows, limit),
    })


@bp.route('/game-predictions/player/<int:player_id>', methods=['GET'])
@require_auth
def get_player_game_prediction(player_id):
    """One player's next-game line for the player popup. Matched by NBA.com ID, then by
    ?name= for popups built without an ID. prediction is null when he is not on the slate."""
    cache = _cache()
    if cache is None:
        return jsonify(UNAVAILABLE), 503

    rows = cache['players']
    row = next((r for r in rows if r.get('id') == player_id), None)
    name = normalize_player_name(sanitize_string(request.args.get('name', ''), 50))
    if row is None and name:
        row = next((r for r in rows if normalize_player_name(r.get('name')) == name), None)
    return jsonify({
        **_slate(cache),
        'available': True,
        'prediction': game_predictions.enrich(row, request_weights()) if row else None,
    })

