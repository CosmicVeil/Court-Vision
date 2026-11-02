from flask import Blueprint, jsonify, request

from app import db, state
from app.api.helpers import SORT_KEY_MAP, get_player_stats_summary, sanitize_string, so_far_stats, validate_pagination
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
    if not year_param and state.current_season_data:
        filtered_players = list(state.current_season_data)
    if year_param:
        try:
            year_val = int(year_param)
            if year_val == state.current_season_year and state.current_season_data:
                filtered_players = list(state.current_season_data)
            elif state.multi_season_data and year_val in state.multi_season_data:
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


def _find_player_by_id(player_id):
    player = next((p for p in state.nba_data if p.get('PLAYER_ID') == player_id), None)
    if player:
        return player, False

    if state.multi_season_data:
        for season in sorted(state.multi_season_data.keys(), reverse=True):
            player = next((p for p in state.multi_season_data[season] if p.get('PLAYER_ID') == player_id), None)
            if player:
                return player, False

    player = next((p for p in state.current_season_data if p.get('PLAYER_ID') == player_id), None)
    return player, bool(player)


@bp.route('/players/<int:player_id>', methods=['GET'])
def get_player_by_id(player_id):
    if not state.nba_data:
        return jsonify({'error': 'NBA data not loaded'}), 500

    if player_id <= 0 or player_id > 999_999_999:
        return jsonify({'error': 'Invalid player ID'}), 400

    player, archive_only = _find_player_by_id(player_id)
    if not player:
        return jsonify({'error': 'Player not found'}), 404

    current_season = {p['PLAYER_ID']: p for p in state.current_season_data}
    return jsonify(_player_result(player.get('PLAYER_NAME'), player, archive_only, current_season))


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


def _player_result(name, curr_player, archive_only, current_season):
    name_key = normalize_player_name(name)
    history = {}
    age = curr_player.get('AGE', 0)
    if state.multi_season_data:
        for season in sorted(state.multi_season_data.keys()):
            season_player = state.multi_season_name_indexes.get(season, {}).get(name_key)
            if season_player:
                history[str(season)] = _season_line(season_player)
                # The pickle stores age per season, not a birth date: age now = latest known age + years since.
                if not archive_only and season_player.get('AGE'):
                    age = season_player['AGE'] + (state.current_season_year - season)

    archive_player = current_season.get(curr_player.get('PLAYER_ID'))
    if archive_player:
        history[str(state.current_season_year)] = {**_season_line(archive_player), 'in_progress': True}

    ml_stats = None
    if state.ai_available:
        try:
            if state.is_render or state.predictions_cache or archive_only:
                pred = state.get_cached_player_prediction(name)
            else:
                pred = state.ai.get_player_prediction(name)
            if pred:
                ml_stats = {
                    # This season so far, to compare the predictions against (None before any games).
                    'so_far_stats': so_far_stats(archive_player) if archive_player else None,
                    'predicted_stats': pred.get('predicted_stats'),
                    'improvements': pred.get('improvements')
                }
        except Exception as e:
            print(f"Error getting AI prediction for {name}: {e}")

    stats_player = archive_player or curr_player
    current = _season_line(stats_player)
    return {
        'id': curr_player.get('PLAYER_ID') or player_id_for(name),
        'name': name,
        'team': curr_player.get('TEAM', 'UNK'),
        'position': curr_player.get('POSITION', 'UNK'),
        'age': age,
        'current_stats': {
            'ppg': current['ppg'],
            'apg': current['apg'],
            'rpg': current['rpg'],
            'spg': current['spg'],
            'bpg': current['bpg'],
            'tov': round(stats_player.get('TOV_LAST', 0), 1),
            'mpg': round(stats_player.get('MIN_LAST', 0), 1),
            'fg_pct': current['fg_pct'],
            'fg3_pct': current['fg3_pct'],
            'ft_pct': current['ft_pct'],
            'games_played': current['games_played'],
            'minutes': current['minutes'],
        },
        'ml_stats': ml_stats,
        'history': history
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

    # Players only in older seasons (retired or inactive), listed after current players.
    older_names = {}
    if multi_season_data:
        current_keys = {normalize_player_name(n) for n in matching_names}
        for season in sorted(multi_season_data.keys(), reverse=True):
            for p in multi_season_data[season]:
                name = p.get('PLAYER_NAME', '')
                name_key = normalize_player_name(name)
                if name_key in current_keys:
                    continue
                if query in name.lower() or (normalized_query and normalized_query in name_key):
                    older_names.setdefault(name_key, name)

    for player in state.current_season_data:
        name = player.get('PLAYER_NAME', '')
        name_key = normalize_player_name(name)
        if name_key in state.nba_name_index or any(
            name_key in index for index in state.multi_season_name_indexes.values()
        ):
            continue
        if query in name.lower() or (normalized_query and normalized_query in name_key):
            matching_names.add(name)

    matching_names = (sorted(matching_names) + sorted(older_names.values()))[:15]

    current_season = {p['PLAYER_ID']: p for p in state.current_season_data}
    archive_by_name = {normalize_player_name(p.get('PLAYER_NAME')): p for p in state.current_season_data}
    results = []
    for name in matching_names:
        name_key = normalize_player_name(name)
        curr_player = state.nba_name_index.get(name_key)

        if not curr_player and multi_season_data:
            for season in sorted(multi_season_data.keys(), reverse=True):
                curr_player = state.multi_season_name_indexes.get(season, {}).get(name_key)
                if curr_player:
                    break

        archive_only = False
        if not curr_player:
            curr_player = archive_by_name.get(name_key)
            archive_only = True
        if not curr_player:
            continue

        results.append(_player_result(name, curr_player, archive_only, current_season))

    return jsonify({'players': results})


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
