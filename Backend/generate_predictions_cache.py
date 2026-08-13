import json
import os
import sys

# Change directory to Backend so relative paths work
os.chdir(os.path.dirname(os.path.abspath(__file__)))

print("Loading ML models and generating predictions... This may take a moment.")
from nba_ai_system import initialize_nba_ai, get_ai_predictions_bundle, nba_ai_system
from recommendations import get_top_performers


RECOMMENDATION_STATS = ("PPG", "APG", "RPG", "PRA")


def build_recommendations(getter=get_top_performers):
    return {stat: getter(stat) for stat in RECOMMENDATION_STATS}

def main():
    if not initialize_nba_ai():
        print("Failed to initialize AI system. Ensure models and data exist.")
        sys.exit(1)
    
    # Get top performers bundle
    bundle = get_ai_predictions_bundle(15)
    
    # Get all player predictions
    predictions_df = nba_ai_system.build_predictions_df()
    
    all_players = []
    if predictions_df is not None:
        for _, row in predictions_df.iterrows():
            player_name = row['PLAYER_NAME']
            
            # Formulate specific player prediction response format
            prediction = {
                'id': int(row.get('PLAYER_ID', abs(hash(player_name)) % (10**9))),
                'name': player_name,
                'team': row.get('TEAM', 'UNK'),
                'position': row.get('POSITION', 'UNK'),
                'age': int(row.get('AGE', 0)),
                'current_stats': {},
                'predicted_stats': {},
                'improvements': {}
            }
            
            # Format used for /api/predictions list
            for key in ('ppg', 'apg', 'rpg', 'spg', 'bpg', 'tov'):
                prediction[f'{key}_last'] = round(float(row.get(f'{key.upper()}_LAST', 0)), 1)
                prediction[f'predicted_{key}'] = round(float(row.get(f'PREDICTED_{key.upper()}', 0)), 1)
                # Formats for player detail
                prediction['current_stats'][key] = prediction[f'{key}_last']
                prediction['predicted_stats'][key] = prediction[f'predicted_{key}']
                
                curr = prediction['current_stats'][key]
                pred = prediction['predicted_stats'][key]
                prediction['improvements'][key] = round((pred - curr) / curr * 100, 1) if curr else 0
                
            prediction['mpg_last'] = round(float(row.get('MIN_LAST', 0)), 1)
            prediction['predicted_mpg'] = round(float(row.get('PREDICTED_MPG', 0)), 1)
            prediction['current_stats']['mpg'] = prediction['mpg_last']
            prediction['predicted_stats']['mpg'] = prediction['predicted_mpg']
            
            for key, column in (('fg_pct', 'FG_PCT'), ('fg3_pct', 'FG3_PCT'), ('ft_pct', 'FT_PCT')):
                prediction[f'{key}_last'] = round(float(row.get(f'{column}_LAST', 0)) * 100, 1)
                prediction[f'predicted_{key}'] = round(float(row.get(f'PREDICTED_{column}', 0)) * 100, 1)
                # Formats for player detail
                prediction['current_stats'][key] = prediction[f'{key}_last']
                prediction['predicted_stats'][key] = prediction[f'predicted_{key}']
                
                curr = prediction['current_stats'][key]
                pred = prediction['predicted_stats'][key]
                prediction['improvements'][key] = round((pred - curr), 1) # percentages are absolute differences
            
            all_players.append(prediction)

    cache = {
        'bundle': bundle,
        'players': {p['name'].lower(): p for p in all_players},
        'all_players_list': all_players,
        'recommendations': build_recommendations()
    }
    
    with open('predictions_cache.json', 'w') as f:
        json.dump(cache, f)
        
    print(f"Successfully wrote {len(all_players)} players to predictions_cache.json")

if __name__ == '__main__':
    main()
