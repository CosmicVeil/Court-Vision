# Sports-Website

## Model tests

The backend (API routes, the ML model in `app/ml/nba_ai_system.py`, and the scraper features it
depends on) is covered by offline `unittest` suites in `tests/`. They use small synthetic datasets and a small XGBoost
model, so they need no network access, never touch the real `.pkl` files, and the
whole set finishes in about a second.

Run everything from `backend/` with the virtual environment's Python:

```bash
.venv/bin/python -m unittest discover -s tests -t .
```

Run a single suite, class or test:

```bash
.venv/bin/python -m unittest tests.test_model_evaluation
.venv/bin/python -m unittest tests.test_nba_ai_model.TrainingTests
.venv/bin/python -m unittest tests.test_nba_ai_model.TrainingTests.test_beats_naive_mean_baseline
```

Add `-v` to list each test as it runs. Add `-W ignore` to hide the expected
`RuntimeWarning`s from fixtures that leave a feature column empty.

| Suite | Tests | What it checks |
|---|---|---|
| `test_nba_ai_model.py` | 62 | Season-to-season training pairs: back-to-back seasons only, players matched across seasons, bad targets dropped. Feature preparation and that training and inference build identical feature vectors. Clamping predictions to valid ranges. Training learns a real signal, beats a mean baseline, and is deterministic. Improvement and PRA calculations, breakout and top-N rankings, single-player lookup. Save/load round-trips and rejection of outdated or corrupt model files. Startup and retraining flows (run in a temp folder). |
| `test_model_evaluation.py` | 8 | The MAE evaluator itself: it never trains on the season it scores or any later season, 2025-26 is evaluated by default, MAE/RMSE/R²/baseline match a hand-checked example, percentages are reported in points, the JSON report shape is correct, CLI flags override hyperparameters, the model beats the "same as last season" baseline on learnable data, and production training uses every row. |
| `test_scraper_features.py` | 16 | NBA.com feature enrichment, using mocked responses: name matching (accents, suffixes, garbled Basketball Reference names), last-10 averages, trends, std devs, consistency, height/weight, previous-season stats, and that unmatched players get missing values rather than made-up defaults. |
| `test_expanded_predictions.py` | 8 | The 10-stat prediction schema, prediction payloads, and the in-sample per-season report. |
| `test_predictions_cache.py` | 1 | The recommendations included in `predictions_cache.json`. |
| `test_weekly_pra.py` | 10 | Week's Best PRA: Monday–Sunday Eastern week bounds (including DST), only started games count, best single game wins, tie-breaks, preseason included, caching, and the `/api/stats/top-pra` response shape. |
| `test_player_names.py` | 5 | Repairing garbled accented names, idempotence, scraper output, and `scripts/repair_player_names.py` on temp copies. |
| `test_game_detail_api.py` | 3 | `/api/games/<id>` finds today's and upcoming games, and returns 404 for unknown ids. |

API tests build the app with `create_app(load_data=False)`, so they need no data files,
model or database.

## Evaluating the model (MAE)

The unit tests check that the code is correct. `scripts/evaluate_model.py` measures how
accurate the model is, which is the number to optimize.

It runs a walk-forward backtest. For each of the last three seasons (2023-24,
2024-25 and 2025-26), it trains a fresh model with the current settings in
`_build_xgboost_model`, using only earlier seasons. It then predicts that season
and compares the predictions with what players actually did. This is the best
estimate of how accurate the model shown to users will be on 2026-27. The saved
`data/nba_ai_model.pkl` can't be scored this way, because it has already trained on
every past season.

Run from `backend/`:

```bash
.venv/bin/python scripts/evaluate_model.py --fast
.venv/bin/python scripts/evaluate_model.py
.venv/bin/python scripts/evaluate_model.py --fast --n-estimators 500 --max-depth 6 --learning-rate 0.05
.venv/bin/python scripts/evaluate_model.py --seasons 5
```

- `--fast` uses a small model (about a minute). Use it for quick iteration.
- With no flags it uses the production settings. With 10,000 trees this takes about an hour.
- `--n-estimators`, `--max-depth`, `--learning-rate`, `--subsample` and `--colsample-bytree` try other settings without editing code. They can be combined with `--fast`.
- `--seasons N` changes how many recent seasons are scored.
- `--data PATH` and `--output PATH` point at a different dataset or report location.

For each stat, and for each season plus the average, it prints:

- **MAE**: average miss. Percentages (`fg_pct`, `fg3_pct`, `ft_pct`) are in percentage points.
- **RMSE**: like MAE, but punishes big misses more.
- **R²**: how much of the variation the model explains (1 is perfect).
- **Naive MAE**: the MAE of simply predicting "same as last season".
- **Δ% vs naive**: how much better the model is than that baseline.

The **headline ratio** at the bottom is the average of MAE ÷ naive MAE across all
10 stats. Lower is better, and below 1 means the model beats "same as last season".
That is the single number to push down when tuning. When a setting improves it,
put that setting in `_build_xgboost_model` and run `scripts/retrain_nba_ai.py`, then `scripts/generate_predictions_cache.py`.

The evaluator only reads `data/nba_multi_season_data.pkl` and never writes a pickle.
Each run also writes `data/model_evaluation_report.json`, which is git-ignored.

Note: `print_season_accuracies()` and the metrics printed during training are
in-sample, because they score seasons the model trained on. Use
`scripts/evaluate_model.py` for real accuracy.
