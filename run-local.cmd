@echo off
setlocal
cd /d "%~dp0"

if not exist ".env" (
  echo File .env not found. Copy .env.example to .env and set TELEGRAM_BOT_TOKEN.
  pause
  exit /b 1
)

set HOST=127.0.0.1
if "%PORT%"=="" set PORT=4174

echo Starting Malina local server...
echo URL: http://127.0.0.1:%PORT%/
echo.
node server.js
pause
