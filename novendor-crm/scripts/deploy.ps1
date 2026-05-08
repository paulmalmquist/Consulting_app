# deploy.ps1
# Deploys a copy of novendor-crm to a target directory.
# Usage: .\deploy.ps1 -Target "C:\Projects\SomeClient"
# This creates SomeClient\novendor-crm\ ready to open in Claude.

param(
    [Parameter(Mandatory=$true)]
    [string]$Target
)

$source = "$env:APPDATA\Claude\novendor-crm"

if (-not (Test-Path $source)) {
    Write-Error "novendor-crm is not installed. Run install.ps1 first."
    exit 1
}

$dest = Join-Path $Target "novendor-crm"

if (Test-Path $dest) {
    Write-Host "Destination already exists. Overwrite? (y/n)" -NoNewline
    $confirm = Read-Host
    if ($confirm -ne 'y') { exit 0 }
    Remove-Item -Recurse -Force $dest
}

Write-Host "Deploying novendor-crm to $dest..."
Copy-Item -Recurse $source $dest

Write-Host ""
Write-Host "Deployed. Open this folder in Claude:"
Write-Host "  $dest"
