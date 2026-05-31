import pandas as pd
import numpy as np
import pickle
import os
import json
from datetime import datetime
from typing import Dict, List, Optional, Tuple
from xgboost import XGBRegressor
from sklearn.multioutput import MultiOutputRegressor
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

from nba_web_scraper import NBAWebScraper

STAT_SCALE = 1.0

def _build_xgboost_model():
    return MultiOutputRegressor(XGBRegressor(
        n_estimators=300,
        max_depth=6,
        learning_rate=0.1,
        subsample=0.8,
        colsample_bytree=0.8,
        random_state=42,
        n_jobs=-1,
    ))

class NBAAISystem:
    def __init__(self):
        self.scraper = NBAWebScraper()
        self.model = None
        self.scaler = StandardScaler()
        self.feature_columns = []
        self.target_columns = ['PPG_NEXT', 'APG_NEXT', 'RPG_NEXT']
        self.data = None
        self.model_trained = False

    def prepare_combined_data(self):
        """Prepare combined training data from multiple consecutive seasons"""
        if not self.data or len(self.data) < 2:
            print("Insufficient multi-season data for training!")
            return None, None, None

        # We'll use transitions: 2023->2024, 2024->2025, 2025->2026
        X_list = []
        y_list = []

        # Get the feature columns from a sample of data (we'll use the first available season)
        sample_season = None
        for season_year in sorted(self.data.keys()):
            if self.data[season_year]:
                sample_season = season_year
                break

        if sample_season is None:
            print("No valid data found in any season!")
            return None, None, None

        # Define feature columns (same as original prepare_data)
        self.feature_columns = [
            'HEIGHT', 'WEIGHT', 'AGE',
            'PPG_LAST', 'APG_LAST', 'RPG_LAST', 'SPG_LAST', 'BPG_LAST',
            'TOV_LAST', 'FG_PCT_LAST', 'FG3_PCT_LAST', 'FT_PCT_LAST', 'MIN_LAST',
            'GAMES_PLAYED_LAST', 'PPG_PREV', 'APG_PREV', 'RPG_PREV',
            'SPG_PREV', 'BPG_PREV', 'TOV_PREV', 'FG_PCT_PREV', 'FG3_PCT_PREV',
            'FT_PCT_PREV', 'MIN_PREV', 'GAMES_PLAYED_PREV',
            'PPG_LAST_10', 'APG_LAST_10', 'RPG_LAST_10', 'FG_PCT_LAST_10',
            'PPG_TREND', 'APG_TREND', 'RPG_TREND',
            'PPG_STD', 'APG_STD', 'RPG_STD', 'CONSISTENCY_SCORE'
        ]

        # Process each consecutive season pair
        sorted_seasons = sorted(self.data.keys())
        for i in range(len(sorted_seasons) - 1):
            current_season = sorted_seasons[i]
            next_season = sorted_seasons[i + 1]

            # Only use consecutive seasons (e.g., 2023->2024, not 2023->2025)
            if next_season != current_season + 1:
                continue

            current_data = self.data[current_season]
            next_data = self.data[next_season]

            if not current_data or not next_data:
                continue

            # Create lookup for next season data by player name
            next_data_by_name = {}
            for player in next_data:
                if 'PLAYER_NAME' in player and player['PLAYER_NAME']:
                    next_data_by_name[player['PLAYER_NAME']] = player

            # Process each player in current season
            for player in current_data:
                if 'PLAYER_NAME' not in player or not player['PLAYER_NAME']:
                    continue

                player_name = player['PLAYER_NAME']
                if player_name not in next_data_by_name:
                    continue  # Skip if player not found in next season

                next_player = next_data_by_name[player_name]

                # Build feature vector from current season data
                feature_vector = []
                for col in self.feature_columns:
                    # Handle missing values - use 0 as default
                    feature_vector.append(player.get(col, 0))

                # Build target vector from next season data (using _LAST stats as the actual next season performance)
                # In our data structure, each season's data contains that season's stats with _LAST suffix
                # So for predicting next season performance, we use the next season's _LAST stats as target
                try:
                    ppg_next = float(next_player.get('PPG_LAST', 0))
                    apg_next = float(next_player.get('APG_LAST', 0))
                    rpg_next = float(next_player.get('RPG_LAST', 0))
                except (ValueError, TypeError):
                    # If conversion fails, skip this player
                    continue

                X_list.append(feature_vector)
                y_list.append([ppg_next, apg_next, rpg_next])

        if not X_list:
            print("No valid player transitions found for training!")
            return None, None, None

        # Convert to numpy arrays
        X = np.array(X_list, dtype=float)
        y = np.array(y_list, dtype=float)

        # Scale features
        X_scaled = self.scaler.fit_transform(X)

        return X_scaled, y, None  # Return None for df since we don't need it in combined approach
        
    def initialize_system(self, force_refresh=False):
        print("Initializing NBA AI System...")

        data_file = os.path.join(os.path.dirname(__file__), 'nba_multi_season_data.pkl')
        model_file = os.path.join(os.path.dirname(__file__), 'nba_ai_model.pkl')

        if os.path.exists(data_file) and os.path.exists(model_file) and not force_refresh:
            print("Found existing data and model")
            # Load the multi-season data specifically
            with open(data_file, 'rb') as f:
                self.data = pickle.load(f)
            if self.data and self.load_model():
                self.model_trained = True
                return True
            else:
                print("❌ Failed to load model or data")
                return False
        else:
            print("No existing data or model found, proceeding to train.")

        print("🔄 Scraping NBA data for multiple seasons (2023-2026)...")
        self.data = self.scraper.scrape_multiple_seasons([2020,2021,2022,2023, 2024, 2025, 2026])

        if not self.data:
            print("❌ Failed to scrape NBA data")
            return False

        # Prepare combined dataset for training
        combined_data = self.prepare_combined_data()
        if combined_data is None:
            print("❌ Failed to prepare combined data")
            return False

        # Save the multi-season data for future use
        with open(data_file, 'wb') as f:
            pickle.dump(self.data, f)

        print("🧠 Training XGBoost model...")
        if self.train_model(combined_data):
            self.save_model()
            self.model_trained = True
            print("System initialized successfully!")
            return True
        else:
            print("Failed to train model")
        return False

    def prepare_data(self):
        if not self.data:
            print("No data available!")
            return None, None, None

        # Handle multi-season data format (dictionary with seasons as keys)
        if isinstance(self.data, dict):
            # Use the most recent season's data for predictions
            most_recent_season = max(self.data.keys())
            df = pd.DataFrame(self.data[most_recent_season])
            print(f"Using data from {most_recent_season} season ({len(df)} players) for predictions")
        else:
            # Handle single season data format (list of player dictionaries)
            df = pd.DataFrame(self.data)

        df = df.fillna(0)

        # Define feature columns (same as used in training)
        self.feature_columns = [
            'HEIGHT', 'WEIGHT', 'AGE',
            'PPG_LAST', 'APG_LAST', 'RPG_LAST', 'SPG_LAST', 'BPG_LAST',
            'TOV_LAST', 'FG_PCT_LAST', 'FG3_PCT_LAST', 'FT_PCT_LAST', 'MIN_LAST',
            'GAMES_PLAYED_LAST', 'PPG_PREV', 'APG_PREV', 'RPG_PREV',
            'SPG_PREV', 'BPG_PREV', 'TOV_PREV', 'FG_PCT_PREV', 'FG3_PCT_PREV',
            'FT_PCT_PREV', 'MIN_PREV', 'GAMES_PLAYED_PREV',
            'PPG_LAST_10', 'APG_LAST_10', 'RPG_LAST_10', 'FG_PCT_LAST_10',
            'PPG_TREND', 'APG_TREND', 'RPG_TREND',
            'PPG_STD', 'APG_STD', 'RPG_STD', 'CONSISTENCY_SCORE'
        ]

        # Add missing columns with default values
        for col in self.feature_columns:
            if col not in df.columns:
                # Set appropriate default values based on column type
                if col in ['HEIGHT']:
                    df[col] = 75  # Average NBA player height in inches
                elif col in ['WEIGHT']:
                    df[col] = 220  # Average NBA player weight in lbs
                elif col in ['PPG_PREV', 'APG_PREV', 'RPG_PREV', 'SPG_PREV', 'BPG_PREV', 'TOV_PREV']:
                    df[col] = df.get(col.replace('_PREV', '_LAST'), 0)  # Use last season as previous
                elif col in ['FG_PCT_PREV', 'FG3_PCT_PREV', 'FT_PCT_PREV']:
                    df[col] = df.get(col.replace('_PREV', '_LAST'), 0.5)  # Default 50% shooting
                elif col in ['MIN_PREV']:
                    df[col] = df.get('MIN_LAST', 25)  # Default minutes
                elif col in ['GAMES_PLAYED_PREV']:
                    df[col] = df.get('GAMES_PLAYED_LAST', 50)  # Default games played
                elif col in ['PPG_LAST_10', 'APG_LAST_10', 'RPG_LAST_10', 'FG_PCT_LAST_10']:
                    df[col] = df.get(col.replace('_LAST_10', '_LAST'), 0)  # Use last season as 10-game avg
                elif col in ['PPG_TREND', 'APG_TREND', 'RPG_TREND']:
                    df[col] = 0  # No trend data available
                elif col in ['PPG_STD', 'APG_STD', 'RPG_STD']:
                    df[col] = df.get(col.replace('_STD', '_LAST'), 0) * 0.3  # Estimate variability
                elif col in ['CONSISTENCY_SCORE']:
                    df[col] = 0.5  # Moderate consistency
                else:
                    df[col] = 0  # Default fallback

        self.feature_columns = [col for col in self.feature_columns if col in df.columns]

        # Use actual next-season data if available; otherwise use last season as placeholder (to be replaced with real next-season data)
        if 'PPG_NEXT' in df.columns:
            # Use actual next-season PPG data
            pass  # df['PPG_NEXT'] already contains the correct values
        else:
            # Placeholder: use last season's PPG as next-season PPG (will be replaced with real data)
            df['PPG_NEXT'] = df['PPG_LAST']
        if 'APG_NEXT' in df.columns:
            # Use actual next-season APG data
            pass
        else:
            df['APG_NEXT'] = df['APG_LAST']
        if 'RPG_NEXT' in df.columns:
            # Use actual next-season RPG data
            pass
        else:
            df['RPG_NEXT'] = df['RPG_LAST']

        X = df[self.feature_columns].values
        y = df[self.target_columns].values
        X_scaled = self.scaler.fit_transform(X)

        return X_scaled, y, df

    def train_model(self, combined_data):
        if combined_data is None:
            print("No data available for training!")
            return False

        X, y, _ = combined_data
        if X is None:
            return False

        X_train, X_val, y_train, y_val = train_test_split(X, y, test_size=0.2, random_state=42)

        print("Training XGBoost model...")
        self.model = _build_xgboost_model()
        self.model.fit(X_train, y_train)

        val_pred = self.model.predict(X_val)

        # Calculate metrics for each target
        val_mse = np.mean((val_pred - y_val) ** 2)
        val_mae = np.mean(np.abs(val_pred - y_val))

        # Calculate R2 for each target separately
        ppg_r2 = r2_score(y_val[:, 0], val_pred[:, 0]) if len(y_val) > 0 else 0
        apg_r2 = r2_score(y_val[:, 1], val_pred[:, 1]) if len(y_val) > 0 else 0
        rpg_r2 = r2_score(y_val[:, 2], val_pred[:, 2]) if len(y_val) > 0 else 0

        print(f"Training completed! Validation Metrics:")
        print(f"  MSE: {val_mse:.4f}")
        print(f"  MAE: {val_mae:.4f}")
        print(f"  PPG R²: {ppg_r2:.4f}")
        print(f"  APG R²: {apg_r2:.4f}")
        print(f"  RPG R²: {rpg_r2:.4f}")
        return True

    def predict(self, X):
        if self.model is None:
            print("Model not trained!")
            return None
        return self.model.predict(X)

    def get_top_performers(self, top_n=10):
        if not self.model_trained:
            self.initialize_system()
            return None
        
        X, _, df = self.prepare_data()
        predictions = self.predict(X)
        
        if predictions is None:
            return None
        
        results = df[['PLAYER_NAME', 'TEAM', 'POSITION', 'AGE']].copy()
        # Apply 1.1x multiplier to all predicted stats
        results['PREDICTED_PPG'] = predictions[:, 0] * STAT_SCALE
        results['PREDICTED_APG'] = predictions[:, 1] * STAT_SCALE
        results['PREDICTED_RPG'] = predictions[:, 2] * STAT_SCALE
        
        if 'PPG_LAST' in df.columns:
            results['PPG_LAST'] = df['PPG_LAST']
        if 'APG_LAST' in df.columns:
            results['APG_LAST'] = df['APG_LAST']
        if 'RPG_LAST' in df.columns:
            results['RPG_LAST'] = df['RPG_LAST']
        
        top_performers = {
            'PPG': results.nlargest(top_n, 'PREDICTED_PPG'),
            'APG': results.nlargest(top_n, 'PREDICTED_APG'),
            'RPG': results.nlargest(top_n, 'PREDICTED_RPG')
        }
        
        return top_performers

    def get_breakout_players(self, threshold=5.0, top_n=15):
        if not self.model_trained:
            self.initialize_system()
            return None
        
        X, _, df = self.prepare_data()
        predictions = self.predict(X)
        
        if predictions is None:
            return None
        
        results = df[['PLAYER_NAME', 'TEAM', 'POSITION', 'AGE', 'PPG_LAST', 'APG_LAST', 'RPG_LAST']].copy()
        # Apply 1.1x multiplier to all predicted stats
        results['PREDICTED_PPG'] = predictions[:, 0] * STAT_SCALE
        results['PREDICTED_APG'] = predictions[:, 1] * STAT_SCALE
        results['PREDICTED_RPG'] = predictions[:, 2] * STAT_SCALE
        
        results['PPG_INCREASE'] = results['PREDICTED_PPG'] - results['PPG_LAST']
        results['APG_INCREASE'] = results['PREDICTED_APG'] - results['APG_LAST']
        results['RPG_INCREASE'] = results['PREDICTED_RPG'] - results['RPG_LAST']
        
        results['PPG_IMPROVEMENT'] = np.where(results['PPG_LAST'] > 0, (results['PREDICTED_PPG'] - results['PPG_LAST']) / results['PPG_LAST'] * 100, 0)
        results['APG_IMPROVEMENT'] = np.where(results['APG_LAST'] > 0, (results['PREDICTED_APG'] - results['APG_LAST']) / results['APG_LAST'] * 100, 0)
        results['RPG_IMPROVEMENT'] = np.where(results['RPG_LAST'] > 0, (results['PREDICTED_RPG'] - results['RPG_LAST']) / results['RPG_LAST'] * 100, 0)
        
        overperformers = results[
            (results['PPG_IMPROVEMENT'] > threshold) |
            (results['APG_IMPROVEMENT'] > threshold) |
            (results['RPG_IMPROVEMENT'] > threshold)
        ].copy()
        
        overperformers['TOTAL_STAT_INCREASE'] = (
            overperformers['PPG_INCREASE'] + 
            overperformers['APG_INCREASE'] + 
            overperformers['RPG_INCREASE']
        )
        
        overperformers['TOTAL_IMPROVEMENT'] = np.clip(
            overperformers['PPG_IMPROVEMENT'] + 
            overperformers['APG_IMPROVEMENT'] + 
            overperformers['RPG_IMPROVEMENT'],
            -1000, 1000
        )
        
        overperformers = overperformers.sort_values('TOTAL_STAT_INCREASE', ascending=False)
        return overperformers.head(top_n)

    def get_player_prediction(self, player_name):
        if not self.model_trained:
            self.initialize_system()
            return None
        
        if isinstance(self.data, dict):
            most_recent_season = max(self.data.keys())
            df = pd.DataFrame(self.data[most_recent_season])
        else:
            df = pd.DataFrame(self.data)
            
        player_data = df[df['PLAYER_NAME'].str.contains(player_name, case=False, na=False)]
        
        if player_data.empty:
            print(f"Player '{player_name}' not found.")
            return None
        
        player = player_data.iloc[0]
        
        X, _, _ = self.prepare_data()
        player_idx = player_data.index[0]
        player_features = X[player_idx:player_idx+1]
        
        raw_prediction = self.predict(player_features)[0]
        # Apply 1.1x multiplier
        prediction = raw_prediction * STAT_SCALE
        
        return {
            'name': player['PLAYER_NAME'],
            'team': player['TEAM'],
            'position': player['POSITION'],
            'age': player['AGE'],
            'current_stats': {
                'ppg': round(float(player['PPG_LAST']), 1),
                'apg': round(float(player['APG_LAST']), 1),
                'rpg': round(float(player['RPG_LAST']), 1)
            },
            'predicted_stats': {
                'ppg': round(float(prediction[0]), 1),
                'apg': round(float(prediction[1]), 1),
                'rpg': round(float(prediction[2]), 1)
            },
            'improvements': {
                'ppg': round(((prediction[0] - player['PPG_LAST']) / player['PPG_LAST'] * 100), 1) if player['PPG_LAST'] else 0,
                'apg': round(((prediction[1] - player['APG_LAST']) / player['APG_LAST'] * 100), 1) if player['APG_LAST'] else 0,
                'rpg': round(((prediction[2] - player['RPG_LAST']) / player['RPG_LAST'] * 100), 1) if player['RPG_LAST'] else 0,
            }
        }

    def save_model(self, filename='nba_ai_model.pkl'):
        if self.model is None:
            print("No model to save!")
            return False
        
        model_data = {
            'model': self.model,
            'scaler': self.scaler,
            'feature_columns': self.feature_columns,
            'target_columns': self.target_columns,
            'model_type': 'xgboost',
        }
        
        filepath = os.path.join(os.path.dirname(__file__), filename)
        with open(filepath, 'wb') as f:
            pickle.dump(model_data, f)
        print(f"Model saved to {filepath}")
        return True
    
    def load_model(self, filename='nba_ai_model.pkl'):
        filepath = os.path.join(os.path.dirname(__file__), filename)
        if os.path.exists(filepath):
            with open(filepath, 'rb') as f:
                model_data = pickle.load(f)

            if model_data.get('model_type') != 'xgboost' or 'model' not in model_data:
                print("Saved model is outdated (YOLO/PyTorch). Retrain with initialize_nba_ai(force_refresh=True).")
                return False

            self.model = model_data['model']
            self.scaler = model_data['scaler']
            self.feature_columns = model_data['feature_columns']
            self.target_columns = model_data['target_columns']

            print(f"Model loaded from {filepath}")
            return True
        return False

# Global instance
nba_ai_system = NBAAISystem()

def initialize_nba_ai(force_refresh=False):
    return nba_ai_system.initialize_system(force_refresh)

def get_top_scorers(limit=10):
    top_performers = nba_ai_system.get_top_performers(limit)
    if top_performers and 'PPG' in top_performers:
        return top_performers['PPG'].to_dict('records')
    return []

def get_top_assists(limit=10):
    top_performers = nba_ai_system.get_top_performers(limit)
    if top_performers and 'APG' in top_performers:
        return top_performers['APG'].to_dict('records')
    return []

def get_top_rebounders(limit=10):
    top_performers = nba_ai_system.get_top_performers(limit)
    if top_performers and 'RPG' in top_performers:
        return top_performers['RPG'].to_dict('records')
    return []

def get_breakout_players(limit=10, threshold=5.0):
    breakouts = nba_ai_system.get_breakout_players(threshold, limit)
    if breakouts is not None and len(breakouts) > 0:
        return breakouts.to_dict('records')
    return []

def get_player_prediction(player_name):
    return nba_ai_system.get_player_prediction(player_name)