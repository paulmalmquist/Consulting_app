#!/usr/bin/env pwsh
# ===========================================================================
# Step 5 of altered_mind_prod plan — REPAIR ingestion (CONDITIONAL).
# Profile: Opus, 16k think, E4 (full pipeline). DRY-RUN BY DEFAULT.
# ===========================================================================
#
# Run this only if step 2 showed:
#   - All four am_* tables empty for env_id, OR
#   - Tables non-empty but scoped to a different env_id / business_id, OR
#   - am_weekly_summary populated but every clients_seen is null/zero (re-ingest from corrected source).
#
# By default this script runs the existing scripts/ingest_altered_mind.py
# in DRY-RUN mode. It will parse the source Excel, count the rows it would
# write, and STOP. No database writes happen unless you pass -Live.
#
# Usage:
#   # safest: parse the Excel and report what would be written
#   .\scripts\host_runner.ps1 -Script .\scripts\pending\altered_mind_step_5_repair.ps1 `
#       -Arguments "-File","C:\path\to\AlteredMind.xlsx"
#
#   # actual write to production:
#   .\scripts\host_runner.ps1 -Script .\scripts\pending\altered_mind_step_5_repair.ps1 `
#       -Arguments "-File","C:\path\to\AlteredMind.xlsx","-Live"
# ===========================================================================

param(
    [Parameter(Mandatory = $false)]
    [string]$File = "",

    [switch]$Live
)

$ErrorActionPreference = "Continue"

# Anchors
$envId      = "bf5c5b10-9a17-4fe7-9f5b-e7de9a380122"
$businessId = "50d028ab-45b4-402c-957f-a652dfcca621"

# Paths
$repoRoot   = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$ingest     = Join-Path $repoRoot "scripts\ingest_altered_mind.py"
$envFile    = Join-Path $repoRoot "backend\.env"
$outDir     = Join-Path $repoRoot "skills\triaged-execution\runs\altered_mind_prod"
$outFile    = Join-Path $outDir "step_5.md"
New-Item -ItemType Directory -Path $outDir -Force | Out-Null

$report = @()
$report += "# Step 5: Altered Mind ingestion repair"
$report += ""
$report += "Run: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
$report += "env_id: ``$envId``"
$report += "business_id: ``$businessId``"
$report += "Mode: $(if ($Live) { 'LIVE (will write to production DB)' } else { 'DRY-RUN (parse only, no writes)' })"
$report += ""

# ---- Preflight: ingestion script ----
if (-not (Test-Path $ingest)) {
    Write-Host "ERROR: ingestion script not found at $ingest" -ForegroundColor Red
    $report += "## ERROR"
    $report += "Ingestion script not found at $ingest. Aborted."
    Set-Content -Path $outFile -Value ($report -join "`n") -Encoding UTF8
    exit 1
}

# ---- Preflight: source Excel ----
if (-not $File) {
    # Try common locations
    $candidates = @(
        "$env:USERPROFILE\Downloads\Altered Mind*.xlsx",
        "$env:USERPROFILE\Downloads\altered*mind*.xlsx",
        "$env:USERPROFILE\OneDrive\Downloads\Altered Mind*.xlsx",
        (Join-Path $repoRoot "demo_docs\altered_mind\*.xlsx"),
        (Join-Path $repoRoot "uploads\*altered*mind*.xlsx")
    )
    foreach ($pattern in $candidates) {
        $hit = Get-ChildItem -Path $pattern -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
        if ($hit) {
            $File = $hit.FullName
            Write-Host "Auto-discovered source file: $File" -ForegroundColor Cyan
            break
        }
    }
}

if (-not $File -or -not (Test-Path $File)) {
    Write-Host "ERROR: source Excel file not found." -ForegroundColor Red
    Write-Host "Pass it explicitly:"
    Write-Host '  .\scripts\host_runner.ps1 -Script .\scripts\pending\altered_mind_step_5_repair.ps1 -Arguments "-File","C:\path\to\AlteredMind.xlsx"'
    $report += "## ERROR"
    $report += "Source Excel not provided and not auto-discovered. Pass -File explicitly."
    Set-Content -Path $outFile -Value ($report -join "`n") -Encoding UTF8
    exit 1
}

$report += "Source: ``$File``"
$report += ""

# ---- Preflight: DATABASE_URL (only required for live writes) ----
if ($Live) {
    if (-not (Test-Path $envFile)) {
        Write-Host "ERROR: backend/.env missing. Pull production env first:" -ForegroundColor Red
        Write-Host "  vercel env pull backend/.env --environment production --yes"
        $report += "## ERROR"
        $report += "backend/.env missing. Run: ``vercel env pull backend/.env --environment production --yes``"
        Set-Content -Path $outFile -Value ($report -join "`n") -Encoding UTF8
        exit 1
    }
    $hasDbUrl = (Select-String -Path $envFile -Pattern "^DATABASE_URL=" -Quiet)
    if (-not $hasDbUrl) {
        Write-Host "ERROR: DATABASE_URL not found in backend/.env" -ForegroundColor Red
        $report += "## ERROR"
        $report += "DATABASE_URL not in backend/.env. Run: ``vercel env pull backend/.env --environment production --yes``"
        Set-Content -Path $outFile -Value ($report -join "`n") -Encoding UTF8
        exit 1
    }
}

# ---- Run ingestion ----
Write-Host ""
Write-Host "Running ingestion..." -ForegroundColor Cyan
Write-Host "  Mode: $(if ($Live) { 'LIVE' } else { 'DRY-RUN' })" -ForegroundColor Cyan
Write-Host ""

$ingestArgs = @($ingest, "--file", $File, "--env-id", $envId, "--business-id", $businessId)
if (-not $Live) { $ingestArgs += "--dry-run" }

# Load DATABASE_URL into the child process env if running live
if ($Live) {
    $envContent = Get-Content $envFile
    foreach ($line in $envContent) {
        if ($line -match '^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$') {
            $key = $Matches[1]
            $val = $Matches[2].Trim().Trim('"').Trim("'")
            [System.Environment]::SetEnvironmentVariable($key, $val, "Process")
        }
    }
}

$ingestOutput = python @ingestArgs 2>&1 | Out-String
$ingestExit = $LASTEXITCODE

$report += "## Ingestion output"
$report += ""
$report += '```'
$report += $ingestOutput.TrimEnd()
$report += '```'
$report += ""
$report += "Exit code: $ingestExit"
$report += ""

if ($ingestExit -ne 0) {
    Write-Host "Ingestion exited with code $ingestExit" -ForegroundColor Red
    $report += "## STATUS"
    $report += "FAILED — ingestion script exit code $ingestExit. Inspect the output above. No verification performed."
    Set-Content -Path $outFile -Value ($report -join "`n") -Encoding UTF8
    exit $ingestExit
}

# ---- Post-run verification (live only) ----
if (-not $Live) {
    $report += "## STATUS"
    $report += "DRY-RUN succeeded. No data was written. Inspect the parsed counts above."
    $report += ""
    $report += "If counts look right, re-run with -Live:"
    $report += '```powershell'
    $report += ".\scripts\host_runner.ps1 -Script .\scripts\pending\altered_mind_step_5_repair.ps1 ``"
    $report += "    -Arguments `"-File`",`"$File`",`"-Live`""
    $report += '```'
    Set-Content -Path $outFile -Value ($report -join "`n") -Encoding UTF8
    Write-Host ""
    Write-Host "Dry-run complete. Inspect: $outFile" -ForegroundColor Green
    Write-Host "If counts look right, re-run with -Live to actually write." -ForegroundColor Yellow
    exit 0
}

# Live mode: re-verify by re-running the step 2 query path
Write-Host "Verifying post-write counts via supabase CLI..." -ForegroundColor Cyan
function Q([string]$sql) {
    $tmp = New-TemporaryFile
    Set-Content -Path $tmp -Value $sql -Encoding UTF8
    $output = Get-Content $tmp -Raw | supabase db query --linked 2>&1 | Out-String
    Remove-Item $tmp -Force -ErrorAction SilentlyContinue
    return $output
}

$expected = @{
    am_daily_checkin = 355
    am_weekly_summary = 16
    am_referral = 63
    am_monthly_reflection = 3
}

$report += "## Post-write verification"
$report += ""
$verifyOk = $true
foreach ($t in $expected.Keys | Sort-Object) {
    $verifyOut = Q "SELECT count(*) AS n FROM $t WHERE env_id = '$envId';"
    $report += "### $t (expected $($expected[$t]))"
    $report += '```'
    $report += $verifyOut.TrimEnd()
    $report += '```'
    $report += ""
}

# Predicate check
$report += "### has_data predicate after write"
$predicateOut = Q @"
SELECT count(*) AS predicate_n
FROM am_weekly_summary
WHERE env_id = '$envId' AND clients_seen > 0;
"@
$report += '```'
$report += $predicateOut.TrimEnd()
$report += '```'
$report += ""
$report += "If ``predicate_n > 0``, the dashboard should now return ``has_data=true``."
$report += "If ``predicate_n = 0`` despite rows existing, the predicate itself is too narrow (proceed to step 7 patch)."

$report += ""
$report += "## STATUS"
$report += "LIVE write completed. Verification queries above. Inspect counts vs expected."

Set-Content -Path $outFile -Value ($report -join "`n") -Encoding UTF8

Write-Host ""
Write-Host "Step 5 LIVE complete." -ForegroundColor Green
Write-Host "Report: $outFile" -ForegroundColor Cyan
Write-Host ""
$report -join "`n"
