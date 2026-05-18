#!/bin/bash

# Resolve script's own directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "🏀 Starting NBA Sports Website..."
echo ""

echo "📦 Installing backend dependencies..."
cd "$SCRIPT_DIR/Backend"
pip install -r requirements.txt
if [ $? -ne 0 ]; then
    echo "❌ Failed to install backend dependencies"
    read -p "Press Enter to exit..."
    exit 1
fi

echo ""
echo "🚀 Starting Flask API server..."
osascript -e 'tell app "Terminal" to do script "cd '"$SCRIPT_DIR"'/Backend && python app.py"'

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