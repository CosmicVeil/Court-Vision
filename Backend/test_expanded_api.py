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


class CachedRecommendationApiTests(unittest.TestCase):
    def _get_recommendations(self, cache):
        model_data = [{"source": "model"}]
        with patch.object(app_module, "AI_AVAILABLE", True), patch.object(
            app_module, "IS_RENDER", True
        ), patch.object(app_module, "predictions_cache", cache), patch.object(
            app_module, "get_top_performers", return_value=model_data
        ) as model_getter:
            response = app_module.app.test_client().get("/api/recommendations/ppg")
        return response, model_getter

    def test_render_returns_cached_recommendations(self):
        cached_data = [{"source": "cache"}]

        response, model_getter = self._get_recommendations(
            {"recommendations": {"PPG": cached_data}}
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), cached_data)
        model_getter.assert_not_called()

    def test_empty_cached_list_is_valid(self):
        response, model_getter = self._get_recommendations(
            {"recommendations": {"PPG": []}}
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), [])
        model_getter.assert_not_called()

    def test_missing_cached_stat_falls_back_to_model(self):
        response, model_getter = self._get_recommendations(
            {"recommendations": {"APG": [{"source": "cache"}]}}
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), [{"source": "model"}])
        model_getter.assert_called_once_with("PPG")

    def test_invalid_cached_stat_falls_back_to_model(self):
        response, model_getter = self._get_recommendations(
            {"recommendations": {"PPG": None}}
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), [{"source": "model"}])
        model_getter.assert_called_once_with("PPG")

    def test_missing_cache_file_on_render_falls_back_to_model(self):
        model_data = [{"source": "model"}]
        with patch.object(app_module, "AI_AVAILABLE", False), patch.object(
            app_module, "IS_RENDER", True
        ), patch.object(app_module, "predictions_cache", None), patch.object(
            app_module, "get_top_performers", return_value=model_data
        ) as model_getter:
            response = app_module.app.test_client().get("/api/recommendations/ppg")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), model_data)
        model_getter.assert_called_once_with("PPG")


if __name__ == "__main__":
    unittest.main()
