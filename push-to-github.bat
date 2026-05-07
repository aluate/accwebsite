@echo off
echo === ACC Website — Git Push to GitHub ===
echo.

cd /d "%~dp0"

REM Remove stale lock file if it exists
if exist ".git\index.lock" (
    echo Removing stale git lock...
    del /f ".git\index.lock"
)

REM Stage everything
git add -A
if %errorlevel% neq 0 (
    echo ERROR: git add failed
    pause
    exit /b 1
)

REM Commit
git commit -m "Migrate to Supabase Postgres + Vercel deployment

- Replace better-sqlite3 with postgres npm package (Supabase)
- Convert all 55+ files from sync SQLite to async Postgres tagged templates
- Migrate file storage from local disk to Supabase Storage
- Add export const runtime = nodejs to all PDF routes
- Fix hardcoded localhost in portal logout route
- Rewrite lib/mailer.ts to use GMAIL_USER/GMAIL_APP_PASSWORD
- Add scripts/_db.mjs shared Postgres helper for local scripts
- Rewrite all scripts to use Postgres instead of better-sqlite3
- Add db-push.mjs for idempotent Supabase schema push
- Add Vercel guard on catalog PUT (filesystem not writable in prod)"

if %errorlevel% neq 0 (
    echo Nothing new to commit - already up to date
)

REM Push
echo.
echo Pushing to GitHub...
git push origin main
if %errorlevel% neq 0 (
    echo Trying to set upstream...
    git push --set-upstream origin main
)

echo.
echo === Done! ===
echo Next: Go to Vercel dashboard and add environment variables.
echo See VERCEL_ENV_VARS.txt in this folder.
pause
