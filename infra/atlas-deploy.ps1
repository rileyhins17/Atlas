<#
  Atlas auto-deploy: puts a merge to `main` on atlaslife.app by itself.

  Registered as the "Atlas deploy" scheduled task, every five minutes:
    powershell -File infra\atlas-deploy.ps1 -Register
    powershell -File infra\atlas-deploy.ps1 -Unregister
  See what it WOULD do right now, touching nothing:
    powershell -File infra\atlas-deploy.ps1 -Check
  Deploy now, even if already up to date:
    powershell -File infra\atlas-deploy.ps1 -Force

  PULL, not push. This machine asks GitHub whether main moved; nothing on the
  internet can reach in. The obvious alternative — a GitHub Actions runner on
  this PC — is one the repo cannot safely have: it is public, and a stranger's
  pull request can end up executing on a self-hosted runner.

  It stands down, doing nothing at all, unless every one of these holds:
    - the stack is RUNNING (ports 4000 and 3000). Stopped means someone is
      gaming; a deploy then would be a build nobody asked for, at a bad time.
    - the clone is on `main`, with no uncommitted changes to tracked files.
    - origin/main is AHEAD and a fast-forward of what is here.
    - the new commits add no database migration. Production migrations are
      applied by hand (see CLAUDE.md), and code that needs a column the
      database does not have 500s every route that reads it.
    - that exact commit has not already failed to build here.

  A deploy costs a few minutes of downtime: the node servers must stop, because
  they hold the Prisma query-engine DLL the build replaces (EPERM otherwise).
  Caddy and the tunnel stay up. If the build or the start fails, it rolls back
  to the commit that was running and rebuilds that, and remembers the failed
  commit so it does not retry it every five minutes.

  Log: infra\deploy.log (gitignored), one line per event.
#>
param(
  [switch]$Register,
  [switch]$Unregister,
  [switch]$Check,
  [switch]$Force
)

$ErrorActionPreference = 'Stop'

# Derived, never hardcoded: this file lives in <repo>\infra.
$Repo      = Split-Path -Parent $PSScriptRoot
$Log       = Join-Path $PSScriptRoot 'deploy.log'
$ServerPs1 = Join-Path $PSScriptRoot 'atlas-server.ps1'
$TaskName  = 'Atlas deploy'
$Watchdog  = 'Atlas health'
# Outside the working tree, so remembering a failure can never dirty it.
$StateDir  = Join-Path $env:LOCALAPPDATA 'Atlas'
$FailedAt  = Join-Path $StateDir 'deploy-failed.txt'

function Note($msg) {
  # One line per event, however long the message: a log that cannot be tailed
  # is a log nobody reads.
  "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $($msg -replace '\s*\r?\n\s*', ' ')" |
    Add-Content -Path $Log -Encoding utf8
}

# For a standing condition — wrong branch, a dirty tree, a pending migration.
# Written once, not every five minutes: 288 identical lines a day is how a log
# stops being read. -Check prints it regardless.
function Say($msg) {
  $msg = $msg -replace '\s*\r?\n\s*', ' '
  if ($Check) { Write-Host $msg; return }
  $last = if (Test-Path $Log) { Get-Content $Log -Tail 1 } else { '' }
  if (-not $last.EndsWith($msg)) { Note $msg }
}

# ── Scheduling ───────────────────────────────────────────────────────────────

if ($Unregister) {
  schtasks /delete /tn $TaskName /f *> $null
  Write-Host "'$TaskName' unregistered."
  exit 0
}
if ($Register) {
  $cmd = "powershell -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$PSCommandPath`""
  schtasks /create /tn $TaskName /tr $cmd /sc minute /mo 5 /f *> $null
  if ($LASTEXITCODE -ne 0) { Write-Host 'Could not register the scheduled task.' -ForegroundColor Red; exit 1 }
  try {
    # A deploy is a build: allow it the time, and never let a second copy
    # start on top of one still running.
    Set-ScheduledTask -TaskName $TaskName -Settings (New-ScheduledTaskSettingsSet `
      -MultipleInstances IgnoreNew `
      -DontStopIfGoingOnBatteries `
      -AllowStartIfOnBatteries `
      -ExecutionTimeLimit (New-TimeSpan -Minutes 30)) *> $null
  } catch {
    Write-Host "Registered, but could not set the task's settings: $_" -ForegroundColor Yellow
  }
  Write-Host "Registered '$TaskName' - every 5 minutes, deploying main while Atlas is running."
  exit 0
}

# ── Gates ────────────────────────────────────────────────────────────────────

function Test-Port([int]$Port) {
  # A real connection rather than the listener table: it is what a request
  # would see, and it works wherever PowerShell does.
  $client = New-Object System.Net.Sockets.TcpClient
  try {
    $wait = $client.BeginConnect('127.0.0.1', $Port, $null, $null)
    return ($wait.AsyncWaitHandle.WaitOne(1500) -and $client.Connected)
  } catch { return $false } finally { $client.Close() }
}

function Git([string[]]$GitArgs) {
  $out = & git -C $Repo @GitArgs 2>&1
  if ($LASTEXITCODE -ne 0) { throw "git $($GitArgs -join ' ') failed: $out" }
  return ($out | Out-String).Trim()
}

# Never two at once, whatever started them: a deploy is minutes of building.
$mutex = New-Object System.Threading.Mutex($false, 'Local\AtlasDeploy')
if (-not $mutex.WaitOne(0)) { if ($Check) { Write-Host 'Another deploy is running.' }; exit 0 }

try {
  if (-not ((Test-Port 4000) -and (Test-Port 3000))) {
    # Silent in the log: this is the normal state whenever the stack is off.
    if ($Check) { Write-Host 'Atlas is not running - nothing would happen (start it first).' }
    exit 0
  }

  $branch = Git @('rev-parse', '--abbrev-ref', 'HEAD')
  if ($branch -ne 'main') { Say "SKIPPED: the clone is on '$branch', not main."; exit 0 }

  $dirty = Git @('status', '--porcelain', '--untracked-files=no')
  if ($dirty) { Say "SKIPPED: uncommitted changes to tracked files: $dirty"; exit 0 }

  Git @('fetch', '--quiet', 'origin', 'main') | Out-Null
  $here  = Git @('rev-parse', 'HEAD')
  $there = Git @('rev-parse', 'origin/main')
  $short = $there.Substring(0, 7)

  if ($here -eq $there -and -not $Force) {
    if ($Check) { Write-Host "Up to date at $short - nothing would happen." }
    exit 0
  }

  & git -C $Repo merge-base --is-ancestor $here $there 2>$null
  if ($LASTEXITCODE -ne 0) {
    Say "SKIPPED: origin/main ($short) is not a fast-forward of what is checked out - sort it out by hand."
    exit 0
  }

  $migrations = Git @('diff', '--name-only', $here, $there, '--', 'packages/db/prisma/migrations')
  if ($migrations -and -not $Force) {
    Say "NEEDS A MIGRATION - not deploying $short. Apply it by hand (CLAUDE.md), then run with -Force: $migrations"
    exit 0
  }

  if (-not $Force -and (Test-Path $FailedAt) -and ((Get-Content $FailedAt -Raw).Trim() -eq "failed $there")) {
    if ($Check) { Write-Host "$short already failed to deploy here - run with -Force to try again." }
    exit 0
  }

  $count = Git @('rev-list', '--count', "$here..$there")
  if ($Check) {
    Write-Host "Would deploy $short ($count new commit(s)): stop the node servers, pull, install, build, start."
    exit 0
  }

  # ── Deploy ─────────────────────────────────────────────────────────────────

  function Invoke-Step([string]$Label, [string]$CommandLine) {
    # Through cmd so pnpm's shim resolves as it does for a person, at
    # BelowNormal so a game keeps the CPU. Output to a temp file, and only its
    # tail reaches the log when a step fails.
    $out = Join-Path $env:TEMP "atlas-deploy-$Label.txt"
    $p = Start-Process -FilePath 'cmd' -ArgumentList '/c', "$CommandLine > `"$out`" 2>&1" `
      -WorkingDirectory $Repo -WindowStyle Hidden -PassThru
    $null = $p.Handle  # without this, ExitCode can read as null once it exits
    try { $p.PriorityClass = 'BelowNormal' } catch { }
    $p.WaitForExit()
    if ($p.ExitCode -ne 0) {
      $tail = (Get-Content $out -Tail 12 -ErrorAction SilentlyContinue) -join ' | '
      Note "$Label FAILED (exit $($p.ExitCode)): $tail"
      return $false
    }
    return $true
  }

  function Stop-NodeServers {
    # The watchdog would restart the web server into a half-written .next, so
    # it is paused first; atlas-server's start re-registers it.
    schtasks /change /tn $Watchdog /disable *> $null
    # Every node process running out of THIS clone, not just the two port
    # owners: any of them can hold the Prisma DLL. Nothing else is touched.
    $mine = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
      Where-Object { $_.CommandLine -and $_.CommandLine.Contains($Repo) }
    foreach ($proc in $mine) { Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Seconds 3
  }

  function Build-And-Start {
    if (-not (Invoke-Step 'install' 'pnpm install --frozen-lockfile')) { return $false }
    if (-not (Invoke-Step 'build' 'pnpm build')) { return $false }
    $err = & powershell -ExecutionPolicy Bypass -File $ServerPs1 start 2>&1
    if ($LASTEXITCODE -ne 0) { Note "start FAILED: $err"; return $false }
    return $true
  }

  function Test-Public {
    for ($i = 0; $i -lt 12; $i++) {
      try {
        if ((Invoke-WebRequest 'https://atlaslife.app/' -TimeoutSec 10 -UseBasicParsing).StatusCode -eq 200) { return $true }
      } catch { }
      Start-Sleep -Seconds 5
    }
    return $false
  }

  Note "DEPLOYING $short ($count new commit(s)) over $($here.Substring(0, 7))"
  Stop-NodeServers
  Git @('merge', '--ff-only', '--quiet', $there) | Out-Null

  if (Build-And-Start) {
    if (Test-Public) { Note "DEPLOYED $short - atlaslife.app answers 200" }
    else { Note "DEPLOYED $short, but atlaslife.app did not answer 200 within a minute - check infra\health.log" }
    if (Test-Path $FailedAt) { Remove-Item $FailedAt -Force }
    exit 0
  }

  # ── Roll back ──────────────────────────────────────────────────────────────
  # The tree was verified clean before the merge, so resetting it loses nothing
  # that was not just pulled.
  Note "ROLLING BACK to $($here.Substring(0, 7)) - $short did not build or start"
  New-Item -ItemType Directory -Force -Path $StateDir | Out-Null
  Set-Content -Path $FailedAt -Value "failed $there"
  Stop-NodeServers
  Git @('reset', '--hard', '--quiet', $here) | Out-Null
  if (Build-And-Start) { Note "ROLLED BACK - $($here.Substring(0, 7)) is serving again" }
  else {
    Note 'ROLLBACK FAILED - the site is DOWN. Open Atlas Server, or run pnpm build by hand.'
    # Leave the watchdog trying rather than paused by a deploy that gave up.
    schtasks /change /tn $Watchdog /enable *> $null
  }
  exit 1
}
catch {
  Note "ERROR: $($_.Exception.Message)"
  # Never leave the watchdog paused by a deploy that died part-way.
  schtasks /change /tn $Watchdog /enable *> $null
  exit 1
}
finally {
  $mutex.ReleaseMutex()
  $mutex.Dispose()
}
