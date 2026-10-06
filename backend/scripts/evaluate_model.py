"""Walk-forward MAE evaluation of the next-season stat model.

Run from backend/:  python scripts/evaluate_model.py --fast
See backend/README.md for all flags.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # make the `app` package importable

from app.ml.model_evaluation import main

if __name__ == "__main__":
    main()
