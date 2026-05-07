# Dev-server start/restart helper.
#
# Usage (from anywhere):
#   PS> C:\dev\repos\acc-website\scripts\dev-restart.ps1
#
# What it does:
#   1. Finds and kills any process listening on :3000.
#   2. Clears Next's stale build cache (.next/) so Turbopack starts clean.
#   3. cd's into the repo root and runs `npx next dev --port 3000`.
#
# Safe to run when the server is already up — it'll be replaced.

$ErrorActionPreference = "Stop"
$repoRoot = "C:\dev\repos\acc-website"

function Stop-PortListener {
    param([int]$Port)
    $conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if (-not $conns) { return }
    foreach ($c in $conns) {
        try {
            $procId = $c.OwningProcess
            $proc   = Get-Process -Id $procId -ErrorAction SilentlyContinue
            if ($proc) {
                Write-Host "Stopping listener on :$Port  PID=$procId  Name=$($proc.ProcessName)"
                Stop-Process -Id $procId -Force
            }
        } catch {
            Write-Warning "Could not stop PID $($c.OwningProcess): $_"
        }
    }
    Start-Sleep -Milliseconds 400
}

Write-Host "[acc] Restarting dev server..." -ForegroundColor Cyan
Stop-PortListener -Port 3000

Set-Location $repoRoot

if (Test-Path ".\.next") {
    Write-Host "[acc] Clearing .next cache..."
    Remove-Item ".\.next" -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host "[acc] Starting npx next dev --port 3000 ..." -ForegroundColor Green
# Run in foreground so Karl sees logs. Ctrl+C stops it cleanly.
npx next dev --port 3000
