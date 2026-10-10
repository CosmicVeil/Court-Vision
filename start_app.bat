@echo off
setlocal
echo 🏀 Starting Court-Vision NBA Dashboard...
echo.

cd /d "%~dp0backend"

set "DO_INSTALL=0"
if "%~1"=="--install" set "DO_INSTALL=1"
if "%~1"=="--update" set "DO_INSTALL=1"

if not exist ".venv\Scripts\python.exe" (
    echo 📦 Creating Python virtual environment...
    python -m venv .venv
    if errorlevel 1 (
        echo ❌ Failed to create virtual environment
        pause
        exit /b 1
    )
    set "DO_INSTALL=1"
)

set "PY=%~dp0backend\.venv\Scripts\python.exe"

if "%DO_INSTALL%"=="1" (
    echo 📦 Installing backend dependencies into .venv...
    "%PY%" -m pip install --upgrade pip -q
    "%PY%" -m pip install -r requirements.txt
    if errorlevel 1 (
        echo ❌ Failed to install backend dependencies
        pause
        exit /b 1
    )

    echo 🌐 Installing Playwright Chromium...
    "%PY%" -m playwright install chromium
)

echo 🚀 Starting Flask API server on http://localhost:5001...
start "NBA API Server" cmd /k "cd /d "%~dp0backend" && "%PY%" main.py"

echo ⏳ Waiting for API server to initialize...
timeout /t 3 /nobreak > nul

cd /d "%~dp0frontend"
if not exist "node_modules" (
    echo 📦 Installing frontend dependencies...
    call npm install
    if errorlevel 1 (
        echo ❌ Failed to install frontend dependencies
        pause
        exit /b 1
    )
)

echo 🌐 Starting React frontend on http://localhost:5173...
start "NBA Frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"

echo.
echo ✅ Court-Vision is running locally!
echo.
echo 🌐 Frontend UI:  http://localhost:5173
echo 🔧 Backend API:   http://localhost:5001
echo.
echo Head to http://localhost:5173/stats to view all NBA player stats!
echo.
pause

 