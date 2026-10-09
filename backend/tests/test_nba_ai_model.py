"""Comprehensive tests for the XGBoost player-projection model in nba_ai_system.

Training tests swap the production estimator (2k trees, depth 20) for a small
XGBoost model so the suite runs in seconds while exercising the real pipeline.
"""
import gzip
import os
import pickle
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

import numpy as np
import pandas as pd
from sklearn.multioutput import MultiOutputRegressor
from xgboost import XGBRegressor

import app.ml.nba_ai_system as nba_module
from app import config
from app.ml.nba_ai_system import (
    FEATURE_COLUMNS,
    MODEL_SCHEMA_VERSION,
    NBAAISystem,
    TARGET_SPECS,
    _build_xgboost_model,
)

TARGET_KEYS = [spec["key"] for spec in TARGET_SPECS]
LAST_COLUMNS = [spec["last_column"] for spec in TARGET_SPECS]


def _small_model():
    return MultiOutputRegressor(XGBRegressor(
        n_estimators=60, max_depth=3, learning_rate=0.2, random_state=42, n_jobs=1,
    ))


def fast_model():
    return patch.object(nba_module, "_build_xgboost_model", side_effect=_small_model)


def make_player(name, ppg=10.0, apg=2.0, rpg=4.0, spg=1.0, bpg=0.5, tov=1.5,
                mins=25.0, fg=0.45, fg3=0.35, ft=0.80, age=25, games=60, **extra):
    return {
        "PLAYER_NAME": name, "TEAM": "TST", "POSITION": "G", "AGE": age,
        "PPG_LAST": ppg, "APG_LAST": apg, "RPG_LAST": rpg, "SPG_LAST": spg,
        "BPG_LAST": bpg, "TOV_LAST": tov, "MIN_LAST": mins, "FG_PCT_LAST": fg,
        "FG3_PCT_LAST": fg3, "FT_PCT_LAST": ft, "GAMES_PLAYED_LAST": games,
        **extra,
    }


def make_synthetic_league(seasons=(2021, 2022, 2023, 2024), n_players=120, seed=0):
    """League where each stat drifts slightly season to season, so last season's
    value is a strong predictor of next season's."""
    rng = np.random.default_rng(seed)
    base = {
        "ppg": rng.uniform(2, 30, n_players),
        "apg": rng.uniform(0.5, 10, n_players),
        "rpg": rng.uniform(1, 13, n_players),
        "spg": rng.uniform(0.1, 2.2, n_players),
        "bpg": rng.uniform(0.0, 2.5, n_players),
        "tov": rng.uniform(0.3, 4.0, n_players),
        "mins": rng.uniform(8, 38, n_players),
        "fg": rng.uniform(0.38, 0.62, n_players),
        "fg3": rng.uniform(0.25, 0.42, n_players),
        "ft": rng.uniform(0.6, 0.92, n_players),
    }
    data = {}
    for offset, season in enumerate(seasons):
        players = []
        for i in range(n_players):
            noise = rng.normal(0, 0.02, len(base))
            stats = {k: max(0.0, v[i] * (1 + n)) for (k, v), n in zip(base.items(), noise)}
            players.append(make_player(f"Player {i}", age=22 + i % 12 + offset, **stats))
        data[season] = players
    return data


class SeasonLabelTests(unittest.TestCase):
    def test_label_uses_previous_year_and_two_digit_suffix(self):
        system = NBAAISystem()
        self.assertEqual(system._season_label(2025), "2024-25")
        self.assertEqual(system._season_label(2000), "1999-00")


class SeasonTransitionTests(unittest.TestCase):
    def setUp(self):
        self.system = NBAAISystem()

    def test_no_data_or_single_season_yields_no_transitions(self):
        self.system.data = None
        self.assertEqual(self.system._build_season_transitions(), [])
        self.system.data = {2024: [make_player("A")]}
        self.assertEqual(self.system._build_season_transitions(), [])

    def test_skips_non_consecutive_seasons(self):
        self.system.data = {
            2020: [make_player("A")],
            2022: [make_player("A")],
            2023: [make_player("A")],
        }
        transitions = self.system._build_season_transitions()
        self.assertEqual([(t["from_season"], t["to_season"]) for t in transitions], [(2022, 2023)])
        self.assertEqual(transitions[0]["season_label"], "2021-22")

    def test_skips_empty_seasons(self):
        self.system.data = {2023: [], 2024: [make_player("A")], 2025: [make_player("A")]}
        transitions = self.system._build_season_transitions()
        self.assertEqual([t["from_season"] for t in transitions], [2024])

    def test_only_players_present_in_both_seasons_are_paired(self):
        self.system.data = {
            2024: [make_player("Stays", ppg=10), make_player("Retires", ppg=20), {"PPG_LAST": 5}],
            2025: [make_player("Stays", ppg=14), make_player("Rookie", ppg=8)],
        }
        transition = self.system._build_season_transitions()[0]
        self.assertEqual(transition["X"].shape, (1, len(FEATURE_COLUMNS)))
        self.assertEqual(transition["y"].shape, (1, len(TARGET_SPECS)))
        self.assertEqual(transition["X"][0][FEATURE_COLUMNS.index("PPG_LAST")], 10)
        self.assertEqual(transition["y"][0][TARGET_KEYS.index("ppg")], 14)

    def test_features_come_from_current_season_and_targets_from_next(self):
        self.system.data = {
            2024: [make_player("A", ppg=10, fg=0.40, age=24)],
            2025: [make_player("A", ppg=15, fg=0.50, age=25)],
        }
        transition = self.system._build_season_transitions()[0]
        features = dict(zip(FEATURE_COLUMNS, transition["X"][0]))
        targets = dict(zip(TARGET_KEYS, transition["y"][0]))
        self.assertEqual(features["AGE"], 24)
        self.assertEqual(features["PPG_LAST"], 10)
        self.assertAlmostEqual(features["FG_PCT_LAST"], 0.40)
        self.assertEqual(targets["ppg"], 15)
        self.assertAlmostEqual(targets["fg_pct"], 0.50)

    def test_missing_or_non_numeric_features_become_nan(self):
        self.system.data = {
            2024: [make_player("A", PPG_PREV=None, HEIGHT="n/a")],
            2025: [make_player("A")],
        }
        features = dict(zip(FEATURE_COLUMNS, self.system._build_season_transitions()[0]["X"][0]))
        for column in ("HEIGHT", "PPG_TREND", "PPG_PREV"):
            self.assertTrue(np.isnan(features[column]), column)

    def test_players_with_non_numeric_targets_are_dropped(self):
        self.system.data = {
            2024: [make_player("Good"), make_player("Bad")],
            2025: [make_player("Good"), make_player("Bad", ppg="n/a")],
        }
        transition = self.system._build_season_transitions()[0]
        self.assertEqual(len(transition["y"]), 1)

    def test_transitions_are_ordered_regardless_of_dict_order(self):
        self.system.data = {
            2025: [make_player("A")], 2023: [make_player("A")], 2024: [make_player("A")],
        }
        self.assertEqual(
            [t["from_season"] for t in self.system._build_season_transitions()], [2023, 2024],
        )


class PrepareCombinedDataTests(unittest.TestCase):
    def test_stacks_every_transition_and_standardizes_features(self):
        system = NBAAISystem()
        system.data = make_synthetic_league(seasons=(2022, 2023, 2024), n_players=30)
        X, y, extra = system.prepare_combined_data()
        self.assertIsNone(extra)
        self.assertEqual(X.shape, (60, len(FEATURE_COLUMNS)))
        self.assertEqual(y.shape, (60, len(TARGET_SPECS)))
        varying = X.std(axis=0) > 0
        np.testing.assert_allclose(X[:, varying].mean(axis=0), 0, atol=1e-9)
        np.testing.assert_allclose(X[:, varying].std(axis=0), 1, atol=1e-9)
        self.assertEqual(system.scaler.n_features_in_, len(FEATURE_COLUMNS))

    def test_returns_triple_of_none_without_transitions(self):
        system = NBAAISystem()
        system.data = {2024: [make_player("A")]}
        self.assertEqual(system.prepare_combined_data(), (None, None, None))


class PrepareDataTests(unittest.TestCase):
    def setUp(self):
        self.system = NBAAISystem()
        self.system.data = {
            2024: [make_player("Old Season", ppg=99)],
            2025: [make_player("A", ppg=20, apg=5, rpg=10, fg=0.5), make_player("B", ppg=None)],
        }

    def test_uses_most_recent_season_and_fills_nans(self):
        _, _, df = self.system.prepare_data()
        self.assertEqual(list(df["PLAYER_NAME"]), ["A", "B"])
        self.assertEqual(df.loc[1, "PPG_LAST"], 0)

    def test_missing_features_are_nan_in_matrix_but_zero_in_display_frame(self):
        X, _, df = self.system.prepare_data()
        height = FEATURE_COLUMNS.index("HEIGHT")
        self.assertTrue(np.isnan(X[0, height]))
        self.assertEqual(df.iloc[0]["HEIGHT"], 0)

    def test_inference_features_match_training_features_for_same_row(self):
        """Guards against train/serve skew: the same player row must produce the
        same raw feature vector whether it is seen in training or at inference."""
        row = make_player("A", HEIGHT=80, PPG_PREV=None, PPG_TREND=0.2)
        self.system.data = {2024: [row], 2025: [dict(row)]}
        train_X = self.system._build_season_transitions()[0]["X"][0]
        X, _, _ = self.system.prepare_data()
        serve_X = self.system.scaler.inverse_transform(X)[0]
        np.testing.assert_allclose(serve_X, train_X, equal_nan=True)

    def test_existing_feature_values_are_not_overwritten(self):
        self.system.data[2025][0]["HEIGHT"] = 82
        _, _, df = self.system.prepare_data()
        self.assertEqual(df.iloc[0]["HEIGHT"], 82)

    def test_feature_matrix_matches_feature_column_order(self):
        X, y, _ = self.system.prepare_data()
        self.assertEqual(X.shape, (2, len(FEATURE_COLUMNS)))
        self.assertEqual(y.shape, (2, len(TARGET_SPECS)))
        self.assertEqual(self.system.feature_columns, list(FEATURE_COLUMNS))

    def test_trained_system_reuses_fitted_scaler_instead_of_refitting(self):
        self.system.scaler.fit(np.ones((3, len(FEATURE_COLUMNS))) * 1000)
        self.system.model_trained = True
        mean_before = self.system.scaler.mean_.copy()
        self.system.prepare_data()
        np.testing.assert_array_equal(self.system.scaler.mean_, mean_before)

    def test_returns_none_triple_without_data(self):
        self.system.data = None
        self.assertEqual(self.system.prepare_data(), (None, None, None))


class ClampAndPredictTests(unittest.TestCase):
    def setUp(self):
        self.system = NBAAISystem()

    def test_clamp_does_not_mutate_input(self):
        raw = np.array([[-5.0] * len(TARGET_SPECS)])
        self.system._clamp_predictions(raw)
        self.assertEqual(raw[0, 0], -5.0)

    def test_clamp_respects_every_spec_bound(self):
        low = self.system._clamp_predictions(np.full((1, len(TARGET_SPECS)), -100.0))[0]
        high = self.system._clamp_predictions(np.full((1, len(TARGET_SPECS)), 100.0))[0]
        for index, spec in enumerate(TARGET_SPECS):
            self.assertEqual(low[index], spec["minimum"], spec["key"])
            expected_high = spec["maximum"] if spec["maximum"] is not None else 100.0
            self.assertEqual(high[index], expected_high, spec["key"])

    def test_predict_without_model_returns_none(self):
        self.assertIsNone(self.system.predict(np.zeros((1, len(FEATURE_COLUMNS)))))

    def test_predict_clamps_model_output(self):
        self.system.model = Mock()
        self.system.model.predict.return_value = np.array([[-3, 1, 1, 1, 1, 1, 55, 1.5, 0.3, 0.9]])
        out = self.system.predict(np.zeros((1, len(FEATURE_COLUMNS))))
        self.assertEqual(out[0, TARGET_KEYS.index("ppg")], 0)
        self.assertEqual(out[0, TARGET_KEYS.index("mpg")], 48)
        self.assertEqual(out[0, TARGET_KEYS.index("fg_pct")], 1)


class ModelConfigTests(unittest.TestCase):
    def test_production_model_is_deterministic_multi_output_xgboost(self):
        model = _build_xgboost_model()
        self.assertIsInstance(model, MultiOutputRegressor)
        self.assertIsInstance(model.estimator, XGBRegressor)
        params = model.estimator.get_params()
        self.assertEqual(params["random_state"], 42)
        self.assertEqual(params["n_jobs"], 1)
        self.assertGreater(params["n_estimators"], 0)
        self.assertTrue(0 < params["learning_rate"] <= 1)
        self.assertTrue(0 < params["subsample"] <= 1)
        self.assertTrue(0 < params["colsample_bytree"] <= 1)


class TrainingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.system = NBAAISystem()
        cls.system.data = make_synthetic_league()
        cls.combined = cls.system.prepare_combined_data()
        with fast_model():
            cls.trained = cls.system.train_model(cls.combined)

    def test_training_succeeds_and_records_metrics_for_every_target(self):
        self.assertTrue(self.trained)
        self.assertEqual(set(self.system.validation_metrics), set(TARGET_KEYS))
        for key, metrics in self.system.validation_metrics.items():
            self.assertEqual(set(metrics), {"train_mae", "train_r2"}, key)
            self.assertTrue(np.isfinite(metrics["train_mae"]), key)
            self.assertGreaterEqual(metrics["train_mae"], 0, key)

    def test_model_learns_strong_season_to_season_signal(self):
        # This is an in-sample fit check; honest held-out quality is tested walk-forward.
        for key, metrics in self.system.validation_metrics.items():
            self.assertGreater(
                metrics["train_r2"], 0.8, f"{key} r2={metrics['train_r2']:.3f}"
            )

    def test_beats_naive_mean_baseline(self):
        X, y, _ = self.combined
        pred = self.system.predict(X)
        model_mae = np.abs(pred - y).mean(axis=0)
        baseline_mae = np.abs(y - y.mean(axis=0)).mean(axis=0)
        for index, key in enumerate(TARGET_KEYS):
            self.assertLess(model_mae[index], baseline_mae[index] * 0.5, key)

    def test_predictions_have_expected_shape_and_are_finite_and_in_bounds(self):
        X, _, _ = self.combined
        pred = self.system.predict(X)
        self.assertEqual(pred.shape, (len(X), len(TARGET_SPECS)))
        self.assertTrue(np.isfinite(pred).all())
        for index, spec in enumerate(TARGET_SPECS):
            self.assertTrue((pred[:, index] >= spec["minimum"]).all(), spec["key"])
            if spec["maximum"] is not None:
                self.assertTrue((pred[:, index] <= spec["maximum"]).all(), spec["key"])

    def test_higher_scorer_is_projected_to_score_more(self):
        X, y, _ = self.combined
        ppg = TARGET_KEYS.index("ppg")
        pred = self.system.predict(X)
        top, bottom = np.argmax(y[:, ppg]), np.argmin(y[:, ppg])
        self.assertGreater(pred[top, ppg], pred[bottom, ppg])

    def test_training_is_deterministic(self):
        other = NBAAISystem()
        other.data = make_synthetic_league()
        combined = other.prepare_combined_data()
        with fast_model():
            other.train_model(combined)
        X, _, _ = self.combined
        np.testing.assert_allclose(other.predict(X), self.system.predict(X))

    def test_train_model_rejects_missing_data(self):
        system = NBAAISystem()
        self.assertFalse(system.train_model(None))
        self.assertFalse(system.train_model((None, None, None)))
        self.assertIsNone(system.model)


class PredictionsFrameTests(unittest.TestCase):
    def setUp(self):
        self.system = NBAAISystem()
        self.system.model_trained = True
        self.system.data = {2025: [
            make_player("Riser", ppg=10, apg=4, rpg=5, fg=0.40, PLAYER_ID=1),
            make_player("Zero", ppg=0, apg=0, rpg=0, fg=0.0, PLAYER_ID=2),
        ]}
        self.system.model = Mock()
        self.system.model.predict.return_value = np.array([
            [12, 5, 5, 1, 0.5, 1.5, 25, 0.45, 0.35, 0.8],
            [3, 1, 2, 1, 0.5, 1.5, 25, 0.30, 0.35, 0.8],
        ], dtype=float)
        self.system.scaler.fit(np.zeros((2, len(FEATURE_COLUMNS))))

    def test_frame_has_identity_current_and_predicted_columns(self):
        df = self.system.build_predictions_df()
        for column in ["PLAYER_NAME", "TEAM", "POSITION", "AGE", "PLAYER_ID", "PRA_LAST", "PREDICTED_PRA"]:
            self.assertIn(column, df.columns)
        for spec in TARGET_SPECS:
            prefix = spec["predicted_column"].removeprefix("PREDICTED_")
            for column in (spec["last_column"], spec["predicted_column"],
                           f"{prefix}_INCREASE", f"{prefix}_IMPROVEMENT"):
                self.assertIn(column, df.columns)

    def test_rate_improvement_is_relative_and_percentage_improvement_is_absolute(self):
        riser = self.system.build_predictions_df().iloc[0]
        self.assertAlmostEqual(riser["PPG_INCREASE"], 2)
        self.assertAlmostEqual(riser["PPG_IMPROVEMENT"], 20)
        self.assertAlmostEqual(riser["APG_IMPROVEMENT"], 25)
        self.assertAlmostEqual(riser["FG_PCT_IMPROVEMENT"], 5)

    def test_zero_baseline_gives_zero_improvement_not_inf(self):
        zero = self.system.build_predictions_df().iloc[1]
        self.assertEqual(zero["PPG_IMPROVEMENT"], 0)
        self.assertEqual(zero["PRA_IMPROVEMENT"], 0)
        self.assertAlmostEqual(zero["FG_PCT_IMPROVEMENT"], 30)

    def test_pra_is_sum_of_points_assists_rebounds(self):
        riser = self.system.build_predictions_df().iloc[0]
        self.assertEqual(riser["PRA_LAST"], 19)
        self.assertEqual(riser["PREDICTED_PRA"], 22)
        self.assertAlmostEqual(riser["PRA_IMPROVEMENT"], 3 / 19 * 100)

    def test_frame_is_cached_until_cleared(self):
        first = self.system.build_predictions_df()
        self.assertIs(self.system.build_predictions_df(), first)
        self.assertEqual(self.system.model.predict.call_count, 1)
        self.system.clear_predictions_cache()
        self.system.build_predictions_df()
        self.assertEqual(self.system.model.predict.call_count, 2)

    def test_returns_none_when_model_cannot_be_initialized(self):
        system = NBAAISystem()
        system.initialize_system = Mock(return_value=False)
        self.assertIsNone(system.build_predictions_df())
        self.assertIsNone(system.get_top_performers())
        self.assertIsNone(system.get_breakout_players())


class RankingTests(unittest.TestCase):
    def setUp(self):
        self.system = NBAAISystem()
        rows = []
        for name, ppg_inc, ppg_imp, apg_imp, rpg_imp in [
            ("Big Jump", 6.0, 60.0, 0.0, 0.0),
            ("Small Jump", 1.0, 10.0, 0.0, 0.0),
            ("Flat", 0.0, 0.0, 1.0, 1.0),
            ("Absurd", 0.5, 900.0, 900.0, 900.0),
        ]:
            rows.append({
                "PLAYER_NAME": name, "PREDICTED_PPG": 10 + ppg_inc, "PREDICTED_APG": 3,
                "PREDICTED_RPG": 4, "PREDICTED_SPG": 1, "PREDICTED_BPG": 1,
                "PPG_INCREASE": ppg_inc, "APG_INCREASE": 0.0, "RPG_INCREASE": 0.0,
                "PPG_IMPROVEMENT": ppg_imp, "APG_IMPROVEMENT": apg_imp, "RPG_IMPROVEMENT": rpg_imp,
            })
        self.system.build_predictions_df = Mock(return_value=pd.DataFrame(rows))

    def test_breakouts_filter_by_threshold_and_sort_by_total_increase(self):
        names = list(self.system.get_breakout_players(threshold=5.0)["PLAYER_NAME"])
        self.assertEqual(names, ["Big Jump", "Small Jump", "Absurd"])

    def test_breakout_threshold_is_strict(self):
        names = list(self.system.get_breakout_players(threshold=10.0)["PLAYER_NAME"])
        self.assertNotIn("Small Jump", names)

    def test_total_improvement_is_clipped(self):
        df = self.system.get_breakout_players(threshold=5.0)
        self.assertEqual(df.set_index("PLAYER_NAME").loc["Absurd", "TOTAL_IMPROVEMENT"], 1000)

    def test_bundle_matches_standalone_breakouts_and_respects_top_n(self):
        bundle = self.system.get_ai_predictions_bundle(top_n=2, breakout_threshold=5.0)
        self.assertEqual([p["PLAYER_NAME"] for p in bundle["breakout_players"]], ["Big Jump", "Small Jump"])
        self.assertEqual([p["PLAYER_NAME"] for p in bundle["top_scorers"]], ["Big Jump", "Small Jump"])
        for key in ("top_assists", "top_rebounders", "top_steals", "top_blocks"):
            self.assertEqual(len(bundle[key]), 2, key)

    def test_top_performers_sorted_descending(self):
        ppg = self.system.get_top_performers(top_n=4)["PPG"]["PREDICTED_PPG"].tolist()
        self.assertEqual(ppg, sorted(ppg, reverse=True))

    def test_empty_bundle_when_no_predictions(self):
        self.system.build_predictions_df = Mock(return_value=None)
        bundle = self.system.get_ai_predictions_bundle()
        self.assertEqual(set(bundle), {
            "top_scorers", "top_assists", "top_rebounders",
            "top_steals", "top_blocks", "breakout_players",
        })
        self.assertTrue(all(value == [] for value in bundle.values()))


class PlayerPredictionTests(unittest.TestCase):
    def setUp(self):
        self.system = NBAAISystem()
        self.system.model_trained = True
        self.system.data = {2025: [
            make_player("LeBron James", ppg=25),
            make_player("Stephen Curry", ppg=0, fg3=0.40),
        ]}
        self.system.prepare_data = Mock(return_value=(np.array([[0.0], [1.0]]), None, None))
        self.system.predict = Mock(side_effect=lambda X: np.array(
            [[30 if X[0, 0] == 0 else 5, 2, 4, 1, 0.5, 1.5, 25, 0.45, 0.42, 0.8]], dtype=float))

    def test_match_is_case_insensitive_and_partial(self):
        self.assertEqual(self.system.get_player_prediction("lebron")["name"], "LeBron James")

    def test_uses_feature_row_for_matched_player(self):
        self.assertEqual(self.system.get_player_prediction("Curry")["predicted_stats"]["ppg"], 5)
        self.assertEqual(self.system.get_player_prediction("LeBron")["predicted_stats"]["ppg"], 30)

    def test_zero_current_stat_yields_zero_improvement(self):
        self.assertEqual(self.system.get_player_prediction("Curry")["improvements"]["ppg"], 0)

    def test_percentages_reported_in_percent_points(self):
        payload = self.system.get_player_prediction("Curry")
        self.assertEqual(payload["current_stats"]["fg3_pct"], 40.0)
        self.assertEqual(payload["predicted_stats"]["fg3_pct"], 42.0)
        self.assertEqual(payload["improvements"]["fg3_pct"], 2.0)

    def test_unknown_player_returns_none(self):
        self.assertIsNone(self.system.get_player_prediction("Michael Jordan"))

    def test_returns_none_when_system_cannot_initialize(self):
        system = NBAAISystem()
        system.initialize_system = Mock(return_value=False)
        self.assertIsNone(system.get_player_prediction("Anyone"))


class PersistenceTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name) / "model.pkl"

    def _write(self, payload, compress=True):
        opener = gzip.open if compress else open
        with opener(self.path, "wb") as handle:
            pickle.dump(payload, handle)

    def _valid_payload(self, **overrides):
        return {
            "model": "m", "scaler": "s", "model_type": "xgboost",
            "schema_version": MODEL_SCHEMA_VERSION,
            "feature_columns": list(FEATURE_COLUMNS),
            "target_columns": [spec["target_column"] for spec in TARGET_SPECS],
            "validation_metrics": {"ppg": {"train_mae": 1.0, "train_r2": 0.9}},
            **overrides,
        }

    def test_trained_model_round_trips_with_identical_predictions(self):
        system = NBAAISystem()
        system.data = make_synthetic_league(n_players=40)
        combined = system.prepare_combined_data()
        with fast_model():
            system.train_model(combined)
        self.assertTrue(system.save_model(str(self.path)))

        loaded = NBAAISystem()
        self.assertTrue(loaded.load_model(str(self.path)))
        X, _, _ = combined
        np.testing.assert_array_equal(loaded.predict(X), system.predict(X))
        np.testing.assert_array_equal(loaded.scaler.mean_, system.scaler.mean_)
        self.assertEqual(loaded.validation_metrics, system.validation_metrics)

    def test_save_without_model_fails(self):
        self.assertFalse(NBAAISystem().save_model(str(self.path)))
        self.assertFalse(self.path.exists())

    def test_loads_uncompressed_legacy_pickle_with_current_schema(self):
        self._write(self._valid_payload(), compress=False)
        system = NBAAISystem()
        self.assertTrue(system.load_model(str(self.path)))
        self.assertEqual(system.validation_metrics["ppg"]["train_r2"], 0.9)

    def test_rejects_incompatible_schemas(self):
        cases = {
            "wrong version": self._valid_payload(schema_version=MODEL_SCHEMA_VERSION - 1),
            "wrong type": self._valid_payload(model_type="random_forest"),
            "reordered features": self._valid_payload(feature_columns=list(reversed(FEATURE_COLUMNS))),
            "missing model": {k: v for k, v in self._valid_payload().items() if k != "model"},
            "not a dict": ["model"],
        }
        for label, payload in cases.items():
            with self.subTest(label):
                self._write(payload)
                system = NBAAISystem()
                self.assertFalse(system.load_model(str(self.path)))
                self.assertIsNone(system.model)

    def test_missing_or_corrupt_file_fails_gracefully(self):
        self.assertFalse(NBAAISystem().load_model(str(self.path)))
        self.path.write_bytes(b"\x1f\x8bnot really gzip")
        self.assertFalse(NBAAISystem().load_model(str(self.path)))


class InitializationTests(unittest.TestCase):
    """Redirects the module's file paths to a temp dir so no real artifacts are touched."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        env_patch = patch.dict(os.environ, {}, clear=False)
        env_patch.start()
        self.addCleanup(env_patch.stop)
        os.environ.pop(config.MODEL_FILE_ENV, None)
        self.dir = Path(self.tmp.name)
        dir_patch = patch.object(nba_module, "DATA_DIR", str(self.dir))
        dir_patch.start()
        self.addCleanup(dir_patch.stop)
        self.data_file = self.dir / "nba_multi_season_data.pkl"
        self.model_file = self.dir / "nba_ai_model.pkl"

    def _system_with_scraper(self, data):
        system = NBAAISystem()
        system.scraper = Mock()
        system.scraper.scrape_multiple_seasons.return_value = data
        return system

    def test_already_trained_system_short_circuits(self):
        system = self._system_with_scraper({})
        system.model_trained = True
        self.assertTrue(system.initialize_system())
        system.scraper.scrape_multiple_seasons.assert_not_called()

    def test_missing_cached_data_fails_cleanly_without_scraping(self):
        system = self._system_with_scraper({})
        with patch("builtins.print") as output:
            self.assertFalse(system.initialize_system())
        self.assertFalse(system.model_trained)
        system.scraper.scrape_multiple_seasons.assert_not_called()
        self.assertIn("scrape_training_data.py", " ".join(str(call) for call in output.call_args_list))
        self.assertEqual(list(self.dir.iterdir()), [])

    def test_cold_start_trains_from_cache_without_scraping(self):
        with open(self.data_file, "wb") as handle:
            pickle.dump(make_synthetic_league(n_players=40), handle)
        original_data = self.data_file.read_bytes()
        system = self._system_with_scraper({})
        with fast_model():
            self.assertTrue(system.initialize_system())
        self.assertTrue(system.model_trained)
        self.assertTrue(self.model_file.exists())
        self.assertEqual(self.data_file.read_bytes(), original_data)
        system.scraper.scrape_multiple_seasons.assert_not_called()

        warm = self._system_with_scraper({})
        with patch.object(warm, "train_model", side_effect=AssertionError("must load")):
            self.assertTrue(warm.initialize_system())
        warm.scraper.scrape_multiple_seasons.assert_not_called()
        self.assertIsNotNone(warm.build_predictions_df())

    def test_incompatible_saved_model_triggers_retrain_from_cache(self):
        with open(self.data_file, "wb") as handle:
            pickle.dump(make_synthetic_league(n_players=30), handle)
        with gzip.open(self.model_file, "wb") as handle:
            pickle.dump({"model_type": "xgboost", "schema_version": 1}, handle)

        system = self._system_with_scraper({})
        with fast_model():
            self.assertTrue(system.initialize_system())
        system.scraper.scrape_multiple_seasons.assert_not_called()
        self.assertTrue(NBAAISystem().load_model(str(self.model_file)))

    def test_retrain_from_cache_without_data_file_fails(self):
        self.assertFalse(NBAAISystem().retrain_from_cache())

    def test_force_refresh_clears_cached_predictions(self):
        system = self._system_with_scraper({})
        with open(self.data_file, "wb") as handle:
            pickle.dump(make_synthetic_league(n_players=20), handle)
        system.model_trained = True
        system._predictions_df = pd.DataFrame()
        with fast_model():
            self.assertTrue(system.initialize_system(force_refresh=True))
        self.assertIsNone(system._predictions_df)
        system.scraper.scrape_multiple_seasons.assert_not_called()

    def test_force_refresh_without_cache_fails_without_scraping(self):
        system = self._system_with_scraper({})
        system.model_trained = True
        self.assertFalse(system.initialize_system(force_refresh=True))
        system.scraper.scrape_multiple_seasons.assert_not_called()

    def test_empty_cached_data_fails_with_scrape_instruction(self):
        with open(self.data_file, "wb") as handle:
            pickle.dump({}, handle)
        system = self._system_with_scraper({})
        with patch("builtins.print") as output:
            self.assertFalse(system.initialize_system())
        system.scraper.scrape_multiple_seasons.assert_not_called()
        self.assertIn("scrape_training_data.py", " ".join(str(call) for call in output.call_args_list))


class SeasonAccuracyReportTests(unittest.TestCase):
    def setUp(self):
        self.system = NBAAISystem()
        self.system.data = {
            2023: [make_player("A", ppg=10, fg=0.40)],
            2024: [make_player("A", ppg=12, fg=0.45)],
            2025: [make_player("A", ppg=16, fg=0.50)],
        }
        self.system.model = Mock()
        self.system.model_trained = True
        self.system.scaler.fit(np.zeros((1, len(FEATURE_COLUMNS))))
        # Always predicts 10 PPG / 40% FG, so errors are 2 then 6 PPG and 5 then 10 FG points.
        prediction = make_player("x", ppg=10, fg=0.40)
        self.system.predict = Mock(return_value=np.array([[prediction[c] for c in LAST_COLUMNS]], dtype=float))

    def test_reports_per_season_and_average_absolute_error(self):
        result = self.system.print_season_accuracies()
        self.assertEqual(result["season_count"], 2)
        self.assertEqual(result["seasons"]["2022-23"]["ppg"], 2.0)
        self.assertEqual(result["seasons"]["2023-24"]["ppg"], 6.0)
        self.assertEqual(result["average_differences"]["ppg"], 4.0)

    def test_percentage_errors_are_reported_in_percent_points(self):
        result = self.system.print_season_accuracies()
        self.assertEqual(result["seasons"]["2022-23"]["fg_pct"], 5.0)
        self.assertEqual(result["average_differences"]["fg_pct"], 7.5)

    def test_untrained_model_returns_none(self):
        self.system.model_trained = False
        self.assertIsNone(self.system.print_season_accuracies())


if __name__ == "__main__":
    unittest.main()
