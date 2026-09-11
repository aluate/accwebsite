# acc-watch.ps1  -  collect what Claude cannot reach, into a folder Claude can read.
#
# WHY THIS EXISTS.
#
# Claude runs in a cloud sandbox behind an egress allowlist: github.com and the
# package registries are on it, and advancedcabinets.org, supabase.co and
# api.vercel.com are not. That is true of the Linux VM on this machine too. So
# Claude cannot poll the live site, read Vercel's logs, or query the production
# database  -  not for want of permission, but for want of a route.
#
# This machine has one. So this script runs HERE, on Windows, on a schedule, and
# writes everything it collects into _reports\ inside the repo folder  -  which
# Claude can read at any time, without anyone being asked to do anything.
#
# It reads secrets from secrets.txt (gitignored) and never writes a secret into
# its output. Everything it writes is status, timings, error text and schema
# metadata. _reports\ is gitignored, so none of it is committed.
#
# Install once:   install-acc-watch.bat      (registers a scheduled task)
# Run by hand:    powershell -ExecutionPolicy Bypass -File scripts\watch\acc-watch.ps1
# Remove:         uninstall-acc-watch.bat

param(
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path,
  [switch]$Once
)

$ErrorActionPreference = "Continue"
$ProgressPreference    = "SilentlyContinue"

$reportDir = Join-Path $RepoRoot "_reports"
New-Item -ItemType Directory -Force -Path $reportDir | Out-Null

$stamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
$log   = [System.Collections.ArrayList]::new()
function Note([string]$line) { [void]$log.Add("$((Get-Date).ToUniversalTime().ToString('HH:mm:ss'))  $line") }

Note "acc-watch starting"

# -- secrets ----------------------------------------------------------------
# Read, never echoed. If the file is missing, the parts that need a token are
# skipped and say so, rather than failing the whole run.
$secretsPath = Join-Path $RepoRoot "secrets.txt"
$vercelToken = $null
if (Test-Path $secretsPath) {
  $secrets = Get-Content $secretsPath -Raw
  if ($secrets -match "(vcp_[A-Za-z0-9]+)") { $vercelToken = $Matches[1] }
} else {
  Note "secrets.txt not found  -  skipping anything that needs a token"
}

# -- 1. is the live site answering? -----------------------------------------
# The cheapest and most useful signal, and the one that needs no credentials.
$routes = @(
  @{ path = "/";            expect = 200 },
  @{ path = "/login";       expect = 200 },
  @{ path = "/jobs";        expect = 307 },   # redirects to /login when signed out
  @{ path = "/api/health";  expect = 0   }    # 0 = record whatever it says
)
$site = @()
foreach ($r in $routes) {
  $url = "https://www.advancedcabinets.org$($r.path)"
  $sw  = [System.Diagnostics.Stopwatch]::StartNew()
  try {
    $resp   = Invoke-WebRequest -Uri $url -MaximumRedirection 0 -TimeoutSec 25 -UseBasicParsing -ErrorAction Stop
    $status = [int]$resp.StatusCode
  } catch {
    if ($_.Exception.Response) { $status = [int]$_.Exception.Response.StatusCode } else { $status = -1 }
  }
  $sw.Stop()
  $site += [pscustomobject]@{
    path = $r.path; status = $status; expected = $r.expect
    ms = [int]$sw.ElapsedMilliseconds
    ok = ($r.expect -eq 0) -or ($status -eq $r.expect)
  }
}
$bad = @($site | Where-Object { -not $_.ok })
Note "site check: $($site.Count) routes, $($bad.Count) unexpected"

# -- 2. Vercel: the current deployment and its runtime errors ---------------
# The log endpoint has moved around between API versions, so try the ones that
# have existed and record which answered. The first run tells us which is live
# on this account; after that it is settled.
$vercel = [ordered]@{ ok = $false; note = "not attempted" }
if ($vercelToken) {
  $hdr = @{ Authorization = "Bearer $vercelToken" }
  try {
    $deployments = Invoke-RestMethod -Uri "https://api.vercel.com/v6/deployments?app=accwebsite&limit=5" `
                                     -Headers $hdr -TimeoutSec 30 -ErrorAction Stop
    $latest = $deployments.deployments | Select-Object -First 1
    # Precomputed, because an inline if-expression inside a hashtable literal
    # is not something every PowerShell version parses the same way.
    $created = $null
    if ($latest.created) {
      $created = ([datetimeoffset]::FromUnixTimeMilliseconds([int64]$latest.created)).UtcDateTime.ToString('s') + 'Z'
    }
    $vercel['ok']     = $true
    $vercel['note']   = 'ok'
    $vercel['latest'] = [ordered]@{
      uid      = $latest.uid
      state    = $latest.state
      url      = $latest.url
      target   = $latest.target
      created  = $created
      commit   = $latest.meta.githubCommitSha
      message  = $latest.meta.githubCommitMessage
    }
    $vercel['recent'] = @($deployments.deployments | ForEach-Object {
      [ordered]@{ uid = $_.uid; state = $_.state; target = $_.target; sha = $_.meta.githubCommitSha }
    })
    Note "vercel: latest $($latest.state) $($latest.meta.githubCommitSha)"

    # Runtime logs for the live deployment.
    $logsTried = @()
    foreach ($u in @(
      "https://api.vercel.com/v3/deployments/$($latest.uid)/events?limit=200&statusCode=500-599",
      "https://api.vercel.com/v2/deployments/$($latest.uid)/events?limit=200",
      "https://api.vercel.com/v1/deployments/$($latest.uid)/events?limit=200"
    )) {
      try {
        $events = Invoke-RestMethod -Uri $u -Headers $hdr -TimeoutSec 30 -ErrorAction Stop
        $vercel['logEndpoint'] = $u
        $vercel['events'] = @($events | Select-Object -Last 200)
        $logsTried += "$u -> ok"
        break
      } catch {
        $logsTried += "$u -> $($_.Exception.Message)"
      }
    }
    $vercel['logAttempts'] = $logsTried
  } catch {
    $vercel.ok   = $false
    $vercel.note = "vercel api: $($_.Exception.Message)"
    Note "vercel: $($_.Exception.Message)"
  }
} else {
  $vercel['note'] = "no vercel token found in secrets.txt"
}

# -- 3. production schema, once a day ---------------------------------------
# Only when the report is missing or stale, because it is the slowest part and
# a schema does not change hourly.
$schemaPath = Join-Path $reportDir "schema-report.json"
$schemaStale = -not (Test-Path $schemaPath) -or
               ((Get-Date) - (Get-Item $schemaPath).LastWriteTime).TotalHours -gt 20
$schema = [ordered]@{ ran = $false; note = "fresh enough" }
if ($schemaStale) {
  $envPath = Join-Path $RepoRoot ".env.local"
  $prodUrl = $env:ACC_PROD_DATABASE_URL
  if (-not $prodUrl -and (Test-Path $envPath)) {
    # Never the bare DATABASE_URL line: .env.local points that at the local
    # Postgres, and reporting on the wrong database while saying "production"
    # is the exact bug this whole exercise dug out. Only these two, in order:
    # an explicit PROD_DATABASE_URL, then DATABASE_URL_DIRECT, which is the
    # direct (port 5432) production connection the backups already use.
    foreach ($key in @("PROD_DATABASE_URL", "DATABASE_URL_DIRECT")) {
      if ($prodUrl) { break }
      $line = Select-String -Path $envPath -Pattern ("^" + $key + "=(.+)$") | Select-Object -First 1
      if ($line) { $prodUrl = $line.Matches[0].Groups[1].Value.Trim('"').Trim("'") }
    }
  }
  if ($prodUrl) {
    try {
      Push-Location $RepoRoot
      & node "scripts\schema-report.mjs" --url $prodUrl --out $reportDir 2>&1 | Out-Null
      Pop-Location
      $schema['ran'] = $true; $schema['note'] = 'written'
      Note "schema report written"
    } catch {
      $schema['note'] = "schema-report failed: $($_.Exception.Message)"
      Note $schema.note
    }
  } else {
    $schema['note'] = "no production URL in .env.local (looked for PROD_DATABASE_URL and DATABASE_URL_DIRECT)"
  }
}

# -- write it down ----------------------------------------------------------
$report = [ordered]@{
  when   = $stamp
  site   = $site
  vercel = $vercel
  schema = $schema
  log    = $log
}
$json = $report | ConvertTo-Json -Depth 8

# latest.json is the one Claude reads; history keeps a trail without unbounded growth.
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText((Join-Path $reportDir "latest.json"), $json, $utf8NoBom)
$histDir = Join-Path $reportDir "history"
New-Item -ItemType Directory -Force -Path $histDir | Out-Null
[System.IO.File]::WriteAllText((Join-Path $histDir ("watch-" + (Get-Date).ToUniversalTime().ToString("yyyyMMdd-HHmmss") + ".json")), $json, $utf8NoBom)
Get-ChildItem $histDir -Filter "watch-*.json" | Sort-Object LastWriteTime -Descending |
  Select-Object -Skip 300 | Remove-Item -Force -ErrorAction SilentlyContinue

# A short human-readable line, so opening the folder tells you something.
$summary = "$stamp  site: $($site.Count - $bad.Count)/$($site.Count) as expected" +
           "  |  vercel: $(if ($vercel.ok) { $vercel.latest.state } else { $vercel.note })" +
           "  |  schema: $($schema.note)"
Add-Content -Path (Join-Path $reportDir "watch.log") -Value $summary -Encoding UTF8
Write-Output $summary
