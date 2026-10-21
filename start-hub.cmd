@echo off
REM GaragePro - hub du garage : double-cliquez pour demarrer l'application et la synchronisation.
cd /d "%~dp0"
title GaragePro - hub

REM Premiere utilisation (juste apres l'installateur) : configuration d'abord.
if not exist node_modules goto :setup
if not exist .env goto :setup

REM Apres une mise a jour : liste des dependances changee -> npm install (aucune donnee touchee).
REM On compare l'empreinte de package-lock.json a celle du dernier npm install reussi.
if not exist package-lock.json goto :hub
powershell -NoProfile -Command "$h=(Get-FileHash package-lock.json).Hash; $f='node_modules\.gp-lock-hash'; if ((Test-Path $f) -and ((Get-Content $f -Raw).Trim() -eq $h)) { exit 0 } else { exit 1 }"
if errorlevel 1 (
  echo  Mise a jour des dependances...
  call npm install
  if not errorlevel 1 powershell -NoProfile -Command "(Get-FileHash package-lock.json).Hash | Set-Content node_modules\.gp-lock-hash"
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
