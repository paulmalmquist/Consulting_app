# Winston / Novendor Coding Session Instructions

This is the charter for how work moves through the Winston / Novendor platform.
It is the reference doc — the "why" and the full standard. The enforced,
executable protocol lives in [`.skills/azure-devops-intake/SKILL.md`](../.skills/azure-devops-intake/SKILL.md).
`CLAUDE.md` routes every non-trivial coding request through that skill first.

## The Core Rule

**Azure DevOps is the source of truth for all non-trivial work.** A coding
prompt is not a standalone request. Every feature, bug, refactor, design
change, AI behavior change, data fix, deploy task, research spike, or
documentation task must be represented as an ADO work item — classified,
linked into the hierarchy, planned, implemented one Story at a time, verified
with evidence, and reported back.

Org `paulmalmquist1984`, project `Novendor`. CLI quirks: see the
"Azure DevOps Board Management" section of [`docs/tips.md`](./tips.md).

## The Required Hierarchy

```
Epic              cross-sprint product/platform domain
  Feature         a 1–3 sprint capability within an Epic
    User Story    a unit of value that fits one focused coding session
    Bug           a defect — not unfinished work
      Task        a concrete implementation step
```

A coding agent implements **exactly one** User Story or Bug per session.

## What Skips ADO

Trivial bypass applies **only** to: harmless copyedits, typos, pure
formatting, one-line non-behavioral tweaks, and anything the user explicitly
calls a "throwaway experiment."

It does **not** apply — intake is mandatory regardless of size — to changes in
instruction/governance files: `CLAUDE.md`, `skills/`, `.skills/`,
`docs/plans/`, AI runtime behavior docs, deployment docs, security/compliance
docs, or any instruction file that changes how agents behave. If in doubt, do
intake.

## The 6-Step Intake Flow

1. **Classify** — type, domain, risk, affected repo surfaces.
2. **Locate** — `az boards query` for an existing matching Epic/Feature/Story.
   If ADO is unavailable/unauthenticated, stop and emit an ADO Unavailable
   Blocker note; do not silently proceed.
3. **Propose** — if no Story exists, propose the full `Epic → Feature →
   Story → Task` chain in a Relay Intake Report. Wait for approval.
4. **Create** — post-approval only; create items and verify every parent link.
5. **Session Brief** — emit the implementation contract.
6. **Implement** — hand off to `feature-dev` for one scoped Story/Bug.

## Session Start Protocol

A coding session starts only when an approved **Session Brief** exists:
ADO work item ID + type + title + parent Feature + parent Epic + ADO URL,
requested work, repo context, acceptance criteria, risk level, test plan,
evidence required, out of scope. `feature-dev`'s orienting state refuses to
proceed without it.

## Session End Protocol

Every session ends with a **Final Report** and an ADO update:

- **State transition**: `Active` when implementation starts → `Resolved` when
  code/tests/evidence are ready → `Closed` **only** when the PR is merged and
  required deploy/smoke criteria are actually verified. If merge/deploy did not
  happen, leave it `Resolved`. No fake completion status.
- **Audit comment**: append an ADO discussion comment with branch/commit/PR,
  files changed, tests run, evidence, risks, and next recommended work item.
- **Link attachment**: any PR, branch, commit, screenshot, Playwright trace,
  deployment URL, or test artifact is linked from the work item.
- **Final Report** content: summary, ADO updates, files changed, tests run with
  results, evidence, risks/unknowns, plan/`tips.md` updates, next work item.

No claims of passing tests unless the tests actually ran.

## Definition of Ready

A Story or Bug is ready for coding only if it has a parent Feature (and the
Feature a parent Epic), acceptance criteria, an Area Path, an Iteration if
planned for the current sprint, an understood risk level, listed
tests/evidence, known dependencies, and scope small enough for one focused
session. If any are missing, fix the board first.

## Definition of Done

Done means: code complete and acceptance criteria met; tests added/updated and
actually run (or failure-to-run documented); UI changes have a screenshot,
API/backend changes have a response/log/test receipt, DB changes have a
migration + verification receipt, AI runtime changes have event-stream /
fail-closed evidence; the ADO work item is updated with state + audit comment +
links; active plans/docs are updated; a reusable lesson is added to `tips.md`
if one was discovered; and no fake data, invented status, or silent fallback
was introduced.

## Board Rules Going Forward

- Every Story has a parent Feature; every Feature has a parent Epic. No Story
  parented directly to an Epic except during temporary triage.
- Epics are cross-sprint. Features are 1–3 sprint capabilities. Stories fit one
  focused Claude Code / Codex session. Tasks are concrete engineering steps.
- Bugs are defects, not unfinished features.
- Test scenarios are Tasks or Test Cases, not standalone Stories.
- Research/spikes timebox uncertainty and end with a decision.
- Do not use `Platform-Core` as a dumping ground — each Epic domain gets its own
  Area Path; Features and Stories inherit the Epic's area.
- Do not create hundreds of Tasks before sprint planning — only task out the
  current sprint.
- Every non-trivial coding Story produces evidence and, when a reusable lesson
  is found, improves `tips.md` or the planning docs.

## Boundaries

- One Story or Bug per session unless the user explicitly says otherwise.
- No deploy, secret, or production changes unless the Story scopes them.
- No broad refactor hidden inside a small Story.
- Fail closed when capability, data, auth, schema, or AI context is missing.
- Prefer small reversible changes with receipts.
- Do not bypass Azure DevOps unless the user explicitly says a request is a
  throwaway experiment.
