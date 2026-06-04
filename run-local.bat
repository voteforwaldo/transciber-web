@echo off
setlocal EnableExtensions
title Transciber Web - local dev

cd /d "%~dp0"
echo Project: %CD%
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js is not installed or not on PATH.
  echo Install from https://nodejs.org/ then run this again.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo Installing npm dependencies...
  call npm install
  if errorlevel 1 (
    echo npm install failed.
    pause
    exit /b 1
  )
)

if not exist ".env.local" (
  if exist ".env.example" (
    echo Creating .env.local from .env.example
    copy /Y ".env.example" ".env.local" >nul
  )
)

if exist "scripts\sync-env-from-transcriber.ps1" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\sync-env-from-transcriber.ps1" 2>nul
)

if not exist "config\youtube-cookies.txt" (
  echo.
  echo NOTE: YouTube needs config\youtube-cookies.txt
  echo   Run install-cookies.bat after exporting from the Chrome extension
  echo.
)

findstr /C:"SPEECHMATICS_API_KEY=" ".env.local" 2>nul | findstr /V "=$" >nul
if errorlevel 1 (
  echo.
  echo NOTE: Set API keys in .env.local. For YouTube, run scripts\export-youtube-cookies.ps1 once (browser closed).
  echo.
)

rem Port 3000 is often taken by Cursor or other dev servers; use 3010 for this app.
set PORT=3010
echo Starting dev server at http://localhost:%PORT%
echo If that port is busy, Next.js will pick another — check the "Local:" line below.
echo Press Ctrl+C to stop.
echo.
call npm run dev -- -p %PORT%

endlocal
