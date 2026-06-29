@echo off
chcp 65001 >nul
title Remark Installer Build

cd /d "%~dp0"

echo === Remark – Installer wird erstellt ===
echo.

echo 1/2 Frontend wird gebaut...
call npm run build
if %errorlevel% neq 0 (
    echo FEHLER: Frontend-Build fehlgeschlagen
    pause
    exit /b 1
)
echo Frontend erfolgreich gebaut
echo.

echo 2/2 Tauri-Installer wird gebaut (MSI + NSIS)...
call npx tauri build
if %errorlevel% neq 0 (
    echo FEHLER: Installer-Build fehlgeschlagen
    pause
    exit /b 1
)
echo.
echo === Fertig! Installer liegt in src-tauri\target\release\bundle\ ===
echo.
pause
