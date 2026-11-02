# ============================================================
#  DDZ One-Click Launcher - Local Game + Cloudflare Tunnel
#  Usage: right-click -> Run with PowerShell (or double start-game.bat)
#  Ctrl+C kills everything cleanly
# ============================================================

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$ServerDir   = Join-Path $ProjectRoot 'game-ddz-server'
$DistApp     = Join-Path $ServerDir 'dist\app.js'
$PublicPort  = 9200

function Cyan($s)  { Write-Host $s -ForegroundColor Cyan }
function Green($s) { Write-Host $s -ForegroundColor Green }
function Red($s)   { Write-Host $s -ForegroundColor Red }
function Yellow($s){ Write-Host $s -ForegroundColor Yellow }

function Banner {
  Clear-Host
  Write-Host ""
  Write-Host "   ======================================" -ForegroundColor Magenta
  Write-Host "     DDZ Game + Cloudflare Tunnel" -ForegroundColor Magenta
  Write-Host "   ======================================" -ForegroundColor Magenta
  Write-Host ""
}

$script:NodePid   = $null
$script:TunnelPid = $null
$script:Cleanup   = {
  Yellow "`n[cleanup] shutting down all processes..."
  if ($script:NodePid)   { Stop-Process -Id $script:NodePid   -Force -ErrorAction SilentlyContinue }
  if ($script:TunnelPid) { Stop-Process -Id $script:TunnelPid -Force -ErrorAction SilentlyContinue }
  Green "[cleanup] done. bye!`n"
}
Register-EngineEvent -SourceIdentifier PowerShell.Exiting -Action $script:Cleanup | Out-Null

# ---------- Step 1: Prereq ----------
Banner
Cyan "[1/4] checking prerequisites"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Red "  [X] node not found, install Node.js 18+"
  exit 1
}
Green "  [OK] node $(node -v)"

# ---------- Step 2: Build ----------
Cyan "[2/4] checking build artifacts"

if (-not (Test-Path $DistApp)) {
  Yellow "  [!] dist/app.js missing, building..."
  Push-Location $ProjectRoot
  try {
    & pnpm install 2>&1 | Out-Null
    & pnpm build    2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { Red "  [X] build failed"; Pop-Location; exit 1 }
  } finally { Pop-Location }
  Green "  [OK] build complete"
} else {
  Green "  [OK] dist/app.js ready"
}

# ---------- Step 3: Kill port + Start Node ----------
Cyan "[3/4] starting local game server (port=$PublicPort)"

$existing = Get-NetTCPConnection -LocalPort $PublicPort -State Listen -ErrorAction SilentlyContinue
if ($existing) {
  Yellow "  [!] port $PublicPort in use, cleaning..."
  $pids = $existing | Select-Object -ExpandProperty OwningProcess -Unique
  foreach ($pid in $pids) { Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Milliseconds 500
}

Push-Location $ProjectRoot
try {
  $nodeProc = Start-Process -FilePath 'node' `
    -ArgumentList 'game-ddz-server/dist/app.js' `
    -PassThru -NoNewWindow `
    -RedirectStandardOutput "$env:TEMP\ddz-node.log" `
    -RedirectStandardError  "$env:TEMP\ddz-node-err.log"
} finally { Pop-Location }
$script:NodePid = $nodeProc.Id

$ready = $false
for ($i = 0; $i -lt 20; $i++) {
  Start-Sleep -Milliseconds 500
  try { $null = Invoke-RestMethod -Uri "http://localhost:$PublicPort/health" -UseBasicParsing -TimeoutSec 2; $ready = $true; break } catch {}
}
if (-not $ready) {
  Red "  [X] node server timeout, log:"
  Get-Content "$env:TEMP\ddz-node.log" -Tail 10
  Get-Content "$env:TEMP\ddz-node-err.log" -Tail 10
  exit 1
}
Green "  [OK] game server running (pid=$($nodeProc.Id), port=$PublicPort)"

# ---------- Step 4: Cloudflare Tunnel ----------
Cyan "[4/4] starting Cloudflare Tunnel"

Push-Location $ProjectRoot
try {
  $tunnelProc = Start-Process -FilePath 'npx.cmd' `
    -ArgumentList 'cloudflared','tunnel','--url',"http://localhost:$PublicPort",'--no-autoupdate' `
    -PassThru -NoNewWindow `
    -RedirectStandardOutput "$env:TEMP\ddz-tunnel.log" `
    -RedirectStandardError  "$env:TEMP\ddz-tunnel-err.log"
} finally { Pop-Location }
$script:TunnelPid = $tunnelProc.Id

$publicUrl = $null
for ($i = 0; $i -lt 30; $i++) {
  Start-Sleep -Milliseconds 500
  $txt = (Get-Content "$env:TEMP\ddz-tunnel.log" -Tail 20 -ErrorAction SilentlyContinue) + "`n" + (Get-Content "$env:TEMP\ddz-tunnel-err.log" -Tail 20 -ErrorAction SilentlyContinue)
  if ($txt -match 'https://[a-z0-9-]+\.trycloudflare\.com') { $publicUrl = $Matches[0]; break }
}

# ---------- Result ----------
Write-Host ""
Write-Host "   ==============================================" -ForegroundColor Green
if ($publicUrl) {
  Green "   [OK] PUBLIC URL: $publicUrl"
  Green "   Share this link with friends to play!"
} else {
  Yellow "   [!] cloudflared did not emit a URL yet"
  Yellow "   Check logs: $env:TEMP\ddz-tunnel.log"
}
Write-Host "   ----------------------------------------------" -ForegroundColor Green
Green "   Local access:   http://localhost:$PublicPort"
Green "   Press Ctrl+C to exit (auto cleanup)"
Write-Host "   ==============================================" -ForegroundColor Green
Write-Host ""

try { while ($true) { Start-Sleep -Seconds 1 } } finally { & $script:Cleanup }
