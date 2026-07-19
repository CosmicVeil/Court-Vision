@echo off
echo ========================================
echo Starting NBA Backend Server
echo ========================================
echo.

REM Activate virtual environment
call cleanenv\Scripts\activate.bat

REM Check if activation worked
if errorlevel 1 (
    echo ERROR: Failed to activate virtual environment
    echo Make sure cleanenv exists in the Backend folder
    pause
    exit /b 1
)

echo Virtual environment activated
echo.

REM Start the Flask server
echo Starting Flask server on http://localhost:5001
echo Press Ctrl+C to stop the server
echo.
python app.py

pause
