import pickle
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock

import numpy as np
import pandas as pd

from nba_ai_system import NBAAISystem, FEATURE_COLUMNS, TARGET_SPECS


class ExpandedPredictionSchemaTests(unittest.TestCase):
    def setUp(self):
        self.system = NBAAISystem()
        self.system.data = {
            2024: [{
                "PLAYER_NAME": "Test Player", "AGE": 24,
                "PPG_LAST": 10.0, "APG_LAST": 2.0, "RPG_LAST": 5.0,
                "SPG_LAST": 1.0, "BPG_LAST": 0.5, "TOV_LAST": 1.5,
                "MIN_LAST": 25.0, "FG_PCT_LAST": 0.45,
                "FG3_PCT_LAST": 0.35, "FT_PCT_LAST": 0.80,
            }],
            2025: [{
                "PLAYER_NAME": "Test Player", "AGE": 25,
                "PPG_LAST": 12.0, "APG_LAST": 3.0, "RPG_LAST": 6.0,
                "SPG_LAST": 1.2, "BPG_LAST": 0.7, "TOV_LAST": 1.8,
                "MIN_LAST": 28.0, "FG_PCT_LAST": 0.48,
                "FG3_PCT_LAST": 0.38, "FT_PCT_LAST": 0.82,
            }],
        }

    def test_target_schema_has_ten_metrics_in_api_order(self):
        self.assertEqual(
            [spec["key"] for spec in TARGET_SPECS],
            ["ppg", "apg", "rpg", "spg", "bpg", "tov", "mpg", "fg_pct", "fg3_pct", "ft_pct"],
        )

    def test_combined_data_uses_next_season_values_in_target_order(self):
        _, targets, _ = self.system.prepare_combined_data()
        np.testing.assert_allclose(
            targets[0],
            [12.0, 3.0, 6.0, 1.2, 0.7, 1.8, 28.0, 0.48, 0.38, 0.82],
        )


class ExpandedPredictionInferenceTests(unittest.TestCase):
    def setUp(self):
        self.system = NBAAISystem()

    def test_clamps_minutes_percentages_and_negative_counting_stats(self):
        raw = np.array([[-1, 2, 3, 1, -0.5, 2, 60, 1.2, -0.1, 0.8]], dtype=float)
        actual = self.system._clamp_predictions(raw)
        np.testing.assert_allclose(actual[0], [0, 2, 3, 1, 0, 2, 48, 1, 0, 0.8])

    def test_rejects_legacy_three_target_model(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "legacy.pkl"
            with path.open("wb") as handle:
                pickle.dump({
                    "model_type": "xgboost",
                    "model": "legacy-model",
                    "scaler": "legacy-scaler",
                    "feature_columns": list(FEATURE_COLUMNS),
                    "target_columns": ["PPG_NEXT", "APG_NEXT", "RPG_NEXT"],
                }, handle)
            self.assertFalse(self.system.load_model(str(path)))


if __name__ == "__main__":
    unittest.main()
