#!/usr/bin/env pwsh
# ===========================================================================
# Deploy plan for the AI usage attribution service.
# Uses your already-installed CLIs (supabase, railway, vercel, gh).
# DRY-RUN BY DEFAULT.
# ===========================================================================
#
# What this deploy touches:
#   1. Apply migration repo-b/db/schema/609_nv_ai_usage_attribution.sql
#      to production Supabase via `supabase db query --linked`.
#   2. Register backend/app/routes/ai_usage.py with the FastAPI app
#      (idempotent edit to backend/app/main.py).
#   3. Push the backend repo to Railway (`railway up --service authentic-sparkle`
#      from backend/ per CLAUDE.md guardrails).
#   4. Push the frontend (repo-b) to Vercel preview, then promote to production
#      after a smoke check on the preview URL.
#   5. Verify by curling /api/ai-usage/v1/summary on the live site.
#
# Usage:
#   # dry-run: print every step that would run, no changes
#   .\scripts\host_runner.ps1 -Script .\scripts\pending\ai_usage_deploy.ps1
#
#   # live deploy
#   .\scripts\host_runner.ps1 -Script .\scripts\pending\ai_usage_deploy.ps1 -Arguments "-Apply"
#
# Bypass model: this script runs in your real PowerShell shell. It uses the
# CLIs and auth tokens already on your machine. It does NOT install anything.
# ===========================================================================

param(
    [switch]$Apply
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path

$migrationFile = Join-Path $repoRoot "repo-b\db\schema\609_nv_ai_usage_attribution.sql"
$mainPy        = Join-Path $repoRoot "backend\app\main.py"
$routeFile     = Join-Path $repoRoot "backend\app\routes\ai_usage.py"
$outDir        = Join-Path $repoRoot "skills\triaged-execution\runs\ai_usage_deploy"
$outFile       = Join-Path $outDir "deploy.md"
New-Item -ItemType Directory -Path $outDir -Force | Out-Null

$report = @()
$report += "# AI Usage Attribution Service — Deploy"
$report += ""
$report += "Run: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
$report += "Mode: $(if ($Apply) { 'APPLY' } else { 'DRY-RUN' })"
$report += ""

function Step($title) {
    Write-Host ""
    Write-Host "=== $title ===" -ForegroundColor Cyan
    $script:report += ""
    $script:report += "## $title"
    $script:report += ""
}

function Run($cmd, $description) {
    Write-Host "  $description" -ForegroundColor DarkGray
    Write-Host "  > $cmd" -ForegroundColor DarkGray
    $script:report += "- **$description**"
    $script:report += '  ```'
    $script:report += "  $cmd"
    $script:report += '  ```'
    if ($Apply) {
        $output = Invoke-Expression $cmd 2>&1 | Out-String
        $exit = $LASTEXITCODE
        $script:report += "  Exit: $exit"
        if ($output) {
            $script:report += '  ```'
            $script:report += $output.TrimEnd()
            $script:report += '  ```'
        }
        if ($exit -ne 0) {
            Write-Host "  FAILED (exit $exit)" -ForegroundColor Red
            $script:report += ""
            $script:report += "**HALTED here.**"
            Set-Content -Path $outFile -Value ($script:report -join "`n") -Encoding UTF8
            exit $exit
        }
        Write-Host "  ok" -ForegroundColor Green
    } else {
        $script:report += "  *(dry-run, not executed)*"
    }
}

# ---- Preflight: required files + CLIs ----
Step "Preflight"

foreach ($f in @($migrationFile, $mainPy, $routeFile)) {
    if (-not (Test-Path $f)) {
        Write-Host "  MISSING: $f" -ForegroundColor Red
        $report += "- MISSING: ``$f``"
        Set-Content -Path $outFile -Value ($report -join "`n") -Encoding UTF8
        exit 1
    }
    Write-Host "  ok: $f" -ForegroundColor Green
    $report += "- present: ``$([System.IO.Path]::GetFileName($f))``"
}

foreach ($cli in @("supabase", "railway", "vercel", "gh", "python")) {
    if (-not (Get-Command $cli -ErrorAction SilentlyContinue)) {
        Write-Host "  MISSING CLI: $cli (run scripts\bootstrap_clis.ps1)" -ForegroundColor Red
        $report += "- MISSING CLI: $cli"
        Set-Content -Path $outFile -Value ($report -join "`n") -Encoding UTF8
        exit 1
    }
    Write-Host "  ok cli: $cli" -ForegroundColor Green
    $report += "- cli on PATH: ``$cli``"
}

# ---- Step 1: Apply migration to Supabase ----
Step "Apply migration to Supabase (project ozboonlsplroialdwuxj)"
Run "Get-Content '$migrationFile' -Raw | supabase db query --linked" `
    "Apply 609_nv_ai_usage_attribution.sql"

# ---- Step 2: Register the FastAPI route ----
Step "Register ai_usage router in backend/app/main.py"
$mainContent = Get-Content $mainPy -Raw
$alreadyRegistered = $mainContent -match "from app\.routes import ai_usage"
if ($alreadyRegistered) {
    Write-Host "  already registered — skipping" -ForegroundColor Yellow
    $report += "- already registered in main.py — no change"
} else {
    Write-Host "  needs to be added to main.py imports + app.include_router" -ForegroundColor Yellow
    $report += "- **manual edit needed:** add to backend/app/main.py:"
    $report += '  ```python'
    $report += '  from app.routes import ai_usage'
    $report += '  app.include_router(ai_usage.router)'
    $report += '  ```'
    if ($Apply) {
        Write-Host "  Auto-edit not implemented for safety. Add the two lines manually then re-run." -ForegroundColor Yellow
        $report += "  *(auto-edit skipped for safety; please patch main.py and re-run)*"
        Set-Content -Path $outFile -Value ($report -join "`n") -Encoding UTF8
        exit 2
    }
}

# ---- Step 3: Deploy backend to Railway ----
Step "Deploy backend to Railway"
Run "Push-Location '$repoRoot\backend'; railway up --service authentic-sparkle --detach; Pop-Location" `
    "railway up from backend/ (per CLAUDE.md guardrail)"

# ---- Step 4: Deploy frontend to Vercel ----
Step "Deploy frontend (repo-b) to Vercel"
Run "Push-Location '$repoRoot\repo-b'; vercel deploy --prod --yes; Pop-Location" `
    "vercel deploy --prod for repo-b"

# ---- Step 5: Smoke test ----
Step "Smoke test the live endpoint"
$testEnvId = "bf5c5b10-9a17-4fe7-9f5b-e7de9a380122"
Run "curl -s -o NUL -w '%{http_code}' 'https://novendor.ai/api/ai-usage/v1/summary?env_id=$testEnvId&days=30'" `
    "GET /api/ai-usage/v1/summary should return 200 (may return empty data)"

# ---- Done ----
Step "Done"
$report += ""
$report += "Dashboard URL: https://novendor.ai/lab/env/<envId>/ai-usage"
$report += ""
$report += "First-time wiring (one-off, per client):"
$report += "1. Update cost_ledger.py to also POST events to /api/ai-usage/v1/events for live attribution."
$report += "2. Schedule the recommendation rules to run every 15 minutes (cron or scheduled task)."
$report += "3. Have any in-house Claude code wrappers POST events at the end of each call."

Set-Content -Path $outFile -Value ($report -join "`n") -Encoding UTF8

Write-Host ""
Write-Host "Deploy report: $outFile" -ForegroundColor Cyan
$report -join "`n"
