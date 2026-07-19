from nba_ai_system import nba_ai_system


if __name__ == "__main__":
    if not nba_ai_system.retrain_from_cache():
        raise SystemExit("Model retraining failed")
    print("Saved ten-target model to Backend/nba_ai_model.pkl")
