# Court-Vision: NBA Statistics & AI Predictions Dashboard

Court-Vision is a premium, high-fidelity sports analytics web application designed to browse, search, and analyze NBA player performances. Leveraging a fully responsive glassmorphic dark-mode interface, Court-Vision couples real-time schedule aggregations with cutting-edge machine learning predictions (XGBoost models) to forecast breakout metrics for athletes across the league.

---

## 🛠️ Technology Stack

* **Core Frontend**: React (Vite, JSX, Context API, Router v6)
* **Visual Theme & Styling**: Vanilla CSS (Tailored glassmorphism, responsive CSS Grid, hardware-accelerated animations)
* **Backend API**: Python (Flask, SQLite, Process multiprocessing)
* **AI Model Engine**: Machine Learning predictions powered by trained XGBoost systems and custom performance scalar modules.
* **Data Sources**: Multi-season historical databases (covering 2020 through 2026 player metrics) and real-time live boxscore APIs.

---

## 🌟 Key Features

1. **Title Screen Global Search**: Search for any NBA player dynamically on the hero screen. The autocomplete suggestion dropdown features smooth scaling hover indicators.
2. **Unified Player Details Modal**: A multi-tab, glassmorphic profile modal accessible from any screen (Home, Stats, Live Games, Favourites, Recommendations). It aggregates:
   * **Current Season Averages**: High-contrast, custom progress bars mapping PPG, APG, RPG, SPG, BPG, FG%, 3PT%, FT%, and minutes.
   * **AI Predictions**: ML-predicted metrics highlighting estimated performance leaps and percent-change improvements.
   * **Career History (2020–2026)**: Tabular year-by-year historical trends loaded dynamically from local datasets.
3. **Responsive Stats Grid & Season Filter**: View complete league-wide stats in an auto-aligning grid. Includes sorting controls and a custom Season selector querying historical averages.
4. **Live Games & Boxscores**: View daily schedules, boxscores, quarterly breakdowns, and active rosters in real-time.
5. **AI Radar Breakouts & Spotlight Charts**: Spot upcoming scoring, playmaking, and glass-dominance breakout candidates projected by ML.

---

## 📂 Project Directory Structure

```
Court-Vision/
├── backend/                     # Flask API & ML engine
│   ├── app/
│   │   ├── __init__.py          # create_app(): Flask setup, CORS, route registration
│   │   ├── config.py            # Environment flags, data file paths, port
│   │   ├── state.py             # Data and predictions loaded at startup, shared by routes
│   │   ├── auth.py              # Bearer tokens and @require_auth
│   │   ├── db.py                # PostgreSQL users and saved players
│   │   ├── api/routes/          # One file per area: auth, games, health, players,
│   │   │                        #   predictions, saved_players, stats
│   │   ├── services/            # Live games (ESPN) and recommendations
│   │   ├── ml/                  # XGBoost model and walk-forward evaluation
│   │   ├── scraping/            # Basketball Reference + NBA.com scraper
│   │   └── utils/               # Player name helpers
│   ├── data/                    # .pkl datasets, trained model, predictions cache
│   ├── scripts/                 # CLI tools: evaluate, retrain, regenerate cache, repair names
│   ├── tests/                   # Offline backend tests
│   ├── main.py                  # Entry point (python main.py / gunicorn main:app)
│   └── requirements.txt
├── frontend/                    # React + Vite app
│   ├── src/
│   │   ├── pages/               # One component per route (Home, Stats, Predictions, ...)
│   │   ├── components/          # Shared UI (prediction grid, box score, stats modal, ...)
│   │   ├── config/              # API endpoints and stat definitions
│   │   ├── utils/               # Auth, favourites, formatting helpers
│   │   ├── App.jsx              # Routes
│   │   └── main.jsx             # Entry point
│   ├── public/
│   ├── tests/                   # Frontend tests
│   └── package.json
├── docs/                        # Design specs and plans
└── .github/workflows/           # Daily stats + predictions update
```

---

## 🚀 Installation & Setup

### 1. Prerequisites
Ensure you have **Node.js (v18+)** and **Python (v3.10+)** installed on your workstation.

### 2. Configure and Run Backend
Set up a Python virtual environment in `backend/`:
```bash
cd backend
python -m venv .venv

# Activate Virtual Environment (Windows PowerShell)
.venv\Scripts\Activate.ps1

# Activate Virtual Environment (macOS/Linux Bash)
source .venv/bin/activate

# Install Dependencies
pip install -r requirements.txt

# Start Flask Server
python main.py
```
The server will initialize on [http://localhost:5001](http://localhost:5001) and load the datasets in `backend/data/`.

#### Testing and evaluating the AI model
From `backend/`, run the offline backend tests (about a second) and a quick accuracy (MAE) report:
```bash
python -m unittest discover -s tests -t .
python scripts/evaluate_model.py --fast
```
See [backend/README.md](backend/README.md) for what each suite covers, how to read the MAE report, and how to tune the model.

### 3. Configure and Run Frontend
In a second terminal, start the Vite development server from `frontend/`:
```bash
cd frontend

# Install NPM packages
npm install

# Start Vite Development Server
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser to experience Court-Vision.

---

## 📦 Production Builds

To compile the application bundle for production environments (assets compiled, minified, and optimized), from `frontend/`:
```bash
npm run build
```
Compiled production files are outputted inside `frontend/dist`, ready to serve or deploy to Netlify/Vercel.

## Testing

Frontend, from `frontend/`:
```bash
npm test
npm run lint
npm run build
```
Backend, from `backend/`:
```bash
python -m unittest discover -s tests -t .
```
