#!/usr/bin/env pwsh
# Regression tests for the Confluent lifecycle skill's cost-truth guarantees.
# Framework-free (repo only ships Pester 3.4.0): dot-sources _helpers.ps1, asserts, exits
# non-zero on any failure. Run: pwsh -File scripts/lifecycle.Tests.ps1
#
# The bug these guard against: `confluent flink compute-pool update --max-cfu 0` returns
# EXIT 0 while rejecting the argument in stdout, so the old stop-serving silently claimed a
# false "parked at 0 CFU" state. max-cfu cannot be 0 (valid: 5/10/20/30/40/50); the real
# cost-stop is "no running statements".

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $ScriptDir '_helpers.ps1')

$script:fails = 0
function Check([string]$name, [bool]$cond) {
  if ($cond) { Write-Host "  PASS  $name" -ForegroundColor Green }
  else       { Write-Host "  FAIL  $name" -ForegroundColor Red; $script:fails++ }
}

Write-Host "Confluent lifecycle — cost-truth regression tests" -ForegroundColor Cyan

# ── 1. The exact failure mode: exit 0 + rejection text in stdout ──────────────
# This is the real CLI output captured from `--max-cfu 0` (exit code was 0).
$maxCfuZeroOutput = @(
  'Error: Bad Request: Violations [MaxCfu is not one of 5, 10, 20, 30, 40, 50: 0]'
)
Check "Test-CliReject flags the --max-cfu 0 rejection" (Test-CliReject $maxCfuZeroOutput)
Check "Test-CliSuccess returns FALSE despite exit 0 on rejection" (-not (Test-CliSuccess 0 $maxCfuZeroOutput))
Check "Test-CliSuccess returns FALSE on --max-cfu 1 rejection" `
  (-not (Test-CliSuccess 0 @('Error: Bad Request: Violations [MaxCfu is not one of 5, 10, 20, 30, 40, 50: 1]')))

# ── 2. A genuine success must still read as success ───────────────────────────
$okOutput = @('{ "id": "lfcp-22wznzq", "max_cfu": 5, "status": "PROVISIONED" }')
Check "Test-CliSuccess returns TRUE on clean exit 0 + clean output" (Test-CliSuccess 0 $okOutput)
Check "Test-CliReject does NOT false-positive on clean output" (-not (Test-CliReject $okOutput))
Check "Test-CliSuccess returns FALSE on non-zero exit even with clean output" (-not (Test-CliSuccess 1 $okOutput))

# ── 3. JSON preamble stripping (flink statement list emits a notice line first) ─
$withPreamble = @(
  'No Flink endpoint is specified, defaulting to public endpoint: https://flink.us-east1.gcp.confluent.cloud',
  '[ { "name": "agg5s", "status": "STOPPED", "compute_pool": "lfcp-22wznzq" } ]'
)
$parsed = ConvertFrom-CliJson $withPreamble
Check "ConvertFrom-CliJson strips the endpoint-notice preamble" ($null -ne $parsed -and @($parsed).Count -eq 1)
Check "ConvertFrom-CliJson returns null on output with no JSON" ($null -eq (ConvertFrom-CliJson @('just a notice, no json')))

# ── 4. Running-set logic: only billing states count ───────────────────────────
$statements = @(
  [pscustomobject]@{ name='agg-create'; status='COMPLETED'; compute_pool='lfcp-22wznzq' },
  [pscustomobject]@{ name='anom';       status='FAILED';    compute_pool='lfcp-22wznzq' },
  [pscustomobject]@{ name='agg5s';      status='STOPPED';   compute_pool='lfcp-22wznzq' },
  [pscustomobject]@{ name='live-insert';status='RUNNING';   compute_pool='lfcp-22wznzq' },
  [pscustomobject]@{ name='other-pool'; status='RUNNING';   compute_pool='lfcp-v7pqqvj' }
)
Check "Select-RunningStatements counts only RUNNING/PENDING/DEGRADED" `
  (@(Select-RunningStatements $statements).Count -eq 2)
Check "Select-RunningStatements filters by pool" `
  (@(Select-RunningStatements $statements 'lfcp-22wznzq').Count -eq 1)
Check "Select-RunningStatements returns empty array (not null) when all idle" `
  (@(Select-RunningStatements ($statements | Where-Object { $_.status -ne 'RUNNING' })).Count -eq 0)

# ── 5. The script must never use the forbidden --max-cfu 0 again ───────────────
$src = Get-Content (Join-Path $ScriptDir 'lifecycle.ps1') -Raw
Check "lifecycle.ps1 contains NO '--max-cfu 0' (or 1) call" `
  (-not ($src -match '--max-cfu\s+[01]\b'))
Check "stop-serving stops statements, not pools (references statement stop)" `
  ($src -match 'flink statement stop')

Write-Host ""
if ($script:fails -gt 0) {
  Write-Host "$($script:fails) test(s) FAILED" -ForegroundColor Red
  exit 1
}
Write-Host "All tests passed" -ForegroundColor Green
exit 0
