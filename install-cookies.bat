@echo off
title Install YouTube cookies
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install-youtube-cookies.ps1" %*
if errorlevel 1 pause & exit /b 1
call "%~dp0check-cookies.bat"
