# Expanded Player Predictions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retrain CourtVision's XGBoost system to predict ten next-season player metrics and display them across the prediction pages and every player popup.

**Architecture:** Keep one versioned `MultiOutputRegressor` and one ordered metric schema in `Backend/nba_ai_system.py`. Flask will add fields to its existing responses, while a shared React metric definition and prediction-grid component will replace the duplicated three-stat popup markup.

**Tech Stack:** Python 3, Flask, pandas, NumPy, scikit-learn, XGBoost, React 19, Vite, Node's built-in test runner, CSS.

## Global Constraints

- Preserve the user's XGBoost settings: `n_estimators=1000`, `max_depth=10`, `learning_rate=0.01`, `subsample=0.8`, and `colsample_bytree=0.8`.
- Keep the current 37-feature input schema and cached 2020–2026 data source.
- Predict PPG, APG, RPG, SPG, BPG, TOV, MPG, FG%, 3P%, and FT% in that order.
- Train shooting percentages as 0–1 fractions and expose them to the frontend as 0–100 percentages.
- Keep all existing API keys and query parameters backward compatible.
- Keep breakout ranking based on PPG, APG, and RPG.
- Do not stage or overwrite unrelated user changes, including `Backend/__pycache__/nba_ai_system.cpython-312.pyc`.

---

### Task 1: Define and test the ten-target model schema

**Files:**
- Create: `Backend/test_expanded_predictions.py`
- Modify: `Backend/nba_ai_system.py:15-140`

**Interfaces:**
- Produces: `MODEL_SCHEMA_VERSION: int`, `FEATURE_COLUMNS: tuple[str, ...]`, `TARGET_SPECS: tuple[dict, ...]`, and `NBAAISystem.prepare_combined_data() -> tuple[np.ndarray, np.ndarray, None]`.
- Target spec keys: `key`, `last_column`, `target_column`, `predicted_column`, `kind`, `minimum`, and `maximum`.

- [ ] **Step 1: Write failing schema and label-order tests**

```python
# Backend/test_expanded_predictions.py
import unittest
from unittest.mock import Mock

import numpy as np

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


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `cd Backend && python -m unittest test_expanded_predictions.ExpandedPredictionSchemaTests -v`

Expected: import failure for `TARGET_SPECS` or a three-value target mismatch.

- [ ] **Step 3: Add the canonical feature and target schemas**

```python
MODEL_SCHEMA_VERSION = 2

FEATURE_COLUMNS = (
    'HEIGHT', 'WEIGHT', 'AGE',
    'PPG_LAST', 'APG_LAST', 'RPG_LAST', 'SPG_LAST', 'BPG_LAST',
    'TOV_LAST', 'FG_PCT_LAST', 'FG3_PCT_LAST', 'FT_PCT_LAST', 'MIN_LAST',
    'GAMES_PLAYED_LAST', 'PPG_PREV', 'APG_PREV', 'RPG_PREV',
    'SPG_PREV', 'BPG_PREV', 'TOV_PREV', 'FG_PCT_PREV', 'FG3_PCT_PREV',
    'FT_PCT_PREV', 'MIN_PREV', 'GAMES_PLAYED_PREV',
    'PPG_LAST_10', 'APG_LAST_10', 'RPG_LAST_10', 'FG_PCT_LAST_10',
    'PPG_TREND', 'APG_TREND', 'RPG_TREND',
    'PPG_STD', 'APG_STD', 'RPG_STD', 'CONSISTENCY_SCORE',
)

TARGET_SPECS = (
    {'key': 'ppg', 'last_column': 'PPG_LAST', 'target_column': 'PPG_NEXT', 'predicted_column': 'PREDICTED_PPG', 'kind': 'rate', 'minimum': 0.0, 'maximum': None},
    {'key': 'apg', 'last_column': 'APG_LAST', 'target_column': 'APG_NEXT', 'predicted_column': 'PREDICTED_APG', 'kind': 'rate', 'minimum': 0.0, 'maximum': None},
    {'key': 'rpg', 'last_column': 'RPG_LAST', 'target_column': 'RPG_NEXT', 'predicted_column': 'PREDICTED_RPG', 'kind': 'rate', 'minimum': 0.0, 'maximum': None},
    {'key': 'spg', 'last_column': 'SPG_LAST', 'target_column': 'SPG_NEXT', 'predicted_column': 'PREDICTED_SPG', 'kind': 'rate', 'minimum': 0.0, 'maximum': None},
    {'key': 'bpg', 'last_column': 'BPG_LAST', 'target_column': 'BPG_NEXT', 'predicted_column': 'PREDICTED_BPG', 'kind': 'rate', 'minimum': 0.0, 'maximum': None},
    {'key': 'tov', 'last_column': 'TOV_LAST', 'target_column': 'TOV_NEXT', 'predicted_column': 'PREDICTED_TOV', 'kind': 'rate', 'minimum': 0.0, 'maximum': None},
    {'key': 'mpg', 'last_column': 'MIN_LAST', 'target_column': 'MIN_NEXT', 'predicted_column': 'PREDICTED_MPG', 'kind': 'minutes', 'minimum': 0.0, 'maximum': 48.0},
    {'key': 'fg_pct', 'last_column': 'FG_PCT_LAST', 'target_column': 'FG_PCT_NEXT', 'predicted_column': 'PREDICTED_FG_PCT', 'kind': 'percentage', 'minimum': 0.0, 'maximum': 1.0},
    {'key': 'fg3_pct', 'last_column': 'FG3_PCT_LAST', 'target_column': 'FG3_PCT_NEXT', 'predicted_column': 'PREDICTED_FG3_PCT', 'kind': 'percentage', 'minimum': 0.0, 'maximum': 1.0},
    {'key': 'ft_pct', 'last_column': 'FT_PCT_LAST', 'target_column': 'FT_PCT_NEXT', 'predicted_column': 'PREDICTED_FT_PCT', 'kind': 'percentage', 'minimum': 0.0, 'maximum': 1.0},
)
```

Set `self.feature_columns = list(FEATURE_COLUMNS)` and `self.target_columns = [spec['target_column'] for spec in TARGET_SPECS]`. Build every training label with:

```python
target_vector = [float(next_player.get(spec['last_column'], 0)) for spec in TARGET_SPECS]
```

In `prepare_data()`, replace the three hard-coded `_NEXT` fallbacks with:

```python
for spec in TARGET_SPECS:
    if spec['target_column'] not in df.columns:
        df[spec['target_column']] = df[spec['last_column']]
```

- [ ] **Step 4: Run the schema tests and verify GREEN**

Run: `cd Backend && python -m unittest test_expanded_predictions.ExpandedPredictionSchemaTests -v`

Expected: 2 tests pass.

- [ ] **Step 5: Commit the schema cycle**

```bash
git add Backend/nba_ai_system.py Backend/test_expanded_predictions.py
git commit -m "feat: define ten-target prediction schema"
```

---

### Task 2: Add safe inference, model compatibility, and cached retraining

**Files:**
- Modify: `Backend/test_expanded_predictions.py`
- Modify: `Backend/nba_ai_system.py:140-530`
- Create: `Backend/retrain_nba_ai.py`

**Interfaces:**
- Produces: `NBAAISystem._clamp_predictions(predictions: np.ndarray) -> np.ndarray`.
- Produces: `NBAAISystem.load_model(filename='nba_ai_model.pkl') -> bool`, which accepts schema version 2 and the exact target order.
- Produces: `NBAAISystem.retrain_from_cache() -> bool`.

- [ ] **Step 1: Write failing clamping and compatibility tests**

```python
import pickle
import tempfile
from pathlib import Path

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
                    "model_type": "xgboost", "model": Mock(), "scaler": Mock(),
                    "feature_columns": list(self.system.feature_columns),
                    "target_columns": ["PPG_NEXT", "APG_NEXT", "RPG_NEXT"],
                }, handle)
            self.assertFalse(self.system.load_model(str(path)))
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `cd Backend && python -m unittest test_expanded_predictions.ExpandedPredictionInferenceTests -v`

Expected: `_clamp_predictions` is missing and the legacy model loads.

- [ ] **Step 3: Implement clamping and versioned persistence**

Implement `_clamp_predictions` by copying the prediction array and applying each target spec's minimum and maximum with `np.clip`. Call it from `predict()`.

Add `'schema_version': MODEL_SCHEMA_VERSION` to `save_model()`. In `load_model()`, require all of:

```python
model_data.get('model_type') == 'xgboost'
model_data.get('schema_version') == MODEL_SCHEMA_VERSION
model_data.get('target_columns') == [spec['target_column'] for spec in TARGET_SPECS]
model_data.get('feature_columns') == list(FEATURE_COLUMNS)
```

Allow `load_model()` to accept either an absolute path or a filename relative to `Backend` so the temporary-file test remains isolated.

- [ ] **Step 4: Add cached retraining and its CLI**

```python
# Backend/retrain_nba_ai.py
from nba_ai_system import nba_ai_system


if __name__ == "__main__":
    if not nba_ai_system.retrain_from_cache():
        raise SystemExit("Model retraining failed")
    print("Saved ten-target model to Backend/nba_ai_model.pkl")
```

`retrain_from_cache()` must load `nba_multi_season_data.pkl`, call `prepare_combined_data()`, train, save, set `model_trained = True`, and clear the prediction cache. Update initialization so an incompatible artifact triggers cached retraining instead of returning `False` or scraping.

- [ ] **Step 5: Report per-target validation metrics**

Replace the three hard-coded R² calculations in `train_model()` with a loop over `TARGET_SPECS`. Store `self.validation_metrics` as:

```python
{
    spec['key']: {
        'mae': float(mean_absolute_error(y_val[:, index], val_pred[:, index])),
        'r2': float(r2_score(y_val[:, index], val_pred[:, index])),
    }
    for index, spec in enumerate(TARGET_SPECS)
}
```

- [ ] **Step 6: Run all backend unit tests and commit**

Run: `cd Backend && python -m unittest test_expanded_predictions -v`

Expected: all tests pass.

```bash
git add Backend/nba_ai_system.py Backend/retrain_nba_ai.py Backend/test_expanded_predictions.py
git commit -m "feat: add versioned ten-stat model inference"
```

---

### Task 3: Expand prediction dataframes and Flask responses

**Files:**
- Modify: `Backend/test_expanded_predictions.py`
- Create: `Backend/test_expanded_api.py`
- Modify: `Backend/nba_ai_system.py:276-475`
- Modify: `Backend/app.py:500-760`

**Interfaces:**
- Produces player stat dictionaries with keys `ppg`, `apg`, `rpg`, `spg`, `bpg`, `tov`, `mpg`, `fg_pct`, `fg3_pct`, and `ft_pct`.
- Produces bundle keys `top_scorers`, `top_assists`, `top_rebounders`, `top_steals`, `top_blocks`, and `breakout_players`.

- [ ] **Step 1: Write failing dataframe and player-payload tests**

```python
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
```

Add `import pandas as pd` to the test module for this synthetic dataframe.

- [ ] **Step 2: Run focused payload tests and verify RED**

Run: `cd Backend && python -m unittest test_expanded_predictions.ExpandedPredictionPayloadTests -v`

Expected: missing expanded keys and bundle lists.

- [ ] **Step 3: Generalize dataframe and player response construction**

In `build_predictions_df()`, include every `last_column`, add each `predicted_column`, and calculate improvement/increase columns in a loop. For percentage metrics, store the internal current and prediction as fractions and calculate improvement as percentage-point difference: `(predicted - current) * 100`.

In `get_player_prediction()`, loop over `TARGET_SPECS`. Convert current and predicted percentages to 0–100 before rounding. Use relative percent change for rate/minutes metrics and percentage-point difference for percentages.

Add `top_steals` sorted by `PREDICTED_SPG` and `top_blocks` sorted by `PREDICTED_BPG` to both the populated and empty bundles.

- [ ] **Step 4: Expand Flask serializers and sort keys**

In `GET /api/players/search-all`, add `tov` and `mpg` to `current_stats`; keep `minutes` as a compatibility alias. The `ml_stats` object will pass through every expanded predicted and improvement key.

In `GET /api/predictions`, emit:

```python
for key in ('ppg', 'apg', 'rpg', 'spg', 'bpg', 'tov'):
    result[f'{key}_last'] = round(float(row[f'{key.upper()}_LAST']), 1)
    result[f'predicted_{key}'] = round(float(row[f'PREDICTED_{key.upper()}']), 1)
result['mpg_last'] = round(float(row['MIN_LAST']), 1)
result['predicted_mpg'] = round(float(row['PREDICTED_MPG']), 1)
for key, column in (('fg_pct', 'FG_PCT'), ('fg3_pct', 'FG3_PCT'), ('ft_pct', 'FT_PCT')):
    result[f'{key}_last'] = round(float(row[f'{column}_LAST']) * 100, 1)
    result[f'predicted_{key}'] = round(float(row[f'PREDICTED_{column}']) * 100, 1)
```

Use an allowlisted dictionary to sort every `predicted_*` field.

- [ ] **Step 5: Add a failing Flask serializer test, then make it pass**

```python
# Backend/test_expanded_api.py
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
            with patch.object(app_module, "AI_AVAILABLE", True), patch.object(app_module, "initialize_nba_ai", return_value=True):
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
```

Run before the serializer change: `cd Backend && python -m unittest test_expanded_api -v`

Expected: missing `predicted_spg` assertion fails.

Run after the serializer change: `cd Backend && python -m unittest test_expanded_api -v`

Expected: test passes.

- [ ] **Step 6: Run tests and commit**

Run: `cd Backend && python -m unittest test_expanded_predictions test_expanded_api -v`

Expected: all tests pass.

```bash
git add Backend/nba_ai_system.py Backend/app.py Backend/test_expanded_predictions.py Backend/test_expanded_api.py
git commit -m "feat: expose expanded prediction metrics"
```

---

### Task 4: Build the shared React prediction grid

**Files:**
- Create: `src/config/predictionStats.js`
- Create: `src/components/PlayerPredictionGrid.jsx`
- Create: `src/components/PlayerPredictionGrid.css`
- Create: `tests/expanded-predictions.test.mjs`

**Interfaces:**
- Produces: `PREDICTION_GROUPS`, `PREDICTION_STATS`, `toPredictionPageStats(player)`.
- Produces: `<PlayerPredictionGrid currentStats predictionStats improvements />`.

- [ ] **Step 1: Write failing source-contract tests**

```javascript
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const config = readFileSync(new URL("../src/config/predictionStats.js", import.meta.url), "utf8");
const grid = readFileSync(new URL("../src/components/PlayerPredictionGrid.jsx", import.meta.url), "utf8");

test("prediction config defines all ten metrics", () => {
  for (const key of ["ppg", "apg", "rpg", "spg", "bpg", "tov", "mpg", "fg_pct", "fg3_pct", "ft_pct"]) {
    assert.match(config, new RegExp(`key: ["']${key}["']`));
  }
});

test("shared grid labels percentage changes as percentage points", () => {
  assert.match(grid, /changeUnit === ["']pp["']/);
  assert.match(grid, /PlayerPredictionGrid/);
});
```

- [ ] **Step 2: Run the frontend test and verify RED**

Run: `node --test tests/expanded-predictions.test.mjs`

Expected: file-not-found failure.

- [ ] **Step 3: Create the canonical frontend metric configuration**

Define two groups. Production contains PPG/APG/RPG/SPG/BPG/TOV/MPG with change unit `%`; Shooting contains FG%/3P%/FT% with change unit `pp`. Every definition includes `key`, `label`, `unit`, `changeUnit`, `currentField`, and `predictedField`.

`toPredictionPageStats(player)` must map `*_last` fields into `currentStats`, `predicted_*` fields into `predictionStats`, and calculate changes with a zero-safe helper.

- [ ] **Step 4: Implement the shared grid and responsive CSS**

Render each group heading and metric card. Use `0` only when a value is nullish, preserve legitimate zeroes, format to one decimal, and apply positive/negative badge classes. Render shooting changes as `+2.3 pp` and other changes as `+4.1%`.

CSS must use `grid-template-columns: repeat(auto-fit, minmax(180px, 1fr))`, keep the existing orange accent variables, and reduce the minimum card width below 600px.

- [ ] **Step 5: Run test, build, and commit**

Run: `node --test tests/expanded-predictions.test.mjs`

Expected: tests pass.

Run: `npm run build`

Expected: Vite build exits 0.

```bash
git add src/config/predictionStats.js src/components/PlayerPredictionGrid.jsx src/components/PlayerPredictionGrid.css tests/expanded-predictions.test.mjs
git commit -m "feat: add shared player prediction grid"
```

---

### Task 5: Use the shared grid in every player popup and prediction card

**Files:**
- Modify: `src/components/home.jsx:1-665`
- Modify: `src/components/Stats.jsx:1-700`
- Modify: `src/components/LiveGames.jsx:1-425`
- Modify: `src/components/Favourites.jsx:1-375`
- Modify: `src/components/Recommendations.jsx:1-450`
- Modify: `src/components/RecommendationChart.jsx:1-325`
- Modify: `src/components/Predictions.jsx:1-490`
- Modify: `src/components/Predictions.css:130-470`
- Modify: `tests/expanded-predictions.test.mjs`

**Interfaces:**
- Consumes: `PlayerPredictionGrid` and `toPredictionPageStats` from Task 4.
- Produces: consistent ten-stat AI tabs on all seven popup entry points and ten-stat cards on `/predictions`.

- [ ] **Step 1: Extend the frontend contract test to cover all consumers**

```javascript
const consumers = ["home.jsx", "Stats.jsx", "LiveGames.jsx", "Favourites.jsx", "Recommendations.jsx", "RecommendationChart.jsx", "Predictions.jsx"];

test("every player popup uses the shared prediction grid", () => {
  for (const filename of consumers) {
    const source = readFileSync(new URL(`../src/components/${filename}`, import.meta.url), "utf8");
    assert.match(source, /PlayerPredictionGrid/);
  }
});

test("legacy three-stat popup loops are gone", () => {
  for (const filename of consumers) {
    const source = readFileSync(new URL(`../src/components/${filename}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /\[['"]ppg['"], ['"]apg['"], ['"]rpg['"]\]\.map/);
  }
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test tests/expanded-predictions.test.mjs`

Expected: each existing consumer fails the shared-grid assertion.

- [ ] **Step 3: Replace popup prediction markup**

Import `PlayerPredictionGrid` in every consumer. Replace each hard-coded PPG/APG/RPG prediction block with:

```jsx
<PlayerPredictionGrid
  currentStats={selectedPlayer.current_stats}
  predictionStats={selectedPlayer.ml_stats.predicted_stats}
  improvements={selectedPlayer.ml_stats.improvements}
/>
```

Add `tov: 0` and `mpg: 0` to every fallback `current_stats` object. Preserve `minutes: 0` for history/current-stat compatibility.

- [ ] **Step 4: Expand dedicated prediction cards and sorting**

Use `toPredictionPageStats(player)` and `PlayerPredictionGrid` in each `/predictions` player card. Replace the three sort buttons with a select whose options come from `PREDICTION_STATS`, while keeping name sorting. Pass the selected `predicted_<key>` value to the unchanged API query contract.

Update `Predictions.css` for the grouped grid and mobile select width. Remove styles only when no remaining element uses them.

- [ ] **Step 5: Run frontend tests, lint, and build**

Run: `node --test tests/*.test.mjs`

Expected: all Node tests pass.

Run: `npm run lint`

Expected: ESLint exits 0.

Run: `npm run build`

Expected: Vite build exits 0.

- [ ] **Step 6: Commit popup and prediction-page integration**

```bash
git add src/components/home.jsx src/components/Stats.jsx src/components/LiveGames.jsx src/components/Favourites.jsx src/components/Recommendations.jsx src/components/RecommendationChart.jsx src/components/Predictions.jsx src/components/Predictions.css tests/expanded-predictions.test.mjs
git commit -m "feat: show ten metrics in player predictions"
```

---

### Task 6: Add top steals and blocks to the home AI panel

**Files:**
- Modify: `src/components/AIPredictions.jsx:1-215`
- Modify: `src/components/AIPredictions.css:45-110`
- Modify: `tests/expanded-predictions.test.mjs`

**Interfaces:**
- Consumes: `top_steals` and `top_blocks` arrays from `GET /api/ai-predictions`.
- Produces: `steals` and `blocks` tabs with SPG and BPG comparisons.

- [ ] **Step 1: Add failing tab contract tests**

```javascript
test("home AI panel exposes steals and blocks tabs", () => {
  const source = readFileSync(new URL("../src/components/AIPredictions.jsx", import.meta.url), "utf8");
  assert.match(source, /top_steals/);
  assert.match(source, /top_blocks/);
  assert.match(source, /PREDICTED_SPG/);
  assert.match(source, /PREDICTED_BPG/);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test tests/expanded-predictions.test.mjs`

Expected: missing top-steals/top-blocks assertions fail.

- [ ] **Step 3: Implement the tabs**

Add `top_steals` and `top_blocks` to `EMPTY_PREDICTIONS`. Add switch cases for `steals` and `blocks`, mapping current and predicted SPG/BPG. Add Top Steals and Top Blocks tab entries. Adjust tab gap/padding so six tabs wrap cleanly.

- [ ] **Step 4: Verify and commit**

Run: `node --test tests/*.test.mjs`

Expected: all tests pass.

Run: `npm run build`

Expected: Vite build exits 0.

```bash
git add src/components/AIPredictions.jsx src/components/AIPredictions.css tests/expanded-predictions.test.mjs
git commit -m "feat: add steals and blocks prediction leaders"
```

---

### Task 7: Retrain the artifact and run end-to-end verification

**Files:**
- Modify: `Backend/nba_ai_model.pkl`
- Verify: `Backend/nba_multi_season_data.pkl`
- Verify: all files changed by Tasks 1–6

**Interfaces:**
- Consumes: cached multi-season data and the versioned ten-target trainer.
- Produces: a schema-version-2 `Backend/nba_ai_model.pkl` with ten estimators and the user's tuned hyperparameters.

- [ ] **Step 1: Run the complete backend test suite before training**

Run: `cd Backend && python -m unittest test_expanded_predictions test_api -v`

Expected: expanded unit tests and existing API smoke tests pass.

- [ ] **Step 2: Retrain once from cached data**

Run: `cd Backend && python retrain_nba_ai.py`

Expected: training finishes, reports MAE and R² for all ten targets, and saves `nba_ai_model.pkl` without scraping.

- [ ] **Step 3: Verify artifact metadata and prediction ranges**

Run: `cd Backend && python -m unittest test_expanded_predictions -v`

Expected: all tests pass with the saved artifact present.

Run: `cd Backend && python -c "from nba_ai_system import NBAAISystem; s=NBAAISystem(); assert s.initialize_system(); p=s.get_player_prediction('LeBron James'); assert len(p['predicted_stats']) == 10; print(p)"`

Expected: one player payload with ten finite prediction values; percentages fall within 0–100 and MPG within 0–48.

- [ ] **Step 4: Run final frontend verification**

Run: `node --test tests/*.test.mjs`

Expected: all tests pass.

Run: `npm run lint`

Expected: ESLint exits 0.

Run: `npm run build`

Expected: Vite build exits 0.

- [ ] **Step 5: Inspect the final diff and backend-file list**

Run: `git diff --check`

Expected: no whitespace errors.

Run: `git status --short`

Expected: only intentional source/test/model changes and the user's pre-existing bytecode change appear.

Record every changed backend path for the handoff, distinguishing Python source, tests, and the generated model artifact.

- [ ] **Step 6: Commit the trained artifact**

```bash
git add Backend/nba_ai_model.pkl
git commit -m "chore: retrain ten-target NBA prediction model"
```
