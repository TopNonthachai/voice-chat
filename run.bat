@echo off
TITLE Voice Chat Runner
COLOR 0B

echo ==========================================
echo    VOICE CHAT PROJECT AUTO-RUNNER
echo ==========================================

:: 1. Check if node_modules exists
if not exist node_modules (
    echo [INFO] Node modules not found. Installing...
    call npm install
)

:: 2. Start Backend Server (Signaling & Static Hosting)
echo [START] Starting Backend Server (Port 3001)...
start "Voice-Chat-Server" cmd /c "npm run server"

:: 3. Start Frontend Dev Server (Vite)
echo [START] Starting Vite Dev Server...
start "Voice-Chat-Vite" cmd /c "npm run dev"

echo.
echo ==========================================
echo  DONE! Both servers are starting...
echo  - Backend/Signaling: http://localhost:3001
echo  - Frontend (Dev): http://localhost:5173
echo ==========================================
echo.
pause
