# Research intake — turning findings into consistent updates

The user is researching specifics over time (e.g., which Google products a Relativity deployment will use). Each finding should update three things together — the **crosswalk**, the **plan prose**, and the **budget** — so they never disagree. This file is the procedure.

## Inputs you might get

- A pasted deep-research summary or notes.
- A vendor/pricing page (fetch it if a URL is given and fetching is allowed).
- A one-line decision ("we're going BigQuery, not Snowflake").
- A correction to an earlier assumption.

## Procedure

### 1. Extract the decisions

From the finding, pull a short list of concrete decisions. For each: **what** product/service, **replacing what** (which template component / crosswalk row), **pricing unit** (how it's billed), and **constraints** (region, compliance, commitment).

Write these as bullets back to the user before editing, so a wrong reading gets caught early.

### 2. Update `CROSSWALK.md`

Find the row for the component being decided. Set the target product and SKU, and cite the source + date. If the choice is partial (product chosen, price unknown), record the product and leave the SKU as `TBD` with a `NEEDS-RESEARCH` note. Keep the crosswalk one row per component — supersede, don't append a duplicate.

### 3. Update the plan prose

Edit only the sections the decision touches. In `02_OPERATING_MODEL_TEMPLATE.md` the stack is placeholder tokens (`{{WAREHOUSE}}`, `{{ORCHESTRATOR}}`, etc.) — leave those generic. Put concrete product names in `03_RELATIVITY_INSTANTIATION.md` (the §0 token table and the relevant section). Match the existing voice; follow the repo's `docs/anti-ai-style.md` if present.

### 4. Update the budget

For each decided component, find its `NEEDS-RESEARCH` placeholder rows in `budget.csv` and replace them with real line items: set `item` to the chosen SKU, fill `unit_cost_low`/`unit_cost_high` from the pricing, set `source` to the finding (e.g., "GCP pricing 2026-06-08"), and raise `confidence`. If the decision implies new cost lines the placeholder didn't have (e.g., egress, a compliance add-on, commitment discounts), add them.

### 5. Re-run the rollup and log

```
python scripts/rollup_budget.py <plans>/budget.csv -o <plans>/BUDGET.md
```

Append a dated entry to `CHANGELOG.md`:

```
## 2026-06-08 — Warehouse decision
- Crosswalk: {{WAREHOUSE}} → BigQuery (source: deep-research note, 2026-06-08)
- Plan: 03 §0 token table + §9 updated
- Budget: R-07 infra placeholder → BigQuery storage (TB-month) + on-demand/slots compute; confidence L→M
- Open: egress estimate still NEEDS-RESEARCH
```

## Rules that keep it clean

- **Idempotent.** Re-running the same finding shouldn't create duplicates. Match on `work_item_id` + component; update in place.
- **Traceable.** Every number or product choice carries a `source`. "assumption" is a valid source — say so rather than implying a citation.
- **Honest gaps.** A half-known decision stays half-known: product set, price `NEEDS-RESEARCH`. Don't fill a price to make the total look complete.
- **Scoped edits.** Touch only the sections a finding affects. Big rewrites hide what changed.
- **Supersede conflicts.** If new research overturns an old number, replace the row and note the change in the changelog; never leave two live values.
