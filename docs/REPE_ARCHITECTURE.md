# REPE Platform Architecture — Canonical Snapshot/Rollup Refactor

**Last updated:** 2026-04-03  
**Status:** Phase 6 (Immediate Fixes) complete. Phases 2–5 canonical infra in progress.

---

## What Was Broken

### 1. NAV Collapse to Zero
**Root cause:** `re_quarter_close._compute_asset_state()` set `asset_value = cost_basis` when there was no operating data. If `repe_property_asset.current_noi` was NULL AND `repe_asset.cost_basis` was NULL, both resolved to `Decimal("0")`. This cascaded:
```
asset_value = 0 → nav = 0 → investment rollup nav = 0 → fund portfolio_nav = 0
```
One asset without operating data in a fund could report the entire fund's NAV as zero.

**File:** `backend/app/services/re_quarter_close.py`  
**Lines:** 507–515 (original), now replaced with full fallback chain.

### 2. False "Disposed" Count / False Asset Status
**Root cause A:** `re_env_portfolio.get_portfolio_kpis()` used `COALESCE(a.asset_status, 'active')` — but the SQL also filtered on `IN ('active', 'held')`, which excluded legacy assets where `asset_status IS NULL` for anything other than those two values. Meanwhile the v1 `getFundBaseScenario` route **did not exist**, so the fund page silently failed to retrieve asset classifications.

**Root cause B:** No explicit `re_asset_realization` check was wired into the asset status classification. The `BaseScenarioAssetContribution` TypeScript type expected `status_category: "active" | "disposed" | "pipeline"` but no route returned it.

**Files:** `backend/app/services/re_env_portfolio.py`, `backend/app/routes/re_v2.py`

### 3. Hard-Coded 5.5% Cap Rate in Summary Views
**Root cause:** `v_fund_portfolio_summary` and `v_asset_operating_summary` (schema 361) computed `gross_asset_value` and `total_nav` via:
```sql
SUM(CASE WHEN lq.noi > 0 THEN lq.noi * 4 / 0.055 ELSE 0 END)
```
This (a) ignored all assumption sets and scenario overrides, (b) produced a different NAV from the v2 quarter-close path, and (c) silently zeroed assets with NOI = 0.

**File:** `repo-b/db/schema/361_re_summary_views.sql`

### 4. N+1 Loan Query
**Root cause:** `re_fund_aggregation.compute()` fired one SQL query per asset to fetch loan maturity dates instead of a single batch query.

**File:** `backend/app/services/re_fund_aggregation.py`, lines 71–83.

### 5. IRR Not Written to `re_fund_quarter_state`
**Root cause:** `re_rollup.rollup_fund()` did not populate `gross_irr` / `net_irr` on `re_fund_quarter_state`. The XIRR engine wrote to `re_fund_quarter_metrics` (a separate table). The front-end read `re_fund_quarter_state` and always got NULL for IRR.

**File:** `backend/app/services/re_rollup.py`, migration `438_repe_canonical_snapshot.sql`

### 6. NULL NAV Coerced to Zero in Rollup
**Root cause:** `re_rollup.rollup_investment()` and `rollup_fund()` used `Decimal(s["nav"] or 0)` — the `or 0` coerced NULL to zero, meaning unvalued assets contributed zero to the fund NAV rather than being excluded.

**File:** `backend/app/services/re_rollup.py`

### 7. Missing `/funds/{fund_id}/base-scenario` Route
**Root cause:** `bos-api.ts` called `GET /api/re/v2/funds/{fund_id}/base-scenario` but no handler existed. The call was caught by `.catch(() => null)` so it silently failed. The fund detail page fell back through a chain of nullable fields and showed misleading metrics.

**File:** `backend/app/routes/re_v2.py`

---

## Target Architecture

```
Raw inputs
  re_asset_operating_qtr     ─┐
  re_asset_acct_quarter_rollup├─→ re_quarter_close._compute_asset_state()
  acct_normalized_noi_monthly ┘          │
  repe_property_asset.current_noi        │
                                         ▼
                               re_asset_quarter_state    ← CANONICAL SNAPSHOT
                               (grain: asset_id × quarter × scenario_id)
                               Columns: noi, revenue, opex, asset_value, nav,
                                        occupancy, debt_balance, ltv, dscr,
                                        value_source, value_reason,
                                        occupancy_reason, debt_reason, noi_reason
                                         │
                                         ▼
                               re_jv_quarter_state
                                         │
                                         ▼
                               re_investment_quarter_state
                                         │
                                         ▼
                               re_fund_quarter_state     ← CANONICAL FUND ROLLUP
                               (portfolio_nav, tvpi, dpi, rvpi, gross_irr, net_irr)
                                         │
                               ┌─────────┴──────────┐
                               ▼                     ▼
                       re_fund_quarter_metrics   re_time_series (future)
                       (XIRR-based IRR)         (dense quarter series)
                                         │
                                         ▼
                               API layer (re_v2.py)
                               /portfolio-kpis
                               /portfolio-readiness
                               /funds/{id}/base-scenario
                               /funds/{id}/quarter-state/{q}
                               /funds/{id}/investment-rollup/{q}
                                         │
                                         ▼
                               UI (page.tsx, overviewNarrative.ts)
                               Reads trusted surfaces only
                               Shows readiness panel instead of silent blanks
```

---

## What Was Changed

### Backend Services

| File | Change |
|---|---|
| `backend/app/services/re_quarter_close.py` | Full valuation fallback chain (cap_rate → cost_basis → prior_period → NULL). NULL `asset_value` and `nav` propagated as NULL, not zero. Null-reason codes added (`value_reason`, `occupancy_reason`, `debt_reason`, `noi_reason`). `_q()` helper now safely handles None. |
| `backend/app/services/re_rollup.py` | NULL-safe NAV aggregation in `rollup_investment()` and `rollup_fund()`. `Decimal(s["nav"] or 0)` replaced with explicit None check — NULL NAV assets excluded from sum, not zeroed. |
| `backend/app/services/re_env_portfolio.py` | Fixed active-asset count (`COALESCE(a.asset_status,'active') IN ('active','held')` → explicit NULL-or-active filter). Added `get_portfolio_readiness()` function returning completeness counts per-fund. |
| `backend/app/services/re_fund_aggregation.py` | N+1 loan query (per-asset maturity lookups) replaced with single `ANY(%s::uuid[])` batch query. |

### Backend Routes

| File | Change |
|---|---|
| `backend/app/routes/re_v2.py` | Added `GET /environments/{env_id}/portfolio-readiness` → calls `re_env_portfolio.get_portfolio_readiness()`. Added `GET /funds/{fund_id}/base-scenario` → per-asset status classification using explicit `asset_status` + `re_asset_realization`, never inferred from missing valuation. |

### Database / Schema

| File | Change |
|---|---|
| `repo-b/db/schema/361_re_summary_views.sql` | `v_fund_portfolio_summary` rewritten: canonical source is `re_asset_quarter_state` (not `re_asset_acct_quarter_rollup`). Hard-coded 5.5% cap rate removed. NULL-safe NAV sum. Active/disposed/pipeline counts. `v_asset_operating_summary` similarly rewritten with canonical source and canonical LTV. |
| `repo-b/db/schema/438_repe_canonical_snapshot.sql` | Adds `value_reason`, `occupancy_reason`, `debt_reason`, `noi_reason` columns to `re_asset_quarter_state`. Backfills `repe_asset.asset_status` for legacy NULL rows. Copies `gross_irr`/`net_irr` from `re_fund_quarter_metrics` into `re_fund_quarter_state`. Creates `re_asset_status_history` audit table. |
| `repo-b/db/schema/439_repe_canonical_seed.sql` | Deterministic snapshot rows for 15 existing seed assets × 6 quarters. Proves the rollup chain end-to-end without requiring a manual quarter-close. Pipeline assets intentionally have no snapshot rows. |

### Tests

| File | Coverage |
|---|---|
| `backend/tests/test_repe_canonical_rollup.py` | 25 tests: NAV fallback chain, fund rollup NULL-safety, asset status classification (never inferred from missing valuation), readiness score arithmetic, occupancy rules by asset type, LTV/DSCR null semantics, seed reconciliation receipt. |

---

## What Remains Deferred

1. **UI updates** — The fund portfolio page and fund overview page still fire 12+ separate fetch calls. A consolidated `/funds/{fund_id}/overview/{quarter}` endpoint needs to be built (combining quarter-state + investment-rollup + capital-timeline) and the page needs to be refactored to use it.

2. **Readiness panel UI** — The new `GET /portfolio-readiness` endpoint exists but is not yet wired into the frontend. The fund portfolio page should render a readiness panel using this data instead of silent blanks.

3. **Null-reason display in UI** — `value_reason`, `occupancy_reason`, `debt_reason` are now stored and returned via the base-scenario route but the UI still renders `"—"` without context. Display states like "Pending valuation" / "No debt data" / "Not applicable" need to be implemented in the asset grid and KPI strip components.

4. **Time series endpoint** — `GET /portfolio-timeseries` is not yet implemented. Charts currently derive historical values by looping through individual asset-state records per quarter. A dedicated time-series endpoint backed by a dense-quarter view should be built.

5. **IRR propagation on new quarter-close runs** — The backfill in migration 438 copies existing values. The `re_rollup.rollup_fund()` function still does not write `gross_irr`/`net_irr` in real time. An UPDATE step in `run_quarter_close._execute_quarter_close()` (after step 8) is needed to keep these columns current on each close.

6. **Old v1 path deprecation** — `re_fund_aggregation.py`, `re_valuation.py`, `re_asset_financial_state` and `re_fund_summary` tables are still referenced by some v1 endpoints. These should be marked deprecated and eventually removed once the fund detail page is fully migrated to v2 read paths.

---

## How to Validate Locally

1. Run migrations `438` and `439`:
   ```bash
   cd repo-b && node db/schema/apply.js 438
   node db/schema/apply.js 439
   ```

2. Verify snapshot rows exist:
   ```sql
   SELECT asset_id, quarter, asset_value, nav, value_source
   FROM re_asset_quarter_state
   WHERE scenario_id IS NULL
   ORDER BY quarter DESC
   LIMIT 20;
   ```
   Should return 90 rows (15 assets × 6 quarters) with non-null `asset_value` and `nav`.

3. Check active asset count (should not be zero):
   ```sql
   SELECT COUNT(*) FROM repe_asset
   WHERE asset_status IS NULL OR asset_status IN ('active','held','lease_up','operating');
   ```

4. Check fund NAV:
   ```sql
   SELECT fund_id, portfolio_nav FROM re_fund_quarter_state
   ORDER BY created_at DESC LIMIT 10;
   ```
   If no quarter-close has been run, call the quarter-close endpoint for each fund with `quarter=2025Q4`.

5. Hit the readiness endpoint:
   ```
   GET /api/re/v2/environments/{env_id}/portfolio-readiness?quarter=2025Q4
   ```
   Should return completeness counts for all active assets.

6. Run the new tests:
   ```bash
   cd backend && python -m pytest tests/test_repe_canonical_rollup.py -v
   ```
   Expected: 25 passed.

---

## Non-Negotiable Rules (enforce in all future code)

- **Never infer "disposed" from missing valuation.** Disposal requires `asset_status IN ('disposed','realized','written_off')` OR a row in `re_asset_realization`.
- **Never coerce NULL NAV to zero.** Use `if raw is not None: agg_nav += Decimal(raw)`.
- **Never hard-code a cap rate** in SQL views or services. Cap rates come from assumption sets or asset-level overrides.
- **Never mix pipeline assets into active NAV rollups.** Filter by `asset_status != 'pipeline'` explicitly.
- **Always surface null-reason codes** when a metric is unavailable. Store in `value_reason`, `occupancy_reason`, `debt_reason`, `noi_reason` columns.
- **Fund KPIs must come from `re_fund_quarter_state`**, not from ad-hoc joins on raw tables.
