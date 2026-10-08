@echo off
setlocal
cd /d "%~dp0"

echo =========================================================
echo               coolSearch Launcher
echo =========================================================
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0run.ps1" %*

if %ERRORLEVEL% neq 0 (
    echo.
    echo Process exited with error code %ERRORLEVEL%.
    pause
)
