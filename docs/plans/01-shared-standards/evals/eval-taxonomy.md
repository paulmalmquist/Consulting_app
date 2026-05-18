# Eval Taxonomy

## Type 1 — Golden path evals

**What:** End-to-end flows that represent the most important user action in an environment.
**How to run:** Playwright test or manual browser walkthrough.
**Pass criteria:** Flow completes without error. Data is visible. Expected API responses received.

Example:
```
golden_path: meridian_repe_fund_load
Steps:
1. Open /lab/env/[envId]/re/funds
2. Fund list renders with at least one fund
3. Click fund → detail page loads
4. KPI cards show non-null values
5. IRR value is in plausible range (<100% for mature fund)
Pass: All 5 steps complete without error.
```

## Type 2 — Negative / fail-closed evals

**What:** Prove that the system refuses, returns null, or declares missing context when it should.
**How to run:** Inject the triggering condition (missing data, out-of-scope request, missing auth).
**Pass criteria:** Response has correct terminal_status and null_reason. UI renders gracefully.

Example:
```
negative_test: meridian_waterfall_no_model
Trigger: Request carry for a fund where waterfall model is unavailable.
Expected response: null with null_reason: "out_of_scope_requires_waterfall"
Expected UI: Shows "Waterfall model required" chip, not 0% or blank.
```

## Type 3 — Visual / screenshot evals

**What:** Key pages look correct at a fixed viewport.
**How to run:** Playwright screenshot or manual inspection.
**Pass criteria:** No broken layout, no empty where data is expected, no low-contrast labels.

## Type 4 — AI answer evals

**What:** Winston says the right things and refuses the wrong things.
**How to run:** Send a fixed prompt, evaluate the response against a rubric.
**Pass criteria:**
- Required elements present (data source, provenance, null_reason if applicable)
- Prohibited elements absent (invented numbers, out-of-scope claims, lawyer advice)

Example rubric:
```
prompt: "What is the current IRR for IGF VII?"
required: ["IRR value", "as of [date]", "source: authoritative snapshot"]
prohibited: ["I estimate", "approximately", "based on my knowledge"]
```

## Type 5 — Tool-call evals

**What:** Confirmation gates, receipts, and write sequencing work correctly.
**How to run:** Trigger a write operation via the AI surface. Check for confirmation gate, then receipt.

## Type 6 — Regression evals

**What:** Changes to shared code do not break existing environments.
**How to run:** Run the full golden-path suite for all environments after a shared change.
**Pass criteria:** All environment golden paths still pass.

## Type 7 — Production smoke evals

**What:** Minimum verification that production is healthy after a deploy.
**How to run:** Hit key endpoints, check response codes, load key pages.
**Pass criteria:** No 500 errors, key pages load, AI gateway responds.
