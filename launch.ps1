# ACC Website Launcher
# Double-click launch.bat to run this.

$ErrorActionPreference = "Stop"

function Write-Ok   ($msg) { Write-Host "  [OK]   $msg" -ForegroundColor Green }
function Write-Warn ($msg) { Write-Host "  [WARN] $msg" -ForegroundColor Yellow }
function Write-Fail ($msg) { Write-Host "  [ERR]  $msg" -ForegroundColor Red }
function Write-Info ($msg) { Write-Host "  [....] $msg" -ForegroundColor DarkGray }

try {
    $host.UI.RawUI.WindowTitle = "ACC Website Launcher"

    Write-Host ""
    Write-Host "  ==========================================" -ForegroundColor Cyan
    Write-Host "   ACC Website + Express Wizard  Launcher"   -ForegroundColor Cyan
    Write-Host "  ==========================================" -ForegroundColor Cyan
    Write-Host ""

    # ── 1. Locate the project folder ─────────────────────────────────────────
    # $PSScriptRoot is set when called via -File; fall back to the .bat's folder
    $projectDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path $MyInvocation.MyCommand.Path }
    Write-Info "Project: $projectDir"
    Set-Location $projectDir

    # ── 2. Find Node.js ───────────────────────────────────────────────────────
    $nodePaths = @(
        "$env:ProgramFiles\nodejs",
        "${env:ProgramFiles(x86)}\nodejs",
        "C:\Program Files\nodejs",
        "C:\Program Files (x86)\nodejs"
    )
    # NVM for Windows
    $nvmBase = "$env:APPDATA\nvm"
    if (Test-Path $nvmBase) {
        Get-ChildItem $nvmBase -Filter "v*" -Directory -ErrorAction SilentlyContinue |
            Sort-Object Name -Descending |
            ForEach-Object { $nodePaths += $_.FullName }
    }

    $nodeDir = $null
    foreach ($p in $nodePaths) {
        if (Test-Path "$p\node.exe") { $nodeDir = $p; break }
    }
    if (-not $nodeDir) {
        $found = Get-Command node -ErrorAction SilentlyContinue
        if ($found) { $nodeDir = Split-Path $found.Source }
    }

    if (-not $nodeDir) {
        Write-Fail "Node.js not found."
        Write-Host ""
        Write-Host "  Install from: https://nodejs.org  (LTS version)" -ForegroundColor White
        Write-Host "  Then close this window and run launch.bat again." -ForegroundColor White
        exit 1
    }

    $env:PATH = "$nodeDir;$env:PATH"
    $nodeVer  = & "$nodeDir\node.exe" --version 2>&1
    Write-Ok "Node.js $nodeVer"

    $npmVer = & npm --version 2>&1
    if ($LASTEXITCODE -ne 0) { throw "npm not found after locating Node at $nodeDir. Reinstall Node.js." }
    Write-Ok "npm v$npmVer"

    # ── 3. .env.local check ───────────────────────────────────────────────────
    if (-not (Test-Path "$projectDir\.env.local")) {
        Write-Host ""
        Write-Warn ".env.local missing — email and admin login won't work."
        Write-Host "  Ask your admin for the .env.local file, then restart." -ForegroundColor Yellow
        Write-Host ""
        Read-Host "  Press Enter to continue anyway"
    }

    # ── 4. Install dependencies ───────────────────────────────────────────────
    Write-Host ""
    if (-not (Test-Path "$projectDir\node_modules\next")) {
        Write-Info "First run — installing dependencies (about 60 seconds)..."
        Write-Host ""
        & npm install
        if ($LASTEXITCODE -ne 0) { throw "npm install failed. Check your internet connection and try again." }
        Write-Host ""
        Write-Ok "Dependencies installed."
    } else {
        Write-Ok "Dependencies present."
    }

    # ── 5. Find a free port 3000-3009 ─────────────────────────────────────────
    Write-Host ""
    $port  = 3000
    $portOk = $false
    while ($port -le 3009) {
        try {
            $l = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $port)
            $l.Start(); $l.Stop()
            $portOk = $true; break
        } catch {
            Write-Info "Port $port in use — trying next..."
            $port++
        }
    }
    if (-not $portOk) { throw "Ports 3000-3009 are all busy. Close other apps and retry." }
    Write-Ok "Port $port available."

    # ── 6. Schedule browser open ─────────────────────────────────────────────
    $url = "http://localhost:$port"
    Write-Host ""
    Write-Host "  ============================================" -ForegroundColor Cyan
    Write-Host "   $url" -ForegroundColor White
    Write-Host "  ============================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  Browser opens in ~5 seconds." -ForegroundColor DarkGray
    Write-Host "  To stop: close this window (or Ctrl+C)." -ForegroundColor DarkGray
    Write-Host ""

    $ErrorActionPreference = "Continue"   # don't let the background job throw
    Start-Job -ScriptBlock { param($u); Start-Sleep 5; Start-Process $u } -ArgumentList $url | Out-Null
    $ErrorActionPreference = "Stop"

    # ── 7. Build if needed, then start production server ─────────────────────
    if (-not (Test-Path "$projectDir\.next\BUILD_ID")) {
        Write-Info "No production build found — building now (about 60 seconds)..."
        Write-Host ""
        & npx next build
        if ($LASTEXITCODE -ne 0) { throw "Build failed. Check the output above for errors." }
        Write-Host ""
        Write-Ok "Build complete."
        Write-Host ""
    } else {
        Write-Ok "Production build present."
        Write-Host ""
    }
    & npx next start --port $port

} catch {
    Write-Host ""
    Write-Fail "Something went wrong:"
    Write-Host ""
    Write-Host "  $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Write-Host "  Full error details:" -ForegroundColor DarkGray
    Write-Host "  $($_ | Out-String)" -ForegroundColor DarkGray
} finally {
    Write-Host ""
    Read-Host "  Press Enter to close"
}
