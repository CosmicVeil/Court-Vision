# CourtVision

NBA stats and ML predictions dashboard. React + Vite frontend, Flask backend, XGBoost model, PostgreSQL (users, saved players, game archive).
Full details: [README.md](README.md), [backend/README.md](backend/README.md).

## How to work with me

I'm building this project to **learn**: system design, how the code works, and why it's built the way it is. Optimize for my understanding, not just for finishing the task.

### Teach as you go
- **Explain before you build.** For anything non-trivial, give a short plan first: what you'll change, where, and why this approach over the alternatives. Name the trade-off (e.g. "caching in a JSON file is simple but goes stale; a DB table would cost X but give Y").
- **Name the concepts.** When a change uses a pattern or idea (caching, idempotency, walk-forward validation, data leakage, connection pooling, React state lifting, etc.), name it and explain it in a sentence or two, tied to *this* code.
- **Show the data flow.** For features that cross layers, trace the path: scraper → `.pkl`/Postgres → `app/state.py` → API route → `frontend/src/config` endpoint → component. A small ASCII diagram is welcome when it helps.
- **Point at the real code.** Reference `file:line` so I can read it myself, rather than paraphrasing large chunks.
- **Don't hide complexity, don't add it either.** Prefer the simple, readable solution and tell me when a "proper" production design would differ and why.
- **Check my understanding occasionally.** After a bigger change, end with one or two questions or "things to try" that would help me confirm I get it (e.g. "what would break if we removed this lock?").
- If I ask *why*, answer the why. If I propose something flawed, say so and explain — don't just go along with it.

### Always finish with a change report
At the end of any task that modified files, include a **Files changed** section:

```
## Files changed
| File | What changed | Why |
|---|---|---|
| backend/app/api/routes/players.py | Added `limit` clamp in `get_games()` | Prevent huge queries from the popup |
| frontend/src/components/GameLog.jsx | New season dropdown | Let users pick past seasons |

**How to review:** start with X, then Y. Run `<command>` to see it working.
**Not done / follow-ups:** ...
```

- List **every** file created, modified, or deleted (generated files like `predictions_cache.json` too, marked as generated).
- Keep "What changed" concrete (functions/components touched), and "Why" about intent.
- Suggest a reading order for review, and say what was verified (tests run, MAE numbers, browser check) and what wasn't.

## Commands

Backend (run from `backend/`, always with the venv Python):
```bash
.venv/bin/python main.py                                   # API on :5001 (LOW_MEMORY=true for local dev)
.venv/bin/python -m unittest discover -s tests -t .        # offline tests, ~1s
.venv/bin/python scripts/evaluate_model.py --fast          # walk-forward MAE report
.venv/bin/python scripts/retrain_nba_ai.py                 # retrain from cached data
.venv/bin/python scripts/generate_predictions_cache.py     # rebuild predictions_cache.json after retraining
```

Frontend (run from `frontend/`):
```bash
npm run dev      # Vite on :5173
npm test         # node --test tests/*.test.mjs
npm run lint
npm run build
```

Both together: `./start_app.sh` from the repo root.

## Architecture map

- `backend/app/__init__.py` — `create_app()`: Flask setup, CORS, route registration
- `backend/app/state.py` — data and predictions loaded once at startup, shared by routes
- `backend/app/api/routes/` — one file per area (auth, games, players, predictions, saved_players, stats, health)
- `backend/app/services/` — live games (ESPN), recommendations, game archive (Postgres)
- `backend/app/ml/` — XGBoost model (`nba_ai_system.py`) and walk-forward evaluation
- `backend/app/scraping/` — Basketball Reference + NBA.com scraper
- `backend/data/` — `.pkl` datasets, trained model, `predictions_cache.json` (what production serves)
- `frontend/src/pages/` — one component per route; `components/` shared UI; `config/` API endpoints and stat definitions
- `.ai-workflow/` — local Claude-plan → Codex-code → Claude-review pipeline (see its SETUP.md)

## Conventions and gotchas

- **Player IDs are NBA.com person IDs** everywhere (LeBron = 2544). ESPN IDs are kept as `espnId`. Unresolved names get fallback IDs ≥ 900,000,000; fix via `NAME_ALIASES` in `app/utils/player_ids.py`.
- **"Testing" the ML model means held-out per-stat MAE** from `scripts/evaluate_model.py`, not just unit tests. Report before/after MAE for any model or feature change.
- **No data leakage:** features for a game may only use *earlier* games (see the `player_game_features` view).
- Unit tests are offline and use synthetic data — never make them hit the network or the real `.pkl` files.
- Only `scripts/scrape_training_data.py` should create/refresh `nba_multi_season_data.pkl`.
- After retraining, regenerate `predictions_cache.json` or production will serve stale predictions.
- Match the surrounding code's style; don't reformat or refactor unrelated code.

## General rules

- Read the relevant code before changing it; don't guess at APIs or file contents.
- Keep diffs small and focused on the task. Ask before large refactors, new dependencies, or schema changes.
- Verify your work: run the relevant tests, the MAE report for ML changes, and check UI changes in the browser. Say plainly what passed, what failed, and what you couldn't verify.
- Don't commit, push, or delete data unless I ask. Never commit secrets (`backend/.env`).
- When unsure about intent, ask one focused question instead of guessing.
