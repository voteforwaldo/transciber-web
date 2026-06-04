@echo off
title Transciber - full online setup
cd /d "%~dp0"
echo.
echo 1. GitHub repo: https://github.com/voteforwaldo/transciber-web
echo 2. Opening Render deploy in your browser...
echo    - Sign in to Render
echo    - Click Apply / Create
echo    - When asked, set: SPEECHMATICS_API_KEY, GEMINI_API_KEY, YTDLP_COOKIES
echo      (paste cookies from config\youtube-cookies.txt)
echo.
start https://render.com/deploy?repo=https://github.com/voteforwaldo/transciber-web
echo.
set /p RENDER_URL=3. After Render shows Live, paste your Render URL (e.g. https://transciber-web.onrender.com): 
if "%RENDER_URL%"=="" (
  echo Skipped Vercel link. Run later: scripts\finish-render-setup.ps1 -RenderUrl YOUR_URL
  pause
  exit /b 0
)
powershell -ExecutionPolicy Bypass -File scripts\finish-render-setup.ps1 -RenderUrl "%RENDER_URL%"
pause
