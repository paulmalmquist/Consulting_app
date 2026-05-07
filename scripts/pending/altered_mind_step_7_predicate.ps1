#!/usr/bin/env pwsh
# ===========================================================================
# Step 7 of altered_mind_prod plan — WIDEN backend has_data predicate.
# Profile: Sonnet, 16k think, E3 (critic review baked into the procedure below).
# DRY-RUN BY DEFAULT.
# ===========================================================================
#
# Step 1 found: the backend predicate at backend/app/routes/altered_mind.py
# lines 81-87 returns has_data=false unless am_weekly_summary has at least one
# row with clients_seen > 0. That is too narrow. A user with 355 daily
# check-ins and no weekly summaries still sees "Run the ingestion pipeline."
#
# This patch widens the predicate to: has_data=true if ANY of the four am_*
# tables has rows for the current env_id. The downstream code already handles
# missing weekly data gracefully (trend list is empty, latest week fields are
# null, frontend conditionally renders sections).
#
# Usage:
#   # dry-run: print the diff, do not modify files
#   .\scripts\host_runner.ps1 -Script .\scripts\pending\altered_mind_step_7_predicate.ps1
#
#   # apply: modify the file
#   .\scripts\host_runner.ps1 -Script .\scripts\pending\altered_mind_step_7_predicate.ps1 `
#       -Arguments "-Apply"
# ===========================================================================

param(
    [switch]$Apply
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$target   = Join-Path $repoRoot "backend\app\routes\altered_mind.py"
$outDir   = Join-Path $repoRoot "skills\triaged-execution\runs\altered_mind_prod"
$outFile  = Join-Path $outDir "step_7.md"
New-Item -ItemType Directory -Path $outDir -Force | Out-Null

if (-not (Test-Path $target)) {
    Write-Host "ERROR: $target not found" -ForegroundColor Red
    exit 1
}

# ---- Original predicate block (matched exactly) ----
$old = @'
            cur.execute(
                "SELECT COUNT(*) AS n FROM am_weekly_summary WHERE env_id = %s AND clients_seen > 0",
                (env_id,)
            )
            row = cur.fetchone()
            if not row or row["n"] == 0:
                return AMDashboardOut(env_id=env_id, trend=[], has_data=False)
'@

$new = @'
            # Widened predicate: has_data is true if ANY of the four am_* tables
            # has rows for this env_id. Downstream queries handle missing
            # weekly data via null fallbacks; frontend renders sections
            # conditionally. Was previously too narrow (am_weekly_summary
            # AND clients_seen > 0 only).
            cur.execute(
                """
                SELECT
                    (SELECT COUNT(*) FROM am_weekly_summary WHERE env_id = %s) AS weekly_n,
                    (SELECT COUNT(*) FROM am_daily_checkin   WHERE env_id = %s) AS daily_n,
                    (SELECT COUNT(*) FROM am_referral        WHERE env_id = %s) AS referral_n,
                    (SELECT COUNT(*) FROM am_monthly_reflection WHERE env_id = %s) AS reflection_n
                """,
                (env_id, env_id, env_id, env_id),
            )
            row = cur.fetchone()
            total_rows = (
                (row["weekly_n"]     or 0) +
                (row["daily_n"]      or 0) +
                (row["referral_n"]   or 0) +
                (row["reflection_n"] or 0)
            ) if row else 0
            if total_rows == 0:
                return AMDashboardOut(env_id=env_id, trend=[], has_data=False)
'@

$content = Get-Content $target -Raw

if ($content -notlike "*$old*") {
    Write-Host "ERROR: original predicate block not found in $target" -ForegroundColor Red
    Write-Host "The file may already have been patched, or the predicate text drifted."
    Write-Host "Inspect manually before retrying."
    exit 1
}

# ---- Build report ----
$report = @()
$report += "# Step 7: backend has_data predicate widening"
$report += ""
$report += "Run: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
$report += "Mode: $(if ($Apply) { 'APPLY (file will be modified)' } else { 'DRY-RUN (no changes)' })"
$report += "Target: ``backend/app/routes/altered_mind.py`` (predicate at lines 81-87)"
$report += ""
$report += "## What this patch does"
$report += ""
$report += "**Before:** has_data=false unless ``am_weekly_summary`` has at least one row with ``clients_seen > 0``."
$report += ""
$report += "**After:** has_data=false only if ALL FOUR ``am_*`` tables are empty for this env_id."
$report += ""
$report += "**Why:** the original predicate hides legitimate data. A user with 355 daily check-ins"
$report += "but no weekly summaries (or only weekly rows with null/zero clients_seen) is told to"
$report += "run the ingestion pipeline, which they already did."
$report += ""
$report += "## Diff"
$report += ""
$report += "### Removed"
$report += '```python'
$report += $old
$report += '```'
$report += ""
$report += "### Added"
$report += '```python'
$report += $new
$report += '```'
$report += ""

# ---- Apply if requested ----
if ($Apply) {
    $patched = $content.Replace($old, $new)
    Set-Content -Path $target -Value $patched -Encoding UTF8 -NoNewline
    $report += "## STATUS"
    $report += "APPLIED. ``$target`` modified."
    $report += ""
    $report += "Next: run the test suite to confirm the change does not regress existing behavior:"
    $report += '```'
    $report += "cd backend && pytest tests/test_altered_mind*.py -v"
    $report += '```'

    Set-Content -Path $outFile -Value ($report -join "`n") -Encoding UTF8

    Write-Host ""
    Write-Host "Patch applied to $target" -ForegroundColor Green
    Write-Host "Report: $outFile" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Next: cd backend && pytest tests/test_altered_mind*.py -v" -ForegroundColor Yellow
} else {
    $report += "## STATUS"
    $report += "DRY-RUN. No files modified."
    $report += ""
    $report += "If the diff looks correct, re-run with -Apply:"
    $report += '```powershell'
    $report += ".\scripts\host_runner.ps1 -Script .\scripts\pending\altered_mind_step_7_predicate.ps1 -Arguments `"-Apply`""
    $report += '```'

    Set-Content -Path $outFile -Value ($report -join "`n") -Encoding UTF8

    Write-Host ""
    Write-Host "Dry-run complete." -ForegroundColor Green
    Write-Host "Report: $outFile" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Diff above. To apply: re-run with -Apply" -ForegroundColor Yellow
}

# Echo to stdout so host_runner captures the report in its result JSON
$report -join "`n"
