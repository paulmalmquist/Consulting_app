# Provision the History Rhymes Polymarket Confluent lane.
#
# Requires:
#   confluent login --save
#   gcloud auth login
#
# API key material is written directly to GCP Secret Manager and is never
# written to the repository or printed to the console.

param(
    [Parameter(Mandatory = $true)]
    [string]$GcpProjectId,
    [string]$EnvId = "",
    [string]$ClusterId = ""
)

$ErrorActionPreference = "Stop"

function Resolve-Command([string]$Name) {
    $command = Get-Command $Name -ErrorAction SilentlyContinue
    if (-not $command) {
        throw "$Name is not installed or not on PATH"
    }
    return $command.Source
}

function Assert-LastExit([string]$Action) {
    if ($LASTEXITCODE -ne 0) {
        throw "$Action failed with exit code $LASTEXITCODE"
    }
}

function Ensure-GcpSecret([string]$Name) {
    & $gcloud secrets describe $Name --project $GcpProjectId *> $null
    if ($LASTEXITCODE -ne 0) {
        & $gcloud secrets create $Name --replication-policy automatic `
            --project $GcpProjectId | Out-Null
        Assert-LastExit "create Secret Manager secret $Name"
    }
}

function Secret-Has-Version([string]$Name) {
    $versions = & $gcloud secrets versions list $Name --project $GcpProjectId `
        --filter "state=ENABLED" --format "value(name)" 2>$null
    return [bool]$versions
}

function Store-SecretVersion([string]$Name, [string]$Value) {
    $Value | & $gcloud secrets versions add $Name --data-file=- `
        --project $GcpProjectId | Out-Null
    Assert-LastExit "store Secret Manager version for $Name"
}

function Ensure-ServiceAccount([string]$Name, [string]$Description) {
    $accounts = & $confluent iam service-account list -o json |
        ConvertFrom-Json
    $account = $accounts | Where-Object { $_.name -eq $Name }
    if ($account) {
        return $account
    }
    return & $confluent iam service-account create $Name `
        --description $Description -o json | ConvertFrom-Json
}

function Ensure-ClusterCredentials(
    [object]$Account,
    [string]$KeySecret,
    [string]$ValueSecret
) {
    Ensure-GcpSecret $KeySecret
    Ensure-GcpSecret $ValueSecret
    $hasKey = Secret-Has-Version $KeySecret
    $hasValue = Secret-Has-Version $ValueSecret
    if ($hasKey -xor $hasValue) {
        throw "Only one credential secret is populated for $($Account.name). Repair both secrets before re-running."
    }
    if ($hasKey -and $hasValue) {
        Write-Host "credentials already stored for $($Account.name)"
        return
    }

    $key = & $confluent api-key create --service-account $Account.id `
        --resource $ClusterId -o json | ConvertFrom-Json
    Assert-LastExit "create Confluent API key for $($Account.name)"
    Store-SecretVersion $KeySecret $key.api_key
    Store-SecretVersion $ValueSecret $key.api_secret
    Write-Host "credentials stored in Secret Manager for $($Account.name)"
}

$confluent = Resolve-Command "confluent"
$gcloud = Resolve-Command "gcloud"

if (-not $EnvId) {
    $environments = & $confluent environment list -o json | ConvertFrom-Json
    $EnvId = $environments[0].id
}
& $confluent environment use $EnvId 2>$null | Out-Null

if (-not $ClusterId) {
    $clusters = & $confluent kafka cluster list -o json | ConvertFrom-Json
    if (-not $clusters) {
        throw "No Confluent Kafka cluster exists in environment $EnvId"
    }
    $ClusterId = $clusters[0].id
}
& $confluent kafka cluster use $ClusterId 2>$null | Out-Null
$cluster = & $confluent kafka cluster describe $ClusterId -o json |
    ConvertFrom-Json
$bootstrap = $cluster.endpoint -replace "^SASL_SSL://", ""

$topics = @(
    @{
        name = "winston.hr.polymarket.markets.v1"
        partitions = 3
        config = @("cleanup.policy=compact")
    },
    @{
        name = "winston.hr.polymarket.raw.v1"
        partitions = 6
        config = @("retention.ms=604800000")
    },
    @{
        name = "winston.hr.polymarket.features.v1"
        partitions = 3
        config = @("retention.ms=2592000000")
    },
    @{
        name = "winston.hr.polymarket.forecasts.v1"
        partitions = 3
        config = @("retention.ms=7776000000")
    },
    @{
        name = "winston.dead-letter.v1"
        partitions = 3
        config = @("retention.ms=2592000000")
    }
)

$existing = (& $confluent kafka topic list -o json | ConvertFrom-Json) |
    ForEach-Object { $_.name }
foreach ($topic in $topics) {
    if ($existing -contains $topic.name) {
        Write-Host "topic exists: $($topic.name)"
        continue
    }
    $configArgs = @()
    foreach ($item in $topic.config) {
        $configArgs += @("--config", $item)
    }
    & $confluent kafka topic create $topic.name `
        --partitions $topic.partitions @configArgs | Out-Null
    Assert-LastExit "create topic $($topic.name)"
    Write-Host "topic created: $($topic.name)"
}

$ingest = Ensure-ServiceAccount "sa-hr-polymarket-ingest" `
    "Read-only public Polymarket ingestion producer"
$materializer = Ensure-ServiceAccount "sa-hr-polymarket-materializer" `
    "History Rhymes Polymarket feature and forecast consumers"
$sink = Ensure-ServiceAccount "sa-winston-observational-sink" `
    "Observational BigQuery event sink consumer"

foreach ($topic in @(
    "winston.hr.polymarket.markets.v1",
    "winston.hr.polymarket.raw.v1"
)) {
    foreach ($operation in @("WRITE", "DESCRIBE")) {
        & $confluent kafka acl create --allow --service-account $ingest.id `
            --operations $operation --topic $topic | Out-Null
    }
}
foreach ($operation in @("WRITE", "DESCRIBE")) {
    & $confluent kafka acl create --allow --service-account $ingest.id `
        --operations $operation --topic "winston.dead-letter.v1" | Out-Null
}

foreach ($topic in @(
    "winston.hr.polymarket.markets.v1",
    "winston.hr.polymarket.raw.v1",
    "winston.hr.polymarket.features.v1"
)) {
    foreach ($operation in @("READ", "DESCRIBE")) {
        & $confluent kafka acl create --allow --service-account $materializer.id `
            --operations $operation --topic $topic | Out-Null
    }
}
foreach ($topic in @(
    "winston.hr.polymarket.features.v1",
    "winston.hr.polymarket.forecasts.v1"
)) {
    foreach ($operation in @("WRITE", "DESCRIBE")) {
        & $confluent kafka acl create --allow --service-account $materializer.id `
            --operations $operation --topic $topic | Out-Null
    }
}
& $confluent kafka acl create --allow --service-account $materializer.id `
    --operations READ --consumer-group "winston-hr-polymarket-" --prefix |
    Out-Null

foreach ($topic in $topics) {
    foreach ($operation in @("READ", "DESCRIBE")) {
        & $confluent kafka acl create --allow --service-account $sink.id `
            --operations $operation --topic $topic.name | Out-Null
    }
}
foreach ($operation in @("WRITE", "DESCRIBE")) {
    & $confluent kafka acl create --allow --service-account $sink.id `
        --operations $operation --topic "winston.dead-letter.v1" | Out-Null
}
& $confluent kafka acl create --allow --service-account $sink.id `
    --operations READ --consumer-group "winston-observational-bigquery-" `
    --prefix | Out-Null

Ensure-GcpSecret "winston-confluent-bootstrap-servers"
if (-not (Secret-Has-Version "winston-confluent-bootstrap-servers")) {
    Store-SecretVersion "winston-confluent-bootstrap-servers" $bootstrap
}
Ensure-ClusterCredentials $ingest `
    "winston-hr-polymarket-ingest-confluent-api-key" `
    "winston-hr-polymarket-ingest-confluent-api-secret"
Ensure-ClusterCredentials $materializer `
    "winston-hr-polymarket-materializer-confluent-api-key" `
    "winston-hr-polymarket-materializer-confluent-api-secret"
Ensure-ClusterCredentials $sink `
    "winston-observational-sink-confluent-api-key" `
    "winston-observational-sink-confluent-api-secret"

Write-Host ""
Write-Host "Provisioning complete."
Write-Host "Bootstrap endpoint and service credentials are in GCP Secret Manager."
Write-Host "No Schema Registry subjects were created; JSON EventEnvelope remains the contract."
