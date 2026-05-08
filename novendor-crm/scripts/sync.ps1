# sync.ps1
# Updates the installed novendor-crm at %APPDATA%\Claude\novendor-crm
# from the source in Consulting_app. Run after any skill or config changes.

$source = Split-Path -Parent $PSScriptRoot
$dest = "$env:APPDATA\Claude\novendor-crm"

if (-not (Test-Path $dest)) {
    Write-Error "Not installed yet. Run install.ps1 first."
    exit 1
}

Write-Host "Syncing $source -> $dest..."
Remove-Item -Recurse -Force $dest
Copy-Item -Recurse $source $dest
Write-Host "Sync complete."
