# REPE Data Coherence Audit Report

**Date**: 2026-03-15
**Scope**: Full-stack data coherence audit of the seeded REPE demo environment

---

## Executive Summary

Audited the REPE workspace across 10 data domains. Found 7 systemic issues requiring remediation, all addressed in this audit. Created 7 new SQL seed/schema files, 1 Python test suite, and 1 API endpoint.

**Before**: Generic operating financials, single-asset lease coverage, sparse pipeline (10 deals), broken capital ledger pro-rata, no fund quarter state, no integrity tests.

**After**: Size-aware financials scaled to property dimensions, 5 assets with lease stacks, 30 pipeline deals across 12+ metros, pro-rata capital ledger for 8 partners, fund/investment/asset quarter states seeded, 13 automated integrity checks, 5 summary views.

---

## Domain Audit Results

### 1. Fund Layer
**Status**: REMEDIATED

| Check | Before | After |
|---|---|---|
| Fund metadata | IGF-VII + 5 sample funds | Same (adequate) |
| Fund terms | IGF-VII only | Same (sample funds via API) |
| Waterfall definitions | IGF-VII only | IGF-VII + Granite Peak |
| Fund quarter state | Empty | 8 quarters for IGF-VII (2025Q1-2026Q4) |
| Fund metrics | Computed on-the-fly | Summary view + quarter state seeded |

**Files**: `358_re_partner_capital_seed.sql` (waterfall), `359_re_quarter_state_seed.sql` (quarter state)

### 2. Investment Layer
**Status**: REMEDIATED

| Check | Before | After |
|---|---|---|
| Investment count | 12+ under IGF-VII | Same |
| Investment quarter state | Python seed only (non-deterministic) | Deterministic SQL seed, 4+ quarters per deal |
| Capital tracking columns | Partially filled | Derived from asset rollups |

**Files**: `359_re_quarter_state_seed.sql`

### 3. Asset Layer
**Status**: REMEDIATED

| Check | Before | After |
|---|---|---|
| Property detail | All assets have repe_property_asset | Same |
| Square feet backfill | 4 values cycling (185K/220K/145K/310K) | Same (adequate for size scaling) |
| Asset quarter state | Meridian Tower only (349) | All IGF-VII assets, 4+ quarters each |
| Operating financials | Generic $2-5M base by row number | Size-aware: SF × sector rent PSF |

**Files**: `355_re_size_aware_financials_seed.sql`, `359_re_quarter_state_seed.sql`

### 4. Lease / Tenant / Space Layer
**Status**: REMEDIATED

| Check | Before | After |
|---|---|---|
| Assets with lease data | 1 (Meridian Office Tower) | 5 (+ multifamily, industrial, retail, senior housing) |
| Tenant diversity | 8 (office only) | 22+ across 4 sectors |
| Lease types | full_service, nnn, modified_gross | Same + sector-appropriate variations |
| Rent roll snapshots | 2 (2025Q4, 2026Q1) | 10 (2 per leased asset) |
| Lease events | 2 | 6+ |
| Lease documents | 2 | 10+ |

**Files**: `356_re_lease_expansion_seed.sql`

### 5. Debt Layer
**Status**: ADEQUATE (no changes needed)

| Check | Status |
|---|---|
| Loans per asset | Auto-created by 322 for all assets |
| Rate type variation | Fixed, varies by sector |
| LTV range | 50-64% (realistic) |
| Debt service | Quarterly, computed in rollup |
| Maturity dates | 2029 (staggered by month) |

### 6. Operating Financials
**Status**: REMEDIATED (critical fix)

| Check | Before | After |
|---|---|---|
| Revenue scaling | Flat $2-5.15M base, row-number variation only | SF × sector rent PSF (e.g., 200K SF office → $1.6M/qtr) |
| Sector differentiation | 321 varies opex ratio/cap rate by sector | Same + revenue now size-proportional |
| NOI consistency | revenue - opex = noi (maintained) | Same, verified by integrity check |
| NCF waterfall | noi - capex - debt_service - ti_lc - reserves | Same, verified by integrity check |
| Monthly NOI sync | acct_normalized_noi_monthly matched to rollup | Re-derived from size-aware rollup |
| Model engine sync | asset_revenue_schedule updated | Yes, updated in same seed |

**Files**: `355_re_size_aware_financials_seed.sql`

### 7. Valuation Layer
**Status**: ADEQUATE

| Check | Status |
|---|---|
| Implied value | NOI × 4 / cap_rate in quarter state |
| NAV | Value - Debt in quarter state |
| Cap rate range | 5.5% default, within [3%, 15%] bounds |
| Valuation method | 'cap_rate' tagged |

### 8. Investor / Partner Layer
**Status**: REMEDIATED (critical fix)

| Check | Before | After |
|---|---|---|
| Partners | 4 (Python seed, non-deterministic) | 8 (deterministic UUIDs) |
| Partner types | Unknown | GP, 5 LPs, 1 co-invest |
| Commitments per fund | IGF-VII only | IGF-VII (8 partners) + Granite Peak (7 partners) |
| Capital ledger entries | 1 partner per call/dist (LIMIT 1 bug) | All 8 partners, pro-rata by commitment % |
| Partner quarter metrics | Empty | 8 quarters × 8 partners for IGF-VII |
| Cashflow ledger | Empty | Operating CF entries per asset/quarter |

**Files**: `358_re_partner_capital_seed.sql`, `359_re_quarter_state_seed.sql`

### 9. Pipeline Layer
**Status**: REMEDIATED

| Check | Before | After |
|---|---|---|
| Deal count | 10 | 30 |
| Metro coverage | 7 (Denver, Dallas, Phoenix, Tampa, Atlanta, Austin, Centennial) | 12+ (added Chicago, Nashville, Charlotte, Seattle, San Diego, Miami, Boston, Raleigh, SLC) |
| Property type coverage | 7 | 12+ (added data_center, life_science, self_storage, manufactured_housing) |
| Status distribution | All stages represented | Better balance: ~10 sourced, 6 screening, 4 loi, 3 dd, 2 ic, 2 closing, 2 dead, 1 closed |
| Map pin coordinates | All valid lat/lon | All valid lat/lon |
| Properties per deal | 1-3 | 1-2 |
| Contacts/activities | Partial | All deals have contact + activity |

**Files**: `357_re_pipeline_expansion_seed.sql`

### 10. Documents Layer
**Status**: PARTIALLY ADDRESSED

| Check | Status |
|---|---|
| Lease documents | 10+ across 5 assets (seeded in 356) |
| Fund documents | Not seeded (placeholder acceptable) |
| Appraisals | Not seeded |
| IC memos | Not seeded |

Document metadata beyond leases is out of scope for this data coherence audit.

### 11. Models / Scenarios
**Status**: ADEQUATE (no changes needed)

| Check | Status |
|---|---|
| Seeded models | Morgan QA Downside + Base Case Stress Test (310) |
| Model scope | 8-12 assets per model |
| Assumption overrides | Fund-level exit cap, growth, hold period, discount rate |
| Model runs | Seeded in 312 with TVPI/IRR results |
| Waterfall scenarios | Seeded in 324 for IGF-VII |

### 12. Reports / Dashboards
**Status**: ADEQUATE

| Check | Status |
|---|---|
| Dashboard specs | AI-generated via Winston (March 11, 2026) |
| Statement definitions | IS/CF/BS/KPI lines seeded in 324 |
| Layout archetypes | Seeded in 345 |

---

## Broken/Missing Relationships Found

1. **CRITICAL**: Capital ledger `LIMIT 1` bug in `323_re_capital_events_seed.sql` — only 1 partner per fund received ledger entries. Fixed in `358`.
2. **CRITICAL**: Operating financials not size-aware — all assets received similar revenue regardless of square footage. Fixed in `355`.
3. **HIGH**: No fund quarter state snapshots — fund homepage metrics had no source data. Fixed in `359`.
4. **HIGH**: Only 1 asset had lease data — lease-dependent UI surfaces were empty for 15+ assets. Fixed in `356`.
5. **MEDIUM**: Pipeline too sparse (10 deals) — radar/map/filters felt empty. Fixed in `357`.
6. **MEDIUM**: No automated integrity tests — data quality regressions undetectable. Fixed in `362`.
7. **LOW**: No summary views — all rollups computed on-the-fly. Fixed in `361`.

---

## Files Created/Modified

| File | Type | Description |
|---|---|---|
| `repo-b/db/schema/355_re_size_aware_financials_seed.sql` | NEW | Size-aware operating financials |
| `repo-b/db/schema/356_re_lease_expansion_seed.sql` | NEW | Lease stacks for 4 additional assets |
| `repo-b/db/schema/357_re_pipeline_expansion_seed.sql` | NEW | 20 new pipeline deals (30 total) |
| `repo-b/db/schema/358_re_partner_capital_seed.sql` | NEW | Partners, capital ledger fix, waterfall |
| `repo-b/db/schema/359_re_quarter_state_seed.sql` | NEW | Fund/investment/asset quarter states |
| `repo-b/db/schema/361_re_summary_views.sql` | NEW | 5 summary SQL views |
| `repo-b/db/schema/362_re_integrity_checks.sql` | NEW | 13 SQL integrity check functions |
| `backend/tests/test_re_data_coherence.py` | NEW | Python test suite (mocked + live) |
| `repo-b/src/app/api/re/v2/integrity/coherence/route.ts` | NEW | Coherence API endpoint |
| `orchestration/repe_coherence_audit_report.md` | NEW | This report |
| `docs/tips.md` | MODIFIED | Added data coherence patterns |

---

## Automated Tests Added

13 SQL integrity check functions + master runner:
- `re_check_orphaned_assets`
- `re_check_assets_without_property_detail`
- `re_check_funds_without_investments`
- `re_check_pipeline_completeness`
- `re_check_noi_equals_rev_minus_opex`
- `re_check_ncf_waterfall`
- `re_check_occupancy_bounds`
- `re_check_cap_rate_bounds`
- `re_check_dpi_tvpi_consistency`
- `re_check_all_assets_have_rollup`
- `re_check_pipeline_density`
- `re_check_lease_coverage`
- `re_check_partner_ledger_coverage`
- `re_run_all_integrity_checks` (master runner)

Python test classes:
- `TestCoherenceChecksMocked` — contract tests without DB
- `TestCoherenceChecksLive` — parametrized against live DB
- `TestSeedCountValidation` — minimum entity count checks
- `TestFinancialReconciliation` — formula unit tests

API endpoint: `GET /api/re/v2/integrity/coherence`

---

## UI Pages Verified as Coherent (by data availability)

| Page | Data Source | Status |
|---|---|---|
| Fund list | `v_fund_portfolio_summary` + `re_fund_quarter_state` | Populated |
| Fund detail | `re_fund_quarter_state` + investments | Populated |
| Asset cockpit | `v_asset_operating_summary` + rollup | Populated |
| Asset leasing | `re_lease` + `re_asset_lease_summary_v` | Populated (5 assets) |
| Pipeline radar | `v_pipeline_stage_summary` + 30 deals | Populated |
| Pipeline map | `re_pipeline_property` with lat/lon | Populated |
| Investor list | `v_partner_portfolio_summary` | Populated |
| Investor detail | `re_capital_ledger_entry` per partner | Populated |
| Capital calls | `re_cash_event` CALL entries | Populated |
| Distributions | `re_cash_event` DIST entries | Populated |
| Waterfall | `re_waterfall_definition` + tiers | Populated (IGF-VII + Granite Peak) |
| Models | `re_model` + scope + overrides | Populated |
| Dashboards | Dashboard spec engine | Populated (Winston-generated) |

---

## Remaining Gaps (Intentionally Out of Scope)

1. **Sample funds (Granite Peak, etc.) lack investments/assets** — these are created via the TS seed script at runtime and depend on API availability. Not addressable via SQL seeds alone.
2. **Document metadata beyond leases** — appraisals, IC memos, market reports are not seeded. Would require a document upload/metadata service.
3. **Sustainability/ESG seed data** — exists in `288_re_sustainability_seed.sql` but not audited for coherence in this pass.
4. **Budget vs. actuals variance** — requires `uw_noi_budget_monthly` + `uw_version` seeding, covered separately by existing `286_re_budget_proforma_seed.sql`.
5. **Census overlay data** — `re_census_cache` and `pipeline_geography` PostGIS data is externally sourced; not part of demo seed.
