# Cached Recommendations Design

## Goal

Serve CourtVision recommendations from `predictions_cache.json` on Render so normal recommendation requests do not load the full AI model. Preserve the full model as a fallback when cached recommendations are missing or invalid.

## Cache generation

`Backend/generate_predictions_cache.py` will generate recommendation lists for `PPG`, `APG`, `RPG`, and `PRA` after initializing the model. It will store them under a top-level `recommendations` object alongside the existing `bundle`, `players`, and `all_players_list` data.

The generated shape will be:

```json
{
  "bundle": {},
  "players": {},
  "all_players_list": [],
  "recommendations": {
    "PPG": [],
    "APG": [],
    "RPG": [],
    "PRA": []
  }
}
```

## API behavior

`GET /api/recommendations/<stat>` will retain the existing stat validation.

- On Render, when the requested cached recommendation is present and is a list, return it directly.
- On Render, when the cache entry is missing or invalid, fall back to `get_top_performers(stat)` and allow the full model to load.
- Outside Render, continue using `get_top_performers(stat)` as before.

An empty cached list is valid and must be returned without loading the model.

## Error handling

Existing endpoint error handling remains in place. If both the cache path and model-backed fallback fail, the endpoint returns its current `500` JSON error response.

## Verification

Automated tests will cover:

1. A Render request returns cached recommendations without calling the model-backed function.
2. A missing Render cache entry calls the model-backed fallback.
3. An invalid Render cache entry calls the model-backed fallback.
4. An empty cached list is treated as valid.
5. Cache generation writes recommendation keys for all four supported statistics.

After implementation, regenerate `Backend/predictions_cache.json` and run the relevant backend test suite.
