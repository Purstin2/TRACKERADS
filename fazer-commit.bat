@echo off
echo ================================================
echo  Fazendo Commit das Mudancas
echo ================================================
echo.

REM Verifica se Git esta configurado
git config user.name >nul 2>&1
if errorlevel 1 (
    echo ERRO: Git nao esta configurado!
    echo.
    echo Execute primeiro: configurar-git.bat
    echo.
    pause
    exit /b 1
)

git add -A
echo.
echo Arquivos adicionados ao stage
echo.

git commit -m "feat: Remover dependencia do Railway e implementar scraper local

- Removidas todas as referencias ao Railway no frontend
- Atualizado OfferGridScreen para usar localhost:3001
- Atualizado OfferDetailScreen para usar servico local
- Criado script start-scraper-local.bat para facilitar inicio
- Adicionada documentacao COMO-USAR-SCRAPER-LOCAL.md
- Scraper agora roda 100%% localmente na maquina do usuario
- Sem limites, sem restricoes, sem custos de servidor na nuvem"

echo.
echo ================================================
echo  Commit realizado com sucesso!
echo ================================================
echo.
pause

