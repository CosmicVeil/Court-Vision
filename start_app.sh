#!/bin/bash

PROJECT_DIR="/Users/mohandixit/Documents/Programming /Sports-Website-main"

echo "🏀 Starting NBA Sports Website..."
echo ""

# Install backend dependencies
echo "📦 Installing backend dependencies..."
cd "$PROJECT_DIR/Backend"
pip install -r requirements.txt
if [ $? -ne 0 ]; then
    echo "❌ Failed to install backend dependencies"
    exit 1
fi

# Start Flask backend
echo ""
echo "🚀 Starting Flask API server..."
osascript -e "tell app \"Terminal\" to do script \"cd '$PROJECT_DIR/Backend' && python app.py\""

# Wait for backend to start
echo ""
echo "⏳ Waiting for API server to start..."
sleep 3

# Install frontend dependencies
echo ""
echo "📦 Installing frontend dependencies..."
cd "$PROJECT_DIR"
npm install
if [ $? -ne 0 ]; then
    echo "❌ Failed to install frontend dependencies"
    exit 1
fi

# Start React frontend
echo ""
echo "🌐 Starting React frontend..."
osascript -e "tell app \"Terminal\" to do script \"cd '$PROJECT_DIR' && npm run dev\""

echo ""
echo "✅ NBA Sports Website started successfully!"
echo ""
echo "🌐 Frontend: http://localhost:5173"
echo "🔧 Backend API: http://localhost:5000"
echo ""
echo "Click STATS in the navigation to view NBA players!"
echo ""
read -p "Press Enter to exit..."