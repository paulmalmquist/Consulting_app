#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Pre-PR merge gate. Runs a suite of local sanity checks before any push or PR creation.

.DESCRIPTION
    Checks in order:
    1. Dirty state (uncommitted changes)
    2. Mass deletions without explanation
    3. Skip markers added on this branch
    4. Route integrity (deleted routes still called by frontend)
    5. Nav integrity (nav entries pointing to deleted pages)
    6. Schema readiness (health gate not trivially True)
    7. Untracked secret-shaped files
    8. CI status for the current branch

    Exits 0 if all gates pass. Exits 1 if any blocking gate fails.

.PARAMETER BaseBranch
    The branch to diff against. Defaults to origin/main.

.PARAMETER SkipCI
    Skip the GitHub CI check (useful offline or for local-only branches).

.EXAMPLE
    .\merge_gate.ps1
    .\merge_gate.ps1 -BaseBranch origin/dev
    .\merge_gate.ps1 -SkipCI
#>

param(
    [string]$BaseBranch = 'origin/main',
    [switch]$SkipCI,
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'SilentlyContinue'

$RepoRoot = git rev-parse --show-toplevel 2>$null
if (-not $RepoRoot) { Write-Error "Not inside a git repository."; exit 1 }

$Results = [System.Collections.Generic.List[PSCustomObject]]::new()
$Blocked = $false

function Add-Result($check, $status, $detail) {
    $r = [PSCustomObject]@{ Check = $check; Status = $status; Detail = $detail }
    $Results.Add($r)
    if ($status -eq 'FAIL') { $script:Blocked = $true }
    if (-not $Json) {
        $color = switch ($status) { 'PASS' { 'Green' } 'FAIL' { 'Red' } 'WARN' { 'Yellow' } default { 'Gray' } }
        Write-Host "[$status]".PadRight(8) -ForegroundColor $color -NoNewline
        Write-Host " $check" -NoNewline
        if ($detail) { Write-Host " — $detail" } else { Write-Host "" }
    }
}

# ---------------------------------------------------------------------------
# Gate 1: Dirty state
# ---------------------------------------------------------------------------
$statusLines = git status --short 2>$null
$dirtyCount = ($statusLines | Where-Object { $_ -match '^\s*[MADRCU]' }).Count
$untrackedCount = ($statusLines | Where-Object { $_ -match '^\?\?' }).Count

if ($dirtyCount -gt 0) {
    Add-Result 'Dirty state' 'FAIL' "$dirtyCount uncommitted changes — commit or stash before merging"
} elseif ($untrackedCount -gt 0) {
    Add-Result 'Dirty state' 'WARN' "$untrackedCount untracked files present"
} else {
    Add-Result 'Dirty state' 'PASS' 'clean'
}

# ---------------------------------------------------------------------------
# Gate 2: Mass deletions
# ---------------------------------------------------------------------------
$deletedFiles = git diff --diff-filter=D --name-only $BaseBranch 2>$null
$deletedCount = if ($deletedFiles) { ($deletedFiles | Measure-Object).Count } else { 0 }

if ($deletedCount -gt 20) {
    # Check if there's a PR description or ADO ticket reference explaining the deletions
    $branch = git branch --show-current
    $prBody = gh pr view --head $branch --json body --jq '.body' 2>$null
    if ($prBody -and ($prBody -match 'remov|delet|decommission|retire|ADE|ADO|ticket|#\d+')) {
        Add-Result 'Mass deletions' 'WARN' "$deletedCount files deleted — PR description references explanation"
    } else {
        Add-Result 'Mass deletions' 'FAIL' "$deletedCount files deleted with no PR description explaining the removal"
    }
} else {
    Add-Result 'Mass deletions' 'PASS' "$deletedCount files deleted (under threshold)"
}

# ---------------------------------------------------------------------------
# Gate 3: Skip markers added on this branch
# ---------------------------------------------------------------------------
$skipPatterns = @('pytest.mark.skip', '@skip', 'it\.skip', 'test\.skip', '\bxit\(', '\bxdescribe\(', 'TODO.*skip')
# Exclude this gate's own regex definitions so changing the checker cannot
# trigger its self-reference false positive.
$diffText = git diff $BaseBranch -- . ':(exclude)scripts/winston/merge_gate.ps1' 2>$null
$newSkips = @()
foreach ($pattern in $skipPatterns) {
    $hits = $diffText | Select-String -Pattern "^\+.*$pattern" -AllMatches
    if ($hits) { $newSkips += $hits.Matches.Value }
}

if ($newSkips.Count -gt 0) {
    Add-Result 'Skip markers' 'FAIL' "$($newSkips.Count) new skip/xfail markers added on this branch"
} else {
    Add-Result 'Skip markers' 'PASS' 'no new skip markers'
}

# ---------------------------------------------------------------------------
# Gate 4: Route integrity (deleted backend routes still called by frontend)
# ---------------------------------------------------------------------------
$deletedRouteFiles = git diff --diff-filter=D --name-only $BaseBranch 2>$null |
    Where-Object { $_ -match 'backend/app/routes/' }

$missingRoutes = @()
if ($deletedRouteFiles) {
    $frontendSrc = Join-Path $RepoRoot 'repo-b' 'src'
    foreach ($routeFile in $deletedRouteFiles) {
        # Extract path prefixes from the deleted route file (best effort)
        $routeContent = git show "${BaseBranch}:${routeFile}" 2>$null
        if ($routeContent) {
            $prefixMatches = $routeContent | Select-String -Pattern "@router\.(get|post|put|delete|patch)\(['\`"]([^'\`"]+)['\`"]" -AllMatches
            foreach ($match in $prefixMatches.Matches) {
                $path = $match.Groups[2].Value
                # Search frontend for this path
                $callers = Get-ChildItem $frontendSrc -Recurse -Include '*.ts','*.tsx','*.js' -ErrorAction SilentlyContinue |
                    Select-String -Pattern [regex]::Escape($path) -ErrorAction SilentlyContinue
                if ($callers) {
                    $missingRoutes += "$path (called from $($callers[0].Filename):$($callers[0].LineNumber))"
                }
            }
        }
    }
}

if ($missingRoutes.Count -gt 0) {
    Add-Result 'Route integrity' 'FAIL' "Deleted routes still referenced: $($missingRoutes -join '; ')"
} else {
    Add-Result 'Route integrity' 'PASS' 'no dead route callers found'
}

# ---------------------------------------------------------------------------
# Gate 5: Nav integrity (nav entries pointing to deleted pages)
# ---------------------------------------------------------------------------
$navFiles = Get-ChildItem (Join-Path $RepoRoot 'repo-b' 'src') -Recurse `
    -Include '*Nav.ts','*Nav.tsx','*nav.ts','*navigation*.ts','*sidebar*.ts' -ErrorAction SilentlyContinue

$brokenNav = @()
foreach ($navFile in $navFiles) {
    $content = Get-Content $navFile.FullName -Raw -ErrorAction SilentlyContinue
    $hrefMatches = [regex]::Matches($content, "(?:href|path|url|to):\s*['\`"](\/(app|lab)[^'\`"\s]+)['\`"]")
    foreach ($m in $hrefMatches) {
        $navPath = $m.Groups[1].Value
        # Convert nav path to file path
        $pageFile = $navPath -replace '/app/', 'src/app/' -replace '/lab/', 'src/app/lab/'
        $candidates = @("$pageFile/page.tsx", "$pageFile/page.ts", "$pageFile.tsx")
        $found = $candidates | Where-Object { Test-Path (Join-Path $RepoRoot 'repo-b' $_) }
        if (-not $found) {
            $brokenNav += "$navPath (in $($navFile.Name))"
        }
    }
}

if ($brokenNav.Count -gt 0) {
    Add-Result 'Nav integrity' 'FAIL' "Dead nav entries: $($brokenNav[0..2] -join '; ')$(if ($brokenNav.Count -gt 3) { ' ...' })"
} else {
    Add-Result 'Nav integrity' 'PASS' 'all nav entries point to existing pages'
}

# ---------------------------------------------------------------------------
# Gate 6: Schema readiness (no trivial True gate in main.py)
# ---------------------------------------------------------------------------
$mainPy = Get-Content (Join-Path $RepoRoot 'backend' 'app' 'main.py') -Raw -ErrorAction SilentlyContinue
# A health flag set True is only a "lie" when it is unconditional. The legitimate pattern initializes
# the flag to False and sets it True inside a guarded block (try/except after a real check), e.g.
#   schema_ok = False ; ... ; schema_ok = True   (inside try, after _get_pool())
# So flag `X = True` only when the same flag is NEVER initialized `X = False` earlier in the file.
# `# real` still suppresses explicitly. This keeps lie-detection while not false-positiving real code.
$trivialGates = @()
foreach ($m in [regex]::Matches($mainPy, '(schema_ok|db_ok|health_ok|ready)\s*=\s*True(?!\s*#\s*real)')) {
    $var = $m.Groups[1].Value
    if ($mainPy -notmatch "(?m)^\s*$var\s*=\s*False\b") { $trivialGates += $var }
}

if ($trivialGates.Count -gt 0) {
    $names = ($trivialGates | Select-Object -Unique) -join ', '
    Add-Result 'Schema readiness' 'FAIL' "Unconditional True health gate (no False init / # real): $names — health endpoint will lie"
} else {
    Add-Result 'Schema readiness' 'PASS' 'no unconditional True health gates (guarded/annotated flags ok)'
}

# ---------------------------------------------------------------------------
# Gate 7: Untracked secret-shaped files
# ---------------------------------------------------------------------------
$secretPatterns = @('\.env', '\.pem', 'secret', 'credential', 'password', 'private.key')
$untrackedFiles = git ls-files --others --exclude-standard 2>$null
$secretFiles = @()
foreach ($file in $untrackedFiles) {
    foreach ($pattern in $secretPatterns) {
        if ($file -match $pattern) { $secretFiles += $file; break }
    }
}

# Also scan staged files for secret-shaped content
$stagedDiff = git diff --cached 2>$null
$secretLines = $stagedDiff | Select-String -Pattern '^\+.*(key=|secret=|password=|token=|bearer |-----BEGIN)' -AllMatches
if ($secretLines -or $secretFiles.Count -gt 0) {
    Add-Result 'Secrets scan' 'FAIL' "Potential secrets: $($secretFiles -join ', ') / $($secretLines.Count) secret-pattern lines staged"
} else {
    Add-Result 'Secrets scan' 'PASS' 'no secret-shaped files or content found'
}

# ---------------------------------------------------------------------------
# Gate 8: CI status
# ---------------------------------------------------------------------------
if (-not $SkipCI) {
    $branch = git branch --show-current
    $prNumber = gh pr list --head $branch --json number --jq '.[0].number' 2>$null
    if ($prNumber) {
        $checks = gh pr checks $prNumber 2>$null
        $failing = $checks | Select-String -Pattern 'fail' -CaseSensitive:$false
        if ($failing) {
            Add-Result 'CI status' 'FAIL' "Failing checks on PR #${prNumber}"
        } else {
            Add-Result 'CI status' 'PASS' "PR #${prNumber} checks passing"
        }
    } else {
        Add-Result 'CI status' 'WARN' 'No open PR found for this branch — CI not checked'
    }
} else {
    Add-Result 'CI status' 'SKIP' 'skipped via -SkipCI'
}

# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------
if ($Json) {
    [PSCustomObject]@{
        verdict = if ($Blocked) { 'BLOCKED' } else { 'MERGE READY' }
        results = $Results
    } | ConvertTo-Json -Depth 4
} else {
    Write-Host ""
    if ($Blocked) {
        Write-Host "VERDICT: BLOCKED" -ForegroundColor Red
        $blockingChecks = $Results | Where-Object { $_.Status -eq 'FAIL' } | ForEach-Object { $_.Check }
        Write-Host "Blocking: $($blockingChecks -join ', ')" -ForegroundColor Red
        exit 1
    } else {
        $warnings = $Results | Where-Object { $_.Status -eq 'WARN' }
        if ($warnings) {
            Write-Host "VERDICT: MERGE READY (with warnings)" -ForegroundColor Yellow
        } else {
            Write-Host "VERDICT: MERGE READY" -ForegroundColor Green
        }
        exit 0
    }
}
