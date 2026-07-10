"""
Flask API Server for NBA Sports Website
Serves NBA player data and AI predictions to the React frontend
"""

from flask import Flask, jsonify, request
from flask_cors import CORS
import pickle
import json
import os
import secrets
from typing import Dict, List, Optional



try:
    from nba_ai_system import get_top_scorers, get_top_assists, get_top_rebounders, get_breakout_players, get_player_prediction, initialize_nba_ai
    AI_AVAILABLE = True
except ImportError:
    print("AI predictions module not available. Install PyTorch dependencies to enable AI features.")
    AI_AVAILABLE = False

app = Flask(__name__)
CORS(app) 


nba_data = None

def load_nba_data():
    """Load NBA player data from pickle file"""
    global nba_data
    try:
        filepath = os.path.join(os.path.dirname(__file__), 'nba_2025_26_data.pkl')
        with open(filepath, 'rb') as f:
            nba_data = pickle.load(f)
        print(f"✅ Loaded {len(nba_data)} NBA players from pickle file")
        return True
    except FileNotFoundError:
        print("❌ NBA data file 'nba_2025_26_data.pkl' not found.")
        return False
    except Exception as e:
        print(f"❌ Error loading NBA data: {e}")
        return False

def get_player_stats_summary(player_data):
    """Convert player data to a more readable format"""
    return {
        'id': player_data['PLAYER_ID'],
        'name': player_data['PLAYER_NAME'],
        'team': player_data['TEAM'],
        'position': player_data['POSITION'],
        'age': player_data['AGE'],
        'height': player_data['HEIGHT'],
        'weight': player_data['WEIGHT'],
        'stats': {
            'ppg_last': round(player_data['PPG_LAST'], 1),
            'apg_last': round(player_data['APG_LAST'], 1),
            'rpg_last': round(player_data['RPG_LAST'], 1),
            'spg_last': round(player_data['SPG_LAST'], 1),
            'bpg_last': round(player_data['BPG_LAST'], 1),
            'fg_pct_last': round(player_data['FG_PCT_LAST'] * 100, 1),
            'fg3_pct_last': round(player_data['FG3_PCT_LAST'] * 100, 1),
            'ft_pct_last': round(player_data['FT_PCT_LAST'] * 100, 1),
            'games_played': player_data['GAMES_PLAYED_LAST']
        },
        'trends': {
            'ppg_trend': round(player_data['PPG_TREND'], 2),
            'apg_trend': round(player_data['APG_TREND'], 2),
            'rpg_trend': round(player_data['RPG_TREND'], 2),
            'consistency_score': round(player_data['CONSISTENCY_SCORE'], 2)
        }
    }

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'message': 'NBA API server is running',
        'ai_available': AI_AVAILABLE,
        'players_loaded': len(nba_data) if nba_data else 0
    })

@app.route('/api/players', methods=['GET'])
def get_all_players():
    """Get all NBA players with their stats"""
    if not nba_data:
        return jsonify({'error': 'NBA data not loaded'}), 500
    
    # Get query parameters for pagination and filtering
    page = int(request.args.get('page', 1))
    limit = int(request.args.get('limit', 20))
    search = request.args.get('search', '').lower()
    team = request.args.get('team', '').upper()
    position = request.args.get('position', '').upper()
    
    # Filter players
    filtered_players = nba_data
    
    if search:
        filtered_players = [p for p in filtered_players if search in p['PLAYER_NAME'].lower()]
    
    if team:
        filtered_players = [p for p in filtered_players if p['TEAM'] == team]
    
    if position:
        filtered_players = [p for p in filtered_players if p['POSITION'] == position]
    
    # Pagination
    start_idx = (page - 1) * limit
    end_idx = start_idx + limit
    page_players = filtered_players[start_idx:end_idx]
    
    # Convert to summary format
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
    """Get specific player by ID"""
    if not nba_data:
        return jsonify({'error': 'NBA data not loaded'}), 500
    
    player = next((p for p in nba_data if p['PLAYER_ID'] == player_id), None)
    if not player:
        return jsonify({'error': 'Player not found'}), 404
    
    return jsonify(get_player_stats_summary(player))

@app.route('/api/players/search/<string:player_name>', methods=['GET'])
def search_player(player_name):
    """Search for a player by name"""
    if not nba_data:
        return jsonify({'error': 'NBA data not loaded'}), 500
    
    player_name_lower = player_name.lower()
    players = [p for p in nba_data if player_name_lower in p['PLAYER_NAME'].lower()]
    
    if not players:
        return jsonify({'error': 'No players found'}), 404
    
    players_summary = [get_player_stats_summary(player) for player in players]
    return jsonify({'players': players_summary})

@app.route('/api/teams', methods=['GET'])
def get_teams():
    """Get all unique teams"""
    if not nba_data:
        return jsonify({'error': 'NBA data not loaded'}), 500
    
    teams = list(set(player['TEAM'] for player in nba_data))
    teams.sort()
    return jsonify({'teams': teams})

@app.route('/api/positions', methods=['GET'])
def get_positions():
    """Get all unique positions"""
    if not nba_data:
        return jsonify({'error': 'NBA data not loaded'}), 500
    
    positions = list(set(player['POSITION'] for player in nba_data))
    positions.sort()
    return jsonify({'positions': positions})

@app.route('/api/ai-predictions', methods=['GET'])
def get_ai_predictions():
    """Get AI predictions for top performers"""
    if not AI_AVAILABLE:
        return jsonify({
            'error': 'AI predictions not available. Please install PyTorch dependencies.',
            'ai_available': False
        })
    
    try:
        # Initialize AI system if not already done
        initialize_nba_ai()
        
        # Get predictions
        predictions = {
            'top_scorers': get_top_scorers(10),
            'top_assists': get_top_assists(10),
            'top_rebounders': get_top_rebounders(10),
            'breakout_players': get_breakout_players(10)
        }
        
        return jsonify({
            'predictions': predictions,
            'ai_available': True
        })
    except Exception as e:
        return jsonify({
            'error': f'Error getting AI predictions: {str(e)}',
            'ai_available': True
        }), 500

@app.route('/api/player-prediction/<string:player_name>', methods=['GET'])
def get_player_prediction_api(player_name):
    """Get AI prediction for a specific player"""
    if not AI_AVAILABLE:
        return jsonify({
            'error': 'AI predictions not available. Please install PyTorch dependencies.',
            'ai_available': False
        })
    
    try:
        prediction = get_player_prediction(player_name)
        return jsonify({
            'prediction': prediction,
            'ai_available': True
        })
    except Exception as e:
        return jsonify({
            'error': f'Error getting prediction for {player_name}: {str(e)}',
            'ai_available': True
        }), 500

@app.route('/api/stats/leaders', methods=['GET'])
def get_stat_leaders():
    """Get current stat leaders from the data"""
    if not nba_data:
        return jsonify({'error': 'NBA data not loaded'}), 500
    
    # Sort players by different stats
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



if __name__ == '__main__':
    try:
        # Load NBA data on startup
        print("🔄 Loading NBA data...")
        if load_nba_data():
            print(f"✅ NBA data loaded successfully - {len(nba_data)} players available")
            # Show first few players as confirmation
            print("📋 Sample players loaded:")
            for i, player in enumerate(nba_data[:5]):
                print(f"  {i+1}. {player['PLAYER_NAME']} ({player['TEAM']}) - {player['PPG_LAST']:.1f} PPG")
        else:
            print("❌ Failed to load NBA data from pickle file")
            print("📝 Creating minimal sample data for testing...")
            # Create minimal sample data if file doesn't exist
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
            globals()['nba_data'] = nba_data
            print(f"⚠️ Using sample data - only {len(nba_data)} players available")
        
        # Initialize AI system if available
        if AI_AVAILABLE:
            try:
                print("Initializing AI system...")
                initialize_nba_ai()
                print("AI system initialized successfully")
            except Exception as e:
                print(f"AI system initialization failed: {e}")
        
        print("\n" + "="*50)
        print("Starting NBA API server...")
        print("Server URL: http://localhost:5000")
        print("Health Check: http://localhost:5000/api/health")
        print("Players API: http://localhost:5000/api/players")
        print("="*50)
        print(" Press Ctrl+C to stop the server")
        print("="*50 + "\n")
        
        app.run(debug=False, host='127.0.0.1', port=5000, threaded=True)
        
    except KeyboardInterrupt:
        print("\n Server stopped by user")
    except Exception as e:
        print(f" Error starting server: {e}")
        import traceback
        traceback.print_exc()