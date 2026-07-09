##############################################################
#  ACC Website - Local PostgreSQL Setup
#  Run once after installing PostgreSQL.
#  Right-click -> "Run with PowerShell"
##############################################################

Set-Location $PSScriptRoot

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  ACC Website - Local Database Setup" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Find psql.exe
$psql = Get-ChildItem "C:\Program Files\PostgreSQL" -Recurse -Filter "psql.exe" -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName
if (-not $psql) {
    Write-Host "ERROR: Could not find psql.exe under C:\Program Files\PostgreSQL" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}
Write-Host "Found psql at: $psql" -ForegroundColor Gray

# Step 1: Get postgres password
$pgPass = Read-Host "Enter the password for the 'postgres' user"
$pgPass = $pgPass.Trim()
$localUrl = "postgresql://postgres:${pgPass}@localhost:5432/acc_website"

# Step 2: Create the database
Write-Host ""
Write-Host "[1/4] Creating database 'acc_website'..." -ForegroundColor Yellow
$env:PGPASSWORD = $pgPass
$createDb = & $psql -U postgres -c "CREATE DATABASE acc_website;" 2>&1
if ($LASTEXITCODE -ne 0 -and ($createDb -notmatch "already exists")) {
    Write-Host "ERROR: Could not create database. Check your password." -ForegroundColor Red
    Write-Host $createDb
    Read-Host "Press Enter to exit"
    exit 1
}
Write-Host "  OK" -ForegroundColor Green

# Step 3: Write .env.local
Write-Host ""
Write-Host "[2/4] Updating .env.local..." -ForegroundColor Yellow
$envFile = ".env.local"
if (Test-Path $envFile) {
    $envContent = Get-Content $envFile -Raw
    # Remove any previous local-setup block we added
    $envContent = $envContent -replace '(?s)# LOCAL PostgreSQL \(active\)\r?\nDATABASE_URL="[^"]*"\r?\n\r?\n# Supabase \(uncomment to switch back to cloud\)\r?\n', ''
    # Comment out any remaining active DATABASE_URL lines
    $envContent = $envContent -replace '(?m)^(DATABASE_URL=)', '# $1'
    # Prepend local URL
    $envContent = "# LOCAL PostgreSQL (active)`r`nDATABASE_URL=`"$localUrl`"`r`n`r`n# Supabase (uncomment to switch back to cloud)`r`n" + $envContent
    [System.IO.File]::WriteAllText((Resolve-Path $envFile), $envContent, [System.Text.Encoding]::UTF8)
} else {
    Set-Content $envFile "DATABASE_URL=`"$localUrl`""
}
Write-Host "  OK" -ForegroundColor Green

# Step 4: Run db-push
Write-Host ""
Write-Host "[3/4] Creating tables (db-push)..." -ForegroundColor Yellow
node scripts/db-push.mjs
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: db-push failed." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}
Write-Host "  OK" -ForegroundColor Green

# Step 5: Seed admin accounts
Write-Host ""
Write-Host "[4/4] Creating admin accounts..." -ForegroundColor Yellow
node scripts/seed-admin-accounts.mjs
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Seed failed." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}
Write-Host "  OK" -ForegroundColor Green

# Done
Write-Host ""
Write-Host "==========================================" -ForegroundColor Green
Write-Host "  All done! Run dev.bat to start the app." -ForegroundColor Green
Write-Host "  Login: residential@advancedcabinets.net" -ForegroundColor Green
Write-Host "  Password: Acc2026!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host ""
Read-Host "Press Enter to close"
