@echo off
REM GaragePro - hub du garage : double-cliquez pour demarrer l'application et la synchronisation.
cd /d "%~dp0"
title GaragePro - hub

REM Premiere utilisation (juste apres l'installateur) : configuration d'abord.
if not exist node_modules goto :setup
if not exist .env goto :setup

REM Apres une mise a jour : dependances changees -> npm install (aucune donnee touchee).
if exist node_modules\.package-lock.json (
  powershell -NoProfile -Command "if ((Get-Item package-lock.json).LastWriteTime -gt (Get-Item node_modules\.package-lock.json).LastWriteTime) { exit 1 }"
  if errorlevel 1 (
    echo  Mise a jour des dependances...
    call npm install
  )
)
goto :hub

:setup
call setup.cmd
if not exist .env (
  echo  !! Configuration incomplete : relancez ce raccourci apres avoir rempli .env
  pause
  exit /b 1
)

:hub
call npm run hub
pause
