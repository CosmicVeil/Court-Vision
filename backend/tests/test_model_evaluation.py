"""Offline tests for the walk-forward model evaluation."""

import json
import pickle
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np
from sklearn.multioutput import MultiOutputRegressor
from xgboost import XGBRegressor

import app.ml.nba_ai_system as nba_module
from app.ml.model_evaluation import (
    FAST_OVERRIDES,
    build_report,
    evaluate,
    main,
    make_model_factory,
    parse_args,
    production_params,
    resolve_params,
)
from app.ml.nba_ai_system import FEATURE_COLUMNS, NBAAISystem, TARGET_SPECS
from tests.test_nba_ai_model import make_player, make_synthetic_league


class MeanModel:
    def fit(self, X, y):
        self.mean = np.mean(y, axis=0)
        return self

    def predict(self, X):
        return np.tile(self.mean, (len(X), 1))


def small_factory():
    return MultiOutputRegressor(XGBRegressor(
        n_estimators=40, max_depth=3, learning_rate=0.15,
        random_state=42, n_jobs=1,
    ))


class WalkForwardTests(unittest.TestCase):
    def test_never_trains_on_test_or_later_seasons(self):
        data = make_synthetic_league(seasons=range(2021, 2027), n_players=12)
        fitted_rows = []

        class RecordingModel(MeanModel):
            def fit(self, X, y):
                fitted_rows.append(len(X))
                return super().fit(X, y)

        result = evaluate(data, seasons=3, model_factory=RecordingModel)
        for fold, rows in zip(result["folds"], fitted_rows):
            target = fold["target_season"]
            self.assertTrue(all(year < target for year in fold["train_target_seasons"]))
            self.assertNotIn(target, fold["train_target_seasons"])
            self.assertEqual(rows, fold["n_train"])
            self.assertEqual(rows, 12 * len(fold["train_target_seasons"]))

    def test_default_includes_2025_26_when_present(self):
        data = make_synthetic_league(seasons=range(2021, 2027), n_players=4)
        result = evaluate(data, model_factory=MeanModel)
        self.assertEqual([fold["target_season"] for fold in result["folds"]], [2024, 2025, 2026])
        self.assertEqual(result["folds"][-1]["label"], "2025-26")

    def test_metrics_and_percentage_points_are_hand_checkable(self):
        data = {
            2024: [make_player("A", ppg=8, fg=.3), make_player("B", ppg=18, fg=.4)],
            2025: [make_player("A", ppg=10, fg=.4), make_player("B", ppg=20, fg=.5)],
            2026: [make_player("A", ppg=12, fg=.5), make_player("B", ppg=22, fg=.5)],
        }
        result = evaluate(data, seasons=1, model_factory=MeanModel)
        ppg = result["folds"][0]["stats"]["ppg"]
        self.assertAlmostEqual(ppg["mae"], 5.0)
        self.assertAlmostEqual(ppg["rmse"], np.sqrt(29))
        self.assertAlmostEqual(ppg["r2"], -0.16)
        self.assertAlmostEqual(ppg["naive_mae"], 2.0)
        self.assertAlmostEqual(ppg["ratio"], 2.5)
        self.assertAlmostEqual(ppg["improvement_pct"], -150.0)
        fg = result["folds"][0]["stats"]["fg_pct"]
        self.assertAlmostEqual(fg["mae"], 5.0)  # percentage points, not 0.05
        self.assertAlmostEqual(fg["naive_mae"], 5.0)

    def test_report_has_documented_json_shape(self):
        result = evaluate(
            make_synthetic_league(seasons=(2023, 2024, 2025), n_players=4),
            seasons=1,
            model_factory=MeanModel,
        )
        report = build_report(result, {"n_estimators": 1})
        encoded = json.loads(json.dumps(report, allow_nan=False))
        self.assertEqual(
            set(encoded),
            {"timestamp", "model_params", "seasons_evaluated", "units", "headline", "per_season", "average"},
        )
        self.assertEqual(encoded["seasons_evaluated"], [{"key": 2025, "label": "2024-25"}])
        metrics = encoded["per_season"]["2024-25"]["stats"]["ppg"]
        self.assertEqual(
            set(metrics), {"mae", "rmse", "r2", "naive_mae", "improvement_pct", "ratio", "n"}
        )


class ConfigurationTests(unittest.TestCase):
    def test_cli_flags_override_hyperparameters(self):
        defaults = resolve_params(parse_args([]))
        self.assertEqual(defaults, production_params())
        args = parse_args([
            "--fast", "--n-estimators", "17", "--max-depth", "2",
            "--learning-rate", ".03", "--subsample", ".6", "--colsample-bytree", ".5",
        ])
        params = resolve_params(args)
        self.assertEqual(params["n_estimators"], 17)
        self.assertEqual(params["max_depth"], 2)
        self.assertEqual(params["learning_rate"], .03)
        self.assertEqual(params["subsample"], .6)
        self.assertEqual(params["colsample_bytree"], .5)
        fast = resolve_params(parse_args(["--fast"]))
        for key, value in FAST_OVERRIDES.items():
            self.assertEqual(fast[key], value)
        self.assertEqual(make_model_factory(params)().estimator.get_params()["n_estimators"], 17)

    def test_main_writes_json_to_requested_path(self):
        with tempfile.TemporaryDirectory() as directory:
            data_path = Path(directory) / "data.pkl"
            report_path = Path(directory) / "report.json"
            with open(data_path, "wb") as handle:
                pickle.dump(make_synthetic_league((2023, 2024, 2025), 5), handle)
            with patch("app.ml.model_evaluation.make_model_factory", return_value=MeanModel):
                main(["--fast", "--seasons", "1", "--data", str(data_path), "--output", str(report_path)])
            report = json.loads(report_path.read_text())
            self.assertEqual(report["seasons_evaluated"][0]["key"], 2025)
            self.assertIn("mean_mae_ratio", report["headline"])


class QualityAndTrainingTests(unittest.TestCase):
    def test_model_beats_naive_on_learnable_held_out_signal(self):
        rng = np.random.default_rng(4)
        names = [f"P{i}" for i in range(80)]
        initial = rng.uniform(.5, 1.5, len(names))
        data = {}
        for offset, season in enumerate(range(2021, 2027)):
            players = []
            growth = 1.15 ** offset
            for name, base in zip(names, initial):
                players.append(make_player(
                    name,
                    ppg=10 * base * growth, apg=3 * base * growth,
                    rpg=5 * base * growth, spg=.8 * base * growth,
                    bpg=.4 * base * growth, tov=1.2 * base * growth,
                    mins=min(45, 20 * base * growth),
                    fg=min(.9, .35 * base * growth),
                    fg3=min(.8, .25 * base * growth),
                    ft=min(.98, .55 * base * growth),
                ))
            data[season] = players
        result = evaluate(data, seasons=1, model_factory=small_factory)
        self.assertLess(result["headline_ratio"], 1.0)
        self.assertGreater(result["average"]["stats"]["ppg"]["improvement_pct"], 0)

    def test_train_model_fits_every_input_row(self):
        system = NBAAISystem()
        system.data = make_synthetic_league(n_players=15)
        combined = system.prepare_combined_data()
        expected_X, expected_y, _ = combined

        class RecordingModel(MeanModel):
            def fit(self, X, y):
                self.seen_X = np.array(X, copy=True)
                self.seen_y = np.array(y, copy=True)
                return super().fit(X, y)

        fitted = RecordingModel()
        with patch.object(nba_module, "_build_xgboost_model", return_value=fitted):
            self.assertTrue(system.train_model(combined))
        np.testing.assert_array_equal(fitted.seen_X, expected_X)
        np.testing.assert_array_equal(fitted.seen_y, expected_y)
        self.assertEqual(len(fitted.seen_X), len(expected_X))
        for metrics in system.validation_metrics.values():
            self.assertEqual(set(metrics), {"train_mae", "train_r2"})


if __name__ == "__main__":
    unittest.main()
