import math

from flask import Blueprint, jsonify, request

from app import state
from app.services.live_games import get_todays_games, get_upcoming_games

bp = Blueprint('games', __name__, url_prefix='/api/games')

UPCOMING_GAMES_PER_PAGE = 20


@bp.route('/today', methods=['GET'])
def get_today_games():
    try:
        games = get_todays_games(nba_data=state.nba_data)
        return jsonify({'games': games, 'count': len(games)}), 200
    except Exception as e:
        print(f"Error fetching today's games: {e}")
        return jsonify({'error': 'Failed to fetch games', 'games': []}), 500


@bp.route('/upcoming', methods=['GET'])
def get_upcoming():
    try:
        days = int(request.args.get('days', 365))
        games = get_upcoming_games(days=days, nba_data=state.nba_data)

        page = request.args.get('page', 1, type=int)
        page = max(1, page)
        per_page = UPCOMING_GAMES_PER_PAGE

        start = (page - 1) * per_page
        end = start + per_page

        paginated_games = games[start:end]

        total_pages = math.ceil(len(games) / per_page)

        return jsonify({'games': paginated_games, 'count': len(games), 'total_pages': total_pages, 'page': page}), 200
    except Exception as e:
        print(f"Error fetching upcoming games: {e}")
        return jsonify({'error': 'Failed to fetch upcoming games', 'games': []}), 500


@bp.route('/<string:game_id>', methods=['GET'])
def get_game_detail(game_id):
    try:
        games = get_todays_games(nba_data=state.nba_data)
        game = next((g for g in games if str(g.get('gameId')) == game_id), None)
        if not game:
            upcoming_games = get_upcoming_games(nba_data=state.nba_data)
            game = next((g for g in upcoming_games if str(g.get('gameId')) == game_id), None)
        if not game:
            return jsonify({'error': 'Game not found'}), 404
        return jsonify(game), 200
    except Exception as e:
        print(f"Error fetching game detail: {e}")
        return jsonify({'error': 'Failed to fetch game'}), 500
