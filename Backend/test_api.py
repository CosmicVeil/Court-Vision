"""
Test script to verify the API endpoints work correctly
"""
import requests
import json
from app import app, nba_data

def test_api():
    """Test the API endpoints"""
    with app.test_client() as client:
        print("[TEST] Testing NBA API endpoints...")
        
        # Test health endpoint
        print("\n1. Testing health endpoint...")
        response = client.get('/api/health')
        if response.status_code == 200:
            data = response.get_json()
            print(f"[SUCCESS] Health check passed: {data['message']}")
            print(f"   Players loaded: {data['players_loaded']}")
        else:
            print(f"[FAIL] Health check failed: {response.status_code}")
        
        # Test players endpoint
        print("\n2. Testing players endpoint...")
        response = client.get('/api/players?limit=5')
        if response.status_code == 200:
            data = response.get_json()
            players = data.get('players', [])
            print(f"[SUCCESS] Players endpoint passed: {len(players)} players returned")
            print("   Sample players:")
            for player in players[:3]:
                safe_name = player['name'].encode('ascii', 'ignore').decode()
                print(f"   - {safe_name} ({player['team']}) - {player['stats']['ppg_last']} PPG")
        else:
            print(f"[FAIL] Players endpoint failed: {response.status_code}")
        
        # Test teams endpoint
        print("\n3. Testing teams endpoint...")
        response = client.get('/api/teams')
        if response.status_code == 200:
            data = response.get_json()
            teams = data.get('teams', [])
            print(f"[SUCCESS] Teams endpoint passed: {len(teams)} teams found")
            print(f"   Sample teams: {', '.join(teams[:5])}")
        else:
            print(f"[FAIL] Teams endpoint failed: {response.status_code}")
        
        print(f"\nTotal NBA data available: {len(nba_data) if nba_data else 0} players")

if __name__ == "__main__":
    # Load the data first
    from app import load_nba_data
    if load_nba_data():
        test_api()
    else:
        print("❌ Failed to load NBA data")
