"""Offline tests for the model features the scraper derives from NBA.com data."""
import unittest
from unittest.mock import patch

import numpy as np
import pandas as pd

from app.ml.nba_ai_system import FEATURE_COLUMNS
from app.scraping.nba_web_scraper import (
    GAME_LOG_FEATURES,
    PREV_FEATURE_SOURCES,
    NBAWebScraper,
    add_previous_season_features,
    build_name_index,
    compute_game_log_features,
    normalize_player_name,
)


def game_logs(player_id, name, pts, ast=None, reb=None, fgm=None, fga=None):
    n = len(pts)
    return pd.DataFrame({
        "PLAYER_ID": player_id, "PLAYER_NAME": name,
        "GAME_ID": [f"g{i:03d}" for i in range(n)],
        "GAME_DATE": pd.date_range("2025-10-21", periods=n).strftime("%Y-%m-%dT00:00:00"),
        "PTS": pts, "AST": ast or [0] * n, "REB": reb or [0] * n,
        "FGM": fgm or [0] * n, "FGA": fga or [0] * n,
    })


class NormalizeNameTests(unittest.TestCase):
    def test_accents_suffixes_punctuation_and_case(self):
        self.assertEqual(normalize_player_name("Nikola Jokić"), "nikola jokic")
        self.assertEqual(normalize_player_name("Gary Trent Jr."), "gary trent")
        self.assertEqual(normalize_player_name("A.J. Green"), normalize_player_name("AJ Green"))
        self.assertEqual(normalize_player_name("Shai Gilgeous-Alexander"), "shai gilgeous alexander")
        self.assertEqual(normalize_player_name("De'Aaron Fox"), "deaaron fox")

    def test_repairs_latin1_mojibake_from_basketball_reference(self):
        mojibake = "Luka Dončić".encode("utf-8").decode("latin-1")
        self.assertEqual(normalize_player_name(mojibake), "luka doncic")

    def test_empty(self):
        self.assertEqual(normalize_player_name(None), "")


class GameLogFeatureTests(unittest.TestCase):
    def test_last_ten_uses_most_recent_games_even_if_rows_unsorted(self):
        logs = game_logs(1, "A", pts=list(range(20)), fgm=[1] * 20, fga=[2] * 20)
        features = compute_game_log_features(logs.sample(frac=1, random_state=0))[1]
        self.assertAlmostEqual(features["PPG_LAST_10"], np.mean(range(10, 20)))
        self.assertAlmostEqual(features["FG_PCT_LAST_10"], 0.5)

    def test_trend_is_per_game_slope(self):
        rising = compute_game_log_features(game_logs(1, "A", pts=[10, 12, 14, 16]))[1]
        flat = compute_game_log_features(game_logs(2, "B", pts=[10, 10, 10]))[2]
        self.assertAlmostEqual(rising["PPG_TREND"], 2.0)
        self.assertAlmostEqual(flat["PPG_TREND"], 0.0)

    def test_std_and_consistency(self):
        steady = compute_game_log_features(game_logs(1, "A", pts=[20, 20, 20]))[1]
        streaky = compute_game_log_features(game_logs(2, "B", pts=[0, 40, 0, 40]))[2]
        self.assertEqual(steady["PPG_STD"], 0)
        self.assertEqual(steady["CONSISTENCY_SCORE"], 1)
        self.assertAlmostEqual(streaky["PPG_STD"], 20)
        self.assertEqual(streaky["CONSISTENCY_SCORE"], 0)

    def test_edge_cases_single_game_and_no_shots(self):
        features = compute_game_log_features(game_logs(1, "A", pts=[0]))[1]
        self.assertEqual(features["PPG_TREND"], 0)
        self.assertEqual(features["FG_PCT_LAST_10"], 0)
        self.assertEqual(features["CONSISTENCY_SCORE"], 0)
        self.assertEqual(compute_game_log_features(pd.DataFrame()), {})

    def test_produces_every_game_log_feature_the_model_uses(self):
        features = compute_game_log_features(game_logs(1, "A", pts=[1, 2]))[1]
        for column in GAME_LOG_FEATURES:
            self.assertIn(column, features)
            self.assertIn(column, FEATURE_COLUMNS)


class NameIndexTests(unittest.TestCase):
    def test_ambiguous_names_are_dropped(self):
        frame = pd.DataFrame({
            "PLAYER_ID": [1, 2, 3, 3],
            "PLAYER_NAME": ["Marcus Williams", "Marcus Williams", "Nikola Jokić", "Nikola Jokic"],
        })
        self.assertEqual(build_name_index(frame), {"nikola jokic": 3})


class PreviousSeasonFeatureTests(unittest.TestCase):
    def test_prev_columns_copy_prior_season_and_mark_rookies(self):
        data = {
            2024: [{"PLAYER_NAME": "Vet", "PPG_LAST": 10, "GAMES_PLAYED_LAST": 70, "FG_PCT_LAST": 0.5}],
            2025: [
                {"PLAYER_NAME": "Vet", "PPG_LAST": 12},
                {"PLAYER_NAME": "Rookie", "PPG_LAST": 8},
            ],
        }
        add_previous_season_features(data)
        vet, rookie = data[2025]
        self.assertEqual(vet["PPG_PREV"], 10)
        self.assertEqual(vet["FG_PCT_PREV"], 0.5)
        self.assertEqual(vet["GAMES_PLAYED_PREV"], 70)
        self.assertEqual(rookie["GAMES_PLAYED_PREV"], 0)
        self.assertTrue(np.isnan(rookie["PPG_PREV"]))

    def test_first_season_has_unknown_history(self):
        data = {2024: [{"PLAYER_NAME": "A", "PPG_LAST": 10}]}
        add_previous_season_features(data)
        self.assertTrue(all(np.isnan(data[2024][0][c]) for c in PREV_FEATURE_SOURCES))

    def test_every_prev_column_is_a_model_feature(self):
        self.assertTrue(set(PREV_FEATURE_SOURCES) <= set(FEATURE_COLUMNS))


class EnrichSeasonTests(unittest.TestCase):
    def setUp(self):
        self.scraper = NBAWebScraper()
        logs = pd.concat([
            game_logs(203999, "Nikola Jokic", pts=[20, 30], fgm=[8, 12], fga=[16, 20]),
            game_logs(1, "Other Guy", pts=[5, 5]),
        ])
        bios = pd.DataFrame({
            "PLAYER_ID": [203999], "PLAYER_NAME": ["Nikola Jokic"],
            "PLAYER_HEIGHT_INCHES": [83], "PLAYER_WEIGHT": ["284"],
        })
        patches = [
            patch.object(NBAWebScraper, "fetch_season_game_logs", return_value=logs),
            patch.object(NBAWebScraper, "fetch_season_bios", return_value=bios),
            patch("app.scraping.nba_web_scraper.time.sleep"),
        ]
        for p in patches:
            p.start()
            self.addCleanup(p.stop)

    def test_matched_player_gets_bio_and_game_log_features(self):
        players = [{"PLAYER_NAME": "Nikola Jokić".encode("utf-8").decode("latin-1"), "PPG_LAST": 25}]
        jokic = self.scraper.enrich_season(2026, players)[0]
        self.assertEqual(jokic["NBA_PLAYER_ID"], 203999)
        self.assertEqual(jokic["HEIGHT"], 83)
        self.assertEqual(jokic["WEIGHT"], 284)
        self.assertEqual(jokic["PPG_LAST_10"], 25)
        self.assertAlmostEqual(jokic["FG_PCT_LAST_10"], 20 / 36)

    def test_unmatched_player_gets_nan_not_fake_defaults(self):
        ghost = self.scraper.enrich_season(2026, [{"PLAYER_NAME": "League Average"}])[0]
        self.assertNotIn("NBA_PLAYER_ID", ghost)
        for column in (*GAME_LOG_FEATURES, "HEIGHT", "WEIGHT"):
            self.assertTrue(np.isnan(ghost[column]), column)

    def test_multi_season_enrichment_fills_every_model_feature(self):
        data = {
            2025: [{"PLAYER_NAME": "Nikola Jokic", "PPG_LAST": 26, "GAMES_PLAYED_LAST": 70}],
            2026: [{"PLAYER_NAME": "Nikola Jokic", "PPG_LAST": 29, "GAMES_PLAYED_LAST": 65}],
        }
        self.scraper.enrich_multiple_seasons(data)
        player = data[2026][0]
        missing = [c for c in FEATURE_COLUMNS if c not in player and c not in ("AGE",) and not c.endswith("_LAST")]
        self.assertEqual(missing, [])
        self.assertEqual(player["PPG_PREV"], 26)

    def test_failed_nba_requests_leave_features_missing(self):
        with patch.object(NBAWebScraper, "fetch_season_game_logs", return_value=None), \
             patch.object(NBAWebScraper, "fetch_season_bios", return_value=None):
            player = self.scraper.enrich_season(2026, [{"PLAYER_NAME": "Nikola Jokic"}])[0]
        self.assertTrue(np.isnan(player["HEIGHT"]))


if __name__ == "__main__":
    unittest.main()
