@echo off
title ACC Dev Server
color 0A
cd /d "%~dp0"

echo.
echo  ==========================================
echo   ACC Dev Server
echo  ==========================================
echo.

REM ── Kill anything already on port 3000-3003 ─────────────────────────────────
echo  [....] Checking for running instances...
for %%p in (3000 3001 3002 3003) do (
    for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":%%p "') do (
        taskkill /F /PID %%a >nul 2>&1
    )
)
echo  [ OK ] Cleared old instances.
echo.

REM ── Start dev server ─────────────────────────────────────────────────────────
echo  [ GO ] Starting dev server at http://localhost:3000
echo.
echo  Hot-reload is ON. Code changes appear instantly -- no restart needed.
echo  Errors print below. Copy and paste them to Claude.
echo  Press Ctrl+C to stop.
echo  ==========================================
echo.

REM ── Open browser once port 3000 is accepting connections ────────────────────
start /b powershell -NoProfile -WindowStyle Hidden -Command ^
  "while(-not (Test-NetConnection localhost -Port 3000 -WarningAction SilentlyContinue).TcpTestSucceeded){Start-Sleep 1}; Start-Process 'http://localhost:3000'"

npm run dev

echo.
echo  Server stopped.
pause
