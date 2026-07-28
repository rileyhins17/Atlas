<#
  Atlas watchdog.

  The site is served from this PC through a Cloudflare Tunnel, so the public
  origin depends on FOUR local processes. Any one dying takes atlaslife.app
  down with a Cloudflare 530 — and nothing on this machine notices, because
  the app itself is still happily serving on localhost. That is exactly how a
  restart of the node servers left the tunnel dead and the site down until
  someone happened to load it.

  Restarts only what is actually missing, so it is safe to run every minute.
  Register with:
    schtasks /create /tn "Atlas health" /tr "powershell -ExecutionPolicy Bypass -File C:\Users\riley\atlas\infra\atlas-health.ps1" /sc minute /mo 2 /f
#>
$ErrorActionPreference = 'SilentlyContinue'
$atlas = 'C:\Users\riley\atlas'
$cfd   = 'C:\Program Files (x86)\cloudflared\cloudflared.exe'
$caddy = 'C:\Users\riley\AppData\Local\Microsoft\WinGet\Packages\CaddyServer.Caddy_Microsoft.Winget.Source_8wekyb3d8bbwe\caddy.exe'
$log   = "$atlas\infra\health.log"

function Note($msg) { "$(Get-Date -Format s)  $msg" | Add-Content $log }

function Up($url) {
  try { (Invoke-WebRequest -Uri $url -TimeoutSec 8 -UseBasicParsing).StatusCode -lt 400 }
  catch { $false }
}

# The API and web servers: check the port, not the process list — a hung node
# process is worse than a dead one and only a real request tells them apart.
if (-not (Up 'http://localhost:4000/health')) {
  Note 'API down — restarting'
  Start-Process -FilePath 'cmd' -ArgumentList '/c','pnpm --filter @atlas/api start' -WorkingDirectory $atlas -WindowStyle Hidden
  Start-Sleep -Seconds 15
}
if (-not (Up 'http://localhost:3000/')) {
  Note 'Web down — restarting'
  Start-Process -FilePath 'cmd' -ArgumentList '/c','pnpm --filter @atlas/web start' -WorkingDirectory $atlas -WindowStyle Hidden
  Start-Sleep -Seconds 15
}

# Caddy and cloudflared have no health endpoint of their own; presence is the
# only signal, and it is enough because neither hangs the way node can.
if (-not (Get-Process caddy -ErrorAction SilentlyContinue)) {
  Note 'Caddy missing — starting'
  Start-Process -FilePath $caddy -ArgumentList 'run','--config',"$atlas\infra\Caddyfile.tunnel" -WindowStyle Hidden
  Start-Sleep -Seconds 4
}
if (-not (Get-Process cloudflared -ErrorAction SilentlyContinue)) {
  Note 'Tunnel missing — starting'
  Start-Process -FilePath $cfd -ArgumentList 'tunnel','run','atlas' -WindowStyle Hidden
  Start-Sleep -Seconds 8
}

# The only check that matters: can the public actually reach it?
if (-not (Up 'https://atlaslife.app/today')) { Note 'STILL DOWN from the outside after repair' }
