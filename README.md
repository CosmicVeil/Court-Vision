# CourtVision

CourtVision is a full-stack NBA analytics platform for live scores, player and team statistics, standings, season projections, and next-game predictions. It combines a responsive React interface with a Flask API, PostgreSQL-backed accounts and game history, and two independently evaluated XGBoost prediction pipelines.

[Open the live site](https://courtvision.works) | [Read the backend and model documentation](backend/README.md) | [View the frontend design handoff](docs/frontend-redesign/README.md)

## What the site offers

- **Player database:** Search, filter, sort, and paginate current and historical player statistics. Switch between table and card views and open a player profile for season averages, career history, game logs, injuries, and available projections.
- **Live and historical games:** Follow today's slate, upcoming games, and past results. Game pages include status-aware scoreboards, period scoring, team and player box scores, leaders, fantasy points, venue information, and linked team pages.
- **Standings and team pages:** Browse both conferences, then open a team page for its roster, record, recent form, leaders, schedule, and player statistics.
- **Season predictions:** Explore projected per-game averages for points, rebounds, assists, steals, blocks, turnovers, minutes, shooting percentages, and fantasy points.
- **Next-game predictions:** Review projected player lines for the next three NBA game days. Predictions incorporate recent form, opponent context, rest, schedule, betting lines, and known absences.
- **Recommendations:** Compare projected leaders, breakout candidates, and players expected to finish above or below their recent averages.
- **Accounts and personalization:** Create an account to unlock full prediction data, save favourite players, choose light or dark appearance, and use FanDuel, DraftKings, Yahoo, ESPN, or custom fantasy scoring.
- **Search and discovery:** Find any player from the home page and see live games, upcoming matchups, the week's best PRA performance, and model highlights.
- **Responsive and accessible UI:** The shared application shell supports keyboard navigation, visible focus states, reduced-motion preferences, responsive layouts, route-level metadata, canonical URLs, and a generated sitemap.

Some prediction details and recommendation views require a free account. Public statistics, standings, games, team pages, and a limited prediction preview remain available without signing in.

## Project achievements

The following results are backed by locally generated evaluation reports (season: November 10, 2026; per-game: November 13, 2026) and the current test suites. Evaluation reports are git-ignored and can be regenerated using the commands below.

- **Two production prediction systems:** one forecasts a player's season-level per-game averages; the other forecasts eight statistics for an individual upcoming game.
- **Season model beats its baseline:** the latest walk-forward report evaluates 1,366 held-out player-seasons across 2023-24, 2024-25, and 2025-26. Its mean MAE ratio is `0.873`, or about **12.7% lower error** than predicting that every player repeats the previous season. It beats that baseline across all ten reported statistics.
- **Per-game model improves on recent form:** the selected XGBoost architecture was evaluated on 31,314 archived player-game rows across five chronological folds. Across 13,739 held-out examples per target, its headline MAE ratio is `0.930`, or about **7.0% lower error** than using each player's previous-ten-game average.
- **More than one thousand automated checks:** the repository currently passes **650 backend tests** and **361 frontend tests**, covering API behavior, authentication, model safeguards, data leakage prevention, predictions, games, standings, teams, fantasy scoring, responsive behavior, accessibility, and SEO.
- **Automated data delivery:** a scheduled GitHub Actions workflow refreshes season statistics and prediction caches every day. Per-game caches are rebuilt when the workflow has access to the PostgreSQL game archive.
- **Production deployment:** the React site is deployed at [courtvision.works](https://courtvision.works), with the Flask API hosted separately on Render and health-checked at `/healthz`.

Model results are snapshots, not guarantees. See the JSON reports in `backend/data/` and the evaluation methodology in [backend/README.md](backend/README.md#evaluating-the-model-mae) before interpreting or comparing the numbers.

## How CourtVision compares

CourtVision combines two forecasting horizons in one application: season averages for longer-term player evaluation and individual game lines for upcoming matchups. Its strengths are inspectable model code, chronological evaluation, and projections connected to player history and configurable fantasy scoring.

### Comparison with existing products

Product descriptions were checked on November 16, 2026. This is a comparison of purpose and capabilities; CourtVision has not run a matched accuracy benchmark against these providers.

| Forecasting use case | Existing system | CourtVision's approach and strength |
|---|---|---|
| Season player projections | [FantasyPros consensus projections](https://www.fantasypros.com/nba/projections/avg-overall.php) provide average and total projections across common fantasy statistics, including games played. | CourtVision's season model predicts ten per-game statistics from historical season transitions. Its training and evaluation code can be inspected and rerun, and projections connect directly to season history, breakout comparisons, and custom fantasy scoring. It does not provide the same season-total or games-played forecasts. |
| Daily player and game forecasting | [Dunks & Threes](https://dunksandthrees.com/about/epm) combines player skill and impact estimates with expected minutes to produce game predictions, box score projections, and season simulations, updated nightly. | CourtVision's per-game model forecasts eight box score statistics using recent performance, matchup context, rest, and known absences, with a cache covering the next three game days. Users can compare projections with recent averages and inspect the feature pipeline. CourtVision focuses on player stat lines; it does not offer an equivalent player-impact rating or playoff simulation system. |


### Measured strengths against reproducible alternatives

The local reports provide direct comparisons on the same held-out examples. Mean absolute error (MAE) measures the average size of a prediction's miss; lower is better.

| CourtVision model | Comparison method | Recorded result |
|---|---|---|
| Season XGBoost | Predict each player's previous-season averages again | Mean per-stat MAE ratio of **0.873** across ten targets, approximately **12.7% below baseline**. Points-per-game MAE is **2.316**, versus **2.534** for the baseline. |
| Per-game XGBoost | Predict each player's previous-ten-game averages | Mean per-stat MAE ratio of **0.930** across eight targets, approximately **7.0% below baseline**. Points MAE is **4.561**, versus **4.760** for the baseline. |
| Per-game XGBoost | CourtVision's Random Forest implementation on the same five chronological folds | XGBoost records a headline ratio of **0.930**, versus **0.986** for Random Forest, and lower MAE on each of the eight targets. This supports the architecture choice for this dataset and configuration. |

These improvements were measured on held-out data: 1,366 player-seasons for the season model and 13,739 player-games for the per-game model. Headline percentages represent the mean reduction in normalized MAE across targets. They describe performance against the named baselines, not a head-to-head benchmark against commercial providers.

See the [season evaluation](backend/app/ml/model_evaluation.py), [per-game evaluation](backend/app/ml/game_model_evaluation.py), and [model documentation](backend/README.md) for the implementation and reproduction steps.

## Technology stack

| Area | Technology |
|---|---|
| Frontend | React 19, React Router 7, Vite 7, JavaScript, CSS |
| Backend | Python, Flask, Gunicorn, Flask-CORS |
| Data and accounts | PostgreSQL, pandas, cached pickle and JSON artifacts |
| Machine learning | XGBoost, scikit-learn, walk-forward evaluation |
| External data | ESPN, NBA.com, Basketball Reference |
| Deployment | Vercel or Netlify-compatible frontend, Render backend |
| Automation | GitHub Actions |
| Testing | Node's built-in test runner, Python `unittest` |

## How the data moves through the system

```text
NBA.com / Basketball Reference ----> season datasets ----> season XGBoost model
                                               |                    |
                                               |                    v
                                               |           predictions_cache.json
                                               v                    |
ESPN schedule, scores and injuries ----> PostgreSQL game archive    |
                                               |                    |
                                               v                    |
                                      per-game XGBoost model         |
                                               |                    |
                                               v                    v
                                      game_predictions_cache.json -> Flask API -> React UI
```

Production serves precomputed prediction caches so the web process does not need to train models or hold the full model pipeline in memory. The trade-off is that projections update on the cache schedule rather than after every source-data change.

## Repository structure

```text
Court-Vision/
|-- backend/
|   |-- app/
|   |   |-- api/routes/        Flask blueprints for auth, players, games, teams,
|   |   |                       standings, predictions, profiles, and saved players
|   |   |-- ml/                Season and per-game models, features, and evaluation
|   |   |-- services/          Live data, injuries, standings, archives, and recommendations
|   |   |-- scraping/          Basketball Reference and NBA.com collection
|   |   `-- db.py              PostgreSQL account and saved-player storage
|   |-- data/                  Datasets, trained artifacts, caches, and evaluation reports
|   |-- scripts/               Scrape, train, evaluate, archive, and cache commands
|   |-- tests/                 Offline backend and model tests
|   `-- main.py                Development and Gunicorn entry point
|-- frontend/
|   |-- src/
|   |   |-- pages/             Route-level React views
|   |   |-- components/        Shared cards, filters, scoreboards, modals, and shell
|   |   |-- config/            API, prediction-stat, and SEO configuration
|   |   `-- utils/             Auth, fantasy, game, player, team, and UI helpers
|   |-- tests/                 Frontend behavior and source-contract tests
|   `-- package.json
|-- docs/                      Frontend redesign briefs and reference material
|-- .github/workflows/         Daily statistics and prediction refresh
|-- start_app.sh               Combined macOS/Linux development launcher
`-- start_app.bat              Combined Windows development launcher
```

## Local development

### Prerequisites

- Node.js 20.19 or newer, as required by Vite 7
- Python 3.11 or newer
- PostgreSQL
- Git LFS for the tracked model and dataset artifacts
- On macOS, OpenMP support for XGBoost (`brew install libomp`); `start_app.sh` attempts this automatically when Homebrew is available

### 1. Clone and configure PostgreSQL

```bash
git clone https://github.com/CosmicVeil/Court-Vision.git
cd Court-Vision
git lfs pull

createdb courtvision
cp backend/.env.example backend/.env
```

The default configuration uses `postgresql:///courtvision`. Edit `backend/.env` when your PostgreSQL user, password, host, port, or database name differs. The application creates its required tables and game-archive view when it starts.

### 2. Start both applications

On macOS or Linux:

```bash
./start_app.sh
```

On Windows:

```bat
start_app.bat --install
```

The frontend runs at [http://localhost:5173](http://localhost:5173) and the API runs at [http://localhost:5001](http://localhost:5001). The macOS/Linux launcher installs missing dependencies on first use and stops both processes with `Ctrl+C`.

### 3. Run each service separately

Backend:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python main.py
```

On Windows, activate the environment with `.venv\Scripts\Activate.ps1`.

Frontend, in a second terminal:

```bash
cd frontend
npm install
npm run dev
```

The Vite development server proxies `/api` requests to the Flask server on port `5001`. Set `VITE_API_URL` when the frontend should use a different API origin.

## Testing and quality checks

Frontend, from `frontend/`:

```bash
npm test
npm run lint
npm run build
```

Backend, from `backend/`:

```bash
.venv/bin/python -m unittest discover -s tests -t .
```

The automated tests use synthetic fixtures and mocked responses; they do not require network access or modify the production datasets.

## Model evaluation and maintenance

From `backend/`:

```bash
# Walk-forward evaluation of the season model
.venv/bin/python scripts/evaluate_model.py --fast

# Retrain the season model and rebuild its production cache
.venv/bin/python scripts/retrain_nba_ai.py
.venv/bin/python scripts/generate_predictions_cache.py

# Evaluate, train, and cache the per-game model; DATABASE_URL is required
.venv/bin/python scripts/evaluate_game_model.py
.venv/bin/python scripts/train_game_model.py --arch xgboost
.venv/bin/python scripts/generate_game_predictions_cache.py
```

Walk-forward evaluation preserves chronology: every fold trains only on data earlier than the period it scores. This avoids future-data leakage and gives a more honest result than measuring a model on rows it has already seen.

For script options, endpoint access rules, database tables, feature construction, cache behavior, and detailed model methodology, see the [backend documentation](backend/README.md).

## Deployment

- `frontend/vercel.json` and `netlify.toml` provide single-page application rewrites for the React frontend.
- `backend/render.yaml` defines the Render API, PostgreSQL database, production environment, and health check.
- `VITE_API_URL` selects the production API origin at frontend build time.
- Render uses low-memory mode and serves precomputed prediction caches instead of loading the full season model.
- `.github/workflows/update_stats.yml` performs the scheduled data and cache refresh.

Do not commit `backend/.env` or any other credentials. Configure `DATABASE_URL` and deployment secrets in the hosting provider or GitHub Actions settings.

## Data and prediction disclaimer

CourtVision is an independent analytics project and is not affiliated with the NBA, its teams, ESPN, NBA.com, or Basketball Reference. Statistics and predictions may be delayed, incomplete, or incorrect. The site is for informational and educational use and should not be treated as financial or betting advice.
