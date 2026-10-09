import ast
import os
import pickle
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

import app.ml.nba_ai_system as nba_module
from app import config
from app.ml.nba_ai_system import NBAAISystem, SEASONS_TO_SCRAPE
from scripts import retrain_nba_ai, scrape_training_data
from tests.test_nba_ai_model import fast_model, make_synthetic_league


class AcquisitionStageTests(unittest.TestCase):
    def setUp(self):
        self.env_patch = patch.dict(os.environ, {}, clear=False)
        self.env_patch.start()
        self.addCleanup(self.env_patch.stop)
        os.environ.pop(config.MODEL_FILE_ENV, None)

    def test_acquisition_is_the_network_stage_and_does_not_train(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / "training.pkl"
            system = NBAAISystem()
            system.scraper = Mock()
            system.scraper.scrape_multiple_seasons.return_value = make_synthetic_league(n_players=2)
            system.train_model = Mock(side_effect=AssertionError("must not train"))

            self.assertTrue(system.acquire_training_data(data_file=str(output)))
            system.scraper.scrape_multiple_seasons.assert_called_once_with(SEASONS_TO_SCRAPE)
            self.assertTrue(output.exists())
            system.train_model.assert_not_called()
            self.assertFalse((Path(tmp) / config.MODEL_FILE).exists())

    def test_empty_scrape_writes_nothing(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / "training.pkl"
            system = NBAAISystem()
            system.scraper = Mock()
            system.scraper.scrape_multiple_seasons.return_value = {}
            self.assertFalse(system.acquire_training_data(data_file=str(output)))
            self.assertFalse(output.exists())

    def test_scrape_script_passes_seasons_and_output(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / "training.pkl"
            scraper = Mock()
            scraper.scrape_multiple_seasons.return_value = make_synthetic_league(n_players=2)
            with patch.object(nba_module, "NBAWebScraper", return_value=scraper):
                self.assertEqual(
                    scrape_training_data.main(
                        ["--output", str(output), "--seasons", "2024", "2025"]
                    ),
                    0,
                )
            scraper.scrape_multiple_seasons.assert_called_once_with([2024, 2025])
            self.assertTrue(output.exists())

    def test_scrape_script_failure_is_nonzero_and_writes_nothing(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / "training.pkl"
            scraper = Mock()
            scraper.scrape_multiple_seasons.return_value = {}
            with patch.object(nba_module, "NBAWebScraper", return_value=scraper):
                with self.assertRaises(SystemExit):
                    scrape_training_data.main(["--output", str(output)])
            self.assertFalse(output.exists())

    def test_scrape_script_default_output_uses_config_path(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            scraper = Mock()
            scraper.scrape_multiple_seasons.return_value = make_synthetic_league(n_players=2)
            with patch.object(config, "DATA_DIR", root), patch.object(
                nba_module, "NBAWebScraper", return_value=scraper
            ):
                self.assertEqual(scrape_training_data.main([]), 0)
            self.assertTrue((root / config.MULTI_SEASON_DATA_FILE).exists())


class ScraperIsolationTests(unittest.TestCase):
    def test_only_acquisition_calls_multi_season_scraper(self):
        backend = Path(__file__).resolve().parents[1]
        callers = []
        for root in (backend / "app", backend / "scripts"):
            for path in root.rglob("*.py"):
                tree = ast.parse(path.read_text())
                parents = {}
                for node in ast.walk(tree):
                    for child in ast.iter_child_nodes(node):
                        parents[child] = node
                    if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
                        if node.func.attr == "scrape_multiple_seasons":
                            parent = node
                            while parent in parents and not isinstance(parent, (ast.FunctionDef, ast.AsyncFunctionDef)):
                                parent = parents[parent]
                            callers.append((path.name, getattr(parent, "name", None)))
        self.assertEqual(callers, [("nba_ai_system.py", "acquire_training_data")])

    def test_only_acquisition_writes_plain_pickle_data(self):
        path = Path(nba_module.__file__)
        tree = ast.parse(path.read_text())
        parents = {}
        writers = []
        for node in ast.walk(tree):
            for child in ast.iter_child_nodes(node):
                parents[child] = node
            if (
                isinstance(node, ast.Call)
                and isinstance(node.func, ast.Name)
                and node.func.id == "open"
                and len(node.args) > 1
                and isinstance(node.args[1], ast.Constant)
                and "w" in node.args[1].value
            ):
                parent = node
                while parent in parents and not isinstance(parent, ast.FunctionDef):
                    parent = parents[parent]
                writers.append(parent.name)
        self.assertEqual(writers, ["acquire_training_data"])


class RetrainScriptTests(unittest.TestCase):
    def setUp(self):
        self.env_patch = patch.dict(os.environ, {}, clear=False)
        self.env_patch.start()
        self.addCleanup(self.env_patch.stop)
        os.environ.pop(config.MODEL_FILE_ENV, None)

    def test_explicit_output_leaves_production_untouched(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            data = root / "alternate.pkl"
            output = root / "candidate" / "model.pkl"
            production = root / config.MODEL_FILE
            sentinel = b"production sentinel"
            production.write_bytes(sentinel)
            with open(data, "wb") as handle:
                pickle.dump(make_synthetic_league(n_players=20), handle)

            before = sorted(path.relative_to(root) for path in root.rglob("*"))
            with fast_model(), patch.object(config, "DATA_DIR", root), patch.object(
                nba_module, "DATA_DIR", str(root)
            ), patch("builtins.print") as output_log:
                self.assertEqual(
                    retrain_nba_ai.main(["--data", str(data), "--output", str(output)]), 0
                )
            self.assertTrue(output.exists())
            self.assertEqual(production.read_bytes(), sentinel)
            self.assertTrue(NBAAISystem().load_model(str(output)))
            self.assertRegex(" ".join(str(call) for call in output_log.call_args_list), r"Trained in \d+\.\ds")
            after = {path.relative_to(root) for path in root.rglob("*")}
            self.assertEqual(after, set(before) | {Path("candidate"), Path("candidate/model.pkl")})

    def test_defaults_use_config_data_and_production_paths(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            data = root / config.MULTI_SEASON_DATA_FILE
            with open(data, "wb") as handle:
                pickle.dump(make_synthetic_league(n_players=11), handle)
            with fast_model(), patch.object(config, "DATA_DIR", root), patch.object(
                nba_module, "DATA_DIR", str(root)
            ), patch("builtins.print") as output_log:
                self.assertEqual(retrain_nba_ai.main([]), 0)
            self.assertTrue((root / config.MODEL_FILE).exists())
            output = " ".join(str(call) for call in output_log.call_args_list)
            self.assertIn("Training completed on 33 rows", output)
            self.assertIn("Trained in", output)

    def test_missing_data_exits_without_output(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / "model.pkl"
            with self.assertRaises(SystemExit):
                retrain_nba_ai.main(["--data", str(Path(tmp) / "missing.pkl"), "--output", str(output)])
            self.assertFalse(output.exists())


class ModelPathOverrideTests(unittest.TestCase):
    def setUp(self):
        self.env_patch = patch.dict(os.environ, {}, clear=False)
        self.env_patch.start()
        self.addCleanup(self.env_patch.stop)
        os.environ.pop(config.MODEL_FILE_ENV, None)

    def test_default_model_path_is_production_path(self):
        with tempfile.TemporaryDirectory() as tmp, patch.object(
            nba_module, "DATA_DIR", tmp
        ):
            self.assertEqual(
                nba_module.resolve_model_file(),
                os.path.join(tmp, config.MODEL_FILE),
            )

    def test_relative_environment_model_path_resolves_to_absolute_path(self):
        relative = os.path.join("candidate-models", "nba.pkl")
        with patch.dict(os.environ, {config.MODEL_FILE_ENV: relative}):
            self.assertEqual(
                nba_module.resolve_model_file(),
                os.path.abspath(relative),
            )

    def test_load_saved_model_honors_environment_model_path(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            data = root / config.MULTI_SEASON_DATA_FILE
            candidate = root / "candidate.pkl"
            with open(data, "wb") as handle:
                pickle.dump(make_synthetic_league(n_players=20), handle)

            with fast_model():
                self.assertTrue(NBAAISystem().train_from_cache(str(data), str(candidate)))

            with patch.dict(os.environ, {config.MODEL_FILE_ENV: str(candidate)}):
                serving = NBAAISystem()
                self.assertTrue(serving.load_saved_model())
                self.assertIsNotNone(serving.model)

    def test_environment_model_path_is_loaded(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            data = root / config.MULTI_SEASON_DATA_FILE
            candidate = root / "candidate.pkl"
            with open(data, "wb") as handle:
                pickle.dump(make_synthetic_league(n_players=20), handle)

            trainer = NBAAISystem()
            with fast_model():
                self.assertTrue(trainer.train_from_cache(str(data), str(candidate)))

            with patch.object(nba_module, "DATA_DIR", str(root)), patch.dict(
                os.environ, {config.MODEL_FILE_ENV: str(candidate)}
            ):
                serving = NBAAISystem()
                serving.train_model = Mock(side_effect=AssertionError("must load candidate"))
                self.assertTrue(serving.initialize_system())
                self.assertTrue(serving.model_trained)
                self.assertEqual(nba_module.resolve_model_file(), os.path.abspath(candidate))
                self.assertFalse((root / config.MODEL_FILE).exists())

    def test_missing_candidate_is_created_without_touching_production(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            data = root / config.MULTI_SEASON_DATA_FILE
            candidate = root / "candidate.pkl"
            production = root / config.MODEL_FILE
            production.write_bytes(b"production")
            with open(data, "wb") as handle:
                pickle.dump(make_synthetic_league(n_players=20), handle)
            with patch.object(nba_module, "DATA_DIR", str(root)), patch.dict(
                os.environ, {config.MODEL_FILE_ENV: str(candidate)}
            ), fast_model():
                self.assertTrue(NBAAISystem().initialize_system())
            self.assertTrue(candidate.exists())
            self.assertEqual(production.read_bytes(), b"production")

    def test_global_startup_helpers_never_scrape(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            with open(root / config.MULTI_SEASON_DATA_FILE, "wb") as handle:
                pickle.dump(make_synthetic_league(n_players=20), handle)
            system = NBAAISystem()
            system.scraper = Mock()
            with patch.object(nba_module, "DATA_DIR", str(root)), patch.object(
                nba_module, "nba_ai_system", system
            ), fast_model():
                self.assertTrue(nba_module.initialize_nba_ai())
                nba_module.warm_predictions_cache()
            system.scraper.scrape_multiple_seasons.assert_not_called()
            self.assertIsNotNone(system._predictions_df)
