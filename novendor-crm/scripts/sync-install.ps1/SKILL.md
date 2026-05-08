---
id: crm-deploy
kind: skill
status: active
trigger:
  - deploy CRM to [path]
  - deploy novendor-crm to [directory]
  - give [client] the CRM
  - set up CRM in [folder]
  - copy CRM to [location]
---

# Skill: Deploy CRM to a Target Directory

## Purpose
Copy the installed novendor-crm package to any target directory so it can be opened
as a standalone Claude session or Cowork project.

## Inputs required
- `target` — the destination directory path (e.g. `C:\Projects\ClientName`)

## What to do

Run this PowerShell command via bash:

```bash
powershell.exe -Command "& '$env:APPDATA\Claude\novendor-crm\scripts\deploy.ps1' -Target '{target}'"
```

## After deploy
Confirm: "novendor-crm deployed to {target}\novendor-crm. Open that folder in Claude or Cowork to use it."

Remind Paul: "Set SUPABASE_ACCESS_TOKEN in the environment if this is a new machine."

## Failure cases
- Source not found: "novendor-crm is not installed at %APPDATA%\Claude\novendor-crm. Run install.ps1 first."
- Target doesn't exist: PowerShell will error — tell Paul to create the parent directory first or provide a valid path.
