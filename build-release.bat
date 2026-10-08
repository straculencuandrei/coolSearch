@echo off
setlocal
cd /d "%~dp0"

title coolSearch - Release Build

echo =========================================================
echo       coolSearch Release Build & Packaging Suite
echo =========================================================
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0build-release.ps1" %*

if %ERRORLEVEL% neq 0 (
    echo.
    echo Release build failed with exit code %ERRORLEVEL%.
    pause
) else (
    echo.
    echo Build completed successfully.
)
