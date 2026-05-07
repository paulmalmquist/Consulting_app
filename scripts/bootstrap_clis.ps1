#!/usr/bin/env pwsh
# Idempotent CLI bootstrap. Installs missing CLIs, reports auth status.
# Safe to re-run any time. New machine setup: run this once, then run any login
# commands it tells you to run.

$ErrorActionPreference = "Continue"

function Have-Cmd($name) {
    $null = Get-Command $name -ErrorAction SilentlyContinue
    return $?
}

function Section($text) {
    Write-Host ""
    Write-Host "=== $text ===" -ForegroundColor Cyan
}

function Status($name, $ok, $detail = "") {
    $color = if ($ok) { "Green" } else { "Red" }
    $mark = if ($ok) { "OK" } else { "MISSING" }
    Write-Host ("  [{0}] {1} {2}" -f $mark.PadRight(7), $name.PadRight(14), $detail) -ForegroundColor $color
}

# ---- Prerequisites ----
Section "Prerequisites"
$prereqsOk = $true
foreach ($p in @("node", "npm", "python", "pip", "git")) {
    $ok = Have-Cmd $p
    Status $p $ok
    if (-not $ok) { $prereqsOk = $false }
}
if (-not $prereqsOk) {
    Write-Host ""
    Write-Host "Install missing prerequisites first:" -ForegroundColor Yellow
    Write-Host "  Node.js : https://nodejs.org/"
    Write-Host "  Python  : https://python.org/"
    Write-Host "  Git     : https://git-scm.com/"
    exit 1
}

# ---- CLI install plan ----
Section "CLI install"

$plan = @(
    @{ Name = "vercel";     Cmd = "vercel";     Install = "npm install -g vercel" },
    @{ Name = "railway";    Cmd = "railway";    Install = "npm install -g `"@railway/cli`"" },
    @{ Name = "supabase";   Cmd = "supabase";   Install = "npm install -g supabase" },
    @{ Name = "databricks"; Cmd = "databricks"; Install = "pip install --upgrade databricks-cli" },
    @{ Name = "gh";         Cmd = "gh";         Install = "winget install --id GitHub.cli --silent --accept-source-agreements --accept-package-agreements" },
    @{ Name = "claude";     Cmd = "claude";     Install = "npm install -g `"@anthropic-ai/claude-code`"" }
)

foreach ($t in $plan) {
    if (Have-Cmd $t.Cmd) {
        Status $t.Name $true "already installed"
        continue
    }
    Write-Host ("  installing {0}..." -f $t.Name) -ForegroundColor Yellow
    try {
        Invoke-Expression $t.Install | Out-Null
        $ok = Have-Cmd $t.Cmd
        if ($ok) {
            Status $t.Name $true "installed"
        } else {
            Status $t.Name $false "install command ran but command still missing"
        }
    } catch {
        Status $t.Name $false ("install error: " + $_.ToString().Substring(0, [Math]::Min(80, $_.ToString().Length)))
    }
}

# ---- Auth status ----
Section "Auth status (will prompt for login on any RED row)"

$auth = @(
    @{ Name = "vercel";     Probe = "vercel whoami";                         Login = "vercel login" },
    @{ Name = "railway";    Probe = "railway whoami";                        Login = "railway login" },
    @{ Name = "supabase";   Probe = "supabase projects list --output env";   Login = "supabase login" },
    @{ Name = "databricks"; Probe = "databricks current-user me";            Login = "databricks configure --token" },
    @{ Name = "gh";         Probe = "gh auth status";                        Login = "gh auth login" },
    @{ Name = "claude";     Probe = "claude --version";                      Login = "claude  (then run /login inside the session)" }
)

foreach ($a in $auth) {
    try {
        $output = Invoke-Expression "$($a.Probe) 2>&1"
        $exit = $LASTEXITCODE
        if ($exit -eq 0 -and $output) {
            $first = ($output | Out-String).Split("`n")[0].Trim()
            if ($first.Length -gt 60) { $first = $first.Substring(0, 60) + "..." }
            Status $a.Name $true $first
        } else {
            Status $a.Name $false ("not authenticated. Run: " + $a.Login)
        }
    } catch {
        Status $a.Name $false ("not authenticated. Run: " + $a.Login)
    }
}

# ---- Wrap up ----
Section "Done"
Write-Host "Re-run this script any time to re-check status."
Write-Host "To force-update an installed CLI, uninstall it first then re-run:"
Write-Host "  npm uninstall -g vercel    (or whichever)"
