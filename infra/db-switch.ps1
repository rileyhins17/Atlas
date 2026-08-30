<#
  Point Atlas at a different Postgres, in one command.

  WHY THIS EXISTS: moving hosts by hand is six steps, and the two that go wrong
  go wrong quietly. Neon's free compute quota ran out in August 2026 and took
  the product down with no way to dump the data, which made "we can change host
  cheaply" a property worth actually having rather than assuming. A migration
  you have scripted is a migration you can repeat under pressure.

  It refuses the two mistakes that cost the most time, rather than letting the
  failure show up later as a timeout or as silently empty search results:

    - the transaction pooler used as the DIRECT url. Migrations need session
      state and prepared statements, which PgBouncer in transaction mode does
      not give them.
    - Supabase's `db.<ref>.supabase.co` direct host, which is IPv6-only on new
      projects and simply times out from a home connection. The session pooler
      is the IPv4 answer.

  PREFERRED usage — put the two lines in .env with an editor, then:

    powershell -File infra\db-switch.ps1 -FromEnv

  Nothing secret is typed, so nothing lands in argv, in a PowerShell transcript,
  or in ConsoleHost_history.txt. A connection string contains a password, and a
  password on a command line outlives the command.

  Or pass them directly, accepting that cost (quote them — they contain
  characters PowerShell will otherwise eat):

    powershell -File infra\db-switch.ps1 -Pooled "<6543 url>" -Direct "<5432 url>"

  Either way the URLs are never printed and never logged, and in the second form
  .env is copied to a timestamped backup first, so the previous database is one
  file-rename away.
#>
param(
  [Parameter(ParameterSetName = 'Urls', Mandatory = $true)][string]$Pooled,
  [Parameter(ParameterSetName = 'Urls', Mandatory = $true)][string]$Direct,
  # Read the URLs already in .env instead of taking them as arguments. PREFER
  # THIS: a connection string on the command line is a password in argv, in the
  # PowerShell transcript, and in ConsoleHost_history.txt. Put the two lines in
  # .env with an editor, then run with -FromEnv and nothing is ever typed.
  [Parameter(ParameterSetName = 'FromEnv', Mandatory = $true)][switch]$FromEnv,
  # Apply and verify, but leave the running origin alone.
  [switch]$NoRestart
)

$ErrorActionPreference = 'Stop'

# Derived from this file's own location, like every other script in here.
$Repo    = Split-Path -Parent $PSScriptRoot
$EnvFile = Join-Path $Repo '.env'

# Set once .env has been rewritten, so a later failure can put it back.
$script:Backup = $null

<#
  A failed switch must leave the machine exactly as it was.

  Without this, a migrate that fails halfway leaves .env pointing at a database
  that does not work — and the health watchdog restarts the API within two
  minutes, onto the broken one. The switch would take the site down rather than
  simply not happening.
#>
function Fail($msg) {
  Write-Host "REFUSED: $msg" -ForegroundColor Red
  if ($script:Backup -and (Test-Path $script:Backup)) {
    Copy-Item $script:Backup $EnvFile -Force
    Write-Host 'Restored the previous .env. Nothing has changed.' -ForegroundColor Yellow
  }
  exit 1
}

function Step($msg) { Write-Host "`n== $msg" -ForegroundColor Cyan }

# ── Read from .env when asked, so no secret is ever typed ────────────────────

if (-not (Test-Path $EnvFile)) { Fail ".env not found at $EnvFile" }

if ($FromEnv) {
  $existing = Get-Content $EnvFile -Raw
  if ($existing -match '(?m)^DATABASE_URL=(.*)$')        { $Pooled = $Matches[1].Trim() }
  if ($existing -match '(?m)^DIRECT_DATABASE_URL=(.*)$') { $Direct = $Matches[1].Trim() }
  if (-not $Pooled -or -not $Direct) {
    Fail 'DATABASE_URL and DIRECT_DATABASE_URL must both be set in .env to use -FromEnv.'
  }
  Step 'Read both URLs from .env'
}

# ── Validate before touching anything ────────────────────────────────────────
#
# Name whichever the value actually came from. Being told to fix "-Direct" when
# you set DIRECT_DATABASE_URL in a file sends you looking in the wrong place.

if ($FromEnv) {
  $PooledLabel = 'DATABASE_URL in .env'
  $DirectLabel = 'DIRECT_DATABASE_URL in .env'
}
else {
  $PooledLabel = '-Pooled'
  $DirectLabel = '-Direct'
}

foreach ($pair in @(@($PooledLabel, $Pooled), @($DirectLabel, $Direct))) {
  if ($pair[1] -notmatch '^postgres(ql)?://') {
    Fail "$($pair[0]) is not a postgres URL."
  }
}

if ($Direct -match ':6543/') {
  Fail "$DirectLabel is the transaction pooler (port 6543). Migrations cannot run
through PgBouncer in transaction mode. Use the SESSION pooler, port 5432."
}

if ($Direct -match '@db\.[a-z0-9]+\.supabase\.co') {
  Fail "$DirectLabel is Supabase's direct host, which is IPv6-only on new projects
and will time out from this machine. Use the session pooler host
(...pooler.supabase.com, port 5432) instead."
}

if ($Pooled -match '(localhost|127\.0\.0\.1)') {
  Fail "$PooledLabel points at localhost. That is the dev database, not a hosted one."
}

# ── Back up, then rewrite exactly two lines ──────────────────────────────────
#
# Skipped entirely under -FromEnv: the values are already the ones in the file,
# so there is nothing to write and nothing to roll back.

if (-not $FromEnv) {
  $backup = "$EnvFile.bak.$(Get-Date -Format 'yyyyMMdd-HHmmss')"
  Copy-Item $EnvFile $backup
  Step "Backed up .env -> $(Split-Path -Leaf $backup)"

  # Read as one string and replace per-key, so every other line — INVITE_CODE,
  # the encryption key, the API keys — survives byte for byte.
  $text = Get-Content $EnvFile -Raw
  foreach ($entry in @(@('DATABASE_URL', $Pooled), @('DIRECT_DATABASE_URL', $Direct))) {
    $key = $entry[0]
    # [regex]::Escape on the replacement is wrong (it is a literal, not a pattern),
    # but $ in a connection string IS special to -replace, so escape it by hand.
    $value = $entry[1].Replace('$', '$$')
    if ($text -match "(?m)^$key=") {
      $text = $text -replace "(?m)^$key=.*$", "$key=$value"
    }
    else {
      $text = $text.TrimEnd() + "`n$key=$value`n"
    }
  }
  Set-Content -Path $EnvFile -Value $text -Encoding utf8 -NoNewline
  $script:Backup = $backup
  Step 'Wrote DATABASE_URL and DIRECT_DATABASE_URL'
}

# ── Stop the origin before touching the schema ───────────────────────────────
#
# `prisma generate` REWRITES query_engine-windows.dll.node, and a running node
# process holds that file open. Windows then fails the rename with EPERM and the
# switch dies after the migrations have already been applied — the worst place
# to stop, because .env now points at the new database while the API is still
# serving from the old one.
#
# Stopping first also makes the operation coherent: the API is about to be
# pointed somewhere else, so serving from the old database halfway through a
# migration was never right. This is the switch's defined downtime.

$server = Join-Path $PSScriptRoot 'atlas-server.ps1'
Step 'Stopping the origin (it holds the Prisma engine open)'
& powershell -ExecutionPolicy Bypass -File $server stop | Out-Null

# ── Apply the schema ─────────────────────────────────────────────────────────
#
# migrate deploy runs with its CWD at packages/db and Prisma only reads a .env
# beside the schema or in the CWD, so it never sees the repo-root file. Passing
# it through the environment is the documented way round that.

$env:DIRECT_DATABASE_URL = $Direct
$env:DATABASE_URL        = $Pooled

Step 'Applying migrations'
Push-Location $Repo
try {
  pnpm --filter @atlas/db migrate:deploy
  if ($LASTEXITCODE -ne 0) { Fail 'migrate deploy failed.' }

  Step 'Regenerating the Prisma client'
  pnpm --filter @atlas/db generate
  if ($LASTEXITCODE -ne 0) { Fail 'prisma generate failed.' }

  # The check that matters. A clean `migrate deploy` does NOT prove the database
  # is usable — see scripts/verify.mjs for the specific way it lies.
  Step 'Verifying'
  node (Join-Path $Repo 'packages\db\scripts\verify.mjs')
  if ($LASTEXITCODE -ne 0) { Fail 'the database is not ready to serve. Nothing was restarted.' }
}
finally {
  Pop-Location
}

# ── Restart the origin so the API picks up the new .env ──────────────────────

if ($NoRestart) {
  Write-Host "`nDone, but THE ORIGIN IS STOPPED (-NoRestart) - atlaslife.app is down" -ForegroundColor Yellow
  Write-Host 'until you run:  powershell -File "infra\Atlas Server.cmd"'
  exit 0
}

# Stop rolling .env back from here on. The database is migrated and verified, so
# the new values are the CORRECT ones — reverting them because a restart failed
# would throw away good work and point a healthy app at the old database. What a
# failure past this line means is that a restart is owed, not that the switch was
# wrong.
$script:Backup = $null
Step 'Restarting the origin'
& powershell -ExecutionPolicy Bypass -File $server stop
& powershell -ExecutionPolicy Bypass -File $server start
if ($LASTEXITCODE -ne 0) { Fail 'the origin did not come back up. See infra\server.log.' }

# probe=1 forces a live database check. This is the one caller allowed to pass
# it — never the watchdog, which polls every two minutes forever.
Step 'Checking the API against the new database'
try {
  $health = (Invoke-WebRequest 'http://localhost:4000/health?probe=1' -TimeoutSec 20 -UseBasicParsing).Content | ConvertFrom-Json
  Write-Host "  status=$($health.status)  db=$($health.db)"
  if ($health.db -ne 'ok') { Fail 'the API is up but cannot reach the new database.' }
}
catch {
  Fail "could not reach /health: $($_.Exception.Message)"
}

Write-Host "`nAtlas is now on the new database." -ForegroundColor Green
if (-not $FromEnv) { Write-Host "Previous .env: $(Split-Path -Leaf $backup)" }
