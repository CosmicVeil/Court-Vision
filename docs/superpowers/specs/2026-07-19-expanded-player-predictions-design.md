# Expanded Player Predictions Design

## Goal

Extend CourtVision's next-season model and user interface from three predicted metrics to ten while keeping the existing API fields compatible.

The model will predict PPG, APG, RPG, SPG, BPG, turnovers per game, minutes per game, FG%, 3P%, and FT% from the existing feature vector and cached multi-season data. Training will use the user's updated XGBoost parameters: 1,000 estimators, maximum depth 10, learning rate 0.01, subsample 0.8, and column subsample 0.8.

## Model and Data Flow

`Backend/nba_ai_system.py` will remain the sole owner of training and inference. One `MultiOutputRegressor` will wrap the configured `XGBRegressor` and learn ten next-season targets from consecutive-season player pairs.

Training targets will map to the next season's stored fields:

| API key | Training source | Display unit |
| --- | --- | --- |
| `ppg` | `PPG_LAST` | points/game |
| `apg` | `APG_LAST` | assists/game |
| `rpg` | `RPG_LAST` | rebounds/game |
| `spg` | `SPG_LAST` | steals/game |
| `bpg` | `BPG_LAST` | blocks/game |
| `tov` | `TOV_LAST` | turnovers/game |
| `mpg` | `MIN_LAST` | minutes/game |
| `fg_pct` | `FG_PCT_LAST` | percent |
| `fg3_pct` | `FG3_PCT_LAST` | percent |
| `ft_pct` | `FT_PCT_LAST` | percent |

The model will train percentages as fractions between 0 and 1, matching the stored data. Response formatting will convert them to the 0–100 scale used by the React views. Inference will clamp predictions to valid basketball ranges: nonnegative counting stats, minutes from 0 through 48, and percentages from 0 through 100 after conversion.

The saved model metadata will include an explicit schema version and the ordered target list. Startup will reject an older three-output artifact. The writer will gzip-compress the pickle because the tuned ten-output model exceeds normal repository file-size limits without compression; the loader will continue to accept legacy uncompressed pickles. A retraining command will use the cached `nba_multi_season_data.pkl` file and replace `nba_ai_model.pkl` without scraping when the cache contains the required seasons and fields.

## Backend Contract

The existing `current_stats`, `predicted_stats`, and `improvements` objects will keep their PPG, APG, and RPG keys. Each object will gain SPG, BPG, TOV, MPG, FG%, 3P%, and FT% keys.

Counting-stat improvement values will remain relative percentages. Shooting changes will represent percentage-point movement and the frontend will label them `pp`.

`GET /api/predictions` will add current and predicted values for all ten metrics. It will accept sorting by every predicted metric. Existing query parameters and fields will continue to work.

`GET /api/ai-predictions` will retain top scorers, assists, rebounders, and breakout players, then add top steals and top blocks lists. Breakout ranking will continue to use PPG, APG, and RPG so the existing meaning of that category does not change.

`GET /api/players/search-all` and `GET /api/player-prediction/<name>` will expose the same expanded prediction object used throughout the UI.

## Frontend

A shared, data-driven prediction grid will render all ten metrics in every player popup. The grid will group PPG, APG, RPG, SPG, BPG, TOV, and MPG under per-game production, with FG%, 3P%, and FT% under shooting. Each item will show current value, predicted value, and change.

Home, Stats, Live Games, Favourites, Recommendations, the recommendation chart, and the dedicated Predictions view will use that shared component. Fallback player objects will contain all ten current fields so a partial API response does not crash a popup.

The dedicated Predictions page will show the same two groups on each player card and offer sorting across all predicted metrics. Responsive rules will prevent the larger metric set from overflowing narrow screens.

The home-page AI Predictions panel will add Top Steals and Top Blocks tabs. Its existing tabs and click-through behavior will remain unchanged.

## Errors and Compatibility

The API will return a clear model-schema error if a ten-target model is unavailable instead of indexing a three-column prediction array. Missing source values will use the same deterministic fallbacks during training and inference. The code will define feature and target schemas once so training cannot drift from inference.

Existing consumers that read only PPG, APG, and RPG will continue to work. The API will only add fields and accepted sort keys.

## Testing and Validation

Backend unit tests will cover target order, consecutive-season label construction, output clamping and percentage conversion, saved-model compatibility, expanded player payloads, expanded paginated predictions, and top steals/blocks bundles.

Frontend tests will cover the shared grid's labels, values, units, and missing-data behavior. Build and lint checks will catch integration errors across all popup consumers.

The final training run will report MAE and R² for each of the ten targets. A smoke test will load the saved artifact, generate a known player's prediction, call the affected Flask endpoints, and confirm all ten current and predicted fields contain finite values in their valid ranges.

## Scope

This change will not add a new data source, scrape new seasons, tune separate models per metric, or change the existing breakout definition. It will preserve the user's regressor settings and the current 36-feature input schema.
