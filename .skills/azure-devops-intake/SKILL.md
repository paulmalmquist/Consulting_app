---
name: azure-devops-intake
description: Create or hydrate the Azure DevOps Epic > Feature > User Story/Bug > Task hierarchy and produce a Session Brief for Winston R2 work. Use for schema, security, MCP contracts, cloud infrastructure/cost, production data, deploy/release, agent governance, multi-session work, or explicit ticket/ADO requests. Do not require it for read-only R0 work or routine R1 changes.
---

# Azure DevOps Intake

ADO is a risk gate, not universal ceremony.

Org: `paulmalmquist1984`
Project: `Novendor`

Read the targeted "Azure DevOps Board Management" section in `docs/tips.md`
for current Windows CLI behavior.

## Classify first

- **R0 — read-only:** explanation, audit, planning, inventory, architecture,
  or validation. No work item required.
- **R1 — focused reversible change:** scoped UI/code/test/docs work. Reuse an
  existing item when present; create a new item only when requested or when
  tracking materially helps.
- **R2 — governed change:** schema/migration, security/auth, MCP contracts,
  cloud infrastructure or cost, production data, deploy/release, instruction
  governance, or multi-session/cross-surface work. Approved Story/Bug and
  Session Brief required before mutation.

An existing approved Story/Bug satisfies intake; do not create duplicates.

## Intake sequence

1. **Locate**
   - Search by domain, title, and affected surface.
   - Inspect candidate parent relations.
   - Reuse suitable Epics and Features.
2. **Propose**
   - Show any proposed create/reparent/update actions.
   - Wait for approval before board mutation unless the user already approved
     an implementation plan that explicitly includes those actions.
3. **Create or hydrate**
   - Maintain `Epic → Feature → User Story/Bug → Task`.
   - Verify every parent relation after writing it.
4. **Session Brief**
   - Work item ID, title, parent Feature/Epic, URL
   - requested work and affected surfaces
   - acceptance criteria and explicit non-goals
   - risk and dependencies
   - test and delivery plan
   - required evidence
5. **Handoff**
   - Route implementation to `feature-dev`.

## CLI baseline

```powershell
$az = "C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin\az.cmd"
$org = "https://dev.azure.com/paulmalmquist1984"

& $az devops configure --defaults organization=$org project=Novendor
& $az boards query --wiql "<query>" --org $org --project Novendor
& $az boards work-item show --id <id> --expand Relations --org $org
```

When `--org` is passed to `work-item create`, also pass `--project Novendor`.
Capture relation output or re-read the item and assert `System.Parent`.

## ADO unavailable

ADO failure blocks R2 mutation. Report the exact command/error and preserve the
approved local plan. R0 work and R1 local work may continue when they do not
create production or governance risk.

## Boundaries

- One Story or Bug should remain small enough for one focused delivery.
- Do not create speculative duplicate hierarchy.
- Do not close an item until required merge and verification are complete.
- Do not place secret values in descriptions or comments.
- RS telemetry work uses the existing `Novendor\RS-Analytics` hierarchy and RS
  MLOps team view; it is not a separate backlog.
