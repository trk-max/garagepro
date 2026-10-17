@echo off
REM GaragePro - hub du garage : double-cliquez pour demarrer l'application et la synchronisation.
cd /d "%~dp0"
call npm run hub
pause
