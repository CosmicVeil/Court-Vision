#!/bin/bash

# Resolve script's own directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV="$SCRIPT_DIR/Backend/.venv"
PYTHON="$VENV/bin/python"

echo "🏀 Starting NBA Sports Website..."
echo ""

# Use one venv so pip install and app.py use the same Python (avoids conda vs system mismatch)
if [ ! -x "$PYTHON" ]; then
    echo "📦 Creating Python virtual environment..."
    python3 -m venv "$VENV"
    if [ $? -ne 0 ]; then
        echo "❌ Failed to create virtual environment (is python3 installed?)"
        read -p "Press Enter to exit..."
        exit 1
    fi
fi

echo "📦 Installing backend dependencies into .venv..."
"$PYTHON" -m pip install --upgrade pip -q
"$PYTHON" -m pip install -r "$SCRIPT_DIR/Backend/requirements.txt"
if [ $? -ne 0 ]; then
    echo "❌ Failed to install backend dependencies"
    read -p "Press Enter to exit..."
    exit 1
fi

# XGBoost on macOS needs OpenMP (libomp)
if [[ "$(uname)" == "Darwin" ]] && ! "$PYTHON" -c "from xgboost import XGBRegressor" 2>/dev/null; then
    if command -v brew &>/dev/null; then
        echo "📦 Installing libomp for XGBoost (macOS)..."
        brew install libomp
    else
        echo "⚠️  XGBoost needs OpenMP. Install Homebrew from https://brew.sh then run: brew install libomp"
        echo "    (App will use sklearn fallback until libomp is installed.)"
    fi
fi

echo "🌐 Installing Playwright Chromium (required for NBA scraping)..."
"$PYTHON" -m playwright install chromium
if [ $? -ne 0 ]; then
    echo "❌ Failed to install Playwright browsers"
    read -p "Press Enter to exit..."
    exit 1
fi

echo ""
echo "🚀 Starting Flask API server..."
osascript -e 'tell app "Terminal" to do script "cd '"$SCRIPT_DIR"'/Backend && '"$PYTHON"' app.py"'

echo ""
echo "⏳ Waiting for API server to start..."
sleep 3

echo ""
echo "📦 Installing frontend dependencies..."
cd "$SCRIPT_DIR"
npm install
if [ $? -ne 0 ]; then
    echo "❌ Failed to install frontend dependencies"
    read -p "Press Enter to exit..."
    exit 1
fi

echo ""
echo "🌐 Starting React frontend..."
osascript -e 'tell app "Terminal" to do script "cd '"$SCRIPT_DIR"' && npm run dev"'

echo ""
echo "✅ NBA Sports Website started successfully!"
echo ""
echo "🌐 Frontend: http://localhost:5173"
echo "🔧 Backend API: http://localhost:5000"
echo ""
echo "Click STATS in the navigation to view NBA players!"
echo ""
read -p "Press Enter to exit..."
