#!/usr/bin/env pwsh
# ===========================================================================
# Step 2 of altered_mind_prod plan — verify production schema + row counts.
# Read-only. NO INSTALLS. NO RE-AUTH.
# ===========================================================================
#
# Uses your already-installed and already-linked Supabase CLI.
# If the CLI is missing or not linked, this script fails fast with the exact
# one-time command you need to run. It never tries to install or re-auth.
#
# One-time setup (only if check_clis.ps1 flagged supabase RED):
#   1. npm install -g supabase
#   2. supabase login
#   3. supabase link --project-ref ozboonlsplroialdwuxj
#
# Invocation (via host bypass):
#   .\scripts\host_runner.ps1 -Script .\scripts\pending\altered_mind_step_2.ps1
# ===========================================================================

$ErrorActionPreference = "Continue"

# Anchors
$envId      = "bf5c5b10-9a17-4fe7-9f5b-e7de9a380122"
$businessId = "50d028ab-45b4-402c-957f-a652dfcca621"
$projectRef = "ozboonlsplroialdwuxj"

# Paths
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$outDir   = Join-Path $repoRoot "skills\triaged-execution\runs\altered_mind_prod"
$outFile  = Join-Path $outDir "step_2.md"
New-Item -ItemType Directory -Path $outDir -Force | Out-Null

# ---- Preflight ----
if (-not (Get-Command supabase -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: supabase CLI not on PATH." -ForegroundColor Red
    Write-Host "One-time install: npm install -g supabase"
    Write-Host "Then re-run this script. No further installs needed."
    exit 1
}

# Quick auth + link probe via the documented `supabase db query --linked` pattern.
function Q([string]$sql) {
    $tmp = New-TemporaryFile
    Set-Content -Path $tmp -Value $sql -Encoding UTF8
    $output = Get-Content $tmp -Raw | supabase db query --linked 2>&1 | Out-String
    $exit = $LASTEXITCODE
    Remove-Item $tmp -Force -ErrorAction SilentlyContinue
    return [PSCustomObject]@{ Output = $output; Exit = $exit }
}

$probe = Q "SELECT 1 AS ok;"
if ($probe.Exit -ne 0) {
    Write-Host "ERROR: supabase db query failed. CLI is on PATH but not linked or not authenticated." -ForegroundColor Red
    Write-Host ""
    Write-Host "Probe output:" -ForegroundColor DarkGray
    Write-Host $probe.Output -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "One-time fix (only run the steps you actually need):" -ForegroundColor Yellow
    Write-Host "  supabase login" -ForegroundColor Yellow
    Write-Host "  supabase link --project-ref $projectRef" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Tokens persist after that. You will not need to do this again." -ForegroundColor Yellow
    exit 1
}

# ---- Gather data ----
$tables = @("am_daily_checkin", "am_weekly_summary", "am_referral", "am_monthly_reflection")
$expected = @{
    am_daily_checkin = 355
    am_weekly_summary = 16
    am_referral = 63
    am_monthly_reflection = 3
}

$counts = @{}
foreach ($t in $tables) {
    Write-Host "  count($t)..." -ForegroundColor DarkGray
    $counts[$t] = Q "SELECT count(*) AS n FROM $t;"
}

$scope = @{}
foreach ($t in $tables) {
    Write-Host "  scope($t)..." -ForegroundColor DarkGray
    $sql = @"
SELECT count(*) AS n, env_id::text AS eid, business_id::text AS bid
FROM $t
GROUP BY env_id, business_id
ORDER BY n DESC
LIMIT 10;
"@
    $scope[$t] = Q $sql
}

Write-Host "  has_data predicate (the exact query the backend dashboard route runs)..." -ForegroundColor DarkGray
# This mirrors backend/app/routes/altered_mind.py lines 82-87. If this returns 0, the
# dashboard returns has_data=false and the page shows the empty-state message.
$predicate = Q @"
SELECT count(*) AS predicate_n
FROM am_weekly_summary
WHERE env_id = '$envId'
  AND clients_seen > 0;
"@

Write-Host "  predicate breakdown (am_weekly_summary scope + clients_seen distribution)..." -ForegroundColor DarkGray
$predicateBreak = Q @"
SELECT
  count(*) AS rows_for_env,
  count(*) FILTER (WHERE clients_seen > 0) AS rows_with_clients_seen_positive,
  count(*) FILTER (WHERE clients_seen = 0) AS rows_with_clients_seen_zero,
  count(*) FILTER (WHERE clients_seen IS NULL) AS rows_with_clients_seen_null
FROM am_weekly_summary
WHERE env_id = '$envId';
"@

Write-Host "  owner membership..." -ForegroundColor DarkGray
$owner = Q @"
WITH probes AS (
    SELECT 'business_users' AS source, COALESCE((
        SELECT count(*)::int FROM business_users bu
        JOIN auth.users u ON u.id = bu.user_id
        WHERE u.email = 'paulmalmquist@gmail.com'
          AND bu.business_id = '$businessId'
    ), 0) AS n
    UNION ALL
    SELECT 'env_users' AS source, COALESCE((
        SELECT count(*)::int FROM env_users eu
        JOIN auth.users u ON u.id = eu.user_id
        WHERE u.email = 'paulmalmquist@gmail.com'
          AND eu.env_id = '$envId'
    ), 0)
    UNION ALL
    SELECT 'memberships' AS source, COALESCE((
        SELECT count(*)::int FROM memberships m
        JOIN auth.users u ON u.id = m.user_id
        WHERE u.email = 'paulmalmquist@gmail.com'
    ), 0)
)
SELECT * FROM probes;
"@

# ---- Render report ----
$report = @()
$report += "# Step 2: Altered Mind production data verification"
$report += ""
$report += "Run: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
$report += "env_id: ``$envId``"
$report += "business_id: ``$businessId``"
$report += "project_ref: ``$projectRef``"
$report += ""
$report += "## Row counts (vs expected)"
$report += ""

foreach ($t in $tables) {
    $report += "### $t (expected $($expected[$t]))"
    $report += '```'
    $report += $counts[$t].Output.TrimEnd()
    $report += '```'
    $report += ""
}

$report += "## Scope breakdown by env_id + business_id"
$report += ""
$report += "Look for the bulk of rows under env_id = ``$envId`` and business_id = ``$businessId``."
$report += "Anything under a different scope is the bug surface."
$report += ""

foreach ($t in $tables) {
    $report += "### $t"
    $report += '```'
    $report += $scope[$t].Output.TrimEnd()
    $report += '```'
    $report += ""
}

$report += "## has_data predicate (what the backend dashboard actually checks)"
$report += ""
$report += "Mirrors ``backend/app/routes/altered_mind.py`` lines 82-87."
$report += "If ``predicate_n = 0``, the API returns ``has_data=false`` and the page shows the empty-state."
$report += ""
$report += '```'
$report += $predicate.Output.TrimEnd()
$report += '```'
$report += ""
$report += "### Predicate breakdown (why it might be zero)"
$report += ""
$report += "Even when ``am_weekly_summary`` has rows for this env_id, they only count toward has_data"
$report += "if ``clients_seen > 0``. Null or zero values are silently filtered out."
$report += ""
$report += '```'
$report += $predicateBreak.Output.TrimEnd()
$report += '```'
$report += ""
$report += "## Owner membership probes"
$report += ""
$report += "Tries three common membership tables. Rows with ``n > 0`` mean the owner has access via that table."
$report += "Errors on a probe usually mean that membership table doesn't exist in this schema (fine, ignore)."
$report += ""
$report += '```'
$report += $owner.Output.TrimEnd()
$report += '```'

$report += ""
$report += "## Decision tree (read this last)"
$report += ""
$report += "Use these facts to pick the next pending script."
$report += ""
$report += "1. **All four count tables show 0 rows for this env_id** → ingestion never ran for this scope. Run ``altered_mind_step_5_repair.ps1``."
$report += "2. **Tables have rows but predicate_n is 0** → data is there, but every ``am_weekly_summary`` row for this env_id has ``clients_seen`` null or zero. Two sub-cases:"
$report += "   - Ingestion data was malformed (Excel source had no positive clients_seen). Re-ingest from corrected source."
$report += "   - Predicate itself is too narrow. Widen the backend check to ``any of the four tables has rows`` (step 7 patch)."
$report += "3. **Predicate_n > 0** → has_data should be true. The bug lives elsewhere (auth header, env_id pass-through, frontend caching). Run an API probe."
$report += "4. **Counts under a different env_id or business_id in the scope breakdown** → ingestion ran on wrong scope. Re-ingest under correct anchors."
$report += ""
$report += "Step 3 (scope verification) and Step 4 (owner membership) are already covered above."

Set-Content -Path $outFile -Value ($report -join "`n") -Encoding UTF8

Write-Host ""
Write-Host "Step 2 complete." -ForegroundColor Green
Write-Host "Report: $outFile" -ForegroundColor Cyan
Write-Host ""

# Echo to stdout so host_runner captures it in the result JSON
$report -join "`n"
