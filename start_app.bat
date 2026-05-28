@echo off
setlocal
echo 🏀 Starting NBA Sports Website...
echo.

cd /d "%~dp0Backend"

if not exist ".venv\Scripts\python.exe" (
    echo 📦 Creating Python virtual environment...
    python -m venv .venv
    if errorlevel 1 (
        echo ❌ Failed to create virtual environment
        pause
        exit /b 1
    )
)

set "PY=%~dp0Backend\.venv\Scripts\python.exe"

echo 📦 Installing backend dependencies into .venv...
"%PY%" -m pip install --upgrade pip -q
"%PY%" -m pip install -r requirements.txt
if errorlevel 1 (
    echo ❌ Failed to install backend dependencies
    pause
    exit /b 1
)

echo 🌐 Installing Playwright Chromium (required for NBA scraping)...
"%PY%" -m playwright install chromium
if errorlevel 1 (
    echo ❌ Failed to install Playwright browsers
    pause
    exit /b 1
)

echo.
echo 🚀 Starting Flask API server...
start "NBA API Server" cmd /k "cd /d "%~dp0Backend" && "%PY%" app.py"

echo.
echo ⏳ Waiting for API server to start...
timeout /t 3 /nobreak > nul

echo.
echo 📦 Installing frontend dependencies...
cd /d "%~dp0"
call npm install
if errorlevel 1 (
    echo ❌ Failed to install frontend dependencies
    pause
    exit /b 1
)

echo.
echo 🌐 Starting React frontend...
start "NBA Frontend" cmd /k "cd /d "%~dp0" && npm run dev"

echo.
echo ✅ NBA Sports Website started successfully!
echo.
echo 🌐 Frontend: http://localhost:5173
echo 🔧 Backend API: http://localhost:5000
echo.
echo Click STATS in the navigation to view NBA players!
echo.
pause
 