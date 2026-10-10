@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
title GaragePro

if not exist node_modules (
  echo  Premiere utilisation sur ce PC : lancement de setup.cmd
  call setup.cmd
)
if not exist .env (
  echo  !! Fichier .env absent. Lancez setup.cmd d'abord.
  pause
  exit /b 1
)

rem Verification complete (base, cles, IA...). Si un probleme bloque, on s'arrete ici.
call npm run doctor
if errorlevel 1 (
  echo.
  echo  !! Corrigez les points en rouge ci-dessus, puis relancez start.cmd
  pause
  exit /b 1
)

echo.
echo  ===============================================
echo   GaragePro demarre...
echo   Sur ce PC        : http://localhost:3000
echo   Telephone / PC   : les adresses http://192.168... affichees au point 7
echo   Pour arreter     : Ctrl + C dans cette fenetre
echo  ===============================================
echo.
start "" /b cmd /c "ping -n 10 127.0.0.1 >nul & start http://localhost:3000"
call npm run dev:lan
pause
