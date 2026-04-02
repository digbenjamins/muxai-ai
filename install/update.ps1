# muxAI Update Script (Windows)
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Header { param($msg) Write-Host "`n  $msg" -ForegroundColor White }
function Write-Ok     { param($msg) Write-Host "  [OK] $msg" -ForegroundColor Green }

Write-Host ""
Write-Host "  muxAI - Update Script" -ForegroundColor White
Write-Host "  -------------------------------------"
Write-Host ""

# --- Pull latest --------------------------------------------------------------

Write-Header "Pulling latest changes..."
git pull
Write-Host ""

# --- Install deps -------------------------------------------------------------

Write-Header "Installing dependencies..."
pnpm install
Write-Host ""

# --- Build --------------------------------------------------------------------

Write-Header "Building API..."
pnpm --filter @muxai/api build
Write-Host ""

Write-Header "Building web app..."
pnpm --filter @muxai/web build
Write-Host ""

# --- Restart ------------------------------------------------------------------

$usePm2 = (Get-Command "pm2" -ErrorAction SilentlyContinue) -and (Test-Path "ecosystem.config.js")

if ($usePm2) {
  # Check if PM2 has muxai processes running
  $pm2List = pm2 jlist 2>$null | ConvertFrom-Json -ErrorAction SilentlyContinue
  $hasMuxai = $pm2List | Where-Object { $_.name -match "^muxai-" }

  if ($hasMuxai) {
    Write-Header "Restarting muxAI via PM2..."
    pm2 restart ecosystem.config.js --update-env
    pm2 save
    Write-Host ""
    Write-Ok "muxAI updated and restarted!"
    Write-Host ""
    Write-Host "  Portal:  http://localhost:3000" -ForegroundColor Cyan
    Write-Host "  API:     http://localhost:3001" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  Run " -NoNewline; Write-Host "pm2 logs" -ForegroundColor Yellow -NoNewline; Write-Host " to view output"
    Write-Host ""
    return
  }
}

Write-Host ""
Write-Ok "muxAI updated and rebuilt!"
Write-Host ""
Write-Host "  Start:" -ForegroundColor White
Write-Host "    pnpm start            " -NoNewline -ForegroundColor Yellow; Write-Host "Run API + web (production build)"
Write-Host ""
Write-Host "  Or for development:" -ForegroundColor White
Write-Host "    pnpm dev              " -NoNewline -ForegroundColor Yellow; Write-Host "Run API + web with hot reload"
Write-Host ""
