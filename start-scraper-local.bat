@echo off
echo ================================================
echo  TrackerAds Scraper - Servico Local
echo ================================================
echo.
echo Iniciando scraper local na porta 3001...
echo.
cd scraper-service
echo Verificando dependencias...
if not exist "node_modules" (
    echo Instalando dependencias...
    call npm install
    echo.
    echo Instalando navegador Playwright...
    call npx playwright install chromium
    echo.
)
echo.
echo ================================================
echo  Iniciando servico...
echo  O servico ficara rodando em: http://localhost:3001
echo  Pressione Ctrl+C para parar
echo ================================================
echo.
call npm start
pause

