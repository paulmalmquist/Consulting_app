---
name: idea-to-delivery
description: >-
  Run the full discovery-to-delivery loop: develop a raw idea into deep documentation
  first, shape it into Azure DevOps work items (tasks) second, then plan code and DevOps
  in tandem before implementing. Use this whenever the user is starting from an idea,
  opportunity, or problem rather than a ready ticket — "let's think through X", "develop
  this idea", "flesh this out", "what should we build", "turn this into tasks", "write the
  design doc / ADR", "plan the code and the pipeline together", "deepen the documentation",
  or kicking off a new workstream on the Telemetry/Relativity platform or the Consulting_app
  repo. This skill owns the front (ideation + documentation depth) and the tandem code+DevOps
  plan; it hands the board mutation to azure-devops-intake and the implementation to feature-dev.
  Prefer it over jumping straight to code whenever the work starts fuzzy or needs to be reasoned
  about and documented before it becomes tickets.
---

# Idea to Delivery

The loop that turns a fuzzy idea into shipped, documented, evidenced work — without skipping the thinking. It runs in four phases, in order, but phases 2 and 3 are deliberately planned **in tandem** so code and DevOps are designed together, not bolted on after.

```
1. Ideate & document  ->  2. Shape into tasks  ->  3. Plan code + DevOps (in tandem)  ->  4. Document as you go
        (this skill)         (-> azure-devops-intake)        (this skill -> feature-dev)         (this skill)
```

This skill owns phases 1, 3, and 4. It does **not** mutate the board or write feature code itself — it hands phase 2 to the `azure-devops-intake` skill (the front door for work items) and phase 3 implementation to `feature-dev`. Its job is to make sure an idea is developed and documented *before* it becomes tickets, and that the code plan and the DevOps plan are designed together.

## Why this shape

The failure mode is starting to code from a one-line ask: scope is fuzzy, the design isn't written down, and DevOps (branch, CI, gates, evidence, rollback) gets improvised at the end. The fix is to spend cheap thinking time up front — develop the idea, write the design down, then let tasks and the paired code+DevOps plan fall out of a decision that's already been made and recorded. This is the NCF model's "leave receipts" discipline pulled forward to the idea stage.

## Phase 1 — Ideate & document (start here)

Develop the raw idea before anything else. Capture it in an **idea record** (`assets/idea-record-template.md`) and, when the idea contains a real decision (a technology choice, an architecture direction, a trade-off), an **ADR** (`assets/adr-template.md`).

Develop, don't just transcribe. Push on:

- **Problem & who's affected** — the decision the idea unblocks, and for whom.
- **Value & why now** — what's true after this exists that isn't now.
- **Options considered** — at least two real alternatives, with trade-offs (not a strawman).
- **Risks & unknowns** — what could go wrong; what must be validated in discovery (flag, don't assume — e.g., ITAR service support).
- **Success metrics** — how you'll know it worked.
- **Scope & non-scope** — what's explicitly out.

Depth bar and where docs live: see `references/documentation-depth.md`. The output of this phase is a written, reviewable artifact — not a verbal agreement.

## Phase 2 — Shape into tasks (hand to azure-devops-intake)

Once the idea is developed, promote it to the board. **Do not create work items from this skill directly** — invoke the `azure-devops-intake` skill, which classifies, locates existing items, proposes the `Epic -> Feature -> User Story/Bug -> Task` chain, and waits for approval before creating anything. Feed it the idea record so it has the problem, options, and acceptance criteria already written.

Carry these through into the work items:

- Acceptance criteria in the Screen / API / DB / AI-behavior / Evals / Regression shape (the existing intake template).
- A **risk class** (Low / Medium / High) per story — this drives the gate in phase 3.
- Budget line items, if the work has cost: invoke `plan-budget-augmentor` to attach labor + tooling/infra lines.
- Area path and iteration consistent with the program (for the RS platform: `Novendor\RS-Analytics\<domain>`).

The output of this phase is a created, parented set of work items with acceptance criteria — the tasks.

## Phase 3 — Plan code and DevOps in tandem

For each Story, produce **one paired plan** that designs the code and the DevOps together (`assets/code-devops-plan-template.md`). The point is that these are decided at the same time — the branch, CI stages, gates, and rollback are part of the design, not an afterthought. Full checklist in `references/code-devops-tandem.md`. The two columns:

- **Code plan:** files/routes/schema touched, the approach, tests to add (unit + assertions + dry-run cost where data is involved), and the Definition of Done (flight/test-ready: docs, review, non-functional, RE sign-off + FRR if flight-facing).
- **DevOps plan (designed at the same time):** branch name carrying the work-item link (`feat/<slug>` with `AB#<id>`), which CI stages must pass, any pipeline changes, the risk class and its gate (peer / owner / CCB / FRR), the evidence to attach (test output, SQL/dry-run bytes, lineage, dashboard links), and the documented rollback/backout.

Then hand implementation to the `feature-dev` skill, which owns the scoped build. This skill's contribution is the paired plan that goes in before code starts.

## Phase 4 — Document as you go

Keep documentation deep and current as the work moves, not at the end:

- Update the **design doc / ADR** if the approach changed during build (record the why).
- Attach **evidence** to the work item (receipts: CI output, dry-run cost, lineage, screenshots).
- Update the **wiki / Confluence** page and any runbook the change affects.
- Append a dated line to the **changelog**.
- Keep **lineage** intact — a KPI or data change traces to its source.

The work isn't done when the code merges; it's done when it's shipped, evidenced, and the documentation reflects reality. That's the one-way DONE.

## How this fits the existing skills

- `azure-devops-intake` — the front door for work items. This skill feeds it a developed idea; it owns classification and board mutation.
- `feature-dev` — owns the scoped implementation once the paired plan exists.
- `plan-budget-augmentor` — attaches budget line items to the work.
- The operating model this encodes lives in `TELEMETRY_TEMPLATE/` (the NCF->Relativity instantiation), the strategy doc `docs/plans/RS_ANALYTICS_PLATFORM_PLAN.md`, and the ADO board under `Novendor\RS-Analytics`.

If a request is already a well-formed ticket ready to build, skip to `feature-dev`. If it's a one-line throwaway or a typo fix, skip all of this. Use this skill when the work starts as an idea that deserves thinking and documentation before it becomes tickets.

## Reference files

- `references/ideation.md` — how to develop an idea with depth; the questions that matter.
- `references/code-devops-tandem.md` — the paired code+DevOps planning checklist, branch/CI/gate/evidence conventions.
- `references/documentation-depth.md` — what "deep documentation" means here and where each artifact lives.
- `assets/idea-record-template.md`, `assets/adr-template.md`, `assets/code-devops-plan-template.md` — fill-in templates.
- `scri