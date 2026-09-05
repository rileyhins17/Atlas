<#
  Nightly backup of the Atlas database.

  WHY THIS EXISTS: Supabase's free plan takes NO backups. Atlas holds journal
  entries, finance history and training history — the data whose loss is
  unrecoverable in a way an outage is not. An outage ends; a dropped table does
  not. This is the only thing standing between a mistake and losing all of it.

  It also ends host lock-in for good. A verified nightly dump means moving
  database provider is a restore and a connection string, which is exactly the
  property the August Neon outage proved Atlas did not have — the quota ran out,
  reads included, and there was no way to get the data out at all.

  THE PASSWORD IS NEVER PUT ON A COMMAND LINE. pg_dump accepts a connection URL
  as an argument, but argv is visible to any process listing, so the URL is
  parsed here and handed over as PG* environment variables instead.

  Usage:
    powershell -File infra\atlas-backup.ps1                  # back up now
    powershell -File infra\atlas-backup.ps1 -Dest D:\backups # somewhere else
    powershell -File infra\atlas-backup.ps1 -Register        # nightly at 03:30
    powershell -File infra\atlas-backup.ps1 -Unregister

  The dump is a full copy of everything. Treat the destination as being as
  sensitive as the database itself.
#>
param(
  # Where dumps are written. Prefer a different physical drive to this one; a
  # backup that dies with the disk it was protecting against is not a backup.
  [string]$Dest = (Join-Path (Split-Path -Parent $PSScriptRoot) 'backups'),
  [switch]$Register,
  [switch]$Unregister
)

$ErrorActionPreference = 'Stop'

$Repo     = Split-Path -Parent $PSScriptRoot
$EnvFile  = Join-Path $Repo '.env'
$Log      = Join-Path $PSScriptRoot 'backup.log'
$TaskName = 'Atlas backup'

# Supabase runs PostgreSQL 17. pg_dump refuses outright to dump a server newer
# than itself, so this is a hard floor rather than a preference.
$MinMajor = 17

function Note($msg) { "$(Get-Date -Format s)  $msg" | Add-Content $Log }
function Fail($msg) {
  # One line per event in the log, however many the human-facing message runs
  # to. A log where one failure spans six lines cannot be scanned or tailed.
  Note ("FAILED: " + ($msg -replace '\s*\r?\n\s*', ' '))
  Write-Host "FAILED: $msg" -ForegroundColor Red
  exit 1
}

# ── Scheduling ───────────────────────────────────────────────────────────────

if ($Unregister) {
  schtasks /delete /tn $TaskName /f *> $null
  Write-Host 'Nightly backup unregistered.'
  exit 0
}
if ($Register) {
  $cmd = "powershell -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$PSCommandPath`" -Dest `"$Dest`""
  # 03:30 rather than midnight: nothing else on this machine runs then, and it
  # is late enough that a day's writing is already in.
  schtasks /create /tn $TaskName /tr $cmd /sc daily /st 03:30 /f *> $null
  if ($LASTEXITCODE -ne 0) { Fail 'could not register the scheduled task.' }
  Write-Host "Registered '$TaskName' — daily at 03:30, writing to $Dest"
  exit 0
}

# ── Find a pg_dump new enough to talk to the server ──────────────────────────

$pgDump = (Get-Command pg_dump -ErrorAction SilentlyContinue).Source
if (-not $pgDump) {
  foreach ($major in 18, 17) {
    $candidate = "C:\Program Files\PostgreSQL\$major\bin\pg_dump.exe"
    if (Test-Path $candidate) { $pgDump = $candidate; break }
  }
}
if (-not $pgDump) {
  Fail @"
pg_dump is not installed, so there is nothing to take a backup with.

Install the PostgreSQL client tools once:
  winget install -e --id PostgreSQL.PostgreSQL.17

Then run this again. Nothing else needs changing.
"@
}

$versionText = & $pgDump --version
if ($versionText -match '(\d+)\.') { $major = [int]$Matches[1] } else { $major = 0 }
if ($major -lt $MinMajor) {
  Fail "pg_dump is version $major, but the server is PostgreSQL $MinMajor. pg_dump refuses to dump a newer server than itself. Install PostgreSQL $MinMajor or later."
}

# ── Connection, taken apart so no secret reaches a command line ──────────────

if (-not (Test-Path $EnvFile)) { Fail ".env not found at $EnvFile" }
$envText = Get-Content $EnvFile -Raw
# The SESSION endpoint, not the transaction pooler: pg_dump needs session state
# and holds a consistent snapshot open, which PgBouncer in transaction mode
# cannot give it.
if ($envText -notmatch '(?m)^DIRECT_DATABASE_URL=(.*)$') { Fail 'DIRECT_DATABASE_URL is not set in .env' }
$rawUrl = $Matches[1].Trim()

try { $uri = [uri]$rawUrl } catch { Fail 'DIRECT_DATABASE_URL is not a valid URL.' }
$userInfo = $uri.UserInfo -split ':', 2
if ($userInfo.Count -lt 2) { Fail 'DIRECT_DATABASE_URL has no password in it.' }

# Both halves are percent-encoded in the URL and must be decoded before they go
# into the environment, or a password containing # or & authenticates as
# something else entirely.
$env:PGUSER     = [uri]::UnescapeDataString($userInfo[0])
$env:PGPASSWORD = [uri]::UnescapeDataString($userInfo[1])
$env:PGHOST     = $uri.Host
$env:PGPORT     = if ($uri.Port -gt 0) { $uri.Port } else { 5432 }
$env:PGDATABASE = $uri.AbsolutePath.TrimStart('/')
$env:PGSSLMODE  = 'require'

# ── Dump ─────────────────────────────────────────────────────────────────────

if (-not (Test-Path $Dest)) { New-Item -ItemType Directory -Path $Dest -Force | Out-Null }
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$file  = Join-Path $Dest "atlas-$stamp.dump"

try {
  # Custom format: compressed, and restorable selectively with pg_restore rather
  # than only as one all-or-nothing SQL script.
  & $pgDump --format=custom --no-owner --no-privileges --file=$file
  if ($LASTEXITCODE -ne 0) { Fail "pg_dump exited $LASTEXITCODE" }
}
finally {
  # Do not leave the password sitting in the environment of anything this
  # script goes on to launch.
  $env:PGPASSWORD = $null
}

if (-not (Test-Path $file)) { Fail 'pg_dump reported success but wrote no file.' }
$sizeMb = [math]::Round((Get-Item $file).Length / 1MB, 2)

# ── Prove the dump contains Atlas, not just a reachable database ─────────────
#
# This check exists because the alternative happened. DATABASE_URL was pointed
# at a freshly created, EMPTY project while a migration was half-finished, and
# the 03:30 run dumped it perfectly happily: pg_dump succeeded, a 0.2 MB file
# appeared, and the log recorded "ok". It contained Supabase's own auth and
# storage schemas and NOT ONE application table. Left alone, the 14-day
# rotation would have quietly replaced every good backup with that.
#
# "The dump is the right size" is not the check — an empty database still
# produces a plausible-looking file. The check is that the tables holding the
# data are in there.
$restore = Join-Path (Split-Path -Parent $pgDump) 'pg_restore.exe'
if (Test-Path $restore) {
  $toc = & $restore -l $file 2>&1
  $publicTables = @($toc | Select-String -Pattern 'TABLE DATA public' -SimpleMatch).Count
  # Deliberately low. The point is to catch "none of it", not to break the
  # backup every time a migration adds or removes a table.
  $minTables = 15
  if ($publicTables -lt $minTables) {
    Note "FAIL  $([System.IO.Path]::GetFileName($file))  ${sizeMb} MB  only $publicTables public tables"
    Fail ("The dump holds $publicTables application tables, expected at least $minTables. " +
          "It is being kept as $file for inspection, but it is NOT a usable backup — " +
          "check that DIRECT_DATABASE_URL in .env points at the database Atlas is actually serving.")
  }
  Note "ok  $([System.IO.Path]::GetFileName($file))  ${sizeMb} MB  $publicTables tables"
}
else {
  # Still record it, and say why it was not verified, rather than implying it was.
  Note "ok  $([System.IO.Path]::GetFileName($file))  ${sizeMb} MB  (unverified: pg_restore not found)"
}

# ── Retention ────────────────────────────────────────────────────────────────
#
# 14 daily, then one per week for 8 weeks. Keeping everything forever fills the
# disk; keeping only the newest means a corruption noticed on Friday has already
# overwritten every good copy.

$all = @(Get-ChildItem $Dest -Filter 'atlas-*.dump' | Sort-Object LastWriteTime -Descending)
$keep = [System.Collections.Generic.HashSet[string]]::new()
$now = Get-Date
foreach ($f in $all) { if (($now - $f.LastWriteTime).TotalDays -le 14) { [void]$keep.Add($f.FullName) } }
$weeklies = $all |
  Where-Object { ($now - $_.LastWriteTime).TotalDays -gt 14 } |
  Group-Object { (Get-Date $_.LastWriteTime).ToString('yyyy-ww') } |
  Select-Object -First 8
foreach ($week in $weeklies) { [void]$keep.Add(($week.Group | Sort-Object LastWriteTime -Descending)[0].FullName) }

$removed = 0
foreach ($f in $all) {
  if (-not $keep.Contains($f.FullName)) { Remove-Item $f.FullName -Force -ErrorAction SilentlyContinue; $removed++ }
}
if ($removed -gt 0) { Note "pruned $removed old dump(s); $($keep.Count) kept" }

Write-Host "Backed up to $file (${sizeMb} MB). $($keep.Count) dump(s) kept."
Write-Host "Log: $Log"
