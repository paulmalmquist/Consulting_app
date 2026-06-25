[CmdletBinding(DefaultParameterSetName = "DryRun")]
param(
    [Parameter(ParameterSetName = "DryRun")][switch]$DryRun,
    [Parameter(ParameterSetName = "Backup")][switch]$Backup,
    [Parameter(ParameterSetName = "Apply")][switch]$Apply,
    [Parameter(ParameterSetName = "Verify")][switch]$Verify,
    [string]$ManifestPath = (Join-Path $PSScriptRoot "rs-mlops-control-tower.json"),
    [string]$ReceiptPath = (Join-Path $PSScriptRoot "rs-mlops-control-tower.receipt.json")
)

$ErrorActionPreference = "Stop"
$Az = "C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin\az.cmd"
if (-not (Test-Path -LiteralPath $Az)) { throw "Azure CLI not found at $Az" }
if (-not (Test-Path -LiteralPath $ManifestPath)) { throw "Manifest not found: $ManifestPath" }

$Manifest = Get-Content -Raw -LiteralPath $ManifestPath | ConvertFrom-Json
$Org = $Manifest.organization
$Project = $Manifest.project
$TeamName = $Manifest.team.name

function Invoke-AzJson {
    param([Parameter(Mandatory)][string[]]$Arguments)
    $stderrPath = Join-Path ([IO.Path]::GetTempPath()) ("az-stderr-" + [guid]::NewGuid() + ".txt")
    try {
        $raw = & $Az @Arguments 2>$stderrPath
        if ($LASTEXITCODE -ne 0) {
            $stderr = if (Test-Path $stderrPath) { Get-Content -Raw $stderrPath } else { "" }
            throw "az command failed: az $($Arguments -join ' ')`n$stderr"
        }
    } finally {
        if (Test-Path $stderrPath) { Remove-Item -LiteralPath $stderrPath }
    }
    if (-not $raw) { return $null }
    return ($raw | ConvertFrom-Json)
}

function Write-JsonFile {
    param([Parameter(Mandatory)]$Value, [Parameter(Mandatory)][string]$Path)
    $Value | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath $Path -Encoding utf8
}

function Invoke-DevOps {
    param(
        [Parameter(Mandatory)][string]$Area,
        [Parameter(Mandatory)][string]$Resource,
        [Parameter(Mandatory)][hashtable]$Routes,
        [ValidateSet("GET", "POST", "PUT", "PATCH")][string]$Method = "GET",
        $Body,
        [string]$ApiVersion,
        [hashtable]$QueryParameters
    )
    $args = @("devops", "invoke", "--area", $Area, "--resource", $Resource,
        "--route-parameters")
    foreach ($key in $Routes.Keys) { $args += "$key=$($Routes[$key])" }
    $args += @("--http-method", $Method, "--org", $Org, "-o", "json")
    if ($ApiVersion) { $args += @("--api-version", $ApiVersion) }
    if ($QueryParameters) {
        $args += "--query-parameters"
        foreach ($key in $QueryParameters.Keys) { $args += "$key=$($QueryParameters[$key])" }
    }
    $temp = $null
    if ($null -ne $Body) {
        $temp = Join-Path ([IO.Path]::GetTempPath()) ("ado-" + [guid]::NewGuid() + ".json")
        Write-JsonFile -Value $Body -Path $temp
        $args += @("--in-file", $temp)
    }
    try { return Invoke-AzJson -Arguments $args }
    finally { if ($temp -and (Test-Path $temp)) { Remove-Item -LiteralPath $temp } }
}

function Get-Team {
    $teams = Invoke-AzJson @("devops", "team", "list", "--project", $Project, "--org", $Org, "-o", "json")
    return @($teams) | Where-Object name -eq $TeamName | Select-Object -First 1
}

function Get-IterationMap {
    $tree = Invoke-AzJson @("boards", "iteration", "project", "list", "--depth", "4",
        "--project", $Project, "--org", $Org, "-o", "json")
    $map = @{}
    foreach ($node in @($tree.children)) {
        $assignmentPath = "$Project\$($node.name)"
        $map[$assignmentPath] = $node.identifier
    }
    return $map
}

function Get-TeamSnapshot {
    param($Team)
    if (-not $Team) { return @{ exists = $false } }
    try {
        $boards = Invoke-DevOps -Area work -Resource boards -Routes @{
            project = $Project; team = $Team.id
        }
    } catch {
        return @{
            exists = $true
            team = $Team
            provisioningPending = $true
            error = $_.Exception.Message
        }
    }
    $stories = @($boards.value) | Where-Object name -eq $Manifest.board.name | Select-Object -First 1
    $snapshot = [ordered]@{
        exists = $true
        team = $Team
        boards = $boards.value
        storiesBoard = $null
        queries = $null
        dashboards = $null
    }
    if ($stories) {
        $snapshot.storiesBoard = [ordered]@{
            id = $stories.id
            columns = (Invoke-DevOps -Area work -Resource columns -Routes @{
                project = $Project; team = $Team.id; board = $stories.id
            }).value
            rows = (Invoke-DevOps -Area work -Resource rows -Routes @{
                project = $Project; team = $Team.id; board = $stories.id
            }).value
        }
    }
    $snapshot.queries = (Invoke-DevOps -Area wit -Resource queries -Routes @{ project = $Project } `
        -ApiVersion "7.1").value
    $snapshot.dashboards = (Invoke-DevOps -Area dashboard -Resource dashboards -Routes @{
        project = $Project; team = $Team.id
    } -ApiVersion "7.1-preview").value
    return $snapshot
}

function Ensure-Team {
    $team = Get-Team
    if (-not $team) {
        $team = Invoke-AzJson @("devops", "team", "create", "--name", $TeamName,
            "--description", $Manifest.team.description, "--project", $Project,
            "--org", $Org, "-o", "json")
    }
    $fieldBody = @{
        defaultValue = $Manifest.team.areaPath
        values = @(@{
            value = $Manifest.team.areaPath
            includeChildren = [bool]$Manifest.team.includeChildren
        })
    }
    Invoke-DevOps -Area work -Resource teamfieldvalues -Routes @{
        project = $Project; team = $team.id
    } -Method PATCH -Body $fieldBody | Out-Null

    $iterationMap = Get-IterationMap
    $iterationTree = Invoke-AzJson @("boards", "iteration", "project", "list", "--depth", "1",
        "--project", $Project, "--org", $Org, "-o", "json")
    & $Az boards iteration team set-backlog-iteration --id $iterationTree.identifier `
        --team $team.id --project $Project --org $Org -o none 2>$null
    if ($LASTEXITCODE -ne 0) { throw "Could not set the team backlog iteration" }
    foreach ($path in $Manifest.team.iterations) {
        if (-not $iterationMap.ContainsKey($path)) { throw "Iteration not found: $path" }
        & $Az boards iteration team add --id $iterationMap[$path] --team $team.id `
            --project $Project --org $Org -o none 2>$null
        if ($LASTEXITCODE -ne 0) {
            $message = (& $Az boards iteration team list --team $team.id --project $Project --org $Org -o json 2>$null)
            if ($LASTEXITCODE -ne 0) { throw "Could not assign iteration $path" }
        }
    }
    $currentIterationId = $iterationMap[$Manifest.team.currentIteration]
    if (-not $currentIterationId) {
        throw "Current iteration not found: $($Manifest.team.currentIteration)"
    }
    & $Az boards iteration team set-default-iteration --id $currentIterationId `
        --team $team.id --project $Project --org $Org -o none 2>$null
    if ($LASTEXITCODE -ne 0) { throw "Could not set the default iteration" }
    return $team
}

function Ensure-Board {
    param($Team)
    $boards = $null
    for ($attempt = 1; $attempt -le 6; $attempt++) {
        try {
            $boards = Invoke-DevOps -Area work -Resource boards -Routes @{
                project = $Project; team = $Team.id
            }
            break
        } catch {
            if ($attempt -eq 6) { throw }
            Start-Sleep -Seconds 5
        }
    }
    $board = @($boards.value) | Where-Object name -eq $Manifest.board.name | Select-Object -First 1
    if (-not $board) { throw "Stories board not found for team $TeamName" }

    $existingColumns = (Invoke-DevOps -Area work -Resource columns -Routes @{
        project = $Project; team = $Team.id; board = $board.id
    }).value
    $usedColumnIds = @{}
    $columns = foreach ($desired in $Manifest.board.columns) {
        $existing = @($existingColumns) | Where-Object name -eq $desired.name | Select-Object -First 1
        if (-not $existing -and $desired.type -eq "incoming") {
            $existing = @($existingColumns) | Where-Object columnType -eq "incoming" | Select-Object -First 1
        }
        if (-not $existing -and $desired.type -eq "outgoing") {
            $existing = @($existingColumns) | Where-Object columnType -eq "outgoing" | Select-Object -First 1
        }
        if (-not $existing -and $desired.state -eq "Resolved") {
            $existing = @($existingColumns) |
                Where-Object { $_.stateMappings.'User Story' -eq "Resolved" } |
                Select-Object -First 1
        }
        if (-not $existing -and $desired.state -eq "Active") {
            $existing = @($existingColumns) |
                Where-Object { $_.stateMappings.'User Story' -eq "Active" -and -not $usedColumnIds[$_.id] } |
                Select-Object -First 1
        }
        $column = [ordered]@{
            name = $desired.name
            columnType = $desired.type
            itemLimit = [int]$desired.wip
            stateMappings = @{ "User Story" = $desired.state }
        }
        if ($desired.type -eq "inProgress") { $column.isSplit = $false }
        if ($existing -and -not $usedColumnIds[$existing.id]) {
            $column.id = $existing.id
            $usedColumnIds[$existing.id] = $true
        }
        $column
    }
    Invoke-DevOps -Area work -Resource columns -Routes @{
        project = $Project; team = $Team.id; board = $board.id
    } -Method PUT -Body $columns | Out-Null

    $existingRows = (Invoke-DevOps -Area work -Resource rows -Routes @{
        project = $Project; team = $Team.id; board = $board.id
    }).value
    $rows = @()
    $defaultRow = @($existingRows) | Where-Object { -not $_.name } | Select-Object -First 1
    if ($defaultRow) { $rows += @{ id = $defaultRow.id; name = $null } }
    foreach ($name in $Manifest.board.swimlanes) {
        $existing = @($existingRows) | Where-Object name -eq $name | Select-Object -First 1
        $row = [ordered]@{ name = $name }
        if ($existing) { $row.id = $existing.id }
        $rows += $row
    }
    Invoke-DevOps -Area work -Resource rows -Routes @{
        project = $Project; team = $Team.id; board = $board.id
    } -Method PUT -Body $rows | Out-Null

    $cardFields = @(@{ fieldIdentifier = "System.Title" })
    foreach ($field in $Manifest.board.cardFields) {
        if ($field -eq "System.AssignedTo") {
            $cardFields += @{
                fieldIdentifier = $field
                displayFormat = "AvatarAndFullName"
                displayType = "CORE"
            }
        } else {
            $cardFields += @{ fieldIdentifier = $field }
        }
    }
    $cardFields += @{ showEmptyFields = "false" }
    Invoke-DevOps -Area work -Resource cardsettings -Routes @{
        project = $Project; team = $Team.id; board = $board.id
    } -Method PUT -Body @{ cards = @{ "User Story" = $cardFields } } `
        -ApiVersion "7.1-preview" | Out-Null

    $tagStyles = @(
        @{ name = "risk-high"; isEnabled = "True"; settings = @{ "background-color" = "#7A0002"; color = "#FFFFFF" } },
        @{ name = "human-approval"; isEnabled = "True"; settings = @{ "background-color" = "#FBBC3D"; color = "#000000" } },
        @{ name = "agent-ready"; isEnabled = "True"; settings = @{ "background-color" = "#602F70"; color = "#FFFFFF" } },
        @{ name = "verified"; isEnabled = "True"; settings = @{ "background-color" = "#00564B"; color = "#FFFFFF" } },
        @{ name = "source-missing"; isEnabled = "True"; settings = @{ "background-color" = "#FBBC3D"; color = "#000000" } },
        @{ name = "stale-input"; isEnabled = "True"; settings = @{ "background-color" = "#FBBC3D"; color = "#000000" } },
        @{ name = "no-fake-data"; isEnabled = "True"; settings = @{ "background-color" = "#245CAC"; color = "#FFFFFF" } }
    )
    Invoke-DevOps -Area work -Resource cardrulesettings -Routes @{
        project = $Project; team = $Team.id; board = $board.id
    } -Method PATCH -Body @{ rules = @{ tagStyle = $tagStyles } } `
        -ApiVersion "7.1-preview" | Out-Null
    return $board
}

function Ensure-Queries {
    $roots = (Invoke-DevOps -Area wit -Resource queries -Routes @{ project = $Project } `
        -ApiVersion "7.1").value
    $shared = @($roots) | Where-Object name -eq "Shared Queries" | Select-Object -First 1
    if (-not $shared) { throw "Shared Queries root not found" }
    $sharedDetail = Invoke-DevOps -Area wit -Resource queries -Routes @{
        project = $Project; query = $shared.id
    } -ApiVersion "7.1" -QueryParameters @{ '$depth' = 2 }
    $children = $sharedDetail.children
    $folder = @($children) | Where-Object name -eq "RS MLOps" | Select-Object -First 1
    if (-not $folder) {
        $folder = Invoke-DevOps -Area wit -Resource queries -Routes @{
            project = $Project; query = $shared.id
        } -Method POST -Body @{ name = "RS MLOps"; isFolder = $true } -ApiVersion "7.1"
    }
    $folderDetail = Invoke-DevOps -Area wit -Resource queries -Routes @{
        project = $Project; query = $folder.id
    } -ApiVersion "7.1" -QueryParameters @{ '$depth' = 2 }
    $ids = [ordered]@{}
    foreach ($query in $Manifest.queries) {
        $current = @($folderDetail.children) | Where-Object name -eq $query.name | Select-Object -First 1
        $body = @{ name = $query.name; wiql = $query.wiql }
        if ($current) {
            $saved = Invoke-DevOps -Area wit -Resource queries -Routes @{
                project = $Project; query = $current.id
            } -Method PATCH -Body $body -ApiVersion "7.1"
        } else {
            $saved = Invoke-DevOps -Area wit -Resource queries -Routes @{
                project = $Project; query = $folder.id
            } -Method POST -Body $body -ApiVersion "7.1"
        }
        $ids[$query.name] = $saved.id
    }
    return $ids
}

function Ensure-Dashboards {
    param($Team)
    $existing = (Invoke-DevOps -Area dashboard -Resource dashboards -Routes @{
        project = $Project; team = $Team.id
    } -ApiVersion "7.1-preview").value
    $ids = [ordered]@{}
    foreach ($name in $Manifest.dashboards) {
        $dashboard = @($existing) | Where-Object name -eq $name | Select-Object -First 1
        if (-not $dashboard) {
            $dashboard = Invoke-DevOps -Area dashboard -Resource dashboards -Routes @{
                project = $Project; team = $Team.id
            } -Method POST -Body @{
                name = $name; position = 99; refreshInterval = 0
            } -ApiVersion "7.1-preview"
        }
        $ids[$name] = $dashboard.id
    }
    return $ids
}

function Ensure-DashboardWidgets {
    param($Team, $DashboardIds, $QueryIds)
    $queryMap = @{
        "MLOps Control Tower" = @("Demo Critical Not Verified", "Agent Ready", "Human Approval Required", "Evidence Missing")
        "Model Quality" = @("ML Experiments in Eval Gate", "Evidence Missing")
        "Data Reliability" = @("No Fake Data Violations", "Evidence Missing")
        "Agent Delivery" = @("Agent Ready", "Agent Running", "PR Open", "Evidence Missing")
    }
    $widgetIds = [ordered]@{}
    foreach ($dashboardName in $Manifest.dashboards) {
        $dashboardId = $DashboardIds[$dashboardName]
        $existing = (Invoke-DevOps -Area dashboard -Resource widgets -Routes @{
            project = $Project; team = $Team.id; dashboardId = $dashboardId
        } -ApiVersion "7.1-preview").value
        $ids = [ordered]@{}
        $markdownName = "$dashboardName contract"
        $markdown = @($existing) |
            Where-Object contributionId -eq "ms.vss-dashboards-web.Microsoft.VisualStudioOnline.Dashboards.MarkdownWidget" |
            Select-Object -First 1
        if (-not $markdown) {
            $markdown = Invoke-DevOps -Area dashboard -Resource widgets -Routes @{
                project = $Project; team = $Team.id; dashboardId = $dashboardId
            } -Method POST -ApiVersion "7.1-preview" -Body @{
                name = $markdownName
                position = @{ row = 1; column = 1 }
                size = @{ rowSpan = 2; columnSpan = 2 }
                settings = (@{
                    content = "# $dashboardName`nCards move right only when evidence exists. Verified maps to Resolved; Done maps to Closed."
                } | ConvertTo-Json -Compress)
                contributionId = "ms.vss-dashboards-web.Microsoft.VisualStudioOnline.Dashboards.MarkdownWidget"
            }
        }
        $ids[$markdownName] = $markdown.id
        $positionIndex = 0
        foreach ($queryName in $queryMap[$dashboardName]) {
            $widget = @($existing) | Where-Object name -eq $queryName | Select-Object -First 1
            if (-not $widget) {
                $widget = Invoke-DevOps -Area dashboard -Resource widgets -Routes @{
                    project = $Project; team = $Team.id; dashboardId = $dashboardId
                } -Method POST -ApiVersion "7.1-preview" -Body @{
                    name = $queryName
                    position = @{ row = (3 + ($positionIndex * 2)); column = 1 }
                    size = @{ rowSpan = 2; columnSpan = 3 }
                    settings = (@{
                        query = @{ queryId = $QueryIds[$queryName]; queryName = $queryName }
                    } | ConvertTo-Json -Compress)
                    contributionId = "ms.vss-mywork-web.Microsoft.VisualStudioOnline.MyWork.WitViewWidget"
                }
            }
            $ids[$queryName] = $widget.id
            $positionIndex += 1
        }
        $widgetIds[$dashboardName] = $ids
    }
    return $widgetIds
}

function Ensure-DeliveryPlan {
    param($Team)
    $plans = (Invoke-DevOps -Area work -Resource plans -Routes @{
        project = $Project
    } -ApiVersion "7.1").value
    $plan = @($plans) | Where-Object name -eq $Manifest.deliveryPlan.name | Select-Object -First 1
    if (-not $plan) {
        $plan = Invoke-DevOps -Area work -Resource plans -Routes @{
            project = $Project
        } -Method POST -ApiVersion "7.1" -Body @{
            name = $Manifest.deliveryPlan.name
            description = "RS MLOps roadmap across dated iterations"
            type = "deliveryTimelineView"
            properties = @{
                teamBacklogMappings = @(@{
                    teamId = $Team.id
                    categoryReferenceName = "Microsoft.FeatureCategory"
                })
                criteria = @()
                markers = @()
                styleSettings = @()
                tagStyleSettings = @()
            }
        }
    }
    return $plan
}

function Test-Configuration {
    param($Snapshot)
    $errors = @()
    if (-not $Snapshot.exists) { $errors += "Team does not exist"; return $errors }
    $actualColumns = @($Snapshot.storiesBoard.columns | ForEach-Object name)
    $wantedColumns = @($Manifest.board.columns | ForEach-Object name)
    if (($actualColumns -join "|") -ne ($wantedColumns -join "|")) {
        $errors += "Board columns differ from manifest"
    }
    $actualRows = @($Snapshot.storiesBoard.rows | Where-Object name | ForEach-Object name)
    foreach ($row in $Manifest.board.swimlanes) {
        if ($actualRows -notcontains $row) { $errors += "Missing swimlane: $row" }
    }
    foreach ($column in $Manifest.board.columns) {
        $actual = @($Snapshot.storiesBoard.columns) | Where-Object name -eq $column.name
        if (-not $actual -or [int]$actual.itemLimit -ne [int]$column.wip) {
            $errors += "WIP mismatch: $($column.name)"
        }
    }
    return $errors
}

$team = Get-Team
$before = Get-TeamSnapshot -Team $team

if ($Backup) {
    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $path = Join-Path $PSScriptRoot "backups\rs-mlops-$stamp.json"
    New-Item -ItemType Directory -Force -Path (Split-Path $path) | Out-Null
    $workItems = Invoke-AzJson @("boards", "query", "--wiql",
        "SELECT [System.Id],[System.WorkItemType],[System.Title],[System.State],[System.AreaPath],[System.IterationPath],[System.Tags] FROM WorkItems WHERE [System.TeamProject]='Novendor' AND [System.AreaPath] UNDER 'Novendor\\RS-Analytics'",
        "--org", $Org, "-o", "json")
    Write-JsonFile -Value @{ snapshot = $before; workItems = $workItems } -Path $path
    Write-Host "Backup written: $path"
    exit 0
}

if ($DryRun -or (-not $Apply -and -not $Verify)) {
    $actions = @()
    if (-not $team) { $actions += "CREATE team '$TeamName'" }
    else { $actions += "REUSE team '$TeamName' ($($team.id))" }
    $actions += "SET area scope to '$($Manifest.team.areaPath)' with children"
    $actions += "ASSIGN Sprint 1 through Sprint 8; current Sprint 3"
    $actions += "APPLY $($Manifest.board.columns.Count) columns and $($Manifest.board.swimlanes.Count) swimlanes"
    $actions += "UPSERT $($Manifest.queries.Count) shared queries and $($Manifest.dashboards.Count) dashboards"
    $actions += "DEFER Test Plans, service hook, and GitHub environment approval setup"
    [ordered]@{ mode = "DryRun"; current = $before; plannedActions = $actions } |
        ConvertTo-Json -Depth 30
    exit 0
}

if ($Apply) {
    $backupStamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $backupPath = Join-Path $PSScriptRoot "backups\pre-apply-$backupStamp.json"
    New-Item -ItemType Directory -Force -Path (Split-Path $backupPath) | Out-Null
    Write-JsonFile -Value $before -Path $backupPath
    $team = Ensure-Team
    $board = Ensure-Board -Team $team
    $queryIds = Ensure-Queries
    $dashboardIds = Ensure-Dashboards -Team $team
    $widgetIds = Ensure-DashboardWidgets -Team $team -DashboardIds $dashboardIds -QueryIds $queryIds
    $deliveryPlan = Ensure-DeliveryPlan -Team $team
    $after = Get-TeamSnapshot -Team $team
    $errors = Test-Configuration -Snapshot $after
    $receipt = [ordered]@{
        appliedAtUtc = (Get-Date).ToUniversalTime().ToString("o")
        manifest = (Resolve-Path $ManifestPath).Path
        backup = $backupPath
        team = @{ id = $team.id; name = $team.name }
        board = @{ id = $board.id; name = $board.name }
        queries = $queryIds
        dashboards = $dashboardIds
        dashboardWidgets = $widgetIds
        deliveryPlan = @{ id = $deliveryPlan.id; name = $deliveryPlan.name }
        deferred = $Manifest.deferred
        verificationErrors = $errors
    }
    Write-JsonFile -Value $receipt -Path $ReceiptPath
    if ($errors.Count) { throw "Apply completed with verification errors: $($errors -join '; ')" }
    $receipt | ConvertTo-Json -Depth 20
    exit 0
}

if ($Verify) {
    $snapshot = Get-TeamSnapshot -Team (Get-Team)
    $errors = Test-Configuration -Snapshot $snapshot
    $result = [ordered]@{
        verifiedAtUtc = (Get-Date).ToUniversalTime().ToString("o")
        passed = ($errors.Count -eq 0)
        errors = $errors
        snapshot = $snapshot
    }
    $result | ConvertTo-Json -Depth 30
    if ($errors.Count) { exit 1 }
}
