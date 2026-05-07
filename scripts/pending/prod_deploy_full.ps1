#!/usr/bin/env pwsh
# ===========================================================================
# Unified production deploy: backend (Railway) + frontend (Vercel) + verify.
# Uses your already-installed, already-authed CLIs. No reinstalls. No re-auth.
#
# Default behavior:
#   1. railway up --service authentic-sparkle (from backend/)
#   2. vercel deploy --prod --yes (from repo-b/)
#   3. Smoke-test the live API for the env_id passed in (or default Altered Mind env)
#   4. Write a result receipt to scripts/results/
#
# Usage:
#   .\scripts\host_runner.ps1 -Script .\scripts\pending\prod_deploy_full.ps1
#
#   # Skip frontend (backend-only deploy):
#   .\scripts\host_runner.ps1 -Script .\scripts\pending\prod_deploy_full.ps1 -Arguments "-SkipFrontend"
#
#   # Skip backend (frontend-only deploy):
#   .\scripts\host_runner.ps1 -Script .\scripts\pending\prod_deploy_full.ps1 -Arguments "-SkipBackend"
#
#   # Custom env_id for the smoke test:
#   .\scripts\host_runner.ps1 -Script .\scripts\pending\prod_deploy_full.ps1 -Arguments "-VerifyEnvId","<eid>"
# ===========================================================================

param(
    [switch]$SkipBackend,
    [switch]$SkipFrontend,
    [string]$VerifyEnvId = "bf5c5b10-9a17-4fe7-9f5b-e7de9a380122",
    [string]$VerifyEndpoint = "/api/am/v1/dashboard"
)

$ErrorActionPreference = "Continue"

$repoRoot   = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$backendDir = Join-Path $repoRoot "backend"
$frontendDir = Join-Path $repoRoot "repo-b"
$outDir     = Join-Path $repoRoot "skills\triaged-execution\runs\prod_deploy"
$outFile    = Join-Path $outDir "deploy_$(Get-Date -Format 'yyyyMMdd_HHmmss').md"
New-Item -ItemType Directory -Path $outDir -Force | Out-Null

$report = @()
$report += "# Unified production deploy"
$report += ""
$report += "Run: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
$report += "Backend: $(if ($SkipBackend) { 'SKIPPED' } else { 'railway up --service authentic-sparkle' })"
$report += "Frontend: $(if ($SkipFrontend) { 'SKIPPED' } else { 'vercel deploy --prod --yes' })"
$report += ""

function HaltAndWrite($msg, $code) {
    Write-Host $msg -ForegroundColor Red
    $script:report += "## HALTED"
    $script:report += $msg
    Set-Content -Path $outFile -Value ($script:report -join "`n") -Encoding UTF8
    exit $code
}

# ---- Preflight ----
foreach ($cli in @("railway", "vercel", "curl")) {
    $needed = $true
    if ($cli -eq "railway" -and $SkipBackend) { $needed = $false }
    if ($cli -eq "vercel" -and $SkipFrontend) { $needed = $false }
    if ($needed -and -not (Get-Command $cli -ErrorAction SilentlyContinue)) {
        HaltAndWrite "ERROR: required CLI not found: $cli (run scripts\bootstrap_clis.ps1)" 1
    }
}

# ---- Backend ----
if (-not $SkipBackend) {
    Write-Host ""
    Write-Host "=== Backend: railway up --service authentic-sparkle ===" -ForegroundColor Cyan
    if (-not (Test-Path $backendDir)) {
        HaltAndWrite "ERROR: backend/ not found at $backendDir" 1
    }
    Push-Location $backendDir
    try {
        railway up --service authentic-sparkle --detach
        $exit = $LASTEXITCODE
        if ($exit -ne 0) {
            HaltAndWrite "Railway deploy failed with exit $exit" $exit
        }
        $report += "## Backend deploy"
        $report += "Railway up exit code: 0 (queued, building in background)"
    } finally {
        Pop-Location
    }
}

# ---- Frontend ----
$vercelUrl = $null
if (-not $SkipFrontend) {
    Write-Host ""
    Write-Host "=== Frontend: vercel deploy --prod --yes ===" -ForegroundColor Cyan
    if (-not (Test-Path $frontendDir)) {
        HaltAndWrite "ERROR: repo-b/ not found at $frontendDir" 1
    }
    Push-Location $frontendDir
    try {
        $vercelOutput = vercel deploy --prod --yes 2>&1 | Out-String
        $exit = $LASTEXITCODE
        if ($exit -ne 0) {
            $report += "## Frontend deploy"
            $report += "Vercel exit: $exit"
            $report += '```'
            $report += $vercelOutput.TrimEnd()
            $report += '```'
            HaltAndWrite "Vercel deploy failed (see report)" $exit
        }
        # Extract the production URL from the output
        $vercelUrl = ($vercelOutput | Select-String -Pattern 'https://[^\s]+\.vercel\.app').Matches.Value | Select-Object -First 1
        if (-not $vercelUrl) {
            $vercelUrl = "https://novendor.ai"  # production alias
        }
        $report += "## Frontend deploy"
        $report += "Vercel URL: $vercelUrl"
        Write-Host "Vercel deploy completed." -ForegroundColor Green
    } finally {
        Pop-Location
    }
}

# ---- Wait for backend to come live ----
if (-not $SkipBackend) {
    Write-Host ""
    Write-Host "Waiting 90 seconds for Railway revision to start serving..." -ForegroundColor Yellow
    Start-Sleep -Seconds 90
}

# ---- Verify ----
Write-Host ""
Write-Host "=== Verify: hitting $VerifyEndpoint?env_id=$VerifyEnvId ===" -ForegroundColor Cyan
$verifyUrl = "https://novendor.ai${VerifyEndpoint}?env_id=$VerifyEnvId"
try {
    $verifyOutput = curl -s -w "`nHTTP_STATUS=%{http_code}" $verifyUrl 2>&1 | Out-String
    $report += ""
    $report += "## Verify"
    $report += "URL: $verifyUrl"
    $report += '```'
    $report += $verifyOutput.TrimEnd()
    $report += '```'

    if ($verifyOutput -match 'HTTP_STATUS=200') {
        Write-Host "API returned 200." -ForegroundColor Green
        if ($verifyOutput -match '"has_data"\s*:\s*true') {
            Write-Host "has_data=true. Page should now render." -ForegroundColor Green
            $report += ""
            $report += "**STATUS: SUCCESS** — has_data=true returned by live API."
        } elseif ($verifyOutput -match '"has_data"\s*:\s*false') {
            Write-Host "API returned has_data=false. Investigate why." -ForegroundColor Yellow
            $report += ""
            $report += "**STATUS: API up, but has_data=false.** Investigate data scoping or run skills/altered-mind-prod-fix flow."
        } else {
            Write-Host "API returned 200 but no has_data field detected." -ForegroundColor Yellow
            $report += ""
            $report += "**STATUS: API up, response shape unexpected.** Inspect manually."
        }
    } else {
        Write-Host "API did not return 200. Check Railway logs." -ForegroundColor Red
        $report += ""
        $report += "**STATUS: API not 200.** Run: railway logs --service authentic-sparkle"
    }
} catch {
    $report += "Verify step error: $_"
    Write-Host "Verify step error: $_" -ForegroundColor Red
}

# ---- Page URL ----
$report += ""
$report += "## Page URL"
$report += "https://novendor.ai/lab/env/$VerifyEnvId/altered-mind"

Set-Content -Path $outFile -Value ($report -join "`n") -Encoding UTF8

Write-Host ""
Write-Host "Report: $outFile" -ForegroundColor Cyan
Write-Host ""

# Echo to stdout for host_runner JSON receipt
$report -join "`n"
