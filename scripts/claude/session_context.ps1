$ErrorActionPreference = "SilentlyContinue"

$inputText = [Console]::In.ReadToEnd()
$payload = $null
if ($inputText) {
    try { $payload = $inputText | ConvertFrom-Json } catch { $payload = $null }
}

$cwd = if ($payload -and $payload.cwd) { [string]$payload.cwd } else { (Get-Location).Path }
$root = (& git -C $cwd rev-parse --show-toplevel 2>$null)
if (-not $root) {
    Write-Output "Winston session context: current directory is not inside a git worktree."
    exit 0
}

$branch = (& git -C $root branch --show-current 2>$null)
$head = (& git -C $root rev-parse --short=12 HEAD 2>$null)
$status = @(& git -C $root status --short 2>$null)
$worktrees = @(& git -C $root worktree list 2>$null)

Write-Output "Winston session context (read-only):"
Write-Output "- root: $root"
Write-Output "- branch: $branch"
Write-Output "- HEAD: $head"
Write-Output "- dirty entries: $($status.Count)"
if ($status.Count -gt 0) {
    Write-Output "- first dirty paths:"
    $status | Select-Object -First 20 | ForEach-Object { Write-Output "  $_" }
}
Write-Output "- worktrees:"
$worktrees | ForEach-Object { Write-Output "  $_" }
Write-Output "- before mutation: use /winston-session-start and create a dedicated worktree from origin/main."

exit 0
