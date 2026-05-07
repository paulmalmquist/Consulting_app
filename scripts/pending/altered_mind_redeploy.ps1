#!/usr/bin/env pwsh
# ===========================================================================
# Redeploy backend to Railway with the Altered Mind predicate widening patch.
# Uses your already-installed, already-authed Railway CLI.
# ===========================================================================
#
# Usage:
#   .\scripts\host_runner.ps1 -Script .\scripts\pending\altered_mind_redeploy.ps1
#
# What it does:
#   1. cd to backend/ (Railway expects this per CLAUDE.md guardrail).
#   2. railway up --service authentic-sparkle --detach
#   3. Print the deploy URL so you can watch the build log.
#   4. Tail the Railway logs for ~30 seconds so you see the new revision boot.
#
# After it completes, refresh the production page and the dashboard should
# render. If it doesn't, paste the curl output from below back here:
#
#   curl "https://novendor.ai/api/am/v1/dashboard?env_id=bf5c5b10-9a17-4fe7-9f5b-e7de9a380122"
# ===========================================================================

$ErrorActionPreference = "Stop"

if (-not (Get-Command railway -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: railway CLI not on PATH. Install once: npm install -g @railway/cli" -ForegroundColor Red
    exit 1
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$backendDir = Join-Path $repoRoot "backend"
if (-not (Test-Path $backendDir)) {
    Write-Host "ERROR: backend/ not found at $backendDir" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Deploying backend to Railway service authentic-sparkle..." -ForegroundColor Cyan
Push-Location $backendDir
try {
    railway up --service authentic-sparkle --detach
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Railway deploy command failed. Check railway status." -ForegroundColor Red
        exit $LASTEXITCODE
    }
    Write-Host ""
    Write-Host "Deploy queued. Tailing logs for 30 seconds (Ctrl-C to stop early)..." -ForegroundColor Cyan
    Write-Host ""
    $logProc = Start-Process railway -ArgumentList @("logs", "--service", "authentic-sparkle") -PassThru -NoNewWindow
    Start-Sleep -Seconds 30
    Stop-Process -Id $logProc.Id -Force -ErrorAction SilentlyContinue
} finally {
    Pop-Location
}

Write-Host ""
Write-Host "Verify with:" -ForegroundColor Yellow
Write-Host "  curl 'https://novendor.ai/api/am/v1/dashboard?env_id=bf5c5b10-9a17-4fe7-9f5b-e7de9a380122'"
Write-Host "Then refresh:"
Write-Host "  https://novendor.ai/lab/env/bf5c5b10-9a17-4fe7-9f5b-e7de9a380122/altered-mind"
