import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # make the `app` package importable

from app.ml.nba_ai_system import nba_ai_system


if __name__ == "__main__":
    if not nba_ai_system.retrain_from_cache():
        raise SystemExit("Model retraining failed")
    print("Saved ten-target model to backend/data/nba_ai_model.pkl")
