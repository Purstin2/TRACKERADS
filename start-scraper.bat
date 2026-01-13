@echo off
echo ================================================
echo  TrackerAds Scraper - Auto Start
echo ================================================
echo.
echo Iniciando scraper com PM2...
pm2 resurrect
echo.
echo ================================================
echo  Scraper iniciado com sucesso!
echo  Verifique o status: pm2 status
echo ================================================
timeout /t 3
