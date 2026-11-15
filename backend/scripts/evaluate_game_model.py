"""Walk-forward MAE comparison of the per-game stat model architectures.

Run from backend/:  python scripts/evaluate_game_model.py
                    python scripts/evaluate_game_model.py --arch xgboost --folds 3
Needs DATABASE_URL (reads the game archive).
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # make the `app` package importable

from app.ml.game_model_evaluation import main

if __name__ == "__main__":
    main()
