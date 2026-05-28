import pandas as pd
import numpy as np
import pickle
import os
import json
from datetime import datetime
from typing import Dict, List, Optional
from xgboost import XGBRegressor
from sklearn.multioutput import MultiOutputRegressor
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split

from nba_web_scraper import NBAWebScraper

STAT_SCALE = 1

def _build_xgboost_model():
    return MultiOutputRegressor(XGBRegressor(
        n_estimators=300,
        max_depth=6,
        learning_rate=0.05,
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
        
    def initialize_system(self, force_refresh=False):
        print("Initializing NBA AI System...")
        
        data_file = os.path.join(os.path.dirname(__file__), 'nba_2025_26_data.pkl')
        model_file = os.path.join(os.path.dirname(__file__), 'nba_ai_model.pkl')
        
        if os.path.exists(data_file) and os.path.exists(model_file) and not force_refresh:
            print("Found existing data and model")
            self.data = self.scraper.load_data()
            if self.data and self.load_model():
                self.model_trained = True
                return True
            else:
                print("❌ Failed to load model")
                return False
        else:
            print("No existing data or model found, proceeding to train.")
        
        print("🔄 Scraping NBA data for 2025-26 season...")
        self.data = self.scraper.scrape_player_stats('2025-26')
        
        if not self.data:
            print("❌ Failed to scrape NBA data")
            return False
        
        self.scraper.save_data(self.data)
        
        print("🧠 Training XGBoost model...")
        if self.train_model():
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
        
        df = pd.DataFrame(self.data)
        df = df.fillna(0)
        
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
        
        self.feature_columns = [col for col in self.feature_columns if col in df.columns]
        
        if 'AGE' in df.columns:
            df['AGE'] = df['AGE'].fillna(df['AGE'].median())
            df['AGE_CATEGORY'] = pd.cut(df['AGE'], bins=[0, 23, 29, 35, 100], labels=[0, 1, 2, 3])
            df['AGE_CATEGORY'] = df['AGE_CATEGORY'].fillna(1).astype(int)
            df['AGE_IMPROVEMENT_FACTOR'] = np.where(df['AGE'] <= 23, 1.2,
                                          np.where(df['AGE'] <= 29, 1.0,
                                          np.where(df['AGE'] <= 35, 0.8,
                                          0.6)))
            if 'AGE_CATEGORY' not in self.feature_columns:
                self.feature_columns.append('AGE_CATEGORY')
            if 'AGE_IMPROVEMENT_FACTOR' not in self.feature_columns:
                self.feature_columns.append('AGE_IMPROVEMENT_FACTOR')
        
        if 'AGE_IMPROVEMENT_FACTOR' in df.columns:
            df['PPG_NEXT'] = df['PPG_LAST'] + np.random.normal(0, 1, len(df)) * df['AGE_IMPROVEMENT_FACTOR']
            df['APG_NEXT'] = df['APG_LAST'] + np.random.normal(0, 0.5, len(df)) * df['AGE_IMPROVEMENT_FACTOR']
            df['RPG_NEXT'] = df['RPG_LAST'] + np.random.normal(0, 0.8, len(df)) * df['AGE_IMPROVEMENT_FACTOR']
        else:
            df['PPG_NEXT'] = df['PPG_LAST'] + np.random.normal(0, 1, len(df))
            df['APG_NEXT'] = df['APG_LAST'] + np.random.normal(0, 0.5, len(df))
            df['RPG_NEXT'] = df['RPG_LAST'] + np.random.normal(0, 0.8, len(df))
        
        X = df[self.feature_columns].values
        y = df[self.target_columns].values
        X_scaled = self.scaler.fit_transform(X)
        
        return X_scaled, y, df

    def train_model(self):
        X, y, _ = self.prepare_data()
        if X is None:
            return False

        X_train, X_val, y_train, y_val = train_test_split(X, y, test_size=0.2, random_state=42)

        print("Training XGBoost model...")
        self.model = _build_xgboost_model()
        self.model.fit(X_train, y_train)

        val_pred = self.model.predict(X_val)
        val_mse = np.mean((val_pred - y_val) ** 2)
        print(f"Training completed! Validation MSE: {val_mse:.4f}")
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