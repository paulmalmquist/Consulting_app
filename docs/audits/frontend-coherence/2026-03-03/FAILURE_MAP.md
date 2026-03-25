# Failure Map — REPE Waterfall Workflow
**Date:** 2026-03-03  **Environment:** Meridian Capital Management RE
**Fund tested:** Institutional Growth Fund VII (`a1b2c3d4-0003-0030-0001-000000000001`)
**Backend:** `https://authentic-sparkle-production-7f37.up.railway.app`
**Tester:** Agent-mode black-box (no source access during test)

---

## Click Log

| Step | UI Location | Action | Result |
|------|-------------|--------|--------|
| 1 | `/lab/env/.../re` | Loaded RE environment | Fund portfolio — 3 funds, $2B committed |
| 2 | Fund list | Clicked Institutional Growth Fund VII | Fund detail loaded |
| 3 | Fund → Scenarios tab | Observed | 3 pre-existing scenarios in dropdown |
| 4 | Scenarios tab | Clicked "+ New Sale Scenario" | **Silent creation** — "Sale Scenario 4 (custom)" auto-named, no modal |
| 5 | Scenarios tab → form | Filled assumption: Tower, $49.5M, 2026-06-15, 1.5% fee | POST 201 — **no UI feedback**, duplicate created |
| 6 | Scenarios tab | Clicked "Compute Impact" | POST 200 — results appeared **below fold**, no scroll |
| 7 | Fund → Waterfall Scenario tab | Clicked "Run Scenario Waterfall" | **DB constraint error: `re_run_run_type_check`** |
| 8 | Fund → Run Center tab | Clicked "Run Waterfall (Shadow)" | Success toast — **output inaccessible** |
| 9 | Fund → LP Summary tab | Observed | "No LP data available. Seed partners first." |
| 10 | Fund → Returns tab | Observed | "No return metrics. Run Quarter Close first." (run already exists) |
| 11 | Left nav → Models | Observed | 0 models — completely separate system |
| 12 | Left nav → Run Center | Observed | Raw `QUARTER_CLOSE` enum, run IDs not clickable |
| 13 | Left nav → Reports | Clicked "UW vs Actual" | "Not Found" error |
| 14 | Investment → Meridian Office Tower | Observed | Rich data visible; no Sale Assumptions tab at investment level |

---

## Breakages

### BREAKAGE-1 — Scenario creation has no UX [Medium / UX]
**Step 4 | No API route | DB: `re_sale_scenario`**

Clicking "+ New Sale Scenario" instantly creates "Sale Scenario 4 (custom)" with no modal, no name field, no cancel.

**Root cause:** No creation dialog — button calls a direct create action with an auto-generated name.

**Fix:** Open dialog with Name field + Cancel before creating record.

---

### BREAKAGE-2 — No success feedback on Add Sale Assumption [Medium / UX]
**Step 5 | `POST /api/re/v2/funds/{fundId}/sale-scenarios` → 201 | DB: assumption rows ID 3, 4**

POST returns 201 with full payload. Zero UI feedback — no toast, no list refresh above fold. Caused re-submission and duplicate (IDs 3 and 4).

**Evidence:**
```
POST .../sale-scenarios → 201
{"id":4,"sale_price":"49500000.00","sale_date":"2026-06-15","disposition_fee_pct":"0.0150"}
```

**Root cause:** `onSuccess` handler missing toast call. Assumption list renders below viewport.

**Fix:** Success toast + scroll list into view after POST.

---

### BREAKAGE-3 — Compute Impact results appear below fold [Medium / UX]
**Step 6 | `POST /api/re/v2/funds/{fundId}/scenario-compute` → 200**

Compute succeeds with rich output but "SCENARIO IMPACT" section is below all form elements. No auto-scroll, no indicator.

**Evidence:**
```
POST .../scenario-compute → 200
{"base_gross_irr":"0.1245","scenario_gross_irr":"-0.0751","irr_delta":"-0.1996",
 "base_gross_tvpi":"1.080","scenario_gross_tvpi":"0.8864","tvpi_delta":"-0.1936",
 "scenario_net_irr":"-0.0756","carry_estimate":"0.00","total_sale_proceeds":"97515000.00"}
```
(Note: $97.5M = 2 assumptions × $49.5M due to the duplicate from BREAKAGE-2.)

**Root cause:** Results `<div>` is placed below assumption list in DOM. No `scrollIntoView` called post-compute.

**Fix:** `resultsRef.current?.scrollIntoView({ behavior: 'smooth' })` after compute, or move results to sticky panel.

---

### BREAKAGE-4 — CRITICAL: Waterfall Scenario run type rejected by DB [Critical / Backend]
**Step 7 | Run creation POST → 500 | DB: `re_run.run_type` CHECK constraint**

```
ERROR: new row for relation "re_run" violates check constraint "re_run_run_type_check"
DETAIL: Failing row contains (..., WATERFALL_SCENARIO, running, ...)
```

The `re_run` table's CHECK constraint on `run_type` does not include `WATERFALL_SCENARIO`.

**Root cause:** Migration gap — `WATERFALL_SCENARIO` was added to application code but the DB constraint was never updated.

**Fix:**
```sql
ALTER TABLE re_run DROP CONSTRAINT re_run_run_type_check;
ALTER TABLE re_run ADD CONSTRAINT re_run_run_type_check
  CHECK (run_type IN ('QUARTER_CLOSE', 'WATERFALL_SHADOW', 'WATERFALL_SCENARIO'));
```

---

### BREAKAGE-5 — Shadow waterfall output is invisible [High / UX+Data]
**Step 8 | Run `e13e7c45` created | DB: waterfall results table (not surfaced)**

Toast shows "Waterfall Shadow: success (run e13e7c45)" but:
- Run ID is plain text (not a link)
- Run does NOT appear in fund-level RUN HISTORY
- No results view exists for shadow waterfall outputs

**Root cause:** Shadow run writes output to a table that no frontend component queries. Fund history filter is limited to `QUARTER_CLOSE` type.

**Fix:** Make run ID in toast a `<Link>`. Create a results page for waterfall runs. Include all run types in fund history.

---

### BREAKAGE-6 — LP Summary empty: no investor data seeded [High / Data]
**Step 9 | `GET .../lps` → empty | DB: `re_lp`/`re_investor`, `re_commitment`, `re_capital_call`**

"No LP data available. Seed partners and capital ledger entries first."

No LP entities, no commitments, no capital calls exist for this fund.

**Root cause:** Fund was created via seed script without LP/commitment data.

**Fix (Section D):** Seed 2 LPs (CalPERS $150M, Harvard Endowment $100M) + 1 GP ($25M) with commitments and 2 capital calls each.

---

### BREAKAGE-7 — Returns tab empty despite completed Quarter Close [High / Data+Logic]
**Step 10 | `GET .../returns` → empty | DB: return metrics table**

"No return metrics available. Run a Quarter Close first." — but run `e1540a03` (QUARTER_CLOSE, success, 2026-03-02) exists in global Run Center.

**Root cause (two candidates):**
1. Run `e1540a03` is a seeded stub — the actual computation was never executed and metrics table was not populated.
2. Returns tab query filters on `fund_id`/`env_id` that doesn't match the seeded run.

**Fix:** Check `re_return_metric` table for this fund. If empty, Quarter Close compute logic must write metrics on run completion.

---

### BREAKAGE-8 — Two parallel modeling systems [Medium / Architecture]
**Step 11 | Left nav → Models vs. Fund → Scenarios**

Global Models page (0 models, `name/description/strategy` schema) has no connection to fund-level Scenarios (sale assumptions, compute impact, waterfall). Users trying to model from the Models page find nothing.

**Root cause:** Two features built independently, never integrated.

**Fix (short term):** Add note on Models page directing users to Fund → Scenarios tab.

---

### BREAKAGE-9 — Run Center: raw enums, no drill-down [Low / UX]
**Step 12 | Global Run Center**

Run type shown as `QUARTER_CLOSE` (raw enum). Run IDs are plain text. No way to view run outputs.

**Fix:** Label map `{ QUARTER_CLOSE: 'Quarter Close', WATERFALL_SHADOW: 'Waterfall (Shadow)', WATERFALL_SCENARIO: 'Waterfall Scenario' }`. Link run IDs to `/runs/{id}`.

---

### BREAKAGE-10 — UW vs Actual report returns Not Found [Medium / Data+API]
**Step 13 | `GET /api/re/v2/reports/uw-actual?fundId=...&quarter=2025Q4` → 404**

"Not Found" error for Fund VII / 2025Q4. No underwriting or actual metric data seeded.

**Fix:** Seed UW metrics for 2024Q4–2025Q4. Add "Scenario Impact Report" as a report type showing waterfall compute results.

---

## Summary

| # | Breakage | Severity | Type |
|---|----------|----------|------|
| 4 | DB constraint rejects WATERFALL_SCENARIO run type | **Critical** | Backend/DB |
| 5 | Shadow waterfall output invisible | High | UX + Data |
| 6 | LP Summary empty — no investors seeded | High | Data |
| 7 | Returns tab empty despite successful Quarter Close | High | Data + Logic |
| 1 | Scenario creation has no dialog/UX | Medium | UX |
| 2 | No success feedback on add assumption | Medium | UX |
| 3 | Compute Impact results below fold | Medium | UX |
| 8 | Two parallel modeling systems, no connection | Medium | Architecture |
| 10 | UW vs Actual report Not Found | Medium | Data + API |
| 9 | Run Center shows raw enums, no drill-down | Low | UX |

**Critical path to demo-ready (in order):**
1. Fix `re_run_run_type_check` constraint (BREAKAGE-4)
2. Seed LP/investor data (BREAKAGE-6)
3. Re-run / verify Quarter Close populates metrics (BREAKAGE-7)
4. Wire waterfall results to a view (BREAKAGE-5)
5. Add success toasts + auto-scroll (BREAKAGE-2, 3)
6. Add scenario creation modal (BREAKAGE-1)
7. Polish: run labels, clickable IDs, UW report (BREAKAGE-9, 10)

---

## Target UX (After Fixes)

```
Fund Detail
├── Scenarios tab
│   ├── [Scenario Dropdown]  +  [+ New Scenario → modal with Name/Type]
│   ├── ASSUMPTIONS table (inline edit/delete)  +  [+ Add row]
│   ├── [Compute Impact] → sticky CTA
│   └── IMPACT RESULTS panel (auto-scrolled into view)
│       └── IRR Δ / TVPI Δ / DPI / Carry  +  [Run Full Waterfall →]
│
├── Waterfall Results tab (post-run)
│   ├── Tier breakdown (RoC / 8% Pref / 80-20 Promote)
│   ├── LP Allocation table
│   └── [Export PDF]
│
└── Run History tab
    ├── All run types with human-readable labels
    └── Clickable run IDs → Run Detail page
```

---
*See AESTHETIC_WALKTHROUGH_2.md for separate UI/layout issues. Next: Section C — canonical data model.*
