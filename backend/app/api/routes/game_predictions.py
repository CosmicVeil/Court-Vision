"""Per-game predictions for the next few game days, read from data/game_predictions_cache.json.

Days that have passed (US Eastern) are dropped per request (game_predictions.upcoming), so a
daily run that is late still leaves the following days on the pages.

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


def _today():
    return datetime.now(_ET).date().isoformat()


def _cache():
    """The cache without its past days, or None when there is none."""
    cache = state.current_game_predictions()
    if not (isinstance(cache, dict) and isinstance(cache.get('players'), list)):
        return None
    return game_predictions.upcoming(cache, _today())


def _slate(cache, day=''):
    """What every response carries about the slate itself.

    slate_date: the nearest day left; slate_dates: every day left. games: that `day`'s games, or
    all of them. stale: every day has passed, i.e. the daily run has not replaced the cache yet,
    so the pages can say these are no longer the next games instead of presenting them as such."""
    games = [game for game in cache.get('games') or [] if not day or game.get('game_date') == day]
    return {
        **{key: cache.get(key) for key in ('slate_date', 'slate_dates', 'generated_at', 'model', 'accuracy')},
        'date': day,
        'games': [game_predictions.with_logos(game) for game in games],
        'stale': bool(cache.get('slate_date')) and cache['slate_date'] < _today(),
    }


def _day(cache):
    """The ?date= filter as a covered day ("next" = nearest), or "" for every day."""
    return game_predictions.resolve_day(sanitize_string(request.args.get('date', ''), 10), cache.get('slate_dates') or [])


@bp.route('/game-predictions', methods=['GET'])
@optional_auth
def get_game_predictions():
    cache = _cache()
    if cache is None:
        return jsonify(UNAVAILABLE), 503

    weights = request_weights()
    day = _day(cache)
    rows = [game_predictions.enrich(row, weights) for row in cache['players']]
    # Never project a player who is ruled out for his game (bug #141).
    rows = game_predictions.drop_out_players(rows)
    rows = game_predictions.filter_rows(
        rows,
        search=sanitize_string(request.args.get('search', ''), 50),
        team=sanitize_string(request.args.get('team', ''), 10).upper(),
        game_id=sanitize_string(request.args.get('game_id', ''), 20),
        day=day,
    )
    # One card per player: ranked by his nearest game, with any later ones attached to it.
    rows = game_predictions.sort_rows(game_predictions.group_by_player(rows), request.args.get('sort_by', 'predicted_pts'),
                                      request.args.get('sort_order', 'desc'))

    page, limit = validate_pagination(request.args.get('page', 1), request.args.get('limit', 20))
    is_authenticated = request.user_id is not None
    if not is_authenticated:
        rows = rows[:PUBLIC_PREVIEW_LIMIT]
        page = 1
        limit = min(limit, PUBLIC_PREVIEW_LIMIT)

    start = (page - 1) * limit
    return jsonify({
        **_slate(cache, day),
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
    # Picks compare players within one night: the requested day, else the nearest one.
    day = _day(cache) or (cache.get('slate_dates') or [''])[0]
    weights = request_weights()
    rows = [game_predictions.enrich(row, weights) for row in cache['players'] if row.get('game_date') == day]
    rows = game_predictions.drop_out_players(rows)
    return jsonify({
        **_slate(cache, day),
        'available': True,
        'min_average_minutes': game_predictions.MIN_AVERAGE_MINUTES,
        'recommendations': game_predictions.recommendations(rows, limit),
    })


@bp.route('/game-predictions/player/<int:player_id>', methods=['GET'])
@require_auth
def get_player_game_prediction(player_id):
    """One player's predicted games for the player popup, nearest first. Matched by NBA.com ID,
    then by ?name= for popups built without an ID. prediction is the nearest game (null when he
    is not on the slate); predictions lists every one."""
    cache = _cache()
    if cache is None:
        return jsonify(UNAVAILABLE), 503

    rows = cache['players']
    matches = [r for r in rows if r.get('id') == player_id]
    name = normalize_player_name(sanitize_string(request.args.get('name', ''), 50))
    if not matches and name:
        matches = [r for r in rows if normalize_player_name(r.get('name')) == name]
    weights = request_weights()
    matches = sorted(matches, key=lambda r: (r.get('game_date') or '', r.get('tipoff') or ''))
    predictions = game_predictions.drop_out_players(
        [game_predictions.enrich(row, weights) for row in matches])
    return jsonify({
        **_slate(cache),
        'available': True,
        'prediction': predictions[0] if predictions else None,
        'predictions': predictions,
    })

