@echo off
setlocal EnableExtensions
title Export YouTube cookies — use extension method on Windows

cd /d "%~dp0"
echo.
echo ============================================================
echo   On Windows, automatic export often fails (DPAPI error).
echo   USE OPTION A instead:
echo.
echo   1. Double-click:  open-cookies-folder.bat
echo   2. Follow SETUP-COOKIES.txt (Chrome extension method)
echo   3. Then run:      check-cookies.bat
echo ============================================================
echo.
set /p cont="Still try automatic export? Press Y, or Enter to open instructions: "
if /i not "%cont%"=="Y" (
  start "" notepad "%~dp0config\SETUP-COOKIES.txt"
  explorer "%~dp0config"
  exit /b 0
)

if /i "%~1"=="kill" goto killchrome
set /p action="Press K to kill Chrome first, or Enter to try export: "
if /i "%action%"=="K" goto killchrome
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\export-youtube-cookies.ps1" %*
goto afterexport

:killchrome
taskkill /IM chrome.exe /F 2>nul
timeout /t 2 /nobreak >nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\export-youtube-cookies.ps1" -KillBrowser %2 %3 %4

:afterexport
if errorlevel 1 (
  echo.
  echo Automatic export failed. Use the Chrome extension — see SETUP-COOKIES.txt
  notepad "%~dp0config\SETUP-COOKIES.txt"
)
if exist "config\youtube-cookies.txt" (
  echo OK: config\youtube-cookies.txt created. Run check-cookies.bat
)
pause
endlocal
