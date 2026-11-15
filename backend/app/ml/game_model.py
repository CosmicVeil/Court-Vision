"""Per-game stat model: predicts a player's box-score line for one game.

Separate from the next-season model in nba_ai_system.py. The architecture (XGBoost,
random forest, ...) is chosen by name from app/ml/game_architectures.py; this class is
the same for all of them.
"""
import pickle
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd

from app import config
from app.ml import game_architectures
from app.ml.game_features import FEATURE_COLUMNS, TARGET_COLUMNS


def model_file(architecture: str) -> Path:
    return config.data_path(config.GAME_MODEL_FILE_TEMPLATE.format(architecture=architecture))


class GameStatModel:
    def __init__(self, architecture: Optional[str] = None):
        self.architecture = architecture or game_architectures.default_architecture()
        self.estimator = None
        self.trained_rows = 0
        self.trained_at = None

    def fit(self, frame: pd.DataFrame) -> "GameStatModel":
        if frame.empty:
            raise ValueError("No training rows")
        estimator = game_architectures.build(self.architecture)
        estimator.fit(frame[FEATURE_COLUMNS].to_numpy(dtype=float),
                      frame[TARGET_COLUMNS].to_numpy(dtype=float))
        self.estimator = estimator
        self.trained_rows = len(frame)
        self.trained_at = datetime.now(timezone.utc).isoformat()
        return self

    def predict(self, frame: pd.DataFrame) -> pd.DataFrame:
        """Return one column per target stat, aligned with the rows of `frame`."""
        if self.estimator is None:
            raise RuntimeError("Model is not trained")
        predictions = self.estimator.predict(frame[FEATURE_COLUMNS].to_numpy(dtype=float))
        # No stat can be negative, whatever the trees extrapolate to.
        predictions = np.clip(predictions, 0.0, None)
        return pd.DataFrame(predictions, columns=TARGET_COLUMNS, index=frame.index)

    def save(self, path=None) -> Path:
        if self.estimator is None:
            raise RuntimeError("Model is not trained")
        path = Path(path) if path else model_file(self.architecture)
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "wb") as handle:
            pickle.dump({
                "architecture": self.architecture,
                "estimator": self.estimator,
                "feature_columns": FEATURE_COLUMNS,
                "target_columns": TARGET_COLUMNS,
                "trained_rows": self.trained_rows,
                "trained_at": self.trained_at,
            }, handle)
        return path

    @classmethod
    def load(cls, path) -> "GameStatModel":
        with open(path, "rb") as handle:
            bundle = pickle.load(handle)
        # A model trained on a different column layout would silently read the wrong
        # features, so refuse it instead.
        if bundle["feature_columns"] != FEATURE_COLUMNS or bundle["target_columns"] != TARGET_COLUMNS:
            raise ValueError(f"{path} was trained with different columns; retrain it")
        model = cls(bundle["architecture"])
        model.estimator = bundle["estimator"]
        model.trained_rows = bundle["trained_rows"]
        model.trained_at = bundle["trained_at"]
        return model
