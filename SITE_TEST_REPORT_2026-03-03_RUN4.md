# RE Platform Verification Report — Run 4
**Date:** 2026-03-03
**Environment:** Meridian Capital Management
**Env ID:** `a1b2c3d4-0001-0001-0003-000000000001`
**Fund:** Institutional Growth Fund VII
**Fund ID:** `a1b2c3d4-0003-0030-0001-000000000001`
**Quarter:** 2026Q1
**URL:** https://www.paulmalmquist.com
**Baseline:** Run 3 (~8/10 partial score)

---

## Executive Summary

| Category | Count |
|---|---|
| ✅ PASS | 2 |
| ⚠️ PARTIAL | 3 |
| ❌ FAIL | 5 |
| 🚫 NOT IMPLEMENTED | 5 |
| **Total** | **15** |

**Overall Score: 4.5 / 15** (2 full pass + 3 half-credit partials)

Wave 2 UI scaffolding is clearly deployed (Waterfall Scenario tab, Shadow Run button, Budget Baseline dropdown, Sector Exposure widget). However the data pipelines powering Wave 2 — returns write-back, LP partner seed, benchmark endpoints, debt covenant routes, and sensitivity routes — are not implemented or remain broken. Wave 1 seed/NAV regressions also persist.

---

## Test Results

### T1 — Seed Idempotency
**Result: ❌ FAIL**

POST `/api/re/v2/seed` with `{ fund_id, env_id }` returns a FK constraint error:
`insert or update on table "re_partner" violates foreign key constraint "re_partner_business_id_fkey"`
The `business_id` (envId) does not exist in the `businesses` table, blocking LP partner seeding. This is the same blocker from Run 3 — not fixed.

**Impact:** Cascades to T8 (LP Summary), T9 (Waterfall Scenarios w/ LP data).

---

### T2 — NAV Reconciliation
**Result: ❌ FAIL**

`GET /api/re/v2/funds/{fundId}/investment-rollup/2026Q1` returns `[]` (empty array).
Fund-level NAV from the fund detail endpoint shows ~$425M but the rollup that aggregates investment-level NAV contributions returns nothing. NAV sum across investments = $0 vs expected ~$425M.

---

### T3 — Investment Detail Completeness
**Result: ⚠️ PARTIAL**

Investment: Meridian Office Tower (`9689adf7-6e9f-43d4-a4db-e0c3b6a979a3`)

**Working fields (new vs Run 3):**
- NAV: $38.5M ✅
- NOI: $4.5M ✅
- Gross Value: $51.8M ✅ *(now showing — was missing in Run 3)*
- IRR: 11.6% ✅
- MOIC: 1.22x ✅
- Committed Capital: $45.3M ✅
- Invested Capital: $38.5M ✅
- Distributions: $2.7M ✅
- Fund NAV Contribution: $33.8M ✅
- Sector Exposure widget ✅ *(new Wave 2 element)*

**Still missing / wrong:**
- Acquisition Date: `—` ❌
- Hold Period: `—` ❌
- Debt / LTV: LTV shows 0.0% ❌
- Cap Rate: 34.78% ❌ *(should be ~8%; likely dividing NOI by wrong base)*

---

### T4 — Quarter Close Pipeline
**Result: ✅ PASS**

Run Center confirmed run `e1540a03` with status `QUARTER_CLOSE 2026Q1 SUCCESS`.
Pipeline executes end-to-end without error. Variance tab shows data ($5.1M vs $4.6M NOI).

---

### T5 — Fund NAV Column
**Result: ❌ FAIL**

`GET /api/re/v2/funds/{fundId}/investment-rollup/2026Q1` → `[]`
The fund-level investment table's "Fund NAV" column shows `—` for all 12 investments. The rollup endpoint that should populate this column returns empty. Blocked by same issue as T2.

---

### T6 — Returns Tab
**Result: ❌ FAIL**

Returns tab shows: *"No return metrics available. Run a Quarter Close first."*
Quarter Close has been run successfully (T4) but the pipeline stub is not writing return metrics to the database. The returns write-back step appears to be a no-op or missing.

---

### T7 — Benchmark Comparison
**Result: 🚫 NOT IMPLEMENTED**

`GET /api/re/v2/funds/{fundId}/benchmarks/2026Q1` → 404
No benchmark route exists. UI tab or component for benchmarks was not observed.

---

### T8 — LP Summary / Gross-Net Bridge
**Result: ❌ FAIL**

LP Summary tab shows: *"No LP data available. Seed partners and capital ledger entries first."*
Seeding is blocked by the FK constraint on `re_partner` (T1). LP data cannot be populated until the seed issue is resolved.

---

### T9 — Waterfall Scenario Tab
**Result: ⚠️ PARTIAL**

**Working:**
- "Waterfall Scenario" tab is present and renders ✅ *(new in Run 4 — not present in Run 3)*
- Scenario dropdown renders (shows "No scenarios available") ✅

**Broken:**
- Scenario creation form silently fails — UI has no `name` field ❌
- API: POST `/api/re/v2/funds/{fundId}/scenarios` → 500: `column "model_id" does not exist` ❌ *(new schema regression)*
- No scenarios can be created ❌

---

### T10 — Waterfall Shadow Run
**Result: ✅ PASS**

"Run Waterfall (Shadow)" button in Run Center works.
Run `6178dee8` completed: *"Waterfall Shadow: success"*
"Budget Baseline (UW Version)" dropdown is new Wave 2 UI and renders correctly.

---

### T11 — Capital Stack / Debt Surveillance
**Result: 🚫 NOT IMPLEMENTED**

`GET /api/re/v2/funds/{fundId}/debt-covenants` → 404
No debt covenant route exists.

---

### T12 — Covenant Alert
**Result: 🚫 NOT IMPLEMENTED**

Dependent on T11. No covenant API means no alert logic can be tested.

---

### T13 — Sensitivity Matrix
**Result: 🚫 NOT IMPLEMENTED**

`GET /api/re/v2/funds/{fundId}/sensitivity` → 404
No sensitivity route exists.

---

### T14 — Sensitivity Monotonicity
**Result: 🚫 NOT IMPLEMENTED**

Dependent on T13. No data to test monotonicity against.

---

### T15 — End-to-End Flow
**Result: ⚠️ PARTIAL**

| Step | Status |
|---|---|
| Fund loads with 12 investments | ✅ |
| Investment detail data (NAV, IRR, MOIC) | ✅ |
| Quarter Close runs successfully | ✅ |
| Waterfall Shadow runs successfully | ✅ |
| Variance tab shows NOI data | ✅ |
| Returns tab populated after QC | ❌ |
| LP Summary populated | ❌ |
| Waterfall Scenario creation | ❌ |
| Console errors (app-level) | ✅ 0 errors |

---

## Wave 2 UI Elements Observed (New vs Run 3)

| Element | Location | Status |
|---|---|---|
| "Waterfall Scenario" tab | Fund detail page | ✅ Renders, data broken |
| "Run Waterfall (Shadow)" button | Run Center | ✅ Functional |
| "Budget Baseline (UW Version)" dropdown | Run Center | ✅ Renders |
| Sector Exposure widget | Investment detail page | ✅ Renders |

---

## Priority Fix List

1. **`re_partner` FK constraint** — `business_id` not in `businesses` table; blocks all LP data (T1, T8)
2. **Investment rollup endpoint** — `/investment-rollup/2026Q1` returns `[]`; blocks NAV column + T2, T5
3. **Returns write-back** — Quarter Close pipeline not writing return metrics; blocks T6
4. **Scenario `model_id` column** — DB schema missing column; blocks T9 scenario creation
5. **Cap Rate calculation** — 34.78% is clearly wrong; review NOI/value division
6. **Acquisition Date / Hold Period / Debt fields** — not populated in investment detail
7. **Implement Wave 2 backend routes** — benchmarks, debt covenants, sensitivity (T7, T11–T14)
