# Cached Recommendations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store PPG, APG, RPG, and PRA recommendations in `predictions_cache.json` and serve them from that cache on Render, with the full model as fallback.

**Architecture:** Extend the offline cache generator with one focused recommendation-building function and a new top-level `recommendations` cache key. The Flask endpoint validates and returns a cached list when available; missing or malformed cache data follows the existing model-backed `get_top_performers` path.

**Tech Stack:** Python 3, Flask, `unittest`, `unittest.mock`, JSON, XGBoost-backed existing recommendation service.

## Global Constraints

- Cache keys are exactly `PPG`, `APG`, `RPG`, and `PRA`.
- An empty cached recommendation list is valid and must not invoke the model fallback.
- Missing or invalid cached recommendation data on Render must invoke the full model fallback.
- Local development must continue using the full model-backed recommendation path.
- Preserve all unrelated working-tree changes.

---

### Task 1: Cache generation includes recommendations

**Files:**
- Create: `Backend/test_predictions_cache.py`
- Modify: `Backend/generate_predictions_cache.py:1-80`

**Interfaces:**
- Consumes: existing `recommendations.get_top_performers(stat: str) -> list`.
- Produces: `build_recommendations(getter=get_top_performers) -> dict[str, list]` and the top-level cache key `recommendations`.

- [ ] **Step 1: Write the failing generator test**

```python
import unittest

from generate_predictions_cache import build_recommendations


class PredictionsCacheGenerationTests(unittest.TestCase):
    def test_build_recommendations_generates_all_supported_stats(self):
        calls = []

        def fake_getter(stat):
            calls.append(stat)
            return [{"stat": stat}]

        actual = build_recommendations(fake_getter)

        self.assertEqual(calls, ["PPG", "APG", "RPG", "PRA"])
        self.assertEqual(actual, {
            "PPG": [{"stat": "PPG"}],
            "APG": [{"stat": "APG"}],
            "RPG": [{"stat": "RPG"}],
            "PRA": [{"stat": "PRA"}],
        })


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run the test and confirm the missing interface failure**

Run: `python3 -m unittest test_predictions_cache.py`

Expected: FAIL because `build_recommendations` is not defined.

- [ ] **Step 3: Implement recommendation cache generation**

Add to `generate_predictions_cache.py`:

```python
from recommendations import get_top_performers

RECOMMENDATION_STATS = ("PPG", "APG", "RPG", "PRA")


def build_recommendations(getter=get_top_performers):
    return {stat: getter(stat) for stat in RECOMMENDATION_STATS}
```

Add the generated value to the existing cache dictionary:

```python
cache = {
    "bundle": bundle,
    "players": {p["name"].lower(): p for p in all_players},
    "all_players_list": all_players,
    "recommendations": build_recommendations(),
}
```

- [ ] **Step 4: Run the generator unit test**

Run: `python3 -m unittest test_predictions_cache.py`

Expected: PASS.

- [ ] **Step 5: Commit the independently tested generator change**

```bash
git add Backend/generate_predictions_cache.py Backend/test_predictions_cache.py
git commit -m "feat: cache AI recommendations"
```

### Task 2: Render endpoint consumes cached recommendations

**Files:**
- Modify: `Backend/test_expanded_api.py:9-44`
- Modify: `Backend/app.py:826-844`

**Interfaces:**
- Consumes: `predictions_cache["recommendations"][stat_clean]`, where the value must be a list.
- Produces: unchanged `GET /api/recommendations/<stat>` JSON response contract.

- [ ] **Step 1: Write failing endpoint tests**

Add a new `CachedRecommendationApiTests` class:

```python
class CachedRecommendationApiTests(unittest.TestCase):
    def _request(self, cache):
        with patch.object(app_module, "AI_AVAILABLE", True), \
             patch.object(app_module, "IS_RENDER", True), \
             patch.object(app_module, "predictions_cache", cache), \
             patch.object(app_module, "get_top_performers", return_value=[{"source": "model"}]) as model_getter:
            response = app_module.app.test_client().get("/api/recommendations/ppg")
        return response, model_getter

    def test_returns_cached_recommendations_without_loading_model(self):
        response, model_getter = self._request({
            "recommendations": {"PPG": [{"source": "cache"}]}
        })
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), [{"source": "cache"}])
        model_getter.assert_not_called()

    def test_empty_cached_recommendations_are_valid(self):
        response, model_getter = self._request({"recommendations": {"PPG": []}})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), [])
        model_getter.assert_not_called()

    def test_missing_cached_recommendations_load_model(self):
        response, model_getter = self._request({"recommendations": {}})
        self.assertEqual(response.get_json(), [{"source": "model"}])
        model_getter.assert_called_once_with("PPG")

    def test_invalid_cached_recommendations_load_model(self):
        response, model_getter = self._request({"recommendations": {"PPG": None}})
        self.assertEqual(response.get_json(), [{"source": "model"}])
        model_getter.assert_called_once_with("PPG")
```

- [ ] **Step 2: Run endpoint tests and verify the cache-path test fails**

Run: `python3 -m unittest test_expanded_api.CachedRecommendationApiTests`

Expected: FAIL because the endpoint always calls `get_top_performers`.

- [ ] **Step 3: Implement cache-first endpoint selection**

Replace the route's model-only selection with:

```python
recommendations_cache = (
    predictions_cache.get("recommendations", {})
    if isinstance(predictions_cache, dict)
    else {}
)
cached_data = (
    recommendations_cache.get(stat_clean)
    if isinstance(recommendations_cache, dict)
    else None
)

if (
    IS_RENDER
    and isinstance(recommendations_cache, dict)
    and stat_clean in recommendations_cache
    and isinstance(cached_data, list)
):
    data = cached_data
else:
    data = get_top_performers(stat_clean)
```

- [ ] **Step 4: Run all endpoint tests**

Run: `python3 -m unittest test_expanded_api.py`

Expected: PASS.

- [ ] **Step 5: Commit the independently tested endpoint change**

```bash
git add Backend/app.py Backend/test_expanded_api.py
git commit -m "feat: serve cached recommendations on Render"
```

### Task 3: Regenerate and verify the production cache

**Files:**
- Modify: `Backend/predictions_cache.json`

**Interfaces:**
- Consumes: the current trained model and season data through `generate_predictions_cache.py`.
- Produces: a committed JSON cache containing recommendation lists under all four required keys.

- [ ] **Step 1: Generate the updated cache**

Run: `python3 generate_predictions_cache.py`

Expected: the script reports 583 players written to `predictions_cache.json`.

- [ ] **Step 2: Validate the cache schema and content**

Run:

```bash
python3 -c 'import json; data=json.load(open("predictions_cache.json")); recs=data["recommendations"]; assert set(recs)=={"PPG","APG","RPG","PRA"}; assert all(isinstance(recs[key], list) for key in recs); print({key: len(value) for key, value in recs.items()})'
```

Expected: four recommendation counts are printed and every value is a list.

- [ ] **Step 3: Run the relevant backend regression suite**

Run: `python3 -m unittest test_predictions_cache.py test_expanded_api.py test_expanded_predictions.py`

Expected: all tests pass.

- [ ] **Step 4: Review scope**

Run: `git diff -- Backend/generate_predictions_cache.py Backend/app.py Backend/test_predictions_cache.py Backend/test_expanded_api.py Backend/predictions_cache.json`

Expected: only the approved cache generation, endpoint behavior, tests, and generated cache changes appear.

- [ ] **Step 5: Commit the generated cache**

```bash
git add Backend/predictions_cache.json
git commit -m "chore: regenerate prediction cache"
```
