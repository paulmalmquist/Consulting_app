#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Tiered lifecycle control for the Confluent Cloud Stargate streaming spine.

.DESCRIPTION
  Stops serving costs losslessly, exports topics/schemas/connectors/Flink as IaC,
  deletes the cluster behind an export gate, recreates it from the export, and
  mirrors the broker cost state onto the Telemetry Mission Control PIPELINE panel.

  Confluent Cloud is NOT sleepable. Tier 'stop-serving' keeps the cluster (topics
  + schemas survive). Tier 'delete-cluster' destroys topics; recreate from export.

.PARAMETER Action
  status | export | stop-serving | delete-cluster | recreate

.PARAMETER ConfirmDelete
  Required for delete-cluster: must equal the live cluster id (e.g. lkc-gqpvvyv).

.EXAMPLE
  pwsh lifecycle.ps1 -Action status
  pwsh lifecycle.ps1 -Action export
  pwsh lifecycle.ps1 -Action stop-serving
  pwsh lifecycle.ps1 -Action delete-cluster -ConfirmDelete lkc-gqpvvyv
  pwsh lifecycle.ps1 -Action recreate
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory)]
  [ValidateSet('status','export','stop-serving','delete-cluster','recreate')]
  [string]$Action,
  [string]$ConfirmDelete,
  [switch]$SkipGraph
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

# ── constants (verified live 2026-06-24) ──────────────────────────────────────
$ENV_ID      = 'env-vwkk2z'
$CLUSTER_ID  = 'lkc-gqpvvyv'
$CLUSTER_NM  = 'cluster_0'
$FLINK_POOLS = @('lfcp-22wznzq','lfcp-v7pqqvj')   # stargate-demo-pool, default
$FLINK_CLOUD = 'gcp'
$FLINK_REGION= 'us-east1'
# A Flink statement bills CFUs only while RUNNING/PENDING/DEGRADED (see _helpers.ps1).
# There is NO way to set a pool's max-cfu to 0 — valid values are {5,10,20,30,40,50} — so
# "parked" means "no statement in a running state", NOT "0 CFU ceiling".

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot  = (Resolve-Path (Join-Path $ScriptDir '..' '..' '..')).Path
$IacDir    = Join-Path $RepoRoot 'infra' 'confluent' 'stargate'
$Manifest  = Join-Path $IacDir 'manifest.json'

function Say($msg, $color='Gray') { Write-Host $msg -ForegroundColor $color }
function Die($msg) { Write-Host "FAIL: $msg" -ForegroundColor Red; exit 1 }

# ── fail-closed preconditions ─────────────────────────────────────────────────
function Assert-Cli {
  $cf = Get-Command confluent -ErrorAction SilentlyContinue
  if (-not $cf) { Die "confluent CLI not on PATH. Install: winget install ConfluentInc.Confluent-CLI" }
  $ctx = & confluent context list -o json 2>&1 | ConvertFrom-Json
  $cur = $ctx | Where-Object { $_.is_current }
  if (-not $cur) { Die "confluent CLI not logged in. Run: confluent login" }
  Say "auth: $($cur.credential) @ $($cur.platform)" 'DarkGray'
  & confluent environment use $ENV_ID 2>&1 | Out-Null
}

function Get-ClusterType {
  $c = & confluent kafka cluster describe $CLUSTER_ID --environment $ENV_ID -o json 2>&1 | ConvertFrom-Json
  if (-not $c) { return $null }
  return $c.type   # STANDARD | DEDICATED | BASIC | ENTERPRISE
}

function CostUnit($type) {
  if ($type -eq 'DEDICATED') { return 'CKU-hours' } else { return 'flat hourly base' }
}

# Pure helpers (Test-CliReject / Test-CliSuccess / ConvertFrom-CliJson / Select-RunningStatements)
# live in _helpers.ps1 so the regression test can dot-source them without running a tier.
. (Join-Path $ScriptDir '_helpers.ps1')

# Return the Flink statements currently in a billing/running state. $null pool = all pools.
function Get-FlinkRunning($poolId = $null) {
  $raw = & confluent flink statement list --environment $ENV_ID --cloud $FLINK_CLOUD --region $FLINK_REGION -o json 2>&1
  $st = ConvertFrom-CliJson $raw
  return @(Select-RunningStatements $st $poolId)
}

# ── graph bind ────────────────────────────────────────────────────────────────
function Set-Graph($status, $reason) {
  if ($SkipGraph) { Say "graph: skipped (-SkipGraph)" 'DarkGray'; return }
  $py = Get-Command python -ErrorAction SilentlyContinue
  if (-not $py) { $py = Get-Command python3 -ErrorAction SilentlyContinue }
  if (-not $py) { Say "graph: python not found, skipping broker row write" 'Yellow'; return }
  $script = Join-Path $ScriptDir 'graph_bind.py'
  & $py.Source $script --status $status --reason $reason
  if ($LASTEXITCODE -ne 0) { Say "graph: write failed (broker row not updated)" 'Yellow' }
}

# ── tier 0: status ────────────────────────────────────────────────────────────
function Do-Status {
  Assert-Cli
  $type = Get-ClusterType
  if (-not $type) {
    Say "cluster ${CLUSTER_ID}: NOT FOUND (deleted?)" 'Yellow'
    Set-Graph 'gone' 'cluster not found · recreate from export'
    return
  }
  Say "cluster $CLUSTER_ID ($CLUSTER_NM): $type · cost unit = $(CostUnit $type)" 'Cyan'

  $conns = @(& confluent connect cluster list --cluster $CLUSTER_ID --environment $ENV_ID -o json 2>&1 | ConvertFrom-Json)
  $running = @($conns | Where-Object { $_.status -eq 'RUNNING' })
  Say "connectors: $($conns.Count) total, $($running.Count) running" 'Gray'
  foreach ($c in $conns) { Say "  - $($c.name) [$($c.id)] $($c.status) ($($c.type))" 'DarkGray' }

  # max_cfu is only a ceiling (min 5, never 0) — NOT the cost lever. CFU-hours bill on
  # running statements, so report those as the real idle/active signal. Fetch once.
  $flinkRunning = @(Get-FlinkRunning)
  foreach ($p in $FLINK_POOLS) {
    $pool = & confluent flink compute-pool describe $p --environment $ENV_ID -o json 2>&1 | ConvertFrom-Json
    # NOTE: CLI 4.60 misspells the field as 'currrent_cfu' (three r's). Read both spellings.
    if ($pool) {
      $cur = if ($null -ne $pool.currrent_cfu) { $pool.currrent_cfu } else { $pool.current_cfu }
      $runOnPool = @($flinkRunning | Where-Object { $_.compute_pool -eq $p }).Count
      $verb = if ($runOnPool -eq 0) { 'idle' } else { "active ($runOnPool running)" }
      Say "flink: $($pool.name) [$p] $verb · cfu $cur (ceiling $($pool.max_cfu)) · $($pool.status)" 'Gray'
    }
  }

  $topics = & confluent kafka topic list --cluster $CLUSTER_ID --environment $ENV_ID -o json 2>&1 | ConvertFrom-Json
  $subs   = & confluent schema-registry subject list --environment $ENV_ID -o json 2>&1 | ConvertFrom-Json
  Say "topics: $(@($topics).Count) · schema subjects: $(@($subs).Count) · flink running stmts: $($flinkRunning.Count)" 'Gray'

  # derive broker state for the graph — honest about BOTH connectors and Flink statements
  if ($running.Count -gt 0 -or $flinkRunning.Count -gt 0) {
    Set-Graph 'fresh' "serving · $($running.Count) connector(s) + $($flinkRunning.Count) flink stmt(s) running · $type cluster"
  } else {
    Set-Graph 'warm' "idle · 0 connectors · 0 running flink stmts · topics retained · $type $(CostUnit $type) only"
  }
}

# ── tier 1: export ────────────────────────────────────────────────────────────
function Do-Export {
  Assert-Cli
  New-Item -ItemType Directory -Force -Path $IacDir | Out-Null
  New-Item -ItemType Directory -Force -Path (Join-Path $IacDir 'topics') | Out-Null
  New-Item -ItemType Directory -Force -Path (Join-Path $IacDir 'schemas') | Out-Null
  New-Item -ItemType Directory -Force -Path (Join-Path $IacDir 'connectors') | Out-Null
  New-Item -ItemType Directory -Force -Path (Join-Path $IacDir 'flink') | Out-Null

  $type = Get-ClusterType
  if (-not $type) { Die "cluster $CLUSTER_ID not found — nothing to export." }

  # topics + configs
  $topics = & confluent kafka topic list --cluster $CLUSTER_ID --environment $ENV_ID -o json 2>&1 | ConvertFrom-Json
  $topicNames = @()
  foreach ($t in $topics) {
    if ($t.is_internal) { continue }
    $topicNames += $t.name
    $cfg = & confluent kafka topic describe $t.name --cluster $CLUSTER_ID --environment $ENV_ID -o json 2>&1
    $safe = ($t.name -replace '[^\w\.\-]','_')
    $cfg | Out-File -Encoding utf8 (Join-Path $IacDir 'topics' "$safe.json")
  }
  Say "exported $($topicNames.Count) topics" 'Green'

  # schema subjects (latest version each).
  # NOTE: `schema describe` does NOT support `-o json` (unlike the cluster/topic/pool describe
  # commands above). Passing it errors, and a blind `2>&1 > file` writes the CLI error dump INTO the
  # schema file. So: capture stdout only (no 2>&1) and parse the human "Schema ID:/Type:/Schema:"
  # output into a clean {subject, version, id, schemaType, schema} doc. JSON schemas embed the parsed
  # object; PROTOBUF/AVRO embed the raw schema text as a string. A bad/empty describe is skipped, never
  # written. (Re-corrupting these files is exactly the bug fix/stargate-schema-exports addressed.)
  $subs = & confluent schema-registry subject list --environment $ENV_ID -o json 2>&1 | ConvertFrom-Json
  $subjNames = @()
  foreach ($s in $subs) {
    $safe = ($s.subject -replace '[^\w\.\-]','_')
    $raw = & confluent schema-registry schema describe --subject $s.subject --version latest --environment $ENV_ID 2>$null
    $text = ($raw -join "`n")
    if ($text -match 'Error:|Usage:' -or [string]::IsNullOrWhiteSpace($text)) {
      Say "  skipped schema $($s.subject) (describe returned no schema)" 'Yellow'; continue
    }
    $id   = if ($text -match 'Schema ID:\s*(\d+)') { [int]$Matches[1] } else { $null }
    $type = if ($text -match 'Type:\s*(\w+)')      { $Matches[1] }       else { $null }
    $body = if ($text -match '(?s)Schema:\s*\n(.*)$') { $Matches[1].Trim() } else { '' }
    $schema = if ($type -eq 'JSON') { $body | ConvertFrom-Json } else { $body }  # proto/avro: raw text
    $doc = [ordered]@{ subject = $s.subject; version = 'latest'; id = $id; schemaType = $type; schema = $schema }
    $doc | ConvertTo-Json -Depth 50 | Out-File -Encoding utf8 (Join-Path $IacDir 'schemas' "$safe.json")
    $subjNames += $s.subject
  }
  Say "exported $($subjNames.Count) schema subjects" 'Green'

  # connector configs
  $conns = & confluent connect cluster list --cluster $CLUSTER_ID --environment $ENV_ID -o json 2>&1 | ConvertFrom-Json
  $connNames = @()
  foreach ($c in $conns) {
    $connNames += $c.name
    $safe = ($c.name -replace '[^\w\.\-]','_')
    & confluent connect cluster describe $c.id --cluster $CLUSTER_ID --environment $ENV_ID -o json 2>&1 |
      Out-File -Encoding utf8 (Join-Path $IacDir 'connectors' "$safe.json")
  }
  Say "exported $($connNames.Count) connector configs" 'Green'

  # flink pools
  foreach ($p in $FLINK_POOLS) {
    $pool = & confluent flink compute-pool describe $p --environment $ENV_ID -o json 2>&1
    $pool | Out-File -Encoding utf8 (Join-Path $IacDir 'flink' "$p.json")
  }
  Say "exported $($FLINK_POOLS.Count) flink pool definitions" 'Green'

  # manifest — the export gate for delete-cluster
  # NOTE: PowerShell variables are case-insensitive, so this must NOT be named $Manifest
  # (that already holds the path). Use $manifestObj.
  $manifestObj = [ordered]@{
    cluster_id   = $CLUSTER_ID
    cluster_name = $CLUSTER_NM
    cluster_type = $type
    environment  = $ENV_ID
    topics       = $topicNames
    subjects     = $subjNames
    connectors   = $connNames
    flink_pools  = $FLINK_POOLS
    exported_by  = (& confluent context list -o json 2>&1 | ConvertFrom-Json | Where-Object { $_.is_current }).credential
    note         = 'Recreate order: cluster -> topics -> schemas -> service accounts/keys/ACLs -> flink pools -> connectors -> replay.'
  }
  $manifestObj | ConvertTo-Json -Depth 6 | Out-File -Encoding utf8 $Manifest
  Say "manifest written: $Manifest" 'Green'
  Say "export complete — delete-cluster is now unlocked (still requires -ConfirmDelete)." 'Cyan'
}

# ── tier 2: stop-serving (lossless) ───────────────────────────────────────────
function Do-StopServing {
  Assert-Cli
  $type = Get-ClusterType
  if (-not $type) { Die "cluster not found — nothing to stop." }

  # delete connectors (pausing keeps billing task-hours)
  $conns = @(& confluent connect cluster list --cluster $CLUSTER_ID --environment $ENV_ID -o json 2>&1 | ConvertFrom-Json)
  foreach ($c in $conns) {
    Say "deleting connector $($c.name) [$($c.id)] (delete, not pause — task-hours)" 'Yellow'
    & confluent connect cluster delete $c.id --cluster $CLUSTER_ID --environment $ENV_ID --force 2>&1 | Out-Null
  }

  # Stop Flink CFU-hours by stopping RUNNING statements — NOT by lowering max-cfu (which
  # cannot go below 5 and silently no-ops). An idle pool with no running statements bills
  # no CFU-hours; the pool itself is free to keep around.
  $running = @(Get-FlinkRunning)
  if ($running.Count -eq 0) {
    Say "flink: no running statements — already idle, no CFU-hours accruing." 'Gray'
  } else {
    foreach ($s in $running) {
      Say "stopping flink statement $($s.name) [$($s.status)] on $($s.compute_pool)" 'Yellow'
      $out = & confluent flink statement stop $s.name --environment $ENV_ID --cloud $FLINK_CLOUD --region $FLINK_REGION 2>&1
      if ($LASTEXITCODE -ne 0 -or (Test-CliReject $out)) {
        Die "failed to stop statement $($s.name): $($out -join ' ')"
      }
    }
  }

  # Verify the honest end state before claiming anything. Never report "parked" on faith.
  $stillRunning = @(Get-FlinkRunning)
  if ($stillRunning.Count -gt 0) {
    Set-Graph 'hot' "serving NOT fully stopped · $($stillRunning.Count) flink statement(s) still running"
    Die "stop-serving incomplete: $($stillRunning.Count) flink statement(s) still running ($([string]::Join(', ', ($stillRunning | ForEach-Object { $_.name })))). Cost-state NOT claimed as parked."
  }

  Say "serving stopped. Connectors deleted, no running Flink statements. Topics + schemas retained." 'Cyan'
  Say "Cluster still bills $(CostUnit $type); Flink pools idle (no CFU-hours). To stop ALL billing, delete the cluster." 'Cyan'
  Set-Graph 'warm' "serving stopped · 0 connectors · 0 running flink stmts · topics retained · $type $(CostUnit $type) only"
}

# ── tier 3: delete-cluster (destructive, export-gated) ────────────────────────
function Do-DeleteCluster {
  Assert-Cli
  if (-not (Test-Path $Manifest)) {
    Die "no export manifest at $Manifest. Run -Action export first (export gate)."
  }
  if ($ConfirmDelete -ne $CLUSTER_ID) {
    Die "refusing to delete. Pass -ConfirmDelete $CLUSTER_ID to confirm you mean to destroy topics + data."
  }
  $m = Get-Content $Manifest -Raw | ConvertFrom-Json
  Say "export on disk covers: $(@($m.topics).Count) topics, $(@($m.subjects).Count) subjects, $(@($m.connectors).Count) connectors." 'Gray'
  Say "DELETING cluster $CLUSTER_ID — this destroys all topics + data in it." 'Red'
  & confluent kafka cluster delete $CLUSTER_ID --environment $ENV_ID --force 2>&1 | Out-Null

  # "deleted" state = Flink pools removed too (a pool with no statements is free, but the
  # delete tier means "tear the lane down"). Best-effort; report what actually happened.
  foreach ($p in $FLINK_POOLS) {
    $out = & confluent flink compute-pool delete $p --environment $ENV_ID --force 2>&1
    if ($LASTEXITCODE -eq 0 -and -not (Test-CliReject $out)) {
      Say "deleted flink pool $p" 'Yellow'
    } else {
      Say "flink pool $p not deleted (may already be gone): $($out -join ' ')" 'DarkGray'
    }
  }
  Say "cluster + flink pools deleted. Recreate with -Action recreate." 'Cyan'
  Set-Graph 'gone' 'cluster + flink pools deleted · recreate from export'
}

# ── tier 4: recreate (from export) ────────────────────────────────────────────
function Do-Recreate {
  Assert-Cli
  if (-not (Test-Path $Manifest)) { Die "no export manifest at $Manifest — nothing to recreate from." }
  $m = Get-Content $Manifest -Raw | ConvertFrom-Json

  # The repo already ships an idempotent provisioner for this exact lane. Delegate
  # to it rather than duplicate topic/SR/Flink creation — keep one source of truth.
  $provision = Join-Path $IacDir 'provision.ps1'
  if (-not (Test-Path $provision)) {
    Die "expected provisioner missing: $provision. Recreate manually from infra/confluent/stargate/."
  }

  # If the cluster still exists, provision.ps1 is idempotent and will reuse it;
  # if it was deleted (tier 3), provision.ps1 creates it. Either way it's safe.
  Say "recreating Stargate lane via the repo provisioner ($($m.cluster_type) in $($m.environment))..." 'Cyan'
  & pwsh -NoProfile -File $provision
  if ($LASTEXITCODE -ne 0) { Die "provision.ps1 failed (exit $LASTEXITCODE). Inspect output above." }

  Say "lane provisioned. Connectors carry secrets — rebind API keys from infra/confluent/stargate/connectors/, then replay producers." 'Yellow'
  Set-Graph 'fresh' 'recreated via provision.ps1 · rebind connector keys + replay to finish'
}

# ── dispatch ──────────────────────────────────────────────────────────────────
switch ($Action) {
  'status'         { Do-Status }
  'export'         { Do-Export }
  'stop-serving'   { Do-StopServing }
  'delete-cluster' { Do-DeleteCluster }
  'recreate'       { Do-Recreate }
}
