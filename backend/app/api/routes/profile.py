"""Account settings: the signed-in user's fantasy scoring preset or custom weights."""
from flask import Blueprint, jsonify, request

from app.auth import require_auth
from app.db import get_user_by_id, set_fantasy_scoring
from app.utils.fantasy import PER_GAME_KEYS, SCORING_PRESETS, describe_setting, normalize_setting

bp = Blueprint('profile', __name__, url_prefix='/api/profile')


def _presets():
    return [{'id': preset_id, **preset} for preset_id, preset in SCORING_PRESETS.items()]


@bp.route('/scoring', methods=['GET'])
@require_auth
def get_scoring():
    user = get_user_by_id(request.user_id) or {}
    return jsonify({
        'scoring': describe_setting(user.get('fantasy_scoring')),
        'presets': _presets(),
        'stats': list(PER_GAME_KEYS),
    }), 200


@bp.route('/scoring', methods=['PUT'])
@require_auth
def put_scoring():
    setting = normalize_setting(request.get_json(silent=True))
    if setting is None:
        return jsonify({'success': False, 'message': 'Choose a preset or send custom weights'}), 400
    if not set_fantasy_scoring(request.user_id, setting):
        return jsonify({'success': False, 'message': 'Could not save your scoring'}), 500
    return jsonify({'success': True, 'scoring': describe_setting(setting)}), 200
