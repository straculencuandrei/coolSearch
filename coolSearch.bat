@echo off
setlocal
cd /d "%~dp0"

if exist "%~dp0coolSearch.exe" (
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process '%~dp0coolSearch.exe' -Verb RunAs"
    exit /b
)

if exist "%~dp0release\coolSearch.exe" (
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process '%~dp0release\coolSearch.exe' -Verb RunAs"
    exit /b
)

if exist "%~dp0src-tauri\target\release\cool-search.exe" (
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process '%~dp0src-tauri\target\release\cool-search.exe' -Verb RunAs"
    exit /b
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0run.ps1"
