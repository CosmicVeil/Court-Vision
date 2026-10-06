from flask import Blueprint, jsonify

from app import state
from app.db import get_db

bp = Blueprint('health', __name__)


@bp.route('/', methods=['GET'])
def root():
    return jsonify({
        'message': 'NBA Sports Website API',
        'version': '1.0.0',
        'status': 'running',
        'endpoints': {
            'health': '/api/health',
            'all_players': '/api/players',
            'player_by_id': '/api/players/<id>',
            'search_player': '/api/players/search/<name>',
            'teams': '/api/teams',
            'positions': '/api/positions',
            'ai_predictions': '/api/ai-predictions',
            'player_prediction': '/api/player-prediction/<name>',
            'stat_leaders': '/api/stats/leaders'
        },
        'players_loaded': len(state.nba_data) if state.nba_data else 0,
        'ai_available': state.ai_available
    })


@bp.route('/api/health', methods=['GET'])
def health_check():
    db_connected = False
    try:
        conn = get_db()
        conn.execute('SELECT 1')
        conn.close()
        db_connected = True
    except Exception:
        pass
    return jsonify({
        'status': 'healthy',
        'message': 'NBA API server is running',
        'ai_available': state.ai_available,
        'players_loaded': len(state.nba_data) if state.nba_data else 0,
        'database_connected': db_connected
    })
