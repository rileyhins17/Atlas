@echo off
REM Start the whole Atlas stack for the Cloudflare Tunnel deployment.
REM
REM Everything runs as the logged-in user, so no admin rights and no Windows
REM service are needed. Launched from the Startup folder, which means it comes
REM back after a reboot as soon as Riley logs in.
REM
REM Order matters: API and web must be listening before Caddy proxies to them,
REM and Caddy must be up before the tunnel forwards to it.

set ATLAS=C:\Users\riley\atlas
set CADDY=C:\Users\riley\AppData\Local\Microsoft\WinGet\Packages\CaddyServer.Caddy_Microsoft.Winget.Source_8wekyb3d8bbwe\caddy.exe
set CFD=C:\Program Files (x86)\cloudflared\cloudflared.exe

cd /d "%ATLAS%"

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
