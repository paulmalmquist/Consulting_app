param(
    [Parameter(Mandatory = $true)]
    [string]$ProjectId,
    [Parameter(Mandatory = $true)]
    [string]$ClusterName,
    [string]$Location = "us-east1",
    [string]$Dataset = "winston_events_raw"
)

$ErrorActionPreference = "Stop"
$namespace = "winston-streaming"

function Assert-LastExit([string]$Action) {
    if ($LASTEXITCODE -ne 0) {
        throw "$Action failed with exit code $LASTEXITCODE"
    }
}

function Ensure-Gsa([string]$Name, [string]$DisplayName) {
    & gcloud iam service-accounts describe `
        "$Name@$ProjectId.iam.gserviceaccount.com" --project $ProjectId *> $null
    if ($LASTEXITCODE -ne 0) {
        & gcloud iam service-accounts create $Name `
            --display-name $DisplayName --project $ProjectId | Out-Null
        Assert-LastExit "create GSA $Name"
    }
}

function Ensure-Secret([string]$Name) {
    & gcloud secrets describe $Name --project $ProjectId *> $null
    if ($LASTEXITCODE -ne 0) {
        & gcloud secrets create $Name --replication-policy automatic `
            --project $ProjectId | Out-Null
        Assert-LastExit "create secret $Name"
        Write-Warning "Secret $Name has no version. Add its value before deployment."
    }
}

function Bind-WorkloadIdentity([string]$Gsa, [string]$Ksa) {
    & gcloud iam service-accounts add-iam-policy-binding `
        "$Gsa@$ProjectId.iam.gserviceaccount.com" `
        --role roles/iam.workloadIdentityUser `
        --member "serviceAccount:$ProjectId.svc.id.goog[$namespace/$Ksa]" `
        --project $ProjectId | Out-Null
    Assert-LastExit "bind Workload Identity for $Ksa"
}

function Grant-Secret([string]$Secret, [string]$Gsa) {
    & gcloud secrets add-iam-policy-binding $Secret `
        --member "serviceAccount:$Gsa@$ProjectId.iam.gserviceaccount.com" `
        --role roles/secretmanager.secretAccessor `
        --project $ProjectId | Out-Null
    Assert-LastExit "grant $Gsa access to $Secret"
}

& gcloud services enable container.googleapis.com secretmanager.googleapis.com `
    artifactregistry.googleapis.com bigquery.googleapis.com `
    --project $ProjectId | Out-Null
Assert-LastExit "enable GCP APIs"

& gcloud container clusters update $ClusterName --location $Location `
    --enable-secret-manager --project $ProjectId | Out-Null
Assert-LastExit "enable Secret Manager CSI add-on"

$accounts = @(
    @{
        name = "hr-polymarket-ingest"
        display = "History Rhymes Polymarket ingestion"
    },
    @{
        name = "hr-polymarket-materializer"
        display = "History Rhymes Polymarket materializer"
    },
    @{
        name = "winston-observational-sink"
        display = "Winston observational BigQuery sink"
    }
)
foreach ($account in $accounts) {
    Ensure-Gsa $account.name $account.display
    Bind-WorkloadIdentity $account.name $account.name
}

$secretAccess = @{
    "hr-polymarket-ingest" = @(
        "winston-confluent-bootstrap-servers",
        "winston-hr-polymarket-ingest-confluent-api-key",
        "winston-hr-polymarket-ingest-confluent-api-secret"
    )
    "hr-polymarket-materializer" = @(
        "winston-confluent-bootstrap-servers",
        "winston-hr-polymarket-materializer-confluent-api-key",
        "winston-hr-polymarket-materializer-confluent-api-secret",
        "winston-database-url",
        "winston-fred-api-key",
        "winston-databricks-host",
        "winston-databricks-pat"
    )
    "winston-observational-sink" = @(
        "winston-confluent-bootstrap-servers",
        "winston-observational-sink-confluent-api-key",
        "winston-observational-sink-confluent-api-secret"
    )
}
foreach ($gsa in $secretAccess.Keys) {
    foreach ($secret in $secretAccess[$gsa]) {
        Ensure-Secret $secret
        Grant-Secret $secret $gsa
    }
}

& gcloud projects add-iam-policy-binding $ProjectId `
    --member "serviceAccount:winston-observational-sink@$ProjectId.iam.gserviceaccount.com" `
    --role roles/bigquery.jobUser | Out-Null
Assert-LastExit "grant BigQuery jobUser"

& bq add-iam-policy-binding `
    --member "serviceAccount:winston-observational-sink@$ProjectId.iam.gserviceaccount.com" `
    --role roles/bigquery.dataEditor "$ProjectId`:$Dataset" | Out-Null
Assert-LastExit "grant BigQuery dataset dataEditor"

Write-Host ""
Write-Host "GCP identities and permissions are ready."
Write-Host "Populate any secret without an enabled version before deploying."
