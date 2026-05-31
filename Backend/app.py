from flask import Flask, jsonify, request
from flask_cors import CORS
import pickle
import json
import os
import secrets
import subprocess
import sys
import signal
import time
from datetime import datetime, timedelta
from typing import Dict, List, Optional
from functools import wraps
from db import init_db, create_user_from_json, authenticate_user_from_json, get_user_by_id, get_saved_players, save_player, remove_saved_player
from live_games import get_todays_games, get_upcoming_games
from recommendations import get_top_performers




try:
    from nba_ai_system import get_top_scorers, get_top_assists, get_top_rebounders, get_breakout_players, get_player_prediction, initialize_nba_ai, nba_ai_system
    AI_AVAILABLE = True
except ImportError as e:
    print(f"AI predictions module not available: {e}")
    AI_AVAILABLE = False

app = Flask(__name__)

AO = os.environ.get('ALLOWED_ORIGINS', 'http://localhost:5173').split(',')
CORS(app, resources={
    r"/api/*": {
        "origins": "*",
        "methods": ["GET", "POST", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization"],
        "supports_credentials": False
    }
})

SECRET_KEY = os.environ.get('SECRET_KEY', secrets.token_hex(32))
app.config['SECRET_KEY'] = SECRET_KEY

TOKEN_EXPIRY_HOURS = 24
active_tokens = {}

mysql = None

nba_data = None
multi_season_data = None

def create_token(user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    expiry = datetime.now() + timedelta(hours=TOKEN_EXPIRY_HOURS)
    active_tokens[token] = {
        'user_id': user_id,
        'expiry': expiry
    }
    return token

def validate_token(token: str) -> Optional[int]:
    if token not in active_tokens:
        return None
    
    token_data = active_tokens[token]
    if datetime.now() > token_data['expiry']:
        del active_tokens[token]
        return None
    
    return token_data['user_id']

def invalidate_token(token: str):
    if token in active_tokens:
        del active_tokens[token]

def require_auth(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        auth_header = request.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Bearer '):
            return jsonify({'success': False, 'message': 'No token provided'}), 401
        
        token = auth_header.split(' ')[1]
        user_id = validate_token(token)
        
        if not user_id:
            return jsonify({'success': False, 'message': 'Invalid or expired token'}), 401
        
        request.user_id = user_id
        return f(*args, **kwargs)
    
    return decorated_function

def sanitize_string(value: str, max_length: int = 100) -> str:
    if not isinstance(value, str):
        return ""
    return value[:max_length].strip()


# ── Replace the live games routes in app.py with these ──────────────────────
# Import at top of app.py:
#   from live_games import get_todays_games, get_upcoming_games, get_top_pra_player

@app.route('/api/games/today', methods=['GET'])
def get_today_games():
    try:
        games = get_todays_games(nba_data=nba_data)
        return jsonify({'games': games, 'count': len(games)}), 200
    except Exception as e:
        print(f"Error fetching today's games: {e}")
        return jsonify({'error': 'Failed to fetch games', 'games': []}), 500

@app.route('/api/games/upcoming', methods=['GET'])
def get_upcoming():
    try:
        days = int(request.args.get('days', 7))
        games = get_upcoming_games(days=min(days, 14), nba_data=nba_data)
        return jsonify({'games': games, 'count': len(games)}), 200
    except Exception as e:
        print(f"Error fetching upcoming games: {e}")
        return jsonify({'error': 'Failed to fetch upcoming games', 'games': []}), 500

@app.route('/api/games/<string:game_id>', methods=['GET'])
def get_game_detail(game_id):
    try:
        games = get_todays_games(nba_data=nba_data)
        game = next((g for g in games if g['gameId'] == game_id), None)
        if not game:
            return jsonify({'error': 'Game not found'}), 404
        return jsonify(game), 200
    except Exception as e:
        print(f"Error fetching game detail: {e}")
        return jsonify({'error': 'Failed to fetch game'}), 500

@app.route('/api/stats/top-pra', methods=['GET'])
def get_top_pra():
    try:
        player = get_top_pra_player(nba_data)
        if not player:
            return jsonify({'error': 'No data available'}), 404
        return jsonify(player), 200
    except Exception as e:
        print(f"Error fetching top PRA: {e}")
        return jsonify({'error': 'Failed to fetch top PRA player'}), 500

def validate_pagination(page: any, limit: any) -> tuple:
    try:
        page = max(int(page), 1)
    except (ValueError, TypeError):
        page = 1
    
    try:
        limit = min(max(int(limit), 1), 100)
    except (ValueError, TypeError):
        limit = 20
    
    return page, limit

def load_nba_data():
    global nba_data
    try:
        with open('nba_2025_26_data.pkl', 'rb') as f:
            seasonal_data = pickle.load(f)

        # Flatten the seasonal data into a single list of players
        # Use the most recent season's data for each player to avoid duplicates
        # or combine data from all seasons (we'll use the most recent season)
        nba_data = []
        if isinstance(seasonal_data, dict):
            # Get the most recent season
            most_recent_season = max(seasonal_data.keys())
            nba_data = seasonal_data[most_recent_season]
            print(f"Loaded {len(nba_data)} NBA players from {most_recent_season} season data")
        elif isinstance(seasonal_data, list):
            nba_data = seasonal_data
            print(f"Loaded {len(nba_data)} NBA players from pickle file")
        else:
            print(f"Unexpected data format in pickle file: {type(seasonal_data)}")
            return False

        return True
    except FileNotFoundError:
        print("NBA data file 'nba_2025_26_data.pkl' not found.")
        return False
    except Exception as e:
        print(f"Error loading NBA data: {e}")
        return False

def load_multi_season_data():
    global multi_season_data
    try:
        data_file = os.path.join(os.path.dirname(__file__), 'nba_multi_season_data.pkl')
        if os.path.exists(data_file):
            with open(data_file, 'rb') as f:
                multi_season_data = pickle.load(f)
            print(f"Loaded multi-season data for years: {list(multi_season_data.keys())}")
            return True
        else:
            print("Multi-season data file 'nba_multi_season_data.pkl' not found.")
            return False
    except Exception as e:
        print(f"Error loading multi-season data: {e}")
        return False

def _deterministic_trend(name, stat, scale=3.0):
    """Generate a stable, deterministic trend value based on player name + stat."""
    import hashlib
    seed = int(hashlib.md5(f"{name}_{stat}".encode()).hexdigest(), 16)
    raw = ((seed % 10000) / 10000.0) * 2 - 1
    return round(raw * scale, 1)

def _deterministic_consistency(name, ppg):
    """Generate a stable consistency score (0.0 – 1.0) based on name + ppg."""
    import hashlib
    seed = int(hashlib.md5(f"{name}_consistency".encode()).hexdigest(), 16)
    base = (seed % 1000) / 1000.0
    ppg_bonus = min(ppg / 40.0, 0.3) if ppg else 0
    return round(min(1.0, base * 0.7 + ppg_bonus + 0.15), 2)

def get_player_stats_summary(player_data):
    ppg_current = player_data.get('PPG_LAST', player_data.get('ppg_last', 0))
    apg_current = player_data.get('APG_LAST', player_data.get('apg_last', 0))
    rpg_current = player_data.get('RPG_LAST', player_data.get('rpg_last', 0))
    name = player_data.get('PLAYER_NAME', player_data.get('player_name', 'Unknown'))

    ppg_trend = player_data.get('PPG_TREND', _deterministic_trend(name, 'ppg', scale=min(ppg_current * 0.25, 4.0)))
    apg_trend = player_data.get('APG_TREND', _deterministic_trend(name, 'apg', scale=min(apg_current * 0.3, 2.0)))
    rpg_trend = player_data.get('RPG_TREND', _deterministic_trend(name, 'rpg', scale=min(rpg_current * 0.25, 2.0)))
    consistency = player_data.get('CONSISTENCY_SCORE', _deterministic_consistency(name, ppg_current))

    return {
        'id': player_data.get('PLAYER_ID', player_data.get('player_id', abs(hash(name)) % (10**9))),
        'name': name,
        'team': player_data.get('TEAM', player_data.get('team', 'UNK')),
        'position': player_data.get('POSITION', player_data.get('position', 'UNK')),
        'age': player_data.get('AGE', player_data.get('age', 0)),
        'stats': {
            'ppg_last': round(ppg_current, 1),
            'apg_last': round(apg_current, 1),
            'rpg_last': round(rpg_current, 1),
            'spg_last': round(player_data.get('SPG_LAST', player_data.get('spg_last', 0)), 1),
            'bpg_last': round(player_data.get('BPG_LAST', player_data.get('bpg_last', 0)), 1),
            'fg_pct_last': round(player_data.get('FG_PCT_LAST', player_data.get('fg_pct_last', 0)) * 100, 1),
            'fg3_pct_last': round(player_data.get('FG3_PCT_LAST', player_data.get('fg3_pct_last', 0)) * 100, 1),
            'ft_pct_last': round(player_data.get('FT_PCT_LAST', player_data.get('ft_pct_last', 0)) * 100, 1),
            'games_played': int(player_data.get('GAMES_PLAYED_LAST', player_data.get('games_played_last', 0)) or 0)
        },
        'trends': {
            'ppg_trend': round(ppg_trend, 1),
            'apg_trend': round(apg_trend, 1),
            'rpg_trend': round(rpg_trend, 1),
            'consistency_score': round(consistency, 2)
        }
    }

@app.after_request
def add_security_headers(response):
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['X-XSS-Protection'] = '1; mode=block'
    response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
    return response

@app.route('/api/auth/signup', methods=['POST'])
def signup():
    try:
        success, user, message = create_user_from_json()
        if success:
            token = create_token(user['id'])
            return jsonify({'success': True, 'user': user, 'token': token, 'message': message}), 201
        return jsonify({'success': False, 'message': message}), 400
    except Exception as e:
        print(f"Signup error: {e}")
        return jsonify({'success': False, 'message': 'Error creating account'}), 500
 
@app.route('/api/auth/login', methods=['POST'])
def login():
    try:
        success, user, message = authenticate_user_from_json()
        if success:
            token = create_token(user['id'])
            return jsonify({'success': True, 'user': user, 'token': token, 'message': message}), 200
        return jsonify({'success': False, 'message': message}), 401
    except Exception as e:
        print(f"Login error: {e}")
        return jsonify({'success': False, 'message': 'Error logging in'}), 500
 
@app.route('/api/auth/logout', methods=['POST'])
@require_auth
def logout():
    auth_header = request.headers.get('Authorization')
    if auth_header and auth_header.startswith('Bearer '):
        token = auth_header.split(' ')[1]
        invalidate_token(token)
    return jsonify({'success': True, 'message': 'Logged out successfully'}), 200
 
@app.route('/api/auth/verify', methods=['GET'])
@require_auth
def verify():
    user = get_user_by_id(request.user_id)
    if user:
        return jsonify({'authenticated': True, 'user': user}), 200
    return jsonify({'authenticated': False, 'message': 'User not found'}), 401
 
# ── Saved players routes ─────────────────────────────────────────────────────
 
@app.route('/api/players/saved', methods=['GET'])
@require_auth
def get_saved():
    players = get_saved_players(request.user_id)
    return jsonify({'success': True, 'saved_players': players}), 200
 
@app.route('/api/players/saved', methods=['POST'])
@require_auth
def add_saved():
    data = request.get_json()
    if not data:
        return jsonify({'success': False, 'message': 'No data provided'}), 400
    player_id   = data.get('player_id')
    player_name = data.get('player_name', '')
    team        = data.get('team', '')
    position    = data.get('position', '')
    if not player_id:
        return jsonify({'success': False, 'message': 'player_id is required'}), 400
    success, message = save_player(request.user_id, player_id, player_name, team, position)
    return jsonify({'success': success, 'message': message}), 200 if success else 500
 
@app.route('/api/players/saved/<int:player_id>', methods=['DELETE'])
@require_auth
def delete_saved(player_id):
    success, message = remove_saved_player(request.user_id, player_id)
    return jsonify({'success': success, 'message': message}), 200 if success else 500
 
@app.route('/', methods=['GET'])
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
        'players_loaded': len(nba_data) if nba_data else 0,
        'ai_available': AI_AVAILABLE
    })

@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({
        'status': 'healthy',
        'message': 'NBA API server is running',
        'ai_available': AI_AVAILABLE,
        'players_loaded': len(nba_data) if nba_data else 0,
        'database_connected': False
    })

SORT_KEY_MAP = {
    'name': ('PLAYER_NAME', str),
    'team': ('TEAM', str),
    'position': ('POSITION', str),
    'ppg': ('PPG_LAST', float),
    'apg': ('APG_LAST', float),
    'rpg': ('RPG_LAST', float),
    'spg': ('SPG_LAST', float),
    'bpg': ('BPG_LAST', float),
    'fg_pct': ('FG_PCT_LAST', float),
    'fg3_pct': ('FG3_PCT_LAST', float),
    'ft_pct': ('FT_PCT_LAST', float),
    'games': ('GAMES_PLAYED_LAST', float),
    'age': ('AGE', float),
}

@app.route('/api/players', methods=['GET'])
def get_all_players():
    if not nba_data:
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

    filtered_players = list(nba_data)
    if year_param and multi_season_data:
        try:
            year_val = int(year_param)
            if year_val in multi_season_data:
                filtered_players = list(multi_season_data[year_val])
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

@app.route('/api/players/<int:player_id>', methods=['GET'])
def get_player_by_id(player_id):
    if not nba_data:
        return jsonify({'error': 'NBA data not loaded'}), 500
    
    if player_id < 0 or player_id > 9999999:
        return jsonify({'error': 'Invalid player ID'}), 400
    
    player = next((p for p in nba_data if p['PLAYER_ID'] == player_id), None)
    if not player:
        return jsonify({'error': 'Player not found'}), 404
    
    return jsonify(get_player_stats_summary(player))

@app.route('/api/players/search-all', methods=['GET'])
def search_players_all():
    if not nba_data:
        return jsonify({'error': 'NBA data not loaded'}), 500
    
    query = sanitize_string(request.args.get('query', ''), 50).lower()
    if not query:
        return jsonify({'players': []})
    
    matching_names = set()
    for player in nba_data:
        if query in player.get('PLAYER_NAME', '').lower():
            matching_names.add(player.get('PLAYER_NAME'))
            
    if not matching_names and multi_season_data:
        for season, players in multi_season_data.items():
            for p in players:
                if query in p.get('PLAYER_NAME', '').lower():
                    matching_names.add(p.get('PLAYER_NAME'))
                    
    matching_names = sorted(list(matching_names))[:15]
    
    results = []
    for name in matching_names:
        curr_player = next((p for p in nba_data if p.get('PLAYER_NAME') == name), None)
        
        if not curr_player and multi_season_data:
            for season in sorted(multi_season_data.keys(), reverse=True):
                curr_player = next((p for p in multi_season_data[season] if p.get('PLAYER_NAME') == name), None)
                if curr_player:
                    break
                    
        if not curr_player:
            continue
            
        history = {}
        if multi_season_data:
            for season in sorted(multi_season_data.keys()):
                season_player = next((p for p in multi_season_data[season] if p.get('PLAYER_NAME') == name), None)
                if season_player:
                    fg_pct = season_player.get('FG_PCT_LAST', 0)
                    fg3_pct = season_player.get('FG3_PCT_LAST', 0)
                    ft_pct = season_player.get('FT_PCT_LAST', 0)
                    history[str(season)] = {
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
                    
        ml_stats = None
        if AI_AVAILABLE:
            try:
                pred = get_player_prediction(name)
                if pred:
                    ml_stats = {
                        'predicted_stats': pred.get('predicted_stats'),
                        'improvements': pred.get('improvements')
                    }
            except Exception as e:
                print(f"Error getting AI prediction for {name}: {e}")
                
        fg_pct = curr_player.get('FG_PCT_LAST', 0)
        fg3_pct = curr_player.get('FG3_PCT_LAST', 0)
        ft_pct = curr_player.get('FT_PCT_LAST', 0)
        results.append({
            'name': name,
            'team': curr_player.get('TEAM', 'UNK'),
            'position': curr_player.get('POSITION', 'UNK'),
            'age': curr_player.get('AGE', 0),
            'current_stats': {
                'ppg': round(curr_player.get('PPG_LAST', 0), 1),
                'apg': round(curr_player.get('APG_LAST', 0), 1),
                'rpg': round(curr_player.get('RPG_LAST', 0), 1),
                'spg': round(curr_player.get('SPG_LAST', 0), 1),
                'bpg': round(curr_player.get('BPG_LAST', 0), 1),
                'fg_pct': round(fg_pct * (100.0 if fg_pct <= 1.0 else 1.0), 1),
                'fg3_pct': round(fg3_pct * (100.0 if fg3_pct <= 1.0 else 1.0), 1),
                'ft_pct': round(ft_pct * (100.0 if ft_pct <= 1.0 else 1.0), 1),
                'games_played': int(curr_player.get('GAMES_PLAYED_LAST', 0) or 0),
                'minutes': round(curr_player.get('MIN_LAST', 0), 1)
            },
            'ml_stats': ml_stats,
            'history': history
        })
        
    return jsonify({'players': results})

@app.route('/api/players/search/<string:player_name>', methods=['GET'])
def search_player(player_name):
    if not nba_data:
        return jsonify({'error': 'NBA data not loaded'}), 500
    
    player_name_clean = sanitize_string(player_name, 50).lower()
    if not player_name_clean:
        return jsonify({'error': 'Invalid player name'}), 400
    
    players = [p for p in nba_data if player_name_clean in p['PLAYER_NAME'].lower()]
    
    if not players:
        return jsonify({'error': 'No players found'}), 404
    
    players_summary = [get_player_stats_summary(player) for player in players[:50]]
    return jsonify({'players': players_summary})

@app.route('/api/teams', methods=['GET'])
def get_teams():
    if not nba_data:
        return jsonify({'error': 'NBA data not loaded'}), 500
    
    teams = list(set(player['TEAM'] for player in nba_data))
    teams.sort()
    return jsonify({'teams': teams})

@app.route('/api/positions', methods=['GET'])
def get_positions():
    if not nba_data:
        return jsonify({'error': 'NBA data not loaded'}), 500
    
    positions = list(set(player['POSITION'] for player in nba_data))
    positions.sort()
    return jsonify({'positions': positions})

@app.route('/api/ai-predictions', methods=['GET'])
def get_ai_predictions():
    if not AI_AVAILABLE:
        return jsonify({
            'error': 'AI predictions not available',
            'ai_available': False
        }), 503
    
    try:
        initialize_nba_ai()
        
        predictions = {
            'top_scorers': get_top_scorers(10),
            'top_assists': get_top_assists(10),
            'top_rebounders': get_top_rebounders(10),
            'breakout_players': get_breakout_players(10)
        }
        
        if nba_data:
            for category in ['top_scorers', 'top_assists', 'top_rebounders']:
                for player in predictions[category]:
                    player_name = player['PLAYER_NAME']
                    matching_player = next((p for p in nba_data if p['PLAYER_NAME'] == player_name), None)
                    if matching_player:
                        player['PPG_LAST'] = matching_player.get('PPG_LAST', 0)
                        player['APG_LAST'] = matching_player.get('APG_LAST', 0)
                        player['RPG_LAST'] = matching_player.get('RPG_LAST', 0)
        
        return jsonify({
            'predictions': predictions,
            'ai_available': True
        })
    except Exception as e:
        import traceback
        trace_str = traceback.format_exc()
        print(f"AI prediction error: {trace_str}")
        return jsonify({
            'error': f'Error generating predictions: {str(e)}',
            'trace': trace_str,
            'ai_available': True
        }), 500

@app.route('/api/predictions', methods=['GET'])
def get_all_predictions_paginated():
    if not AI_AVAILABLE:
        return jsonify({
            'error': 'AI predictions not available',
            'ai_available': False
        }), 503
    
    try:
        initialize_nba_ai()
        X, _, df = nba_ai_system.prepare_data()
        predictions = nba_ai_system.predict(X)
        
        if predictions is None:
            return jsonify({'error': 'Failed to generate predictions'}), 500
        
        results = []
        for i, row in df.iterrows():
            player_name = row['PLAYER_NAME']
            ppg_last = row.get('PPG_LAST', 0)
            apg_last = row.get('APG_LAST', 0)
            rpg_last = row.get('RPG_LAST', 0)
            
            # Apply 1.1x multiplier
            predicted_ppg = float(predictions[i, 0] * 1.1)
            predicted_apg = float(predictions[i, 1] * 1.1)
            predicted_rpg = float(predictions[i, 2] * 1.1)
            
            results.append({
                'id': int(row.get('PLAYER_ID', abs(hash(player_name)) % (10**9))),
                'name': player_name,
                'team': row.get('TEAM', 'UNK'),
                'position': row.get('POSITION', 'UNK'),
                'age': int(row.get('AGE', 0)),
                'ppg_last': round(float(ppg_last), 1),
                'apg_last': round(float(apg_last), 1),
                'rpg_last': round(float(rpg_last), 1),
                'predicted_ppg': round(predicted_ppg, 1),
                'predicted_apg': round(predicted_apg, 1),
                'predicted_rpg': round(predicted_rpg, 1),
            })
            
        search = sanitize_string(request.args.get('search', ''), 50).lower()
        team = sanitize_string(request.args.get('team', ''), 10).upper()
        position = sanitize_string(request.args.get('position', ''), 10).upper()
        sort_by = request.args.get('sort_by', 'name')
        sort_order = request.args.get('sort_order', 'asc')
        
        filtered = results
        if search:
            filtered = [p for p in filtered if search in p['name'].lower()]
        if team:
            filtered = [p for p in filtered if p['team'] == team]
        if position:
            filtered = [p for p in filtered if p['position'] == position]
            
        reverse = (sort_order == 'desc')
        if sort_by == 'name':
            filtered.sort(key=lambda p: p['name'].lower(), reverse=reverse)
        elif sort_by == 'team':
            filtered.sort(key=lambda p: p['team'].lower(), reverse=reverse)
        elif sort_by == 'position':
            filtered.sort(key=lambda p: p['position'].lower(), reverse=reverse)
        elif sort_by == 'ppg_last':
            filtered.sort(key=lambda p: p['ppg_last'], reverse=reverse)
        elif sort_by == 'predicted_ppg':
            filtered.sort(key=lambda p: p['predicted_ppg'], reverse=reverse)
        elif sort_by == 'predicted_apg':
            filtered.sort(key=lambda p: p['predicted_apg'], reverse=reverse)
        elif sort_by == 'predicted_rpg':
            filtered.sort(key=lambda p: p['predicted_rpg'], reverse=reverse)
        else:
            filtered.sort(key=lambda p: p['name'].lower(), reverse=reverse)
            
        page = request.args.get('page', 1)
        limit = request.args.get('limit', 20)
        page, limit = validate_pagination(page, limit)
        
        start_idx = (page - 1) * limit
        end_idx = start_idx + limit
        page_results = filtered[start_idx:end_idx]
        
        return jsonify({
            'predictions': page_results,
            'pagination': {
                'page': page,
                'limit': limit,
                'total': len(filtered),
                'total_pages': (len(filtered) + limit - 1) // limit
            }
        })
    except Exception as e:
        print(f"Error in get_predictions endpoint: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/player-prediction/<string:player_name>', methods=['GET'])
def get_player_prediction_api(player_name):
    if not AI_AVAILABLE:
        return jsonify({
            'error': 'AI predictions not available',
            'ai_available': False
        }), 503
    
    player_name_clean = sanitize_string(player_name, 50)
    if not player_name_clean:
        return jsonify({'error': 'Invalid player name'}), 400
    
    try:
        prediction = get_player_prediction(player_name_clean)
        return jsonify({
            'prediction': prediction,
            'ai_available': True
        })
    except Exception as e:
        print(f"Player prediction error: {e}")
        return jsonify({
            'error': 'Error generating prediction',
            'ai_available': True
        }), 500

@app.route('/api/stats/leaders', methods=['GET'])
def get_stat_leaders():
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

@app.route('/api/recommendations/<stat>', methods=['GET'])
def recommendations(stat):
    if not AI_AVAILABLE:
        return jsonify({'error': 'AI predictions not available', 'ai_available': False}), 503

    stat_clean = sanitize_string(stat, 10).upper()
    if stat_clean not in ('PPG', 'APG', 'RPG', 'PRA'):
        return jsonify({'error': 'Invalid stat. Use PPG, APG, RPG, or PRA.'}), 400

    try:
        data = get_top_performers(stat_clean)
        return jsonify(data), 200
    except Exception as e:
        print(f"Error in recommendations: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    frontend_process = None
    
    def cleanup_processes():
        if frontend_process:
            try:
                print("\nStopping frontend server...")
                frontend_process.terminate()
                frontend_process.wait(timeout=5)
                print(" Frontend server stopped")
            except Exception as e:
                print(f"Error stopping frontend: {e}")
                try:
                    frontend_process.kill()
                except:
                    pass
    
    def signal_handler(sig, frame):
        cleanup_processes()
        sys.exit(0)
    
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    try:
        print("Starting frontend development server...")
        backend_dir = os.path.dirname(os.path.abspath(__file__))
        project_root = os.path.dirname(backend_dir)
        
        package_json = os.path.join(project_root, 'package.json')
        if os.path.exists(package_json):
            try:
                frontend_process = subprocess.Popen(
                    ['npm', 'run', 'dev'],
                    cwd=project_root,
                    shell=(sys.platform == 'win32')
                )
                print("Frontend server starting...")
                print(f"   Frontend: http://localhost:5173")
                time.sleep(3)
            except Exception as e:
                print(f"Frontend startup failed: {e}")
        
        print("\nLoading NBA data...")
        if load_nba_data():
            print(f"NBA data loaded - {len(nba_data)} players")
            load_multi_season_data()
            for i, player in enumerate(nba_data[:5]):
                print(f"  {i+1}. {player['PLAYER_NAME']} ({player['TEAM']}) - {player['PPG_LAST']:.1f} PPG")
        else:
            nba_data = [
                {
                    'PLAYER_ID': 1,
                    'PLAYER_NAME': 'LeBron James',
                    'TEAM': 'LAL',
                    'POSITION': 'SF',
                    'AGE': 39,
                    'HEIGHT': 80,
                    'WEIGHT': 250,
                    'PPG_LAST': 25.0,
                    'APG_LAST': 7.8,
                    'RPG_LAST': 7.3,
                    'SPG_LAST': 1.3,
                    'BPG_LAST': 0.5,
                    'FG_PCT_LAST': 0.525,
                    'FG3_PCT_LAST': 0.410,
                    'FT_PCT_LAST': 0.730,
                    'GAMES_PLAYED_LAST': 71,
                    'PPG_TREND': 0.5,
                    'APG_TREND': 0.2,
                    'RPG_TREND': 0.1,
                    'CONSISTENCY_SCORE': 0.85
                },
                {
                    'PLAYER_ID': 2,
                    'PLAYER_NAME': 'Stephen Curry',
                    'TEAM': 'GSW',
                    'POSITION': 'PG',
                    'AGE': 35,
                    'HEIGHT': 75,
                    'WEIGHT': 190,
                    'PPG_LAST': 26.4,
                    'APG_LAST': 4.5,
                    'RPG_LAST': 4.5,
                    'SPG_LAST': 0.9,
                    'BPG_LAST': 0.4,
                    'FG_PCT_LAST': 0.450,
                    'FG3_PCT_LAST': 0.427,
                    'FT_PCT_LAST': 0.923,
                    'GAMES_PLAYED_LAST': 74,
                    'PPG_TREND': 1.2,
                    'APG_TREND': -0.1,
                    'RPG_TREND': 0.3,
                    'CONSISTENCY_SCORE': 0.92
                }
            ]
            print(f"Using sample data - {len(nba_data)} players")
        
        if AI_AVAILABLE:
            try:
                print("Initializing AI system...")
                initialize_nba_ai()
                print("AI system initialized")
            except Exception as e:
                print(f"AI initialization failed: {e}")
        
        print("\n" + "="*50)
        print("Starting NBA API server...")
        print("Backend: http://localhost:5000")
        print("Frontend: http://localhost:5173")
        print("Health: http://localhost:5000/api/health")
        print("="*50)
        print("Press Ctrl+C to stop")
        print("="*50 + "\n")
        
        init_db()
        app.run(debug=False, host='0.0.0.0', port=5000, threaded=True)
        
    except KeyboardInterrupt:
        print("\nShutting down servers...")
        cleanup_processes()
        print("Server stopped")
    except Exception as e:
        print(f"Server error: {e}")
        cleanup_processes()