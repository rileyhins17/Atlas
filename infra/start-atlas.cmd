@echo off
REM Start the whole Atlas stack for the Cloudflare Tunnel deployment.
REM
REM Everything runs as the logged-in user, so no admin rights and no Windows
REM service are needed. Launched from the Startup folder, which means it comes
REM back after a reboot as soon as Riley logs in.
REM
REM Order matters: API and web must be listening before Caddy proxies to them,
REM and Caddy must be up before the tunnel forwards to it.

REM Derived, not hardcoded. This script lives in <repo>\infra, so the repo is its
REM own parent — which means the stack starts correctly from wherever the clone
REM actually sits. The old absolute path was right on exactly one machine and
REM silently wrong on any other: `cd` fails and everything after it runs in the
REM wrong directory.
for %%I in ("%~dp0..") do set "ATLAS=%%~fI"

REM Preferred install locations, with a PATH fallback so a machine that got
REM caddy or cloudflared some other way still works.
set "CADDY=%LOCALAPPDATA%\Microsoft\WinGet\Packages\CaddyServer.Caddy_Microsoft.Winget.Source_8wekyb3d8bbwe\caddy.exe"
set "CFD=C:\Program Files (x86)\cloudflared\cloudflared.exe"
if not exist "%CADDY%" for %%I in (caddy.exe) do set "CADDY=%%~$PATH:I"
if not exist "%CFD%" for %%I in (cloudflared.exe) do set "CFD=%%~$PATH:I"

if not exist "%CADDY%" echo [atlas] caddy not found - nothing will be proxied
if not exist "%CFD%" echo [atlas] cloudflared not found - atlaslife.app stays on error 1033

cd /d "%ATLAS%" || exit /b 1

REM Idempotent by design: running this twice must not leave two of anything.
REM Each cloudflared instance opens FOUR edge connections, so re-running the
REM script a few times during development left five tunnels and ~20 connections
REM registered for one hostname. Caddy and Next hide the same mistake because
REM they fail to bind a taken port; cloudflared happily starts another.
taskkill /IM cloudflared.exe /F >nul 2>&1
taskkill /IM caddy.exe /F >nul 2>&1
taskkill /IM node.exe /F >nul 2>&1
timeout /t 3 /nobreak >nul

start "atlas-api" /min cmd /c "pnpm --filter @atlas/api start"
start "atlas-web" /min cmd /c "pnpm --filter @atlas/web start"

REM Give the app servers a moment to bind before the proxy points at them.
timeout /t 20 /nobreak >nul

start "atlas-caddy" /min "%CADDY%" run --config "%ATLAS%\infra\Caddyfile.tunnel"
timeout /t 5 /nobreak >nul

start "atlas-tunnel" /min "%CFD%" tunnel run atlas
