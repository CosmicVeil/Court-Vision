"""Adversarial offline tests; synthetic rows and in-memory persistence only."""

import io
import json
import os
import pickle
import unittest
from contextlib import redirect_stderr, redirect_stdout
from datetime import date, timedelta
from decimal import Decimal
from pathlib import Path
from unittest.mock import Mock, patch

import numpy as np
import pandas as pd

from app import config
from app.ml import game_architectures, game_model_evaluation as evaluation
from app.ml.game_features import (
    BASELINE_COLUMNS, FEATURE_COLUMNS, ID_COLUMNS, TARGET_COLUMNS, TARGETS,
    load_training_frame, prepare_frame,
)
from app.ml.game_model import GameStatModel
from scripts.train_game_model import main as train_main


def rows(counts=(2, 1, 3, 1, 2)):
    result = []
    for day, count in enumerate(counts):
        for player in range(count):
            row = {name: float(i + day + player) for i, name in enumerate(FEATURE_COLUMNS)}
            row.update(game_date=date(2026, 1, 1) + timedelta(days=day),
                       game_id=f"game-{day}", espn_player_id=player,
                       nba_player_id=None, player_name=f"Player {player}",
                       team="AAA", opponent="BBB", games_before=10 + day,
                       is_home=bool(player % 2), back_to_back=False)
            for i, (target, baseline) in enumerate(TARGETS.items()):
                row[target] = float(10 * i + day + player + 1)
                row[baseline] = row[target] + i + 1
            result.append(row)
    return result


class MeanEstimator:
    def fit(self, X, y):
        self.X = X.copy()
        self.y = y.copy()
        self.mean = y.mean(axis=0)
        return self

    def predict(self, X):
        return np.tile(self.mean, (len(X), 1))


class BaselineEstimator(MeanEstimator):
    def predict(self, X):
        return X[:, [FEATURE_COLUMNS.index(c) for c in BASELINE_COLUMNS]].copy()


class BadBlocksEstimator(BaselineEstimator):
    def predict(self, X):
        result = super().predict(X)
        result[:, TARGET_COLUMNS.index("blk")] += 100
        return result


class NonfiniteEstimator(BaselineEstimator):
    def predict(self, X):
        result = super().predict(X)
        result[0, :] = np.nan
        return result


class MemoryFile(io.BytesIO):
    """Allow save/load's context managers to share bytes without a disk file."""
    def close(self):
        pass


class FeatureEdgeTests(unittest.TestCase):
    def test_nullable_database_types_and_generator_preserve_alignment(self):
        source = rows((2, 2))
        for i, row in enumerate(source):
            row["team_spread"] = [Decimal("-2.5"), None, Decimal("NaN"), "bad"][i]
            row["over_under"] = Decimal("220.25")
            row["is_home"] = [True, False, None, True][i]
            row["pts"] = Decimal(str(i + 11))
        frame = prepare_frame(iter(reversed(source)))
        self.assertEqual(list(frame.columns), ID_COLUMNS + FEATURE_COLUMNS + TARGET_COLUMNS)
        self.assertTrue(all(frame[c].dtype == float for c in FEATURE_COLUMNS + TARGET_COLUMNS))
        np.testing.assert_allclose(frame["team_spread"], [-2.5, np.nan, np.nan, np.nan])
        np.testing.assert_allclose(frame["is_home"], [1, 0, np.nan, 1])
        np.testing.assert_allclose(frame["pts"], [11, 12, 13, 14])
        self.assertTrue(frame["nba_player_id"].isna().all())
        self.assertEqual(source[0]["team_spread"], Decimal("-2.5"))

    def test_each_missing_target_is_filtered_but_missing_features_are_retained(self):
        for target in TARGET_COLUMNS:
            for missing in (None, np.nan, Decimal("NaN")):
                with self.subTest(target=target, missing=missing):
                    source = rows((2,))
                    source[0][target] = missing
                    source[1]["team_spread"] = None
                    frame = prepare_frame(source)
                    self.assertEqual(frame["espn_player_id"].tolist(), [1])
                    self.assertTrue(frame["team_spread"].isna().all())

    def test_history_threshold_and_all_filtered_input(self):
        source = rows((5,))
        for row, prior in zip(source, [None, np.nan, 4, Decimal("5"), 6]):
            row["games_before"] = prior
        self.assertEqual(prepare_frame(source)["espn_player_id"].tolist(), [3, 4])
        self.assertTrue(prepare_frame(source[:3]).empty)

    def test_loader_borrows_connection_and_excludes_preseason_in_query(self):
        conn = Mock()
        # Three queries: view rows, team box scores, box-score appearances.
        conn.execute.return_value.fetchall.side_effect = [rows((1, 1)), [], []]
        # The loader keeps NBA teams only; the synthetic rows use made-up tricodes.
        with patch("app.ml.game_features.TEAM_IDS", {"AAA": 1, "BBB": 2}):
            loaded = load_training_frame(conn)
        pd.testing.assert_frame_equal(loaded, prepare_frame(rows((1, 1))))
        query, parameters = conn.execute.call_args_list[0].args
        self.assertIn("FROM player_game_features WHERE season_type <> %s", query)
        self.assertEqual(parameters, (1,))
        team_query, team_parameters = conn.execute.call_args_list[1].args
        self.assertIn("FROM team_game_stats", team_query)
        self.assertEqual(team_parameters, (1,))
        self.assertIn("FROM player_game_stats", conn.execute.call_args_list[2].args[0])
        conn.close.assert_not_called()

    def test_loader_closes_owned_connection_even_when_fetch_fails(self):
        conn = Mock()
        conn.execute.return_value.fetchall.side_effect = RuntimeError("fetch failed")
        with patch("app.db.get_db", return_value=conn):
            with self.assertRaisesRegex(RuntimeError, "fetch failed"):
                load_training_frame()
        conn.close.assert_called_once_with()


@patch.dict(game_architectures.ARCHITECTURES, {"codex_mean": MeanEstimator})
class FoldAndModelTests(unittest.TestCase):
    def test_unequal_dates_shuffled_rows_duplicate_indexes_exact_boundaries(self):
        frame = prepare_frame(rows()).sample(frac=1, random_state=2)
        frame.index = [7] * len(frame)
        folds = list(evaluation.date_folds(frame, folds=2))
        self.assertEqual(len(folds), 2)
        for (train, test), train_days, test_days in zip(
            folds, ({1, 2}, {1, 2, 3, 4}), ({3, 4}, {5})
        ):
            self.assertEqual(set(frame.loc[train, "game_date"].dt.day), train_days)
            self.assertEqual(set(frame.loc[test, "game_date"].dt.day), test_days)
            self.assertFalse((train & test).any())
        np.testing.assert_array_equal(sum(test.astype(int) for _, test in folds),
                                      (frame["game_date"].dt.day >= 3).astype(int))

    def test_evaluation_builds_fresh_estimators_with_only_prior_rows(self):
        frame = prepare_frame(rows()).sample(frac=1, random_state=4)
        frame.index = [9] * len(frame)
        instances = []

        def factory():
            estimator = MeanEstimator()
            instances.append(estimator)
            return estimator

        with patch.dict(game_architectures.ARCHITECTURES, {"codex_spy": factory}):
            evaluation.evaluate(frame, "codex_spy", folds=3)
        self.assertEqual(len(instances), 3)
        for estimator, (train, _) in zip(instances, evaluation.date_folds(frame, folds=3)):
            np.testing.assert_array_equal(estimator.X, frame.loc[train, FEATURE_COLUMNS])
            np.testing.assert_array_equal(estimator.y, frame.loc[train, TARGET_COLUMNS])

    def test_future_targets_do_not_change_earlier_fit(self):
        frame = prepare_frame(rows())
        first_train, first_test = next(evaluation.date_folds(frame, folds=2))
        changed = frame.copy()
        changed.loc[~first_train, TARGET_COLUMNS] += 10000
        original = GameStatModel("codex_mean").fit(frame[first_train]).predict(frame[first_test])
        altered = GameStatModel("codex_mean").fit(changed[first_train]).predict(changed[first_test])
        pd.testing.assert_frame_equal(original, altered)

    def test_reordered_columns_and_duplicate_indexes_keep_feature_target_order(self):
        frame = prepare_frame(rows()).iloc[[7, 1, 6, 2]]
        frame.index = [10, -1, 10, 5]
        reordered = frame[frame.columns[::-1]]
        model = GameStatModel("codex_mean").fit(reordered)
        np.testing.assert_array_equal(model.estimator.X, frame[FEATURE_COLUMNS])
        np.testing.assert_array_equal(model.estimator.y, frame[TARGET_COLUMNS])
        predictions = model.predict(reordered.drop(columns=TARGET_COLUMNS))
        self.assertTrue(predictions.index.equals(frame.index))
        self.assertEqual(list(predictions.columns), TARGET_COLUMNS)
        np.testing.assert_allclose(predictions, np.tile(frame[TARGET_COLUMNS].mean(), (4, 1)))

    def test_empty_and_one_date_inputs_are_rejected(self):
        for frame in (prepare_frame([]), prepare_frame(rows((2,)))):
            with self.subTest(size=len(frame)), self.assertRaises(ValueError):
                list(evaluation.date_folds(frame))
        with self.assertRaisesRegex(ValueError, "No training rows"):
            GameStatModel("codex_mean").fit(prepare_frame([]))

    def test_two_dates_one_test_row_has_defined_metrics_and_no_r2(self):
        result = evaluation.evaluate(prepare_frame(rows((1, 1))), "codex_mean", folds=99)
        self.assertEqual(len(result["folds"]), 1)
        for stat in result["stats"].values():
            self.assertEqual(stat["n"], 1)
            self.assertEqual(stat["mae"], 1)
            self.assertEqual(stat["rmse"], 1)
            self.assertIsNone(stat["r2"])
        json.dumps(result, allow_nan=False)

    def test_real_architectures_accept_one_row_and_all_missing_feature(self):
        frame = prepare_frame(rows((1,)))
        frame["over_under"] = np.nan
        for name in ("random_forest", "xgboost"):
            with self.subTest(architecture=name):
                estimator = game_architectures.build(name)
                # Preserve the real architecture/preprocessor; reduce tree count only.
                settings = {key: (2 if key.endswith("n_estimators") else 1)
                            for key in estimator.get_params()
                            if key.endswith("n_estimators") or key.endswith("n_jobs")}
                estimator.set_params(**settings)
                with patch.object(game_architectures, "build", return_value=estimator):
                    predictions = GameStatModel(name).fit(frame).predict(frame)
                self.assertEqual(predictions.shape, (1, len(TARGET_COLUMNS)))
                self.assertTrue(np.isfinite(predictions.to_numpy()).all())


@patch.dict(game_architectures.ARCHITECTURES, {
    "codex_mean": MeanEstimator, "codex_baseline": BaselineEstimator,
    "codex_bad_blocks": BadBlocksEstimator, "codex_nonfinite": NonfiniteEstimator,
})
class MetricTests(unittest.TestCase):
    def test_pooled_metrics_use_row_weights_and_correct_target_baselines(self):
        frame = prepare_frame(rows((2, 1, 4, 1, 2))).sample(frac=1, random_state=5)
        frame.index = [3] * len(frame)
        frame = frame[frame.columns[::-1]]
        result = evaluation.evaluate(frame, "codex_mean", folds=2)
        ratios = []
        for target, baseline in TARGETS.items():
            actual, predicted, naive = [], [], []
            for train, test in evaluation.date_folds(frame, folds=2):
                actual.extend(frame.loc[test, target])
                predicted.extend([frame.loc[train, target].mean()] * int(test.sum()))
                naive.extend(frame.loc[test, baseline])
            actual, predicted, naive = map(np.array, (actual, predicted, naive))
            mae = np.abs(actual - predicted).mean()
            naive_mae = np.abs(actual - naive).mean()
            score = result["stats"][target]
            self.assertEqual(score["n"], 7)
            self.assertAlmostEqual(score["mae"], mae)
            self.assertAlmostEqual(score["rmse"], np.sqrt(np.mean((actual - predicted) ** 2)))
            self.assertAlmostEqual(score["r2"], 1 - np.sum((actual - predicted) ** 2)
                                   / np.sum((actual - actual.mean()) ** 2))
            self.assertAlmostEqual(score["naive_mae"], naive_mae)
            self.assertAlmostEqual(score["ratio"], mae / naive_mae)
            self.assertAlmostEqual(score["improvement_pct"], 100 * (1 - mae / naive_mae))
            ratios.append(mae / naive_mae)
        self.assertAlmostEqual(result["headline_ratio"], np.mean(ratios))

    def test_perfect_baseline_does_not_hide_a_strictly_worse_architecture(self):
        frame = prepare_frame(rows((1, 1, 1, 1)))
        for target, baseline in TARGETS.items():
            frame[baseline] = frame[target]
        results = evaluation.compare(frame, ["codex_bad_blocks", "codex_baseline"], folds=1)
        self.assertEqual(results["codex_bad_blocks"]["stats"]["blk"]["mae"], 100)
        self.assertEqual(results["codex_baseline"]["stats"]["blk"]["mae"], 0)
        report = evaluation.build_report(results, frame)
        self.assertEqual(report["best_architecture"], "codex_baseline",
                         "A model worse on blocks and identical elsewhere must not win")

    def test_nonfinite_predictions_are_not_silently_removed_from_comparison(self):
        frame = prepare_frame(rows((1, 1, 1, 1)))
        # A failed prediction must not disappear and leave a deceptively valid score.
        with self.assertRaises(ValueError):
            evaluation.evaluate(frame, "codex_nonfinite", folds=1)


@patch.dict(game_architectures.ARCHITECTURES, {"codex_mean": MeanEstimator})
class PersistenceAndCliTests(unittest.TestCase):
    def test_in_memory_pickle_round_trip_keeps_predictions_and_metadata(self):
        frame = prepare_frame(rows((1, 1)))
        model = GameStatModel("codex_mean").fit(frame)
        buffer = MemoryFile()
        with patch("app.ml.game_model.open", return_value=buffer), patch.object(Path, "mkdir"):
            self.assertEqual(model.save("virtual/model.pkl"), Path("virtual/model.pkl"))
            buffer.seek(0)
            loaded = GameStatModel.load("virtual/model.pkl")
        self.assertEqual(loaded.architecture, model.architecture)
        self.assertEqual(loaded.trained_rows, model.trained_rows)
        self.assertEqual(loaded.trained_at, model.trained_at)
        pd.testing.assert_frame_equal(loaded.predict(frame), model.predict(frame))

    def test_load_rejects_reordered_features_and_targets(self):
        model = GameStatModel("codex_mean").fit(prepare_frame(rows((1, 1))))
        buffer = MemoryFile()
        with patch("app.ml.game_model.open", return_value=buffer), patch.object(Path, "mkdir"):
            model.save("virtual/model.pkl")
        bundle = pickle.loads(buffer.getvalue())
        for field in ("feature_columns", "target_columns"):
            with self.subTest(field=field):
                altered = dict(bundle, **{field: list(reversed(bundle[field]))})
                with patch("app.ml.game_model.open", return_value=MemoryFile(pickle.dumps(altered))):
                    with self.assertRaisesRegex(ValueError, "different columns"):
                        GameStatModel.load("virtual/model.pkl")

    def test_invalid_cli_architecture_is_rejected_before_loading_data(self):
        for main, module in ((train_main, "scripts.train_game_model"),
                             (evaluation.main, "app.ml.game_model_evaluation")):
            with self.subTest(module=module), patch(module + ".load_training_frame") as loader:
                with redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as error:
                    main(["--arch", "not_registered"])
                self.assertEqual(error.exception.code, 2)
                loader.assert_not_called()

    def test_nonpositive_cli_folds_are_rejected_before_loading_data(self):
        for value in ("0", "-1"):
            with self.subTest(folds=value), patch.object(
                evaluation, "load_training_frame", return_value=prepare_frame(rows())
            ) as loader, redirect_stderr(io.StringIO()):
                try:
                    evaluation.main(["--arch", "codex_mean", "--folds", value])
                except (SystemExit, ValueError):
                    pass
                loader.assert_not_called()

    def test_training_cli_environment_default_and_explicit_override(self):
        frame = prepare_frame(rows((1, 1)))
        with patch.dict(os.environ, {config.GAME_MODEL_ARCHITECTURE_ENV: "codex_mean"}), \
                patch("scripts.train_game_model.GameStatModel") as constructor, \
                redirect_stdout(io.StringIO()):
            train_main(["--output", "virtual/model.pkl"], frame=frame)
            constructor.assert_called_with("codex_mean")
            constructor.return_value.fit.return_value.save.assert_called_with("virtual/model.pkl")
            train_main(["--arch", "random_forest"], frame=frame)
            constructor.assert_called_with("random_forest")

    def test_evaluation_cli_writes_strict_json_in_memory(self):
        output = io.StringIO()
        with patch.object(evaluation, "open") as opened, patch.object(Path, "mkdir"), \
                redirect_stdout(io.StringIO()):
            opened.return_value.__enter__.return_value = output
            report = evaluation.main(["--arch", "codex_mean", "--folds", "2",
                                      "--output", "virtual/report.json"],
                                     frame=prepare_frame(rows()))
        self.assertEqual(json.loads(output.getvalue()), report)
        self.assertEqual(set(report["architectures"]), {"codex_mean"})


if __name__ == "__main__":
    unittest.main()
