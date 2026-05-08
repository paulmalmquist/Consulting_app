# install.ps1
# Installs novendor-crm to the Claude global root so it's available in any session.
# Run once from any PowerShell window.

$source = Split-Path -Parent $PSScriptRoot
$dest = "$env:APPDATA\Claude\novendor-crm"

if (Test-Path $dest) {
    Write-Host "Removing existing install at $dest..."
    Remove-Item -Recurse -Force $dest
}

Write-Host "Installing novendor-crm to $dest..."
Copy-Item -Recurse $source $dest

Write-Host ""
Write-Host "Done. novendor-crm is now at:"
Write-Host "  $dest"
Write-Host ""
Write-Host "Open that folder as a Cowork project or Claude Code session to use it anywhere."
