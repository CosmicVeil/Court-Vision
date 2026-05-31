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
├── Backend/                    # Flask Backend & ML Engine
│   ├── app.py                  # Main API Router & Server
│   ├── PlayerPerformancePredictor.py # ML Prediction Functions
│   ├── nba_multi_season_data.pkl # 2020-2026 Career Statistics Pickle
│   ├── player_performance_model.pkl # Trained XGBoost Model
│   └── requirements.txt        # Backend dependencies
├── src/                        # React Frontend App
│   ├── App.jsx                 # Router Declarations
│   ├── main.jsx                # Render Mounting & Global Styling
│   ├── components/             # UI Views & Layout Styles
│   │   ├── home.jsx / home.css # Hero screen & Search Dropdown
│   │   ├── Stats.jsx / Stats.css # Filters Grid & Stats Tables
│   │   ├── Recommendations.jsx # AI Radar & Spotlight breakups
│   │   └── Favourites.jsx      # Golden favorite player tracking
└── index.html                  # Core HTML Entrypoint
```

---

## 🚀 Installation & Setup

### 1. Prerequisites
Ensure you have **Node.js (v18+)** and **Python (v3.10+)** installed on your workstation.

### 2. Configure and Run Backend
Navigate to the `Backend` directory and set up a Python virtual environment:
```bash
cd Backend
python -m venv .venv

# Activate Virtual Environment (Windows PowerShell)
.venv\Scripts\Activate.ps1

# Activate Virtual Environment (macOS/Linux Bash)
source .venv/bin/activate

# Install Dependencies
pip install -r requirements.txt

# Start Flask Server
python app.py
```
The server will initialize on [http://localhost:5000](http://localhost:5000) and load pickle datasets.

### 3. Configure and Run Frontend
Return to the project root directory and spin up the Vite development server:
```bash
# Install NPM packages
npm install

# Start Vite Development Server
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser to experience Court-Vision.

---

## 📦 Production Builds

To compile the application bundle for production environments (assets compiled, minified, and optimized):
```bash
npm run build
```
Compiled production files are outputted inside the `/dist` directory, ready to serve or deploy to Netlify/Vercel.
