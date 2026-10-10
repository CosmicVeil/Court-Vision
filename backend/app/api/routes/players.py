from flask import Blueprint, jsonify, request

from app import db, state
from app.api.helpers import SORT_KEY_MAP, get_player_stats_summary, sanitize_string, validate_pagination
from app.services import game_archive
from app.utils.player_ids import player_id_for
from app.utils.player_names import normalize_player_name

bp = Blueprint('players', __name__, url_prefix='/api')

MAX_GAME_LOG_LIMIT = 200


@bp.route('/players', methods=['GET'])
def get_all_players():
    if not state.nba_data:
        return jsonify({'error': 'NBA data not loaded'}), 500

    page = request.args.get('page', 1)
    limit = request.args.get('limit', 20)
    page, limit = validate_pagination(page, limit)

    search = sanitize_string(request.args.get('search', ''), 50).lower()
    team = sanitize_string(request.args.get('team', ''), 10).upper()
    position = sanitize_string(request.args.get('position', ''), 10).upper()
    sort_by = request.args.get('sort_by', 'name')
    sort_order = request.args.get('sort_order', 'asc')
    year_param = request.args.get('year', '')

    filtered_players = list(state.nba_data)
    if year_param and state.multi_season_data:
        try:
            year_val = int(year_param)
            if year_val in state.multi_season_data:
                filtered_players = list(state.multi_season_data[year_val])
        except ValueError:
            pass

    if search:
        filtered_players = [p for p in filtered_players if search in p['PLAYER_NAME'].lower()]

    if team:
        filtered_players = [p for p in filtered_players if p['TEAM'] == team]

    if position:
        filtered_players = [p for p in filtered_players if p['POSITION'] == position]

    raw_key, cast = SORT_KEY_MAP.get(sort_by, ('PLAYER_NAME', str))
    reverse = (sort_order == 'desc')
    try:
        if cast is str:
            filtered_players.sort(key=lambda p: (p.get(raw_key) or '').lower(), reverse=reverse)
        else:
            filtered_players.sort(key=lambda p: cast(p.get(raw_key) or 0), reverse=reverse)
    except Exception:
        pass

    start_idx = (page - 1) * limit
    end_idx = start_idx + limit
    page_players = filtered_players[start_idx:end_idx]

    players_summary = [get_player_stats_summary(player) for player in page_players]

    return jsonify({
        'players': players_summary,
        'pagination': {
            'page': page,
            'limit': limit,
            'total': len(filtered_players),
            'total_pages': (len(filtered_players) + limit - 1) // limit
        },
        'filters': {
            'search': search,
            'team': team,
            'position': position
        }
    })


@bp.route('/players/<int:player_id>', methods=['GET'])
def get_player_by_id(player_id):
    if not state.nba_data:
        return jsonify({'error': 'NBA data not loaded'}), 500

    if player_id <= 0 or player_id > 999_999_999:
        return jsonify({'error': 'Invalid player ID'}), 400

    player = next((p for p in state.nba_data if p.get('PLAYER_ID') == player_id), None)
    if not player:
        return jsonify({'error': 'Player not found'}), 404

    return jsonify(get_player_stats_summary(player))


@bp.route('/players/<int:player_id>/games', methods=['GET'])
def get_player_games(player_id):
    """Per-game stats from the game archive, for the player popup's Game Log tab."""
    limit = min(max(request.args.get('limit', 10, type=int), 1), MAX_GAME_LOG_LIMIT)
    season = request.args.get('season')
    conn = None
    try:
        conn = db.get_db()
        return jsonify(game_archive.player_game_log(conn, player_id, limit, season=season))
    except Exception as e:
        print(f"Error loading game log for {player_id}: {e}")
        return jsonify({'error': 'Game log unavailable', 'games': []}), 503
    finally:
        if conn:
            conn.close()


def _season_line(season_player):
    fg_pct = season_player.get('FG_PCT_LAST', 0)
    fg3_pct = season_player.get('FG3_PCT_LAST', 0)
    ft_pct = season_player.get('FT_PCT_LAST', 0)
    return {
        'ppg': round(season_player.get('PPG_LAST', 0), 1),
        'apg': round(season_player.get('APG_LAST', 0), 1),
        'rpg': round(season_player.get('RPG_LAST', 0), 1),
        'spg': round(season_player.get('SPG_LAST', 0), 1),
        'bpg': round(season_player.get('BPG_LAST', 0), 1),
        'fg_pct': round(fg_pct * (100.0 if fg_pct <= 1.0 else 1.0), 1),
        'fg3_pct': round(fg3_pct * (100.0 if fg3_pct <= 1.0 else 1.0), 1),
        'ft_pct': round(ft_pct * (100.0 if ft_pct <= 1.0 else 1.0), 1),
        'games_played': int(season_player.get('GAMES_PLAYED_LAST', 0) or 0),
        'minutes': round(season_player.get('MIN_LAST', 0), 1)
    }


@bp.route('/players/search-all', methods=['GET'])
def search_players_all():
    nba_data = state.nba_data
    multi_season_data = state.multi_season_data
    if not nba_data:
        return jsonify({'error': 'NBA data not loaded'}), 500

    raw_query = sanitize_string(request.args.get('query', ''), 50)
    query = raw_query.lower()
    normalized_query = normalize_player_name(raw_query)
    if not raw_query:
        return jsonify({'players': []})

    matching_names = set()
    for player in nba_data:
        name = player.get('PLAYER_NAME', '')
        if query in name.lower() or (normalized_query and normalized_query in normalize_player_name(name)):
            matching_names.add(player.get('PLAYER_NAME'))

    if not matching_names and multi_season_data:
        for season, players in multi_season_data.items():
            for p in players:
                name = p.get('PLAYER_NAME', '')
                if query in name.lower() or (normalized_query and normalized_query in normalize_player_name(name)):
                    matching_names.add(p.get('PLAYER_NAME'))

    matching_names = sorted(list(matching_names))[:15]

    results = []
    for name in matching_names:
        name_key = normalize_player_name(name)
        curr_player = state.nba_name_index.get(name_key)

        if not curr_player and multi_season_data:
            for season in sorted(multi_season_data.keys(), reverse=True):
                curr_player = state.multi_season_name_indexes.get(season, {}).get(name_key)
                if curr_player:
                    break

        if not curr_player:
            continue

        history = {}
        if multi_season_data:
            for season in sorted(multi_season_data.keys()):
                season_player = state.multi_season_name_indexes.get(season, {}).get(name_key)
                if season_player:
                    history[str(season)] = _season_line(season_player)

        ml_stats = None
        if state.ai_available:
            try:
                if state.is_render or state.predictions_cache:
                    pred = state.get_cached_player_prediction(name)
                else:
                    pred = state.ai.get_player_prediction(name)
                if pred:
                    ml_stats = {
                        'predicted_stats': pred.get('predicted_stats'),
                        'improvements': pred.get('improvements')
                    }
            except Exception as e:
                print(f"Error getting AI prediction for {name}: {e}")

        current = _season_line(curr_player)
        results.append({
            'id': curr_player.get('PLAYER_ID') or player_id_for(name),
            'name': name,
            'team': curr_player.get('TEAM', 'UNK'),
            'position': curr_player.get('POSITION', 'UNK'),
            'age': curr_player.get('AGE', 0),
            'current_stats': {
                'ppg': current['ppg'],
                'apg': current['apg'],
                'rpg': current['rpg'],
                'spg': current['spg'],
                'bpg': current['bpg'],
                'tov': round(curr_player.get('TOV_LAST', 0), 1),
                'mpg': round(curr_player.get('MIN_LAST', 0), 1),
                'fg_pct': current['fg_pct'],
                'fg3_pct': current['fg3_pct'],
                'ft_pct': current['ft_pct'],
                'games_played': current['games_played'],
                'minutes': current['minutes'],
            },
            'ml_stats': ml_stats,
            'history': history
        })

    return jsonify({'players': results})


@bp.route('/players/search/<string:player_name>', methods=['GET'])
def search_player(player_name):
    if not state.nba_data:
        return jsonify({'error': 'NBA data not loaded'}), 500

    player_name_clean = sanitize_string(player_name, 50).lower()
    if not player_name_clean:
        return jsonify({'error': 'Invalid player name'}), 400

    players = [p for p in state.nba_data if player_name_clean in p['PLAYER_NAME'].lower()]

    if not players:
        return jsonify({'error': 'No players found'}), 404

    players_summary = [get_player_stats_summary(player) for player in players[:50]]
    return jsonify({'players': players_summary})


@bp.route('/teams', methods=['GET'])
def get_teams():
    if not state.nba_data:
        return jsonify({'error': 'NBA data not loaded'}), 500

    teams = list(set(player['TEAM'] for player in state.nba_data))
    teams.sort()
    return jsonify({'teams': teams})


@bp.route('/positions', methods=['GET'])
def get_positions():
    if not state.nba_data:
        return jsonify({'error': 'NBA data not loaded'}), 500

    positions = list(set(player['POSITION'] for player in state.nba_data))
    positions.sort()
    return jsonify({'positions': positions})
