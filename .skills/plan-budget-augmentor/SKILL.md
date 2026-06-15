---
name: plan-budget-augmentor
description: >-
  Augment delivery and operating-model plans by attaching labor and tooling/infra
  budget line items to every work item, and fold new research (cloud-product specifics,
  vendor SKUs, stack decisions) into the plans, the budget rollup, and a living stack
  crosswalk so all three stay consistent. Use this whenever the user wants to budget,
  cost, or price out a plan; add, update, or roll up line items; estimate effort or
  cloud/license costs; turn research notes or deep-research output into plan updates;
  build or refresh a crosswalk (e.g., Azure to GCP / BigQuery); or says things like
  "augment the plans", "attach budget", "cost this out", "update the plans with what I found",
  or works on the TELEMETRY_TEMPLATE / Relativity Space deployment docs. Prefer this skill
  over ad-hoc editing whenever a plan needs budget line items or needs to absorb new research.
---

# Plan Budget Augmentor

This skill keeps a set of plans, their budget, and a stack crosswalk in sync. It does two jobs:

1. **Attach budget line items** to every work item in a plan — both **labor** (role × time × rate) and **tooling/infra** (cloud SKUs, licenses, services) — and produce a rollup with one-time vs. recurring totals.
2. **Fold in research** — when the user brings new findings (e.g., which Google products a deployment will use), update the affected plan sections, the budget SKUs, and the crosswalk together, with traceability and without duplicating prior content.

It was built for the `TELEMETRY_TEMPLATE/` plans (NCF operating model → Relativity Space), but works on any plan set that has identifiable work items.

## Why this shape

A plan, its budget, and its stack decisions drift apart when they live in separate heads. Tie them to a shared work-item ID and every change has one place to land: the budget references the work item, the crosswalk records the stack choice that sets the SKU, and the plan prose explains it. The user is researching specifics over time, so the skill optimizes for **repeatable updates** — append, don't overwrite; cite the source and date; keep estimates honest as ranges.

## Files this skill maintains

Co-locate these next to the plans (for the template set, inside `TELEMETRY_TEMPLATE/`):

- `budget.csv` — the machine-readable line items (one row per line item). Schema in `references/budget_schema.md`.
- `BUDGET.md` — the human-readable rollup, generated from `budget.csv` by the bundled script.
- `CROSSWALK.md` — the living stack mapping (e.g., NCF/Azure component → chosen target product → SKU/notes). Format in `references/crosswalk.md`.
- `CHANGELOG.md` — a dated log of what each research-intake pass changed.

Never hand-edit `BUDGET.md`; it is regenerated. Edit `budget.csv`, then run the rollup script.

## Core workflow

### A. Attaching / updating budget line items

1. **Identify work items.** Read the plan(s). A work item is anything that takes effort to deliver — the adoption-order steps, the numbered components, the data-platform stages, each data product. Give each a stable `work_item_id` (e.g., `R-03` for Relativity adoption step 3). Reuse IDs across runs so updates land on the same row, not a duplicate.
2. **Add line items** to `budget.csv` following `references/budget_schema.md`. For each work item, attach at least:
   - one or more **labor** rows (role, person-sprints or person-weeks, blended rate as a low–high range), and
   - the **infra / license / services** rows the work item implies (storage, compute, orchestration, BI seats, controlled-enclave controls, one-time setup).
3. **Estimate as ranges with confidence.** Every cost is `unit_cost_low` and `unit_cost_high` with a confidence flag (H/M/L). Unknown SKUs get a placeholder row with `confidence=L` and a `notes` flag like `NEEDS-RESEARCH` rather than a fake number — so gaps are visible, not hidden.
4. **Separate one-time vs. recurring.** Use the `frequency` column (`one_time`, `monthly`, `annual`). Labor build effort is `one_time`; cloud run-cost is `monthly` or `annual`.
5. **Run the rollup:** `python scripts/rollup_budget.py <path-to>/budget.csv -o <path-to>/BUDGET.md`. It writes `BUDGET.md` (summary, by-category, by-work-item, full line items, and a list of rows that still need research) and prints the totals.
6. **Log it** in `CHANGELOG.md` with the date and what changed.

### B. Folding in research

When the user brings findings (a deep-research note, a vendor page, a stack decision), follow `references/research_intake.md`. The short version:

1. **Extract the decisions** — what product/service, replacing what, with what pricing unit, and any constraints (e.g., region, compliance).
2. **Update the crosswalk** — set or revise the target product and SKU in `CROSSWALK.md`, citing the source + date.
3. **Update the plan prose** — only the sections the decision touches; keep the placeholder-token style of the template.
4. **Update the budget** — turn `NEEDS-RESEARCH` placeholders into real line items with the now-known SKU and price; raise confidence.
5. **Re-run the rollup** and **append to `CHANGELOG.md`.**

Keep changes scoped and traceable. If a finding contradicts an earlier one, supersede the row and note it in the changelog — don't leave two conflicting numbers.

## Estimating guidance (brief)

- **Labor**: size in person-sprints (or person-weeks) using the plan's own cadence. Use a blended day/sprint rate range; if the user hasn't given rates, use a clearly-marked assumption and flag it. Don't invent precision the user didn't ask for.
- **Infra/cloud**: cost the *pattern*, not just one SKU — storage + compute + egress + orchestration + the controls a controlled-data path needs. For unknown unit prices, leave a `NEEDS-RESEARCH` placeholder.
- **Licenses/seats**: count seats from the roles in the plan (e.g., BI viewer vs. author seats).
- Full schema and worked examples: `references/budget_schema.md`.

## What good output looks like

- Every work item in the plan appears in `budget.csv` with at least one labor row and the infra it implies.
- `BUDGET.md` shows one-time total, recurring annual total, and a multi-year TCO, all as low–high ranges, plus a clear "needs research" list.
- `CROSSWALK.md` reflects the latest stack decisions with sources.
- `CHANGELOG.md` explains what the last pass did.
- No fabricated unit prices; gaps are visible placeholders.

## Reference files

- `references/budget_schema.md` — the `budget.csv` column contract, line-item categories, and worked examples.
- `references/research_intake.md` — step-by-step for turning research into consistent plan + budget + crosswalk updates.
- `references/crosswalk.md` — the `CROSSWALK.md` format and how to keep it stack-agnostic until research pins a choice.
- `scripts/rollup_budget.py` — reads `budget.csv`, writes `BUDGET.md`, prints totals. Run with `--help` for options.
- `assets/budget.csv` — starter file with the header and one example row.
- `assets/CROSSWALK_template.md` — starter crosswalk seeded with the NCF/Azure stack and an empty target column.
