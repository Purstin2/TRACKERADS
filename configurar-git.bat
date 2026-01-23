@echo off
echo ================================================
echo  Configurar Git (Nome e Email)
echo ================================================
echo.
echo Por favor, informe seus dados do Git:
echo.

set /p GIT_NAME="Digite seu nome: "
set /p GIT_EMAIL="Digite seu email: "

echo.
echo Configurando Git...
git config user.name "%GIT_NAME%"
git config user.email "%GIT_EMAIL%"

echo.
echo ================================================
echo  Git configurado com sucesso!
echo  Nome: %GIT_NAME%
echo  Email: %GIT_EMAIL%
echo ================================================
echo.
echo Agora voce pode executar fazer-commit.bat
echo.
pause

