# Stargate lane — Confluent Cloud provisioning. Idempotent; safe to re-run.
#
# Prereq: `confluent login --save` once (interactive). The repo-root
# confluent)_kafka_api.json key is CLUSTER-scoped — it cannot drive these
# management commands, which is why login is required here and only here.
#
#   .\provision.ps1                # discover + provision everything
#   .\provision.ps1 -SkipFlink     # topics/SR only (no compute pool cost)
#
# Creates, in the first environment/cluster found (override with -EnvId/-ClusterId):
#   topics    stargate.printer.telemetry.v1 (6 partitions)
#             stargate.printer.telemetry.agg5s.v1, stargate.printer.anomalies.v1,
#             stargate.printer.dlq.v1 (7-day retention)
#   SR        v1 + v2 Protobuf schemas on stargate.printer.telemetry.v1-value,
#             compatibility BACKWARD
#   account   service account sa-stargate-demo + cluster API key + ACLs scoped
#             to the stargate.* prefix and the stargate-bridge consumer group
#   flink     compute pool stargate-demo-pool (5 CFU) — submit the statements in
#             .\flink\ afterward, and PAUSE the pool when the demo is done.
#
# Prints the env exports for the producer/bridge at the end. Never writes
# secrets to disk.

param(
    [string]$EnvId = "",
    [string]$ClusterId = "",
    [switch]$SkipFlink
)

$ErrorActionPreference = "Stop"

function Resolve-ConfluentCli {
    $cmd = Get-Command confluent -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    $winget = "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\ConfluentInc.Confluent-CLI_Microsoft.Winget.Source_8wekyb3d8bbwe\confluent\confluent.exe"
    if (Test-Path $winget) { return $winget }
    throw "confluent CLI not found - install with: winget install ConfluentInc.Confluent-CLI"
}

$cli = Resolve-ConfluentCli
Write-Host "confluent CLI: $cli"

# -- auth gate ----------------------------------------------------------------
$whoami = & $cli organization list -o json 2>$null | ConvertFrom-Json
if (-not $whoami) {
    Write-Host ""
    Write-Host "BLOCKED: not logged in to Confluent Cloud." -ForegroundColor Red
    Write-Host "Run once:  & `"$cli`" login --save"
    Write-Host "then re-run this script."
    exit 1
}

# -- discovery ----------------------------------------------------------------
if (-not $EnvId) {
    $envs = & $cli environment list -o json | ConvertFrom-Json
    $EnvId = $envs[0].id
}
& $cli environment use $EnvId | Out-Null
Write-Host "environment: $EnvId"

if (-not $ClusterId) {
    $clusters = & $cli kafka cluster list -o json | ConvertFrom-Json
    if (-not $clusters) { throw "no Kafka cluster in $EnvId - create one in the console first" }
    $ClusterId = $clusters[0].id
}
& $cli kafka cluster use $ClusterId | Out-Null
$cluster = & $cli kafka cluster describe $ClusterId -o json | ConvertFrom-Json
$bootstrap = $cluster.endpoint -replace "^SASL_SSL://", ""
Write-Host "cluster: $ClusterId  bootstrap: $bootstrap"

$sr = & $cli schema-registry cluster describe -o json | ConvertFrom-Json
$srUrl = $sr.endpoint_url
Write-Host "schema registry: $srUrl"

# -- topics (idempotent) --------------------------------------------------------
$existing = (& $cli kafka topic list -o json | ConvertFrom-Json) | ForEach-Object { $_.name }
$topics = @(
    @{ name = "stargate.printer.telemetry.v1"; partitions = 6; config = @() },
    @{ name = "stargate.printer.telemetry.agg5s.v1"; partitions = 1; config = @() },
    @{ name = "stargate.printer.anomalies.v1"; partitions = 1; config = @() },
    @{ name = "stargate.printer.dlq.v1"; partitions = 1; config = @("retention.ms=604800000") }
)
foreach ($t in $topics) {
    if ($existing -contains $t.name) { Write-Host "topic exists: $($t.name)"; continue }
    $cfgArgs = @(); foreach ($c in $t.config) { $cfgArgs += @("--config", $c) }
    & $cli kafka topic create $t.name --partitions $t.partitions @cfgArgs | Out-Null
    Write-Host "topic created: $($t.name) ($($t.partitions) partitions)"
}

# -- schema registry: register v1 + v2, BACKWARD --------------------------------
$subject = "stargate.printer.telemetry.v1-value"
$protoDir = Join-Path $PSScriptRoot "..\proto"
& $cli schema-registry schema create --subject $subject --type protobuf `
    --schema (Join-Path $protoDir "stargate_telemetry.proto") | Out-Null
Write-Host "schema registered: $subject (v1)"
& $cli schema-registry subject update $subject --compatibility BACKWARD | Out-Null
Write-Host "compatibility: BACKWARD"
# v2 registration is the live demo beat - the BACKWARD check passing on stage.
# Run it during the demo, or here if you want it pre-registered:
#   & $cli schema-registry schema create --subject $subject --type protobuf `
#       --schema (Join-Path $protoDir "stargate_telemetry_v2.proto")

# -- service account + key + ACLs ------------------------------------------------
$accounts = & $cli iam service-account list -o json | ConvertFrom-Json
$sa = $accounts | Where-Object { $_.name -eq "sa-stargate-demo" }
if (-not $sa) {
    $sa = & $cli iam service-account create "sa-stargate-demo" `
        --description "Stargate streaming demo lane (PR 4)" -o json | ConvertFrom-Json
    Write-Host "service account created: $($sa.id)"
} else { Write-Host "service account exists: $($sa.id)" }

foreach ($op in @("WRITE", "READ", "DESCRIBE")) {
    & $cli kafka acl create --allow --service-account $sa.id --operations $op `
        --topic "stargate." --prefix | Out-Null
}
& $cli kafka acl create --allow --service-account $sa.id --operations READ `
    --consumer-group "stargate-bridge" --prefix | Out-Null
Write-Host "ACLs: stargate.* topics + stargate-bridge* groups for $($sa.id)"

$key = & $cli api-key create --service-account $sa.id --resource $ClusterId -o json | ConvertFrom-Json
$srKey = & $cli api-key create --service-account $sa.id --resource $sr.cluster_id -o json | ConvertFrom-Json
Write-Host "cluster + SR API keys minted for $($sa.id) (secrets shown once below)"

# -- flink compute pool -----------------------------------------------------------
if (-not $SkipFlink) {
    $pools = & $cli flink compute-pool list -o json 2>$null | ConvertFrom-Json
    $pool = $pools | Where-Object { $_.name -eq "stargate-demo-pool" }
    if (-not $pool) {
        $pool = & $cli flink compute-pool create "stargate-demo-pool" `
            --cloud $cluster.cloud --region $cluster.region --max-cfu 5 -o json | ConvertFrom-Json
        Write-Host "flink pool created: $($pool.id) ($($cluster.cloud)/$($cluster.region), max 5 CFU)"
    } else { Write-Host "flink pool exists: $($pool.id)" }
    Write-Host "submit statements with:"
    Write-Host "  & `"$cli`" flink statement create agg5s --compute-pool $($pool.id) --sql-file .\flink\01_agg_5s.sql"
    Write-Host "  & `"$cli`" flink statement create anomaly-route --compute-pool $($pool.id) --sql-file .\flink\02_anomaly_route.sql"
    Write-Host "PAUSE THE POOL after the demo: confluent flink compute-pool update $($pool.id) --max-cfu 0 (or delete it)"
}

# -- env exports ------------------------------------------------------------------
Write-Host ""
Write-Host "Producer/bridge env (copy into scripts/streaming/stargate/.env or the shell):"
Write-Host "  `$env:CONFLUENT_BOOTSTRAP_SERVERS = `"$bootstrap`""
Write-Host "  `$env:CONFLUENT_API_KEY = `"$($key.api_key)`""
Write-Host "  `$env:CONFLUENT_API_SECRET = `"<shown once above>`""
Write-Host "  `$env:CONFLUENT_SR_URL = `"$srUrl`""
Write-Host "  `$env:CONFLUENT_SR_API_KEY = `"$($srKey.api_key)`""
Write-Host "  `$env:CONFLUENT_SR_API_SECRET = `"<shown once above>`""
Write-Host "  `$env:STARGATE_MODE = `"cloud`""
