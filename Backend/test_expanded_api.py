import unittest
from unittest.mock import Mock, patch

import pandas as pd

import app as app_module


class ExpandedPredictionApiTests(unittest.TestCase):
    def test_paginated_predictions_exposes_and_sorts_all_metrics(self):
        frame = pd.DataFrame([{
            "PLAYER_ID": 1, "PLAYER_NAME": "Test Player", "TEAM": "TST",
            "POSITION": "G", "AGE": 25, "PPG_LAST": 10, "APG_LAST": 2,
            "RPG_LAST": 4, "SPG_LAST": 1, "BPG_LAST": 0.5, "TOV_LAST": 1.5,
            "MIN_LAST": 25, "FG_PCT_LAST": 0.45, "FG3_PCT_LAST": 0.35,
            "FT_PCT_LAST": 0.80, "PREDICTED_PPG": 11, "PREDICTED_APG": 3,
            "PREDICTED_RPG": 5, "PREDICTED_SPG": 1.2, "PREDICTED_BPG": 0.7,
            "PREDICTED_TOV": 1.7, "PREDICTED_MPG": 27,
            "PREDICTED_FG_PCT": 0.48, "PREDICTED_FG3_PCT": 0.37,
            "PREDICTED_FT_PCT": 0.82,
        }])
        original_system = app_module.nba_ai_system
        fake_system = Mock()
        fake_system.build_predictions_df.return_value = frame
        app_module.nba_ai_system = fake_system
        try:
            with patch.object(app_module, "AI_AVAILABLE", True), patch.object(
                app_module, "initialize_nba_ai", return_value=True
            ):
                response = app_module.app.test_client().get(
                    "/api/predictions?sort_by=predicted_spg&sort_order=desc"
                )
        finally:
            app_module.nba_ai_system = original_system

        self.assertEqual(response.status_code, 200)
        player = response.get_json()["predictions"][0]
        self.assertEqual(player["predicted_spg"], 1.2)
        self.assertEqual(player["predicted_bpg"], 0.7)
        self.assertEqual(player["predicted_fg_pct"], 48.0)
        self.assertEqual(player["predicted_mpg"], 27.0)


if __name__ == "__main__":
    unittest.main()
