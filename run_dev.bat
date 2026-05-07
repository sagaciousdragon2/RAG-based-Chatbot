@echo off
echo Starting Walkout Tech AI Assistant Development Environment...

:: Kill existing ngrok instances to prevent tunnel conflicts
echo Cleaning up old processes...
taskkill /f /im ngrok.exe >nul 2>&1

:: Start Backend (FastAPI)
echo Starting Backend on port 8000...
start cmd /k "cd backend && python main.py"

:: Start Frontend (Vite)
echo Starting Frontend on port 5173...
start cmd /k "cd frontend && npm run dev"

:: Start Ngrok Tunnel
echo Starting Ngrok tunnel on your custom domain...
start cmd /k "ngrok http --domain=pterodactyloid-belkis-potted.ngrok-free.dev 8000"

echo All systems starting up. Please check the new windows for logs.
pause
