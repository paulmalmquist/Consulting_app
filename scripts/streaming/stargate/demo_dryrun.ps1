# One-command Stargate demo boot.
#
#   .\demo_dryrun.ps1                 # capture mode: zero dependencies, always works
#   .\demo_dryrun.ps1 -Mode local     # Redpanda compose + live producer
#   .\demo_dryrun.ps1 -Mode cloud     # Confluent Cloud (CONFLUENT_* env required)
#
# Starts the bridge (and producer for broker modes), then prints the dashboard
# URL. Ctrl+C in the spawned windows to stop; compose stays up for reuse.

param(
    [ValidateSet("capture", "local", "cloud")]
    [string]$Mode = "capture",
    [int]$Rate = 250
)

$here = $PSScriptRoot
$venvPy = Join-Path $here ".venv\Scripts\python.exe"
if (-not (Test-Path $venvPy)) {
    Write-Host "venv missing - run: python -m venv .venv; .venv\Scripts\pip install -r requirements.txt"
    exit 1
}

if ($Mode -eq "local") {
    $compose = Join-Path $here "..\..\..\infra\local\docker-compose.streaming.yml"
    Write-Host "starting Redpanda compose..."
    docker compose -f $compose up -d
    Start-Sleep -Seconds 3
}

Write-Host "starting bridge (mode=$Mode) on :8100..."
$env:STARGATE_MODE = $Mode
Start-Process -FilePath $venvPy -ArgumentList "-m", "uvicorn", "bridge:app", "--port", "8100", "--host", "0.0.0.0" -WorkingDirectory $here

if ($Mode -ne "capture") {
    Start-Sleep -Seconds 2
    Write-Host "starting producer (mode=$Mode, rate=$Rate/printer)..."
    Start-Process -FilePath $venvPy -ArgumentList "producer.py", "--mode", $Mode, "--rate", "$Rate" -WorkingDirectory $here
}

Write-Host ""
Write-Host "bridge:    http://localhost:8100/stargate/health"
Write-Host "dashboard: http://localhost:3000/lab/env/<envId>/telemetry/stargate  (npm run dev in repo-b)"
if ($Mode -eq "local") { Write-Host "console:   http://localhost:8080 (Redpanda topics)" }
