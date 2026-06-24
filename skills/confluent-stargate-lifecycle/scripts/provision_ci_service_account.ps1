#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Provision a least-privilege Confluent service account + API keys for the broker-row
  refresh GitHub Action, and print the GitHub secrets to set.

.DESCRIPTION
  CI cannot use the interactive `confluent login`. This creates a dedicated service
  account with a Cloud API key (management-plane reads) so the scheduled refresh can
  observe cluster/connector/Flink state. Run it yourself (it creates real resources);
  it is -DryRun by default and prints exactly what it would do.

  The secrets it emits go into the repo's GitHub Actions secrets:
    CONFLUENT_CLOUD_API_KEY, CONFLUENT_CLOUD_API_SECRET, TELEMETRY_DATABASE_URL
  (TELEMETRY_DATABASE_URL is pulled separately from Railway — see README.)

.PARAMETER Apply
  Actually create the service account + key. Without it, dry-run only.
#>
[CmdletBinding()]
param([switch]$Apply)

$ErrorActionPreference = 'Stop'
$ENV_ID  = 'env-vwkk2z'
$SA_NAME = 'ci-broker-refresh'
$SA_DESC = 'CI service account for the Telemetry broker-row refresh GitHub Action (read-only state probe)'

function Say($m, $c='Gray') { Write-Host $m -ForegroundColor $c }

# Preconditions
if (-not (Get-Command confluent -ErrorAction SilentlyContinue)) {
  Write-Host "FAIL: confluent CLI not on PATH" -ForegroundColor Red; exit 1
}

if (-not $Apply) {
  Say "DRY RUN — would create:" 'Cyan'
  Say "  1. service account '$SA_NAME' ($SA_DESC)" 'Gray'
  Say "  2. a Cloud API key bound to that service account" 'Gray'
  Say "  3. (optional) a Flink API key if statement reads need a separate grant" 'Gray'
  Say ""
  Say "Then set GitHub secrets:" 'Cyan'
  Say "  gh secret set CONFLUENT_CLOUD_API_KEY --body <key>" 'Gray'
  Say "  gh secret set CONFLUENT_CLOUD_API_SECRET --body <secret>" 'Gray'
  Say "  gh secret set TELEMETRY_DATABASE_URL --body \"\$(railway variables --service authentic-sparkle --kv | sls '^TELEMETRY_DATABASE_URL=' | ForEach-Object { (\$_ -split '=',2)[1] })\"" 'Gray'
  Say ""
  Say "Re-run with -Apply to create the service account + key." 'Yellow'
  exit 0
}

Say "Creating service account '$SA_NAME'..." 'Cyan'
$sa = & confluent iam service-account create $SA_NAME --description $SA_DESC -o json 2>&1 | ConvertFrom-Json
if (-not $sa.id) { Write-Host "FAIL: service-account create returned no id: $sa" -ForegroundColor Red; exit 1 }
Say "service account: $($sa.id)" 'Green'

Say "Creating Cloud API key for $($sa.id)..." 'Cyan'
$key = & confluent api-key create --resource cloud --service-account $sa.id `
  --description "broker-refresh CI cloud key" -o json 2>&1 | ConvertFrom-Json
if (-not $key.api_key) { Write-Host "FAIL: api-key create returned no key: $key" -ForegroundColor Red; exit 1 }

Say "" ; Say "Set these GitHub secrets (values shown once):" 'Cyan'
Say "  CONFLUENT_CLOUD_API_KEY    = $($key.api_key)" 'Yellow'
Say "  CONFLUENT_CLOUD_API_SECRET = $($key.api_secret)" 'Yellow'
Say "" ; Say "e.g.:  gh secret set CONFLUENT_CLOUD_API_KEY --body '$($key.api_key)'" 'Gray'
Say "Also set TELEMETRY_DATABASE_URL from Railway (authentic-sparkle service)." 'Gray'
Say ""
Say "NOTE: a Cloud API key grants org-level management reads. If you want tighter" 'DarkGray'
Say "scope, bind RBAC role assignments to $($sa.id) and rotate this key after testing." 'DarkGray'
