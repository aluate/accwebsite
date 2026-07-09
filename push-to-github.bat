@echo off
echo === ACC Website — Git Push to GitHub ===
echo.

cd /d "%~dp0"

REM Remove stale lock file if it exists
if exist ".git\index.lock" (
    echo Removing stale git lock...
    del /f ".git\index.lock"
)

REM Pull latest from remote first (rebase to keep history clean)
echo Pulling latest from GitHub...
git pull --rebase origin master
if %errorlevel% neq 0 (
    echo ERROR: git pull failed. Resolve conflicts and try again.
    pause
    exit /b 1
)

REM Stage everything
git add -A
if %errorlevel% neq 0 (
    echo ERROR: git add failed
    pause
    exit /b 1
)

REM Commit — use first argument as message, or prompt for one
if "%~1"=="" (
    set /p MSG="Commit message: "
) else (
    set MSG=%~1
)

git commit -m "%MSG%"
if %errorlevel% neq 0 (
    echo Nothing new to commit - already up to date
)

REM Push
echo.
echo Pushing to GitHub...
git push origin master
if %errorlevel% neq 0 (
    echo ERROR: push failed.
    pause
    exit /b 1
)

echo.
echo === Done! Vercel will deploy automatically. ===
echo Watch: https://vercel.com/aluates-projects/accwebsite-cd58/deployments
pause
