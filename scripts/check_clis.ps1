#!/usr/bin/env pwsh
# Quick health check for all CLIs used in this project.
# Run any time. Especially useful after a reboot, token rotation, or before a deploy.

function Check($name, $cmd, $loginHint) {
    Write-Host ("  {0,-12} " -f $name) -NoNewline
    try {
        $out = Invoke-Expression "$cmd 2>&1"
        $exit = $LASTEXITCODE
        if ($exit -eq 0) {
            $first = ($out | Out-String).Split("`n")[0].Trim()
            if ($first.Length -gt 70) { $first = $first.Substring(0, 70) + "..." }
            Write-Host "[OK]  " -NoNewline -ForegroundColor Green
            Write-Host $first
        } else {
            Write-Host "[NO AUTH]  " -NoNewline -ForegroundColor Red
            Write-Host ("run: " + $loginHint)
        }
    } catch {
        $msg = $_.ToString()
        if ($msg.Length -gt 60) { $msg = $msg.Substring(0, 60) + "..." }
        Write-Host "[ERROR]  " -NoNewline -ForegroundColor Red
        Write-Host $msg
    }
}

Write-Host ""
Write-Host "CLI auth status  $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Cyan
Write-Host "----------------------------------------------------------------"

Check "vercel"     "vercel whoami"                         "vercel login"
Check "railway"    "railway whoami"                        "railway login"
Check "supabase"   "supabase projects list --output env"   "supabase login"
Check "databricks" "databricks current-user me"            "databricks configure --token"
Check "gh"         "gh auth status"                        "gh auth login"
Check "claude"     "claude --version"                      "claude  (then /login inside)"

Write-Host ""
