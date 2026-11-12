import math

from flask import Blueprint, jsonify, request

from app import db, state
from app.api.helpers import request_weights, season_fantasy
from app.services import game_archive
from app.services.game_archive import archive_finished_games
from app.services.live_games import attach_rosters, get_todays_games, get_upcoming_games
from app.utils.fantasy import fantasy_points, is_default
from app.utils.player_names import normalize_player_name

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


def _rescored_player(player, weights, season_by_id):
    player = dict(player)
    if player.get('fpts') is not None:
        player['fpts'] = fantasy_points(player, weights=weights)
    if 'season_fpts' in player:
        # Season rosters carry rounded averages, so rescore from the unrounded season row: by
        # person ID (the roster's own key), by name only for rows without one. A row that matches
        # neither gets None rather than its FanDuel value under another preset's label.
        season_row = (season_by_id.get(player.get('personId'))
                      or state.nba_name_index.get(normalize_player_name(player.get('name'))))
        player['season_fpts'] = season_fantasy(season_row, weights) if season_row else None
    return player


def _rescored(games, weights):
    """Copies of games with box-score and roster FPTS under weights. Games come from the shared
    live-games cache scored with FanDuel, so they are copied, never edited in place."""
    if is_default(weights):
        return games
    season_by_id = {p['PLAYER_ID']: p for p in state.nba_data or [] if p.get('PLAYER_ID')}
    return [{**game, 'players': {side: [_rescored_player(p, weights, season_by_id) for p in players]
                                 for side, players in (game.get('players') or {}).items()}}
            for game in games]


@bp.route('/today', methods=['GET'])
def get_today_games():
    try:
        games = get_todays_games(state.nba_data, state.live_team_rows)
        archive_finished_games(games)
        return jsonify({'games': _rescored(games, request_weights()), 'count': len(games)}), 200
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

        return jsonify({'games': _rescored(paginated_games, request_weights()), 'count': len(games),
                        'total_pages': total_pages, 'page': page}), 200
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
        games = get_todays_games(state.nba_data, state.live_team_rows)
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
        return jsonify(_rescored([game], request_weights())[0]), 200
    except Exception as e:
        print(f"Error fetching game detail: {e}")
        return jsonify({'error': 'Failed to fetch game'}), 500
