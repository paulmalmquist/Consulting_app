# RS MLOps Azure DevOps Control Tower

The JSON manifest is the source of truth. The PowerShell entrypoint supports
read-only planning, backup, apply, and verification:

```powershell
.\scripts\azure-devops\setup-rs-mlops-control-tower.ps1 -DryRun
.\scripts\azure-devops\setup-rs-mlops-control-tower.ps1 -Backup
.\scripts\azure-devops\setup-rs-mlops-control-tower.ps1 -Apply
.\scripts\azure-devops\setup-rs-mlops-control-tower.ps1 -Verify
```

The script only creates or updates the dedicated `RS MLOps` team and its
team-owned boards, shared queries, and dashboards. It does not delete,
reparent, or bulk-edit existing work items.

Test Plans and service hooks remain disabled until their prerequisites in the
manifest are satisfied.
