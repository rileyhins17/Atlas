<#
  Point Atlas at a Supabase project, typing only the database password.

  WHY THIS EXISTS: the previous flow asked for two connection strings, and a
  connection string is a password wrapped in a URL. Asking a human to copy one
  around is asking them to paste a credential into whatever is in front of them
  — a chat window, a command line, a notes file — and that is exactly what
  happened. So this asks for the one secret at a prompt that does not echo, and
  builds both URLs itself.

  What it does NOT do is guess your password or read it from anywhere. It is
  typed once, held in memory, written only into .env (which is gitignored), and
  never printed, logged, or passed as an argument.

  It also percent-encodes the password, which hand-assembly gets wrong: a
  password containing # ? @ & or / silently truncates or corrupts a connection
  URL, and the resulting error blames the host.

    powershell -File infra\supabase-connect.ps1 -ProjectRef taxcavnrssgtvvhpzfum

  Add -Region to skip the search when you know it. Atlas's own project is in
  us-west-2:

    powershell -File infra\supabase-connect.ps1 -ProjectRef taxcavnrssgtvvhpzfum -Region us-west-2

  Without it, every Supabase region is probed and the first pooler that knows
  the project wins. A pooler that does not host it answers "tenant/user not
  found", which is how the search tells "wrong region" apart from "wrong
  password" — only the latter stops the search.
#>
param(
  [Parameter(Mandatory = $true)][string]$ProjectRef,
  # Skip probing when you already know it, e.g. 'us-east-1'.
  [string]$Region,
  # Build and write .env, but stop before migrating.
  [switch]$WriteOnly
)

$ErrorActionPreference = 'Stop'

$Repo    = Split-Path -Parent $PSScriptRoot
$EnvFile = Join-Path $Repo '.env'
$Probe   = Join-Path $Repo 'packages\db\scripts\probe.mjs'

function Fail($msg) { Write-Host "REFUSED: $msg" -ForegroundColor Red; exit 1 }
function Step($msg) { Write-Host "`n== $msg" -ForegroundColor Cyan }

if ($ProjectRef -notmatch '^[a-z0-9]{16,32}$') {
  Fail "'$ProjectRef' does not look like a Supabase project ref (the subdomain of your project URL)."
}
if (-not (Test-Path $EnvFile)) { Fail ".env not found at $EnvFile" }
if (-not (Test-Path $Probe))   { Fail "probe script missing at $Probe" }

# ── The one secret, typed once ───────────────────────────────────────────────

# Read-Host has no timeout and no EOF behaviour worth relying on: with stdin
# redirected it simply BLOCKS FOREVER. Measured — a background job sat on this
# prompt indefinitely rather than failing. A scheduled task or an automated
# session would hang exactly the same way, so refuse up front instead.
if ([Console]::IsInputRedirected) {
  Fail @'
this needs an interactive terminal, because it prompts for the password.
Run it from a normal PowerShell window. To set the database up without a
prompt, put both URLs in .env yourself and run:
  powershell -File infra\db-switch.ps1 -FromEnv
'@
}

Write-Host 'Supabase database password (Project Settings -> Database).'
Write-Host 'It is not shown as you type, and is never printed or logged.'
# Ctrl+V does nothing at a masked prompt in the legacy console host, and the
# only feedback is the asterisks you cannot count. A real attempt failed here
# with exactly one character registered and a "credentials rejected" message
# that blamed the password instead of the paste.
Write-Host 'RIGHT-CLICK to paste. Ctrl+V often does nothing in this window.' -ForegroundColor Yellow
$secure = Read-Host -AsSecureString '  password'
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
  $password = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
}
finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
}
if ([string]::IsNullOrWhiteSpace($password)) { Fail 'no password entered.' }

# Say how much arrived, without saying what. A silent wrong-length read is the
# difference between "your password is wrong" and "your paste did not work",
# and those send you to completely different places.
Write-Host "  read $($password.Length) characters." -ForegroundColor DarkGray
if ($password.Length -lt 8) {
  Fail @'
that is too short to be a Supabase password, so the paste almost certainly did
not land. Try again and RIGHT-CLICK to paste, or type it by hand.
'@
}

# The bug this prevents: a password with # ? @ & or / in it corrupts a URL, and
# the failure surfaces as a host or auth error that sends you debugging the
# wrong thing. Supabase's own dashboard encodes it; hand-assembly does not.
$encoded = [uri]::EscapeDataString($password)

# ── Find the pooler that owns this project ───────────────────────────────────

# Every AWS region Supabase runs in. An INCOMPLETE list is worse than a slow
# sweep: the first draft of this omitted us-west-2, which is exactly where the
# project turned out to live, so it would have reported "no pooler accepted the
# connection" for a perfectly healthy database.
$allRegions = @(
  'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2', 'ca-central-1', 'sa-east-1',
  'eu-west-1', 'eu-west-2', 'eu-west-3', 'eu-central-1', 'eu-central-2', 'eu-north-1',
  'ap-south-1', 'ap-southeast-1', 'ap-southeast-2', 'ap-northeast-1', 'ap-northeast-2',
  'ap-east-1'
)
$regions = if ($Region) { @($Region) } else { $allRegions }
# Supabase has two pooler fleets per region and the project may sit on either.
$candidates = foreach ($r in $regions) { "aws-0-$r.pooler.supabase.com"; "aws-1-$r.pooler.supabase.com" }

function Session-Url($h) { "postgresql://postgres.$($ProjectRef):$encoded@$($h):5432/postgres" }
function Pooled-Url($h)  { "postgresql://postgres.$($ProjectRef):$encoded@$($h):6543/postgres?pgbouncer=true&connection_limit=5" }
# connect_timeout keeps a wrong region cheap; without it a full sweep crawls.
# Kept OFF the written value — it is an artifact of searching, and config should
# not carry the fingerprints of how it was discovered.
function Probe-Url($h)   { "$(Session-Url $h)?connect_timeout=6" }

Step "Finding the pooler for $ProjectRef"
$hostFound = $null
foreach ($h in $candidates) {
  Write-Host "  trying $h" -NoNewline
  $env:PROBE_URL = Probe-Url $h
  node $Probe *> $null
  $code = $LASTEXITCODE
  $env:PROBE_URL = $null
  if ($code -eq 0) { Write-Host '  <- connected' -ForegroundColor Green; $hostFound = $h; break }
  if ($code -eq 2) {
    Write-Host '  <- credentials rejected' -ForegroundColor Red
    Fail @'
the pooler rejected these credentials. The project was FOUND, so the host and
project ref are right - it is the password. Check the character count printed
above matches the password you meant to paste; if it does, reset it in
Project Settings -> Database and run this again.
'@
  }
  Write-Host ''
}
if (-not $hostFound) {
  Fail @'
no pooler accepted the connection. Either the project is in a region not tried
here, or it is paused. Pass -Region <region> from your project URL, or check the
dashboard.
'@
}

# ── Write .env, then hand over to the switch ─────────────────────────────────

$backup = "$EnvFile.bak.$(Get-Date -Format 'yyyyMMdd-HHmmss')"
Copy-Item $EnvFile $backup
Step "Backed up .env -> $(Split-Path -Leaf $backup)"

$text = Get-Content $EnvFile -Raw
foreach ($entry in @(@('DATABASE_URL', (Pooled-Url $hostFound)), @('DIRECT_DATABASE_URL', (Session-Url $hostFound)))) {
  $key = $entry[0]
  # $ is special to -replace on the replacement side, and a password can contain
  # one even after encoding leaves it alone.
  $value = $entry[1].Replace('$', '$$')
  if ($text -match "(?m)^$key=") { $text = $text -replace "(?m)^$key=.*$", "$key=$value" }
  else { $text = $text.TrimEnd() + "`n$key=$value`n" }
}
Set-Content -Path $EnvFile -Value $text -Encoding utf8 -NoNewline
Step "Wrote DATABASE_URL and DIRECT_DATABASE_URL for $hostFound"

if ($WriteOnly) {
  Write-Host "`nDone. Run infra\db-switch.ps1 -FromEnv when you are ready to migrate."
  exit 0
}

Step 'Handing over to db-switch'
& powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'db-switch.ps1') -FromEnv
exit $LASTEXITCODE
