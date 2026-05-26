@echo off
cd /d "%~dp0"
echo Deploying Discord slash commands...
echo.
npm.cmd run deploy
echo.
pause
