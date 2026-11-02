@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo    Starting DDZ game + Cloudflare Tunnel...
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-game.ps1"
pause
