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

    def test_saved_model_uses_lossless_gzip_compression(self):
        self.system.model = "test-model"
        self.system.scaler = "test-scaler"
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "model.pkl"
            self.assertTrue(self.system.save_model(str(path)))
            self.assertEqual(path.read_bytes()[:2], b"\x1f\x8b")

            loaded = NBAAISystem()
            self.assertTrue(loaded.load_model(str(path)))
            self.assertEqual(loaded.model, "test-model")


class ExpandedPredictionPayloadTests(unittest.TestCase):
    def setUp(self):
        self.system = NBAAISystem()

    def _prediction_frame_for_two_players(self):
        shared = {
            "TEAM": "TST", "POSITION": "G", "AGE": 25,
            "PPG_LAST": 10.0, "APG_LAST": 3.0, "RPG_LAST": 5.0,
            "SPG_LAST": 1.0, "BPG_LAST": 1.0, "TOV_LAST": 2.0,
            "MIN_LAST": 28.0, "FG_PCT_LAST": 0.45,
            "FG3_PCT_LAST": 0.35, "FT_PCT_LAST": 0.80,
            "PREDICTED_PPG": 11.0, "PREDICTED_APG": 3.2,
            "PREDICTED_RPG": 5.2, "PREDICTED_TOV": 2.1,
            "PREDICTED_MPG": 29.0, "PREDICTED_FG_PCT": 0.47,
            "PREDICTED_FG3_PCT": 0.36, "PREDICTED_FT_PCT": 0.81,
            "PPG_IMPROVEMENT": 10.0, "APG_IMPROVEMENT": 6.7,
            "RPG_IMPROVEMENT": 4.0, "PPG_INCREASE": 1.0,
            "APG_INCREASE": 0.2, "RPG_INCREASE": 0.2,
        }
        return pd.DataFrame([
            {**shared, "PLAYER_NAME": "Steals Leader", "PREDICTED_SPG": 3.0, "PREDICTED_BPG": 1.2},
            {**shared, "PLAYER_NAME": "Blocks Leader", "PREDICTED_SPG": 1.5, "PREDICTED_BPG": 4.0},
        ])

    def test_player_prediction_contains_all_ten_metrics(self):
        self.system.model_trained = True
        self.system.data = {2025: [{
            "PLAYER_NAME": "Test Player", "TEAM": "TST", "POSITION": "G", "AGE": 25,
            "PPG_LAST": 10, "APG_LAST": 2, "RPG_LAST": 4, "SPG_LAST": 1,
            "BPG_LAST": 0.5, "TOV_LAST": 1.5, "MIN_LAST": 25,
            "FG_PCT_LAST": 0.45, "FG3_PCT_LAST": 0.35, "FT_PCT_LAST": 0.8,
        }]}
        self.system.prepare_data = Mock(return_value=(np.zeros((1, len(FEATURE_COLUMNS))), None, None))
        self.system.predict = Mock(return_value=np.array([[11, 3, 5, 1.2, 0.7, 1.7, 27, 0.48, 0.37, 0.82]]))
        payload = self.system.get_player_prediction("Test Player")
        self.assertEqual(set(payload["predicted_stats"]), {spec["key"] for spec in TARGET_SPECS})
        self.assertEqual(payload["predicted_stats"]["fg_pct"], 48.0)
        self.assertEqual(payload["improvements"]["fg_pct"], 3.0)

    def test_bundle_includes_top_steals_and_blocks(self):
        frame = self._prediction_frame_for_two_players()
        self.system.build_predictions_df = Mock(return_value=frame)
        bundle = self.system.get_ai_predictions_bundle(top_n=1)
        self.assertEqual(bundle["top_steals"][0]["PLAYER_NAME"], "Steals Leader")
        self.assertEqual(bundle["top_blocks"][0]["PLAYER_NAME"], "Blocks Leader")


if __name__ == "__main__":
    unittest.main()
