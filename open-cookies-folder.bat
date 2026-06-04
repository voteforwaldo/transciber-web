@echo off

cd /d "%~dp0"

start "" "%~dp0config"

notepad "%~dp0config\SETUP-COOKIES.txt"

