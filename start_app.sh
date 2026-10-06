#!/bin/bash
# Start the Court-Vision backend (Flask, :5001) and frontend (Vite, :5173) together
# in this terminal. Ctrl+C stops both. Dependencies install on the first run only.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"
PYTHON="$BACKEND/.venv/bin/python"

echo "🏀 Starting Court-Vision..."

# --- One-time setup -----------------------------------------------------------
if [ ! -x "$PYTHON" ]; then
    echo "📦 Creating backend virtual environment..."
    python3 -m venv "$BACKEND/.venv" || { echo "❌ Could not create the venv (is python3 installed?)"; exit 1; }
fi

if ! "$PYTHON" -c "import flask, flask_cors, psycopg, pandas" 2>/dev/null; then
    echo "📦 Installing backend dependencies..."
    "$PYTHON" -m pip install -q --upgrade pip
    "$PYTHON" -m pip install -q -r "$BACKEND/requirements.txt" || { echo "❌ Backend dependency install failed"; exit 1; }
fi

# XGBoost on macOS needs OpenMP (libomp)
if [[ "$(uname)" == "Darwin" ]] && ! "$PYTHON" -c "from xgboost import XGBRegressor" 2>/dev/null; then
    if command -v brew &>/dev/null; then
        echo "📦 Installing libomp for XGBoost..."
        brew install libomp
    else
        echo "⚠️  XGBoost needs OpenMP. Install Homebrew (https://brew.sh), then run: brew install libomp"
    fi
fi

if [ ! -d "$FRONTEND/node_modules" ]; then
    echo "📦 Installing frontend dependencies..."
    (cd "$FRONTEND" && npm install) || { echo "❌ Frontend dependency install failed"; exit 1; }
fi

# --- Pre-flight checks --------------------------------------------------------
if command -v pg_isready &>/dev/null && ! pg_isready -q; then
    echo "❌ PostgreSQL isn't running, and the backend needs it."
    echo "   Start it with: brew services start postgresql@16"
    exit 1
fi

for port in 5001 5173; do
    if lsof -iTCP:$port -sTCP:LISTEN &>/dev/null; then
        echo "❌ Port $port is already in use (an old server still running?). Stop it and try again."
        exit 1
    fi
done

# --- Run both -----------------------------------------------------------------
(cd "$BACKEND" && PYTHONUNBUFFERED=1 exec "$PYTHON" main.py) > >(sed -u 's/^/[backend]  /') 2>&1 &
BACKEND_PID=$!
(cd "$FRONTEND" && exec ./node_modules/.bin/vite --port 5173 --strictPort) > >(sed -u 's/^/[frontend] /') 2>&1 &
FRONTEND_PID=$!

stop() {
    trap - INT TERM
    echo ""
    echo "🛑 Stopping backend and frontend..."
    kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null
    wait "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null
    exit 0
}
trap stop INT TERM

echo ""
echo "🔧 Backend API: http://localhost:5001   (loading data and the model takes a few seconds)"
echo "🌐 Frontend:    http://localhost:5173"
echo "   Press Ctrl+C to stop both."
echo ""

# If either server exits on its own, stop the other one too.
while kill -0 "$BACKEND_PID" 2>/dev/null && kill -0 "$FRONTEND_PID" 2>/dev/null; do
    sleep 1
done
echo "⚠️  One of the servers stopped; shutting down the other."
stop
