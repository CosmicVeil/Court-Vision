import math

from flask import Blueprint, jsonify, request

from app import db, state
from app.services import game_archive
from app.services.game_archive import archive_finished_games
from app.services.live_games import attach_rosters, get_todays_games, get_upcoming_games

bp = Blueprint('games', __name__, url_prefix='/api/games')

UPCOMING_GAMES_PER_PAGE = 20
PAST_GAMES_PER_PAGE = 20


def _archived_game(game_id):
    """A finished game from the Postgres archive, or None (also when the database is unavailable)."""
    conn = None
    try:
        conn = db.get_db()
        return game_archive.archived_game(conn, game_id)
    except Exception as e:
        print(f"Error loading archived game {game_id}: {e}")
        return None
    finally:
        if conn:
            conn.close()


@bp.route('/today', methods=['GET'])
def get_today_games():
    try:
        games = get_todays_games(nba_data=state.nba_data)
        archive_finished_games(games)
        return jsonify({'games': games, 'count': len(games)}), 200
    except Exception as e:
        print(f"Error fetching today's games: {e}")
        return jsonify({'error': 'Failed to fetch games', 'games': []}), 500


@bp.route('/upcoming', methods=['GET'])
def get_upcoming():
    try:
        days = int(request.args.get('days', 365))
        # Schedule only: rosters are built for the one page returned, not the whole season.
        games = get_upcoming_games(days=days)

        page = request.args.get('page', 1, type=int)
        page = max(1, page)
        per_page = UPCOMING_GAMES_PER_PAGE

        start = (page - 1) * per_page
        end = start + per_page

        paginated_games = attach_rosters(games[start:end], state.nba_data)

        total_pages = math.ceil(len(games) / per_page)

        return jsonify({'games': paginated_games, 'count': len(games), 'total_pages': total_pages, 'page': page}), 200
    except Exception as e:
        print(f"Error fetching upcoming games: {e}")
        return jsonify({'error': 'Failed to fetch upcoming games', 'games': []}), 500


@bp.route('/past', methods=['GET'])
def get_past():
    """Finished games from before today, newest first, read from the game archive."""
    page = max(1, request.args.get('page', 1, type=int))
    per_page = PAST_GAMES_PER_PAGE
    conn = None
    try:
        conn = db.get_db()
        # The database pages the list (LIMIT/OFFSET), so only one page of rows is ever loaded.
        games, total = game_archive.past_games(conn, limit=per_page, offset=(page - 1) * per_page)
        return jsonify({'games': games, 'count': total, 'total_pages': math.ceil(total / per_page), 'page': page}), 200
    except Exception as e:
        print(f"Error fetching past games: {e}")
        return jsonify({'error': 'Past games unavailable', 'games': []}), 503
    finally:
        if conn:
            conn.close()


@bp.route('/<string:game_id>', methods=['GET'])
def get_game_detail(game_id):
    try:
        games = get_todays_games(nba_data=state.nba_data)
        game = next((g for g in games if str(g.get('gameId')) == game_id), None)
        if not game:
            upcoming_games = get_upcoming_games()
            game = next((g for g in upcoming_games if str(g.get('gameId')) == game_id), None)
            if game:
                attach_rosters([game], state.nba_data)
        if not game:
            # Not on today's slate or the schedule: it may be a finished game from an earlier day.
            game = _archived_game(game_id)
        if not game:
            return jsonify({'error': 'Game not found'}), 404
        return jsonify(game), 200
    except Exception as e:
        print(f"Error fetching game detail: {e}")
        return jsonify({'error': 'Failed to fetch game'}), 500
