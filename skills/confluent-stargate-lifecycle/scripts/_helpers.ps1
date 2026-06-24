# Pure, side-effect-free helpers for the Confluent lifecycle skill.
# Extracted so they can be dot-sourced by both lifecycle.ps1 and the regression test
# without triggering the param-gated dispatch in the main script.

# The confluent CLI can return exit 0 while REJECTING the argument, printing the rejection
# to stdout/stderr (e.g. `flink compute-pool update --max-cfu 0` →
# "Bad Request: Violations [MaxCfu is not one of 5, 10, 20, 30, 40, 50: 0]").
# Exit code alone is NOT a reliable success signal — scan the output for rejection markers.
$script:CLI_REJECT_RX = 'Bad Request|Violations|is not one of|must be one of|^Error:|invalid value|not allowed'
function Test-CliReject([string[]]$output) {
  if (-not $output) { return $false }
  $text = ($output -join "`n")
  return [bool]($text -match $script:CLI_REJECT_RX)
}

# A CLI call SUCCEEDED only if exit code is 0 AND the output carries no rejection text.
function Test-CliSuccess([int]$exitCode, [string[]]$output) {
  return ($exitCode -eq 0 -and -not (Test-CliReject $output))
}

# Some confluent commands (notably `flink statement list`) print an informational notice
# to stdout BEFORE the JSON payload ("No Flink endpoint is specified, defaulting to ...").
# Strip everything before the first '[' or '{' so ConvertFrom-Json doesn't choke.
function ConvertFrom-CliJson([string[]]$output) {
  if (-not $output) { return $null }
  $joined = ($output -join "`n")
  $i = $joined.IndexOfAny([char[]]@('[', '{'))
  if ($i -lt 0) { return $null }
  return ($joined.Substring($i) | ConvertFrom-Json)
}

# Flink statements bill CFU-hours only while in one of these states. COMPLETED / STOPPED /
# FAILED do not bill. Exposed so the test can assert the running-set logic.
$script:FLINK_RUNNING_STATES = @('RUNNING', 'PENDING', 'DEGRADED')
function Select-RunningStatements($statements, $poolId = $null) {
  $running = @($statements | Where-Object { $_.status -in $script:FLINK_RUNNING_STATES })
  if ($poolId) { $running = @($running | Where-Object { $_.compute_pool -eq $poolId }) }
  return @($running)
}
