@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
title GaragePro - installation
echo.
echo  ===============================================
echo   GaragePro - installation sur ce PC
echo  ===============================================
echo.

rem --- 1. Node.js et Git (installes avec winget si absents) ---
set NEED_RESTART=0
where node >nul 2>nul
if errorlevel 1 (
  echo  [1/6] Installation de Node.js LTS...
  winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
  set NEED_RESTART=1
) else (
  node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=12)?0:1)"
  if errorlevel 1 (
    echo  [1/6] Mise a jour de Node.js...
    winget upgrade -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
    set NEED_RESTART=1
  ) else (
    echo  [1/6] Node.js OK
  )
)
where git >nul 2>nul
if errorlevel 1 (
  echo  [1/6] Installation de Git...
  winget install -e --id Git.Git --accept-source-agreements --accept-package-agreements
  set NEED_RESTART=1
) else (
  echo  [1/6] Git OK
)
if "%NEED_RESTART%"=="1" (
  echo.
  echo  Des outils viennent d'etre installes.
  echo  FERMEZ cette fenetre, puis double-cliquez de nouveau sur setup.cmd
  pause
  exit /b 0
)

rem --- 2. Dependances du projet ---
echo  [2/6] Installation des dependances (1 a 3 minutes)...
call npm install
if errorlevel 1 goto :error
call npm approve-scripts @prisma/client @prisma/engines prisma esbuild >nul 2>nul

rem --- 3. Fichier .env ---
if not exist .env (
  echo  [3/6] Creation du fichier .env : remplissez-le puis enregistrez [Ctrl+S] et fermez le Bloc-notes
  copy .env.example .env >nul
  notepad .env
) else (
  echo  [3/6] .env deja present
)

rem --- 4. Base de donnees ---
echo  [4/6] Base de donnees (aucune donnee n'est effacee)...
call npx prisma generate >nul
call npx prisma migrate deploy
if errorlevel 1 echo  !! La base n'est pas joignable : verifiez DATABASE_URL et DIRECT_URL dans .env

rem --- 5. Verification complete ---
echo  [5/6] Verification complete...
call npm run doctor

rem --- 6. Tests ---
echo  [6/6] Tests automatiques...
call npm test

echo.
echo  Installation terminee. Pour lancer l'application : double-cliquez sur start.cmd
pause
exit /b 0

:error
echo.
echo  !! L'installation a echoue. Lisez le message en rouge ci-dessus.
pause
exit /b 1
