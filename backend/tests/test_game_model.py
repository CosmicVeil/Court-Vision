"""Offline tests for the per-game stat model: synthetic rows, no database or network."""

import io
import json
import os
import tempfile
import unittest
from contextlib import redirect_stdout
from datetime import date, timedelta
from decimal import Decimal
from pathlib import Path
from unittest.mock import patch

import numpy as np

from app import config
from app.ml import game_architectures
from app.ml.game_features import (
    FEATURE_COLUMNS,
    MIN_PRIOR_GAMES,
    TARGET_COLUMNS,
    TARGETS,
    prepare_frame,
)
from app.ml.game_model import GameStatModel
from app.ml.game_model_evaluation import compare, date_folds, evaluate, main as evaluate_main
from scripts.train_game_model import main as train_main


class MeanModel:
    """Tiny stand-in architecture: predicts the training mean of every target."""

    def fit(self, X, y):
        self.mean = np.mean(y, axis=0)
        return self

    def predict(self, X):
        return np.tile(self.mean, (len(X), 1))


class NegativeModel(MeanModel):
    def predict(self, X):
        return np.full((len(X), len(TARGET_COLUMNS)), -3.0)


def make_rows(players=12, days=40, seed=0):
    """View-shaped rows: each player has a fixed skill level, games add noise around it."""
    rng = np.random.default_rng(seed)
    start = date(2026, 1, 1)
    rows = []
    for player in range(players):
        level = {target: rng.uniform(1, 20) for target in TARGET_COLUMNS}
        for day in range(days):
            row = {column: level["pts"] for column in FEATURE_COLUMNS}
            for target, baseline in TARGETS.items():
                row[baseline] = level[target] + rng.normal(0, 3)
                row[target] = max(0.0, level[target] + rng.normal(0, 1))
            row.update({
                "game_id": f"g{day}", "espn_player_id": player, "nba_player_id": player,
                "player_name": f"Player {player}", "team": "AAA", "opponent": "BBB",
                "game_date": start + timedelta(days=day),
                "is_home": day % 2 == 0, "back_to_back": False, "rest_days": 1,
                "games_before": day,
                # No betting line for some games, like the real archive.
                "team_spread": None if day % 3 == 0 else Decimal("-2.5"),
                "over_under": None if day % 3 == 0 else Decimal("220.5"),
            })
            rows.append(row)
    return rows


class PrepareFrameTests(unittest.TestCase):
    def test_converts_database_types_to_floats(self):
        frame = prepare_frame(make_rows(players=2, days=10))
        for column in FEATURE_COLUMNS + TARGET_COLUMNS:
            self.assertEqual(frame[column].dtype, float, column)
        self.assertEqual(set(frame["is_home"]), {0.0, 1.0})
        self.assertTrue(frame["team_spread"].isna().any())

    def test_drops_rows_without_enough_history_or_targets(self):
        rows = make_rows(players=1, days=10)
        rows[-1]["pts"] = None
        frame = prepare_frame(rows)
        self.assertEqual(len(frame), 10 - MIN_PRIOR_GAMES - 1)
        self.assertTrue((frame["games_before"] >= MIN_PRIOR_GAMES).all())

    def test_sorted_by_date(self):
        frame = prepare_frame(reversed(make_rows(players=3, days=10)))
        self.assertTrue(frame["game_date"].is_monotonic_increasing)

    def test_empty_input(self):
        self.assertTrue(prepare_frame([]).empty)


class ArchitectureRegistryTests(unittest.TestCase):
    def test_both_architectures_registered(self):
        self.assertEqual(game_architectures.available(), ["random_forest", "xgboost"])

    def test_unknown_architecture_lists_choices(self):
        with self.assertRaisesRegex(ValueError, "random_forest, xgboost"):
            game_architectures.build("neural_net")

    def test_duplicate_registration_rejected(self):
        with self.assertRaises(ValueError):
            game_architectures.register("xgboost")(MeanModel)

    def test_build_returns_fresh_estimator(self):
        self.assertIsNot(game_architectures.build("xgboost"), game_architectures.build("xgboost"))

    def test_default_architecture_from_environment(self):
        with patch.dict(os.environ, {config.GAME_MODEL_ARCHITECTURE_ENV: "random_forest"}):
            self.assertEqual(GameStatModel().architecture, "random_forest")
        with patch.dict(os.environ, {config.GAME_MODEL_ARCHITECTURE_ENV: ""}):
            self.assertEqual(GameStatModel().architecture, config.DEFAULT_GAME_MODEL_ARCHITECTURE)

    def test_real_architectures_train_with_missing_values(self):
        frame = prepare_frame(make_rows(players=6, days=25))
        frame["over_under"] = np.nan  # a feature that is missing on every row
        for name in game_architectures.available():
            with self.subTest(architecture=name):
                predictions = GameStatModel(name).fit(frame).predict(frame)
                self.assertEqual(list(predictions.columns), TARGET_COLUMNS)
                self.assertEqual(len(predictions), len(frame))
                self.assertTrue(np.isfinite(predictions.to_numpy()).all())
                self.assertTrue((predictions.to_numpy() >= 0).all())


@patch.dict(game_architectures.ARCHITECTURES, {"mean": MeanModel, "negative": NegativeModel})
class GameStatModelTests(unittest.TestCase):
    def setUp(self):
        self.frame = prepare_frame(make_rows())

    def test_predict_before_fit_fails(self):
        with self.assertRaises(RuntimeError):
            GameStatModel("mean").predict(self.frame)
        with self.assertRaises(RuntimeError):
            GameStatModel("mean").save("unused.pkl")

    def test_fit_rejects_empty_frame(self):
        with self.assertRaises(ValueError):
            GameStatModel("mean").fit(self.frame.iloc[0:0])

    def test_predictions_keep_the_frame_index(self):
        subset = self.frame.iloc[10:20]
        predictions = GameStatModel("mean").fit(self.frame).predict(subset)
        self.assertTrue(predictions.index.equals(subset.index))

    def test_negative_predictions_clamped_to_zero(self):
        predictions = GameStatModel("negative").fit(self.frame).predict(self.frame)
        self.assertTrue((predictions.to_numpy() == 0).all())

    def test_save_and_load_round_trip_keeps_architecture(self):
        model = GameStatModel("mean").fit(self.frame)
        with tempfile.TemporaryDirectory() as folder:
            path = model.save(Path(folder) / "sub" / "model.pkl")
            loaded = GameStatModel.load(path)
        self.assertEqual(loaded.architecture, "mean")
        self.assertEqual(loaded.trained_rows, len(self.frame))
        np.testing.assert_allclose(loaded.predict(self.frame), model.predict(self.frame))

    def test_load_rejects_model_with_other_columns(self):
        model = GameStatModel("mean").fit(self.frame)
        with tempfile.TemporaryDirectory() as folder:
            path = model.save(Path(folder) / "model.pkl")
            with patch("app.ml.game_model.FEATURE_COLUMNS", FEATURE_COLUMNS + ["new_feature"]):
                with self.assertRaisesRegex(ValueError, "retrain"):
                    GameStatModel.load(path)

    def test_train_script_saves_chosen_architecture(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "model.pkl"
            with patch.object(game_architectures, "available", return_value=["mean"]), \
                    redirect_stdout(io.StringIO()):
                train_main(["--arch", "mean", "--output", str(path)], frame=self.frame)
            self.assertEqual(GameStatModel.load(path).architecture, "mean")


@patch.dict(game_architectures.ARCHITECTURES, {"mean": MeanModel})
class WalkForwardTests(unittest.TestCase):
    def setUp(self):
        self.frame = prepare_frame(make_rows())

    def test_training_games_are_always_before_test_games(self):
        seen = np.zeros(len(self.frame), dtype=bool)
        for train_mask, test_mask in date_folds(self.frame, folds=4):
            self.assertFalse((train_mask & test_mask).any())
            self.assertLess(self.frame.loc[train_mask, "game_date"].max(),
                            self.frame.loc[test_mask, "game_date"].min())
            self.assertFalse((seen & test_mask).any())  # each game is tested once
            seen |= test_mask
        dates = np.sort(self.frame["game_date"].unique())
        first_test = dates[len(dates) // 2]
        np.testing.assert_array_equal(seen, (self.frame["game_date"] >= first_test).to_numpy())

    def test_more_folds_than_dates_still_works(self):
        folds = list(date_folds(self.frame, folds=1000))
        dates = self.frame["game_date"].nunique()
        self.assertEqual(len(folds), dates - dates // 2)

    def test_rejects_too_little_data(self):
        one_day = self.frame[self.frame["game_date"] == self.frame["game_date"].min()]
        with self.assertRaises(ValueError):
            list(date_folds(one_day))
        with self.assertRaises(ValueError):
            list(date_folds(self.frame, folds=0))

    def test_scores_match_hand_computed_mae(self):
        result = evaluate(self.frame, "mean", folds=1)
        train_mask, test_mask = next(date_folds(self.frame, folds=1))
        train, test = self.frame[train_mask], self.frame[test_mask]
        expected = np.abs(test["pts"] - train["pts"].mean()).mean()
        naive = np.abs(test["pts"] - test["pts_last10"]).mean()
        stats = result["stats"]["pts"]
        self.assertAlmostEqual(stats["mae"], expected)
        self.assertAlmostEqual(stats["naive_mae"], naive)
        self.assertAlmostEqual(stats["ratio"], expected / naive)
        self.assertEqual(stats["n"], len(test))
        self.assertEqual(result["folds"][0]["n_train"], len(train))

    def test_compare_uses_identical_folds(self):
        with patch.dict(game_architectures.ARCHITECTURES, {"mean2": MeanModel}):
            results = compare(self.frame, ["mean", "mean2"], folds=3)
        self.assertEqual(results["mean"]["folds"], results["mean2"]["folds"])
        self.assertEqual(results["mean"]["stats"], results["mean2"]["stats"])

    def test_xgboost_beats_noisy_naive_baseline(self):
        # The synthetic baseline columns are noisier than the players' true levels, so a
        # model that learns anything should land well under a ratio of 1.
        with patch.dict(game_architectures.ARCHITECTURES, {"mean": MeanModel}):
            result = evaluate(self.frame, "xgboost", folds=1)
        self.assertLess(result["headline_ratio"], 1.0)

    def test_main_writes_report_and_table(self):
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder) / "report.json"
            stdout = io.StringIO()
            with patch.object(game_architectures, "available", return_value=["mean"]), \
                    redirect_stdout(stdout):
                report = evaluate_main(["--folds", "2", "--output", str(output)], frame=self.frame)
            saved = json.loads(output.read_text())
        self.assertEqual(saved["best_architecture"], "mean")
        self.assertEqual(saved["rows"], len(self.frame))
        self.assertEqual(set(saved["architectures"]["mean"]["stats"]), set(TARGET_COLUMNS))
        self.assertEqual(report["architectures"]["mean"]["headline_ratio"],
                         saved["architectures"]["mean"]["headline_ratio"])
        self.assertIn("MAE ratio", stdout.getvalue())


if __name__ == "__main__":
    unittest.main()
