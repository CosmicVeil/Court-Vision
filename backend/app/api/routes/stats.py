from flask import Blueprint, jsonify

from app import state
from app.services.live_games import get_weekly_top_pra

bp = Blueprint('stats', __name__, url_prefix='/api/stats')


@bp.route('/top-pra', methods=['GET'])
def get_top_pra():
    try:
        return jsonify(get_weekly_top_pra()), 200
    except Exception as e:
        print(f"Error fetching top PRA: {e}")
        return jsonify({'error': 'Failed to fetch top PRA player', 'player': None}), 500


@bp.route('/leaders', methods=['GET'])
def get_stat_leaders():
    nba_data = state.nba_data
    if not nba_data:
        return jsonify({'error': 'NBA data not loaded'}), 500

    ppg_leaders = sorted(nba_data, key=lambda x: x['PPG_LAST'], reverse=True)[:10]
    apg_leaders = sorted(nba_data, key=lambda x: x['APG_LAST'], reverse=True)[:10]
    rpg_leaders = sorted(nba_data, key=lambda x: x['RPG_LAST'], reverse=True)[:10]

    def format_leaders(leaders, stat_key, stat_name):
        return [{
            'name': player['PLAYER_NAME'],
            'team': player['TEAM'],
            'value': round(player[stat_key], 1),
            'stat_name': stat_name
        } for player in leaders]

    return jsonify({
        'ppg_leaders': format_leaders(ppg_leaders, 'PPG_LAST', 'Points Per Game'),
        'apg_leaders': format_leaders(apg_leaders, 'APG_LAST', 'Assists Per Game'),
        'rpg_leaders': format_leaders(rpg_leaders, 'RPG_LAST', 'Rebounds Per Game')
    })
