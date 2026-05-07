#!/usr/bin/env pwsh
# Generic host runner. Executes a script in your real shell (with all your CLIs and auth)
# and writes structured results to scripts/results/.
#
# This is the bypass mechanism for Cowork sandbox isolation:
# Cowork writes a script to scripts/pending/, you run host_runner against it,
# the result file lands in scripts/results/ where Cowork can read it back.
#
# Usage:
#   .\scripts\host_runner.ps1 -Script .\scripts\refresh_env.ps1
#   .\scripts\host_runner.ps1 -Script .\scripts\pending\my_task.ps1 -Arguments "arg1","arg2"
#   .\scripts\host_runner.ps1 -Script .\scripts\check_clis.ps1 -Quiet

param(
    [Parameter(Mandatory = $true)]
    [string]$Script,
    [string[]]$Arguments = @(),
    [switch]$Quiet
)

$ErrorActionPreference = "Continue"

if (-not (Test-Path $Script)) {
    Write-Host "Script not found: $Script" -ForegroundColor Red
    exit 1
}

# Resolve to absolute path before changing context
$scriptPath = (Resolve-Path $Script).Path
$scriptName = [System.IO.Path]::GetFileNameWithoutExtension($scriptPath)

# Ensure results dir
$resultsDir = Join-Path $PSScriptRoot "results"
if (-not (Test-Path $resultsDir)) {
    New-Item -ItemType Directory -Path $resultsDir -Force | Out-Null
}

$ts = Get-Date -Format "yyyyMMdd_HHmmss"
$resultPath = Join-Path $resultsDir "${ts}_${scriptName}.json"

# Run the script as a child pwsh process with no profile (faster, deterministic)
$start = Get-Date
$stdoutFile = [System.IO.Path]::GetTempFileName()
$stderrFile = [System.IO.Path]::GetTempFileName()
$exitCode = -1

try {
    $procArgs = @("-NoProfile", "-File", $scriptPath) + $Arguments
    $proc = Start-Process pwsh -ArgumentList $procArgs `
        -RedirectStandardOutput $stdoutFile -RedirectStandardError $stderrFile `
        -PassThru -Wait -NoNewWindow
    $exitCode = $proc.ExitCode
} catch {
    Set-Content -Path $stderrFile -Value $_.ToString()
    $exitCode = -1
}

$end = Get-Date

$stdout = if (Test-Path $stdoutFile) { Get-Content $stdoutFile -Raw } else { "" }
$stderr = if (Test-Path $stderrFile) { Get-Content $stderrFile -Raw } else { "" }

$result = [ordered]@{
    script    = $scriptPath
    arguments = $Arguments
    started   = $start.ToString("o")
    finished  = $end.ToString("o")
    duration  = [math]::Round(($end - $start).TotalSeconds, 2)
    exitCode  = $exitCode
    stdout    = $stdout
    stderr    = $stderr
}

$result | ConvertTo-Json -Depth 4 | Set-Content -Path $resultPath -Encoding UTF8

# Clean up temp files
Remove-Item $stdoutFile, $stderrFile -Force -ErrorAction SilentlyContinue

if (-not $Quiet) {
    Write-Host ""
    Write-Host "Result: $resultPath" -ForegroundColor Cyan
    Write-Host ("Exit:   {0}  ({1:N1}s)" -f $exitCode, $result.duration) `
        -ForegroundColor $(if ($exitCode -eq 0) { "Green" } else { "Red" })
    if ($stdout) {
        Write-Host ""
        Write-Host "--- stdout ---" -ForegroundColor DarkGray
        Write-Host $stdout
    }
    if ($stderr) {
        Write-Host ""
        Write-Host "--- stderr ---" -ForegroundColor DarkGray
        Write-Host $stderr
    }
}

exit $exitCode
