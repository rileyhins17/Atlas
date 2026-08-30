<#
  Atlas watchdog.

  The site is served from this PC through a Cloudflare Tunnel, so the public
  origin depends on FOUR local processes. Any one dying takes atlaslife.app
  down with a Cloudflare 530 — and nothing on this machine notices, because
  the app itself is still happily serving on localhost. That is exactly how a
  restart of the node servers left the tunnel dead and the site down until
  someone happened to load it.

  Restarts only what is actually missing, so it is safe to run every minute.
  Register from the repo root, so the path follows the clone rather than being
  retyped (schtasks stores the absolute path it is given, which is fine — the
  point is not to hardcode a DIFFERENT one by hand):
    schtasks /create /tn "Atlas health" /tr "powershell -ExecutionPolicy Bypass -File $PWD\infra\atlas-health.ps1" /sc minute /mo 2 /f
#>
$ErrorActionPreference = 'SilentlyContinue'
# Derived from this file's own location: <repo>\infra\atlas-health.ps1, so the
# repo is one level up. Hardcoding it meant the watchdog silently supervised a
# directory that did not exist on any machine but one.
$atlas = Split-Path -Parent $PSScriptRoot
$log   = Join-Path $PSScriptRoot 'health.log'

# Preferred install locations, falling back to PATH.
$cfd   = 'C:\Program Files (x86)\cloudflared\cloudflared.exe'
$caddy = Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Packages\CaddyServer.Caddy_Microsoft.Winget.Source_8wekyb3d8bbwe\caddy.exe'
if (-not (Test-Path $cfd))   { $cfd   = (Get-Command cloudflared -ErrorAction SilentlyContinue).Source }
if (-not (Test-Path $caddy)) { $caddy = (Get-Command caddy -ErrorAction SilentlyContinue).Source }

function Note($msg) { "$(Get-Date -Format s)  $msg" | Add-Content $log }

function Up($url) {
  try { (Invoke-WebRequest -Uri $url -TimeoutSec 8 -UseBasicParsing).StatusCode -lt 400 }
  catch { $false }
}

# The API and web servers: check the port, not the process list — a hung node
# process is worse than a dead one and only a real request tells them apart.
if (-not (Up 'http://localhost:4000/health')) {
  Note 'API down - restarting'
  Start-Process -FilePath 'cmd' -ArgumentList '/c','pnpm --filter @atlas/api start' -WorkingDirectory $atlas -WindowStyle Hidden
  Start-Sleep -Seconds 15
}
else {
  # The API answering is not the same as the API working. /health returns 200
  # with status "degraded" when the database is unreachable, deliberately: a
  # restart cannot fix Neon, and a restarting API 502s every route instead of
  # only the ones needing data. But that state has to be WRITTEN DOWN, or the
  # symptom reaching a human is "sign-in is broken" with a healthy-looking
  # watchdog log and nothing pointing at the database.
  #
  # NEVER add ?probe=1 here. /health answers from its last known database state
  # unless somebody has actually used the API since, precisely so this poll --
  # every two minutes, forever -- cannot keep a serverless Postgres awake. That
  # is what burned the Neon compute quota and took the site down for real.
  #
  # Logged once per outage, not once per sweep: 720 identical lines a day is how
  # a log stops being read.
  try {
    $h = (Invoke-WebRequest -Uri 'http://localhost:4000/health' -TimeoutSec 8 -UseBasicParsing).Content | ConvertFrom-Json
    if ($h.db -ne 'ok') {
      $last = if (Test-Path $log) { Get-Content $log -Tail 1 } else { '' }
      if ($last -notmatch 'DATABASE UNREACHABLE') {
        Note "API up but DATABASE UNREACHABLE (db=$($h.db), last checked $($h.dbCheckedAt)) - check the database, not the app"
      }
    }
  } catch {}
}
if (-not (Up 'http://localhost:3000/')) {
  Note 'Web down - restarting'
  Start-Process -FilePath 'cmd' -ArgumentList '/c','pnpm --filter @atlas/web start' -WorkingDirectory $atlas -WindowStyle Hidden
  Start-Sleep -Seconds 15
}

# Caddy and cloudflared have no health endpoint of their own; presence is the
# only signal, and it is enough because neither hangs the way node can.
if (-not (Get-Process caddy -ErrorAction SilentlyContinue)) {
  Note 'Caddy missing - starting'
  Start-Process -FilePath $caddy -ArgumentList 'run','--config',"$atlas\infra\Caddyfile.tunnel" -WindowStyle Hidden
  Start-Sleep -Seconds 4
}
# Exactly one tunnel, not "at least one". Each instance opens four edge
# connections, and two of them racing for the same hostname makes the site
# flap — up for one request, 502 for the next. Starting-if-none never noticed
# duplicates, so a watchdog start on top of a startup-script start left two
# running for a day.
$tunnels = @(Get-Process cloudflared -ErrorAction SilentlyContinue)
if ($tunnels.Count -eq 0) {
  Note 'Tunnel missing - starting'
  Start-Process -FilePath $cfd -ArgumentList 'tunnel','run','atlas' -WindowStyle Hidden
  Start-Sleep -Seconds 8
}
elseif ($tunnels.Count -gt 1) {
  # Kill by explicit Id. Piping process objects into Stop-Process failed
  # silently here (the file-wide SilentlyContinue swallowed whatever it
  # objected to), so the duplicate was logged every sweep and never removed —
  # a watchdog that reports a fault it is not fixing is worse than none.
  Note "$($tunnels.Count) tunnels running - killing all but the newest"
  $sorted = @($tunnels | Sort-Object StartTime)
  foreach ($p in $sorted[0..($sorted.Count - 2)]) {
    Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
    Note "  stopped tunnel $($p.Id)"
  }
}

# Same for Caddy: two of them cannot both hold :80/:443, so the loser dies
# silently and leaves a process that proxies nothing.
$proxies = @(Get-Process caddy -ErrorAction SilentlyContinue)
if ($proxies.Count -gt 1) {
  Note "$($proxies.Count) Caddy processes - killing all but the newest"
  $sortedProxies = @($proxies | Sort-Object StartTime)
  foreach ($p in $sortedProxies[0..($sortedProxies.Count - 2)]) {
    Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
  }
}

# Anything this sweep just restarted came back at Normal priority, and this is a
# gaming machine — a web server handling a request a minute must never outrank a
# game for CPU. Idempotent, so it also repairs anything started by hand.
foreach ($port in 4000, 3000) {
  $conn = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($conn) {
    $proc = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
    if ($proc) { try { $proc.PriorityClass = 'BelowNormal' } catch { } }
  }
}
foreach ($proc in Get-Process caddy, cloudflared -ErrorAction SilentlyContinue) {
  try { $proc.PriorityClass = 'BelowNormal' } catch { }
}

# The only check that matters: can the public actually reach it?
#
# Give the edge time to settle first. Killing a duplicate tunnel drops its
# four connections, and Cloudflare needs a moment to route to the survivor —
# checking immediately reported STILL DOWN on a repair that had just worked,
# which would have sent the next person chasing a fault that no longer existed.
Start-Sleep -Seconds 10
if (-not (Up 'https://atlaslife.app/today')) {
  Note 'STILL DOWN from the outside after repair'
} else {
  # Only worth a line when something was actually repaired this sweep.
  if ((Get-Item $log -ErrorAction SilentlyContinue) -and
      ((Get-Content $log -Tail 1) -notmatch 'healthy')) { Note 'healthy' }
}
