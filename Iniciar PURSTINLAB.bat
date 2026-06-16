@echo off
title PURSTINLAB
cd /d "%~dp0"
echo.
echo   ====================================
echo    PURSTINLAB  -  plataforma de trafego
echo   ====================================
echo.
if not exist "node_modules" (
  echo   Instalando dependencias pela primeira vez...
  call npm install
)
echo   Subindo servidor em http://localhost:5180
echo   Acesse pelo navegador. Ctrl+C para parar.
echo.
start "" http://localhost:5180
call npm run dev
