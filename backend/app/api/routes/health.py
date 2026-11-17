from flask import Blueprint, jsonify, request

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
            'teams': '/api/teams',
            'positions': '/api/positions',
            'ai_predictions': '/api/ai-predictions',
            'player_prediction': '/api/player-prediction/<name>',
            'stat_leaders': '/api/stats/leaders'
        },
        'players_loaded': len(state.nba_data) if state.nba_data else 0,
        'ai_available': state.ai_available
    })


@bp.route('/healthz', methods=['GET'])
@bp.route('/api/healthz', methods=['GET'])
def healthz():
    """Lightweight keepalive endpoint for uptime monitors (e.g. UptimeRobot).

    Intentionally does no DB/model work so it stays cheap to hit every few
    minutes. Returning 200 is enough to keep Render's free tier from sleeping.
    """
    return jsonify({'status': 'ok'}), 200


@bp.route('/api/debug/forwarded', methods=['GET'])
def debug_forwarded():
    """One-off diagnostic: report the proxy chain so the hop count can be confirmed.

    Hit this once from a browser on the deployed site (over Cloudflare), then
    read the Render logs for the "[forwarded]" line. Behind Render + Cloudflare,
    X-Forwarded-For should hold two entries: the client's IP first, then a
    Cloudflare address. remote_addr is the last proxy that spoke to the app.

    If we later trust X-Forwarded-For (e.g. to log or rate-limit by real client
    IP), wrap the app in werkzeug ProxyFix with x_for set to that hop count, or
    prefer Cloudflare's CF-Connecting-IP, which is a single trusted client IP.
    Remove this endpoint once the count is confirmed.
    """
    xff = request.headers.get('X-Forwarded-For', '')
    hops = [h.strip() for h in xff.split(',') if h.strip()]
    payload = {
        'x_forwarded_for': xff,
        'x_forwarded_for_hops': hops,
        'hop_count': len(hops),
        'cf_connecting_ip': request.headers.get('CF-Connecting-IP', ''),
        'x_real_ip': request.headers.get('X-Real-IP', ''),
        'remote_addr': request.remote_addr,
        # access_route is XFF entries + remote_addr, the full chain Werkzeug sees.
        'access_route': list(request.access_route),
    }
    print(f"[forwarded] {payload}", flush=True)
    return jsonify(payload), 200


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
