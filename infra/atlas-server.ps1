<#
  Atlas Server — a one-click control panel for the atlaslife.app origin.

  This PC is a personal and gaming machine first. The old design fought that:
  `start-atlas.cmd` lived in the Startup folder and the watchdog ran every two
  minutes forever, so the stack was always on whether or not anyone was using
  it, and a manual stop was undone within two minutes by its own watchdog.

  So the model here is EXPLICIT: nothing starts at login, nothing restarts after
  you stop it, and stopping is a single click that also retires the watchdog.

  What it costs while running: four processes (api, web, caddy, cloudflared).
  Docker is not one of them — production reads Neon over the network, so the
  local Postgres container is a dev-only thing and stays off.

  Everything Atlas starts is dropped to BelowNormal priority, so a game always
  outranks it for CPU. Serving a handful of requests needs almost none.

  Run with no argument for the window. `start`, `stop` and `status` are for the
  watchdog and for shortcuts.
#>
param(
  [ValidateSet('gui', 'start', 'stop', 'status')]
  [string]$Action = 'gui'
)

$ErrorActionPreference = 'Stop'

# Derived, never hardcoded: this file lives in <repo>\infra.
$Repo    = Split-Path -Parent $PSScriptRoot
$EnvFile = Join-Path $Repo '.env'
$LogFile = Join-Path $PSScriptRoot 'server.log'
$TaskName = 'Atlas health'

$Caddy = Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Packages\CaddyServer.Caddy_Microsoft.Winget.Source_8wekyb3d8bbwe\caddy.exe'
$Cfd   = 'C:\Program Files (x86)\cloudflared\cloudflared.exe'
if (-not (Test-Path $Caddy)) { $Caddy = (Get-Command caddy -ErrorAction SilentlyContinue).Source }
if (-not (Test-Path $Cfd))   { $Cfd   = (Get-Command cloudflared -ErrorAction SilentlyContinue).Source }

function Write-Log($msg) {
  "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $msg" | Add-Content -Path $LogFile -Encoding utf8
}

function Get-PortOwner([int]$Port) {
  $c = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($c) { return Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue }
  return $null
}

function Test-Port([int]$Port) { [bool](Get-PortOwner $Port) }

<#
  A game should never lose a core to a web server that is handling one request a
  minute. Applied after start, because priority cannot be set at launch through
  a cmd shim.
#>
function Set-Background($proc) {
  if ($proc) { try { $proc.PriorityClass = 'BelowNormal' } catch { } }
}

<#
  The config gate. Booting with the dev values would put an EMPTY database behind
  the public domain and quietly accept real signups into it, so this refuses to
  start rather than letting the API discover it later.
#>
function Test-Config {
  if (-not (Test-Path $EnvFile)) { return '.env is missing.' }
  $text = Get-Content $EnvFile -Raw
  if ($text -match 'REPLACE_ME') {
    $keys = [regex]::Matches($text, '(?m)^(\w+)=REPLACE_ME') | ForEach-Object { $_.Groups[1].Value }
    return "Fill these in .env first: $($keys -join ', ')"
  }
  if ($text -match '(?m)^DATABASE_URL=.*(localhost|127\.0\.0\.1)') {
    return 'DATABASE_URL still points at the local dev database, not Neon.'
  }
  if (-not $Cfd)   { return 'cloudflared is not installed.' }
  if (-not $Caddy) { return 'caddy is not installed.' }
  return $null
}

function Get-AtlasStatus {
  $api = Test-Port 4000
  $web = Test-Port 3000
  $cad = [bool](Get-Process caddy -ErrorAction SilentlyContinue)
  $tun = @(Get-Process cloudflared -ErrorAction SilentlyContinue).Count
  $public = $null
  if ($api -and $web -and $cad -and $tun -ge 1) {
    try { $public = (Invoke-WebRequest 'https://atlaslife.app/' -TimeoutSec 8 -UseBasicParsing).StatusCode }
    catch { $public = $_.Exception.Response.StatusCode.value__ }
  }
  [pscustomobject]@{
    Api = $api; Web = $web; Caddy = $cad; Tunnels = $tun; Public = $public
    Running = ($api -and $web -and $cad -and $tun -ge 1)
  }
}

function Start-Atlas {
  $problem = Test-Config
  if ($problem) { Write-Log "REFUSED: $problem"; return $problem }

  Write-Log 'starting'

  if (-not (Test-Port 4000)) {
    Start-Process -FilePath 'cmd' -ArgumentList '/c', 'pnpm --filter @atlas/api start' `
      -WorkingDirectory $Repo -WindowStyle Hidden
  }
  if (-not (Test-Port 3000)) {
    Start-Process -FilePath 'cmd' -ArgumentList '/c', 'pnpm --filter @atlas/web start' `
      -WorkingDirectory $Repo -WindowStyle Hidden
  }

  # Wait for both to bind before the proxy points at them, and before the tunnel
  # forwards to the proxy — the order the whole stack depends on.
  $deadline = (Get-Date).AddSeconds(90)
  while ((Get-Date) -lt $deadline) {
    if ((Test-Port 4000) -and (Test-Port 3000)) { break }
    Start-Sleep -Seconds 2
  }
  if (-not ((Test-Port 4000) -and (Test-Port 3000))) {
    Write-Log 'app servers did not bind in 90s'
    return 'The API or web server did not start. See infra\server.log and the .env values.'
  }

  Set-Background (Get-PortOwner 4000)
  Set-Background (Get-PortOwner 3000)

  if (-not (Get-Process caddy -ErrorAction SilentlyContinue)) {
    $p = Start-Process -FilePath $Caddy -ArgumentList 'run', '--config', (Join-Path $PSScriptRoot 'Caddyfile.tunnel') `
      -WindowStyle Hidden -PassThru
    Start-Sleep -Seconds 3
    Set-Background $p
  }

  # Exactly one tunnel. Each instance opens four edge connections and two racing
  # for one hostname makes the site flap — up for one request, 502 for the next.
  $tunnels = @(Get-Process cloudflared -ErrorAction SilentlyContinue)
  if ($tunnels.Count -eq 0) {
    $p = Start-Process -FilePath $Cfd -ArgumentList 'tunnel', 'run', 'atlas' -WindowStyle Hidden -PassThru
    Start-Sleep -Seconds 6
    Set-Background $p
  }

  Register-Watchdog
  Write-Log 'started'
  return $null
}

function Stop-Atlas {
  Write-Log 'stopping'
  # The watchdog goes FIRST. Killing the servers while it is still registered
  # means it puts them all back within two minutes, which is precisely what made
  # the old setup impossible to turn off before a game.
  Unregister-Watchdog

  foreach ($port in 4000, 3000) {
    $p = Get-PortOwner $port
    if ($p) { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue }
  }
  # By name is safe for these two: nothing else on this machine runs them.
  Get-Process caddy, cloudflared -ErrorAction SilentlyContinue |
    Stop-Process -Force -ErrorAction SilentlyContinue

  Start-Sleep -Seconds 2
  Write-Log 'stopped'
}

function Register-Watchdog {
  # Two-minute sweep, and only while the stack is meant to be up. The public
  # origin depends on four processes and the app gives no sign when one dies.
  $ps1 = Join-Path $PSScriptRoot 'atlas-health.ps1'
  $cmd = "powershell -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$ps1`""
  schtasks /create /tn $TaskName /tr $cmd /sc minute /mo 2 /f *> $null
}

function Unregister-Watchdog {
  schtasks /delete /tn $TaskName /f *> $null
}

switch ($Action) {
  'start'  { $err = Start-Atlas; if ($err) { Write-Output $err; exit 1 }; exit 0 }
  'stop'   { Stop-Atlas; exit 0 }
  'status' { Get-AtlasStatus | Format-List; exit 0 }
}

# ── The window ───────────────────────────────────────────────────────────────
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$form                 = New-Object System.Windows.Forms.Form
$form.Text            = 'Atlas Server'
$form.Size            = New-Object System.Drawing.Size(420, 300)
$form.StartPosition   = 'CenterScreen'
$form.FormBorderStyle = 'FixedSingle'
$form.MaximizeBox     = $false
$form.BackColor       = [System.Drawing.Color]::FromArgb(250, 247, 242)

$title           = New-Object System.Windows.Forms.Label
$title.Text      = 'atlaslife.app'
$title.Font      = New-Object System.Drawing.Font('Segoe UI', 16, [System.Drawing.FontStyle]::Bold)
$title.ForeColor = [System.Drawing.Color]::FromArgb(43, 38, 34)
$title.Location  = New-Object System.Drawing.Point(24, 18)
$title.Size      = New-Object System.Drawing.Size(360, 32)
$form.Controls.Add($title)

$state           = New-Object System.Windows.Forms.Label
$state.Font      = New-Object System.Drawing.Font('Segoe UI', 10)
$state.Location  = New-Object System.Drawing.Point(24, 54)
$state.Size      = New-Object System.Drawing.Size(360, 66)
$form.Controls.Add($state)

$btnStart          = New-Object System.Windows.Forms.Button
$btnStart.Text     = 'Start server'
$btnStart.Location = New-Object System.Drawing.Point(24, 132)
$btnStart.Size     = New-Object System.Drawing.Size(170, 46)
$btnStart.Font     = New-Object System.Drawing.Font('Segoe UI', 10, [System.Drawing.FontStyle]::Bold)
$btnStart.BackColor = [System.Drawing.Color]::FromArgb(181, 80, 47)
$btnStart.ForeColor = [System.Drawing.Color]::White
$btnStart.FlatStyle = 'Flat'
$form.Controls.Add($btnStart)

$btnStop          = New-Object System.Windows.Forms.Button
$btnStop.Text     = 'Stop (free up the PC)'
$btnStop.Location = New-Object System.Drawing.Point(210, 132)
$btnStop.Size     = New-Object System.Drawing.Size(170, 46)
$btnStop.Font     = New-Object System.Drawing.Font('Segoe UI', 10)
$btnStop.FlatStyle = 'Flat'
$form.Controls.Add($btnStop)

$note           = New-Object System.Windows.Forms.Label
$note.Font      = New-Object System.Drawing.Font('Segoe UI', 8)
$note.ForeColor = [System.Drawing.Color]::FromArgb(111, 102, 92)
$note.Location  = New-Object System.Drawing.Point(24, 190)
$note.Size      = New-Object System.Drawing.Size(360, 60)
$note.Text      = "Closing this window leaves the server running - only Stop stops it. Nothing starts at login, and Stop also retires the health check so it stays off while you play. Everything runs at below-normal priority."
$form.Controls.Add($note)

function Sync-Ui {
  $s = Get-AtlasStatus
  if ($s.Running -and $s.Public -eq 200) {
    $state.ForeColor = [System.Drawing.Color]::FromArgb(15, 107, 50)
    $state.Text = "Live — the site is up and answering.`napi 4000 · web 3000 · caddy · $($s.Tunnels) tunnel"
  }
  elseif ($s.Running) {
    $state.ForeColor = [System.Drawing.Color]::FromArgb(181, 80, 47)
    $state.Text = "Running locally, but the edge says $($s.Public).`nGive it a few seconds, or check the tunnel."
  }
  else {
    $bits = @()
    if ($s.Api) { $bits += 'api' }
    if ($s.Web) { $bits += 'web' }
    if ($s.Caddy) { $bits += 'caddy' }
    if ($s.Tunnels -ge 1) { $bits += 'tunnel' }
    $state.ForeColor = [System.Drawing.Color]::FromArgb(111, 102, 92)
    $state.Text = if ($bits.Count) { "Partly up: $($bits -join ', '). Not serving." } else { 'Stopped. Nothing running, nothing scheduled.' }
  }
  $problem = Test-Config
  if ($problem) {
    $state.ForeColor = [System.Drawing.Color]::FromArgb(192, 57, 43)
    $state.Text = $problem
  }
}

$btnStart.Add_Click({
  $btnStart.Enabled = $false
  $state.Text = 'Starting…'
  $form.Refresh()
  $err = Start-Atlas
  if ($err) { [System.Windows.Forms.MessageBox]::Show($err, 'Atlas Server') | Out-Null }
  Sync-Ui
  $btnStart.Enabled = $true
})

$btnStop.Add_Click({
  $btnStop.Enabled = $false
  $state.Text = 'Stopping…'
  $form.Refresh()
  Stop-Atlas
  Sync-Ui
  $btnStop.Enabled = $true
})

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 5000
$timer.Add_Tick({ Sync-Ui })
$timer.Start()

Sync-Ui
[void]$form.ShowDialog()
