@echo off
setlocal
cd /d "%~dp0"
set "f=config\youtube-cookies.txt"
echo.
if not exist "%f%" (
  echo MISSING: %f%
  echo.
  echo Run: install-cookies.bat
  echo   ^(export from Chrome extension, then pick file from Downloads^)
  echo.
  start "" notepad "%~dp0config\SETUP-COOKIES.txt"
  pause
  exit /b 1
)
for %%A in ("%f%") do set size=%%~zA
if %size% LSS 200 (
  echo TOO SMALL: %f% ^(%size% bytes^) — export again from the extension.
  pause
  exit /b 1
)
echo OK: %f% ^(%size% bytes^)
echo You can run run-local.bat and transcribe.
echo.
pause
endlocal
