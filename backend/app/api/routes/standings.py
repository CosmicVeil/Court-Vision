from flask import Blueprint, jsonify, request

from app.services.standings import get_standings

bp = Blueprint('standings', __name__, url_prefix='/api/standings')


@bp.route('', methods=['GET'])
@bp.route('/', methods=['GET'])
def get_conference_standings():
    """Return East/West conference standings, cached hourly server-side.

    Query params:
      season   ESPN end year (2026 == 2025-26). Defaults to the current season;
               out-of-range values are clamped to what the app has stats for.
      refresh  Pass 1/true to bypass the cache (useful for debugging).
    """
    try:
        season = request.args.get('season')
        force = request.args.get('refresh') in ('1', 'true')
        return jsonify(get_standings(season=season, force_refresh=force)), 200
    except Exception as e:
        print(f"Error fetching standings: {e}")
        return jsonify({'error': 'Failed to fetch standings', 'east': [], 'west': []}), 500
