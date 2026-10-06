from flask import Blueprint, jsonify, request

from app.auth import require_auth
from app.db import get_saved_players, remove_saved_player, save_player
from app.utils.player_names import fix_mojibake

bp = Blueprint('saved_players', __name__, url_prefix='/api/players/saved')


@bp.route('', methods=['GET'])
@require_auth
def get_saved():
    players = get_saved_players(request.user_id)
    for player in players:
        if isinstance(player, dict) and 'player_name' in player:
            player['player_name'] = fix_mojibake(player['player_name'])
    return jsonify({'success': True, 'saved_players': players}), 200


@bp.route('', methods=['POST'])
@require_auth
def add_saved():
    data = request.get_json()
    if not data:
        return jsonify({'success': False, 'message': 'No data provided'}), 400
    player_id = data.get('player_id')
    player_name = data.get('player_name', '')
    team = data.get('team', '')
    position = data.get('position', '')
    if not player_id:
        return jsonify({'success': False, 'message': 'player_id is required'}), 400
    success, message = save_player(request.user_id, player_id, player_name, team, position)
    return jsonify({'success': success, 'message': message}), 200 if success else 500


@bp.route('/<int:player_id>', methods=['DELETE'])
@require_auth
def delete_saved(player_id):
    success, message = remove_saved_player(request.user_id, player_id)
    return jsonify({'success': success, 'message': message}), 200 if success else 500
