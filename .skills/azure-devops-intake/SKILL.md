---
id: azure-devops-intake
kind: skill
status: active
source_of_truth: true
topic: work-intake
owners:
  - cross-repo
  - orchestration
intent_tags:
  - intake
  - planning
  - work-item
  - azure-devops
triggers:
  - build
  - implement
  - fix
  - add
  - refactor
  - change
  - new feature
  - bug
entrypoint: true
handoff_to:
  - feature-dev
when_to_use: "Use as the mandatory first stop for any non-trivial coding request — features, bugs, refactors, design changes, AI behavior changes, data/schema changes, deploy tasks, research spikes, and any change to an instruction/governance file. Classify the request, find or propose the Azure DevOps work-item hierarchy, produce a Session Brief, then hand off to feature-dev."
when_not_to_use: "Do not use when the request is an explicit throwaway experiment, a harmless copyedit/typo/formatting fix, or a one-line non-behavioral tweak that does NOT touch an instruction or governance file. Do not re-run if the current session already has an approved Session Brief."
surface_paths:
  - backend/
  - repo-b/
  - repo-c/
  - excel-addin/
  - orchestration/
  - scripts/
  - docs/
  - supabase/
name: azure-devops-intake
description: "Mandatory first stop for any non-trivial coding request. Classifies the request, finds or proposes the Azure DevOps Epic > Feature > User Story/Bug > Task hierarchy, produces a Session Brief, and only then hands off to feature-dev. Use for every feature, bug, refactor, design change, AI behavior change, data/schema change, deploy task, research spike, or documentation task — anything that is not an explicit throwaway experiment."
---

# Azure DevOps Intake — Winston / Novendor

Azure DevOps is the front door. No non-trivial work is coded without a work item.

This skill owns the **"what and why"**: classify the request, map it to the
`Epic → Feature → User Story/Bug → Task` hierarchy on the Novendor board, and
produce a Session Brief. It then hands off to [`feature-dev`](../feature-dev/SKILL.md),
which owns the **scoped implementation**, and to tests/evidence, which decide done.

ADO context — org `paulmalmquist1984`, project `Novendor`. CLI quirks are
documented once in [`docs/tips.md`](../../docs/tips.md) under "Azure DevOps
Board Management" — read that section, do not re-derive it. The full
way-of-working charter is [`docs/WINSTON_CODING_SESSION_INSTRUCTIONS.md`](../../docs/WINSTON_CODING_SESSION_INSTRUCTIONS.md).

## BANNED PATTERNS — violations mean intake FAILED

```
- Coding before an approved Session Brief exists
- Treating a broad Epic-level request as coding scope (split it into Features/Stories first)
- Creating a duplicate Epic or Feature when a suitable one already exists
- Leaving a Story without a parent Feature, or a Feature without a parent Epic
- Creating work items before the user approves the proposal
- Silently mutating the board (every create/relink is shown and reasoned)
- Proceeding to code when the ADO CLI is unavailable or unauthenticated
```

## Trivial bypass test — what skips ADO

A request skips intake **only** if it is one of:

- A harmless copyedit, typo fix, or pure formatting change.
- A one-line, non-behavioral tweak.
- Something the user **explicitly** called a "throwaway experiment."

The bypass does **NOT** apply — intake is mandatory regardless of size — when
the change touches an instruction or governance file:

- `CLAUDE.md`
- `skills/` or `.skills/`
- `docs/plans/`
- AI runtime behavior docs
- deployment docs
- security / compliance docs
- any instruction file that changes how agents behave

If in doubt, do intake.

## Mandatory states — follow in order, cannot skip

### STATE: classify

Classify the request along three axes and emit the result.

- **Type** (one or more): Feature · Bug · Refactor · Design/UI · AI runtime ·
  Data/schema · DevOps/deployment · Research/spike · Documentation ·
  Board cleanup · Security/compliance.
- **Domain** (one or more): Platform Core · Auth/Security ·
  Multi-tenant Environment Provisioning · AI Runtime/MCP · Demo Lab · REPE ·
  Legal Ops · History Rhymes / Altered Mind · Investment Engine ·
  Documents/Extraction · Reporting/Semantic Metrics · Compliance/Audit ·
  CRM/Consulting Ops · Excel Add-in · Orchestration/Codex Automation ·
  Marketing Site · CI-CD/Deployment · Design System.
- **Risk**: Low / Medium / High.
- **Affected repo surfaces**: `backend/` `repo-b/` `repo-c/` `excel-addin/`
  `orchestration/` `scripts/` `docs/` `supabase/`.

Valid transition → **locate**

### STATE: locate

Find whether a matching work item already exists. Never assume.

```powershell
$az = "C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin\az.cmd"
& $az devops configure --defaults organization=https://dev.azure.com/paulmalmquist1984 project=Novendor

# Search by type/domain keyword
& $az boards query --wiql "SELECT [System.Id],[System.WorkItemType],[System.Title] FROM WorkItems WHERE [System.TeamProject]='Novendor'" --org https://dev.azure.com/paulmalmquist1984

# Inspect a candidate's hierarchy
& $az boards work-item show --id <id> --expand Relations --org https://dev.azure.com/paulmalmquist1984
```

**ADO Unavailable Blocker** — if the CLI is missing, unauthenticated, or returns
an error: STOP. Do not proceed to coding. Emit:

```
## ADO Unavailable Blocker
Command: <exact command run>
Error:   <exact error output>
Options:
  1. Fix ADO access (re-auth / install CLI), then re-run intake.
  2. Explicitly approve a temporary, marked exception to proceed without ADO.
```

Wait for the user to choose.

Valid transition → **propose**

### STATE: propose

If a Story already covers the request, hydrate the Session Brief from it and
skip to **session-brief**.

If no Story exists, propose the full chain in the Relay Intake Report below.
Reuse existing Epics/Features — only propose new ones when none fit.
**Stop and wait for explicit user approval before creating anything.**

```
# Relay Intake Report

## Request
[Original request, summarized.]

## Classification
Type:    [...]
Domain:  [...]
Risk:    Low / Medium / High
Surfaces: [...]

## Existing Work Item Check
[What `az boards query` found — matching Epic/Feature/Story IDs, or "none".]

## ADO Mapping (proposed)
Epic:     #<id> <title>           (existing | NEW)
Feature:  #<id> <title>           (existing | NEW)
Story/Bug: #<id> <title>          (existing | NEW)
Tasks:    [concrete implementation steps]   (NEW)

## Proposed Board Action
- create / update / reparent / no-op  (one line each, with reason)

## Go / No-Go
Awaiting approval to create the items above.
```

Valid transition → **create** (after approval)

### STATE: create

Post-approval only. Create items and **verify every link took**.

```powershell
# Create (note: --project is required whenever --org is passed)
$id = (& $az boards work-item create --type "User Story" --title "..." `
  --area "Novendor\<Area>" --iteration "Novendor\Sprint <N>" `
  --project Novendor --org https://dev.azure.com/paulmalmquist1984 | ConvertFrom-Json).id

# Link child to parent, then ASSERT the parent field is set
$r = & $az boards work-item relation add --id $id --relation-type parent `
  --target-id <parentId> --org https://dev.azure.com/paulmalmquist1984 | ConvertFrom-Json
if ($r.fields.'System.Parent' -ne <parentId>) { Write-Host "FAILED — link did not take" }
```

Every Story has a parent Feature; every Feature has a parent Epic; every Task
sits under a Story or Bug. See `docs/tips.md` for iteration-path format,
identity, and stderr quirks.

Valid transition → **session-brief**

### STATE: session-brief

Emit the implementation contract. This is what `feature-dev` consumes.

```
# Session Brief

## ADO Work Item
ID:            #<id>
Type:          User Story | Bug
Title:         <title>
Parent Feature: #<id> <title>
Parent Epic:    #<id> <title>
ADO URL:       https://dev.azure.com/paulmalmquist1984/Novendor/_workitems/edit/<id>

## Requested Work
[Plain-English restatement.]

## Repo Context
Affected surfaces: [backend/ | repo-b/ | repo-c/ | excel-addin/ | orchestration/ | scripts/ | docs/ | supabase/]

## Acceptance Criteria
### Screen   — [visible/UI behavior, if applicable]
### API      — [endpoint behavior, if applicable]
### DB/Data  — [schema/data/provenance, if applicable]
### AI       — [runtime/tool/fail-closed behavior, if applicable]
### Evals/tests — [required tests]
### Regression guard — [what must not break]

## Risk Level
Low / Medium / High

## Test Plan
[Specific commands and expected proof.]

## Evidence Required
[Screenshots, logs, test output, API response, DB query, Playwright trace.]

## Out of Scope
[Explicit boundaries.]
```

Valid transition → **handoff**

### STATE: handoff

Route to [`feature-dev`](../feature-dev/SKILL.md) to implement exactly one
scoped Story or Bug. `feature-dev` owns the orienting → implementing → testing
→ deploying → verifying states, the ADO state transitions, the audit comment,
and the Final Report.

## Definition of Ready — a Story may enter coding only if

```
[ ] It has a parent Feature, and the Feature has a parent Epic
[ ] Acceptance criteria exist (>= 2 concrete bullets)
[ ] Area Path is set
[ ] Iteration is set if planned for the current sprint
[ ] Risk is understood
[ ] Required tests/evidence are listed
[ ] Dependencies are known
[ ] Scope fits one focused coding session
```

If any item is missing, fix the board first — do not start coding.

## Definition of Done — handled downstream by feature-dev, stated here for the gate

```
[ ] Code complete; acceptance criteria met
[ ] Tests added/updated and actually run (or failure-to-run documented)
[ ] UI change has screenshot/visual receipt; API change has response/log receipt;
    DB change has migration + verification receipt; AI change has event-stream receipt
[ ] ADO work item state moved (In Review, or Closed only if merged + deploy/smoke verified)
[ ] ADO audit comment added (branch/commit/PR, files, tests, evidence, risks, next item)
[ ] PR/branch/artifact links attached to the work item
[ ] Active plan/docs updated; reusable lesson added to tips.md if discovered
[ ] No fake data, invented status, or silent fallback
```

## Boundaries

- One Story or Bug per coding session unless the user explicitly says otherwise.
- No deploy, secret, or production changes unless the Story scopes them.
- No opportunistic refactors or unrelated cleanup hidden inside a small Story.
- Fail closed when capability, data, auth, schema, or AI context is missing.
- Do not move a work item to `Closed` unless merge + deploy/smoke are verified.
- Never bypass intake for instruction/governance files (see the bypass test).
