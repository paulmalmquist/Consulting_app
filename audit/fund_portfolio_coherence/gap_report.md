# REPE Fund Portfolio Coherence — Current Gap Report

**Date:** 2026-04-30
**Author:** Claude (asset_operating_cf_run pipeline, Phase: portfolio coherence)
**Page under audit:** [/lab/env/{envId}/re](repo-b/src/app/lab/env/[envId]/re/page.tsx)
**Test environment:** Meridian — `env_id = a1b2c3d4-0001-0001-0003-000000000001`, `quarter = 2026Q2`

This file documents the diagnosis of Fund Portfolio incoherence **before any production code changes**. The implementation in subsequent phases must match the gap classifications listed here. Receipt for the diagnosis itself; not a fix.

---

## 1. Current authoritative state

### Tables / views considered canonical

| Table | Role | Key columns |
|---|---|---|
| [re_authoritative_fund_state_qtr](repo-b/db/schema/459_re_authoritative_snapshot_audit.sql) | Released fund snapshots — single source of truth per (fund, quarter) when `promotion_state='released'` | `env_id, business_id, fund_id, quarter, promotion_state, canonical_metrics, null_reasons` |
| [re_authoritative_fund_gross_to_net_qtr](repo-b/db/schema/459_re_authoritative_snapshot_audit.sql) | Gross→net bridge for a released fund snapshot | `audit_run_id, fund_id, quarter, bridge_items` |
| [repe_fund](repo-b/db/schema/265_repe_object_model.sql) | Canonical fund identity (name, vintage, strategy, status) | `fund_id, business_id, name, status, vintage_year` |
| [re_fund_quarter_state](repo-b/db/schema/278_fin_repe.sql) | **Legacy** quarter-state. Carries `weighted_dscr`/`weighted_ltv` not yet migrated into `canonical_metrics`. Bridge-only read. | `fund_id, quarter, scenario_id, weighted_dscr, weighted_ltv` |
| [app.env_business_bindings](repo-b/db/schema/266_repe_env_business_binding.sql) | Maps `env_id ⇄ business_id` (1:1 via `UNIQUE (env_id)`) | `env_id, business_id` |

No portfolio-level table exists. Portfolio metrics are computed at read time.

### env_id / period under audit

- `env_id = a1b2c3d4-0001-0001-0003-000000000001` (Meridian REPE workspace)
- `business_id` resolved by [app.env_business_bindings](repo-b/db/schema/266_repe_env_business_binding.sql)
- `quarter = 2026Q2`

### Included fund_ids (3, **investor-facing**)

| fund_id | Name | Status | Has released snapshot @ 2026Q2? |
|---|---|---|---|
| `a1b2c3d4-0001-0010-0001-000000000001` | Meridian Real Estate Fund III | active | yes |
| `a1b2c3d4-0002-0020-0001-000000000001` | Meridian Credit Opportunities Fund I | active | yes |
| `a1b2c3d4-0003-0030-0001-000000000001` | IGF VII | active | yes |

### Excluded / quarantined fund_ids (2, **must not appear in primary table**)

| fund_id | Name (after migration 463) | Status | Source migration | Why excluded |
|---|---|---|---|---|
| `d4560000-0003-0030-0004-000000000001` | `[QUARANTINED] Meridian Real Estate Fund III` | `closed` | [463_meridian_orphan_fund_dedup.sql](repo-b/db/schema/463_meridian_orphan_fund_dedup.sql) | Legacy orphan; vintage_year=2026 was wrong; 12 stale `re_fund_quarter_state` rows deleted by migration |
| `d4560000-0003-0030-0005-000000000001` | `[QUARANTINED] Meridian Credit Opportunities Fund I` | `closed` | [463_meridian_orphan_fund_dedup.sql](repo-b/db/schema/463_meridian_orphan_fund_dedup.sql) | Legacy orphan; `fund_type='open_end'` was wrong; 10 stale `re_fund_quarter_state` rows deleted |

### Released vs. draft snapshots detected at 2026Q2

| fund_id | Released? | Draft only? | Notes |
|---|---|---|---|
| `a1b2c3d4-0001-0010-0001-000000000001` (MREF III active) | yes | yes (also has draft from `asset_operating_cf_run`) | Mixed states tolerable; `DISTINCT ON (fund_id) ORDER BY released_at DESC` picks the released row |
| `a1b2c3d4-0002-0020-0001-000000000001` (MCOF I active) | yes | yes | Same |
| `a1b2c3d4-0003-0030-0001-000000000001` (IGF VII) | yes | yes | Same |
| `d4560000-0003-0030-0004-…` (MREF III orphan) | **no** | **no** | Has no authoritative state at all. Migration 463 left it in `repe_fund` only. |
| `d4560000-0003-0030-0005-…` (MCOF I orphan) | **no** | **no** | Same |

---

## 2. Metric lineage by page element

The page is at [repo-b/src/app/lab/env/[envId]/re/page.tsx](repo-b/src/app/lab/env/[envId]/re/page.tsx) and stitches three calls (lines 181, 185, 209). Each visible element is traced below.

| Element | Source endpoint | Service / SQL | Filters applied | Quarantined or unreleased included? | Pass / fail vs. contract |
|---|---|---|---|---|---|
| **Fund count (header)** | `GET /api/re/v2/environments/{envId}/portfolio-kpis` | [get_released_portfolio_kpis](backend/app/services/re_authoritative_snapshots.py:1040) reads `re_authoritative_fund_state_qtr WHERE promotion_state='released'` | released-only; scope-completeness gate (`partial`/`over_scope` excluded) | **No** — already correct | **PASS** |
| **Active assets (header)** | same as above | sums `canonical_metrics->>'asset_count'` over included rows | same | No | **PASS** |
| **Total commitments (header)** | same as above | sums `canonical_metrics->>'total_committed'` over included rows | same | No | **PASS** |
| **Portfolio NAV (header)** | same as above | sums `canonical_metrics->>'ending_nav'` over included rows | same | No | **PASS** |
| **Gross IRR (header)** | same as above | NAV-weighted: `Σ(gross_irr × ending_nav) / Σ(ending_nav)`; explicit denominator excludes funds with `null` IRR | same | No | **PASS** (math correct; UI does **not** label the method — see element #11) |
| **Net IRR (header)** | same as above | Same NAV-weighting math, separate denominator | same | No | **PASS** (math); **FAIL** (no method badge) |
| **WTD DSCR (header)** | same as above | reads `canonical_metrics->>'weighted_dscr'` | — | — | **FAIL** — `weighted_dscr` is **never written** into `canonical_metrics` by the snapshot writer (`grep weighted_dscr backend/app/services/re_authoritative_snapshots.py` returns no matches). Header silently shows `—`. |
| **Fund table rows** | `GET /api/re/v1/funds?env_id=…` → [repe.list_funds](backend/app/services/repe.py:23) | `SELECT * FROM repe_fund WHERE business_id = $1 AND status != 'archived'` | **only** archived filter | **YES** — quarantined orphans (status=`closed`, name `[QUARANTINED] …`) pass through | **FAIL** — primary source of incoherence |
| **Fund table per-row metrics** | `GET /api/re/v2/environments/{envId}/portfolio-states?quarter=…` → [get_portfolio_authoritative_states](backend/app/services/re_authoritative_snapshots.py) | `re_authoritative_fund_state_qtr WHERE promotion_state='released'`; one row per fund | released-only | No | per-fund metrics correct, but they are **mismatched** to a row set (from element #8) that includes quarantined funds → those rows render as `Unavailable` cells with `null_reason='authoritative_state_not_released'` |
| **Trend chart** | `GET /api/re/v2/environments/{envId}/fund-trend` (in [re_v2.py:347-368](backend/app/routes/re_v2.py)) | inline `f.name NOT ILIKE '%[QUARANTINED]%'` filter | quarantined excluded by name pattern; **no** released-snapshot gate | partial — quarantined excluded but draft-only funds still present | **PARTIAL FAIL** — series count can disagree with table row count and with header fund count. Filed as follow-up per plan. |
| **Signal strip / data alerts** | computed in [DataIntegrityBanner.tsx](repo-b/src/components/repe/portfolio/DataIntegrityBanner.tsx:126-139) client-side | header NAV vs. `Σ(row.portfolio_nav)`, with `0`-substitution for `null` rows | none | quarantined rows contribute `0` to row sum | **FAIL** — fires correctly that something is wrong, but cannot identify what; alert message names the symptom not the cause |
| **IRR method label** | — | not rendered today | — | — | **FAIL** — page presents NAV-weighted-average as if it were portfolio IRR. Reviewer's lock-in: `[NAV-weighted, n=N]` badge required. |

---

## 3. Reconciliation status

All numbers below correspond to the live state at `env_id=a1b2c3d4-…0003-…`, `quarter=2026Q2`. Approximate; the SQL receipt in Phase 5 produces exact figures.

| Reconciliation | Header value | Table-derived value | Reconciles? |
|---|---|---|---|
| Header fund count vs. main table row count | `3` | `5` (3 active + 2 quarantined) | **NO** |
| Header NAV vs. Σ(displayed table NAV) | ≈ $1.351B (released-only sum) | quarantined rows show `Unavailable` → contribute `0` to row sum if naively summed; ≈ $1.351B if Unavailable rows are skipped | NO when `null→0` coercion is used (currently); **YES** if Unavailable rows excluded — but the page's row count is still 5, so the Σ still has 5 contributors |
| Header commitments vs. Σ(table commitments) | sum over 3 released funds | sum over 5 funds with quarantined contributing `null` | NO |
| Gross IRR (header) vs. fund-level IRRs | ≈ 47.9% (NAV-weighted) | Table shows IGF VII alone at 53.4%; arithmetic average of 3 funds ≠ 47.9% | YES (NAV-weighted is correct), but the **method is invisible to the user** |
| Net IRR (header) vs. fund-level IRRs | ≈ 45.4% (NAV-weighted) | Same | YES (math); **FAIL** (no badge) |
| Chart fund set vs. table fund set | 3 series (chart filters `[QUARANTINED]`) | 5 rows | **NO** |
| Data alert count vs. excluded records count | "2 funds without released snapshot" alert | 2 quarantined rows visible in primary table | the alert correctly counts `2`, but those `2` are still rendered as primary table rows. **The alert is mixing operational diagnostics with investor-facing display.** |

---

## 4. Gap classification

Each mismatch is classified as one of `DATA_GAP | SELECTOR_GAP | API_GAP | FRONTEND_GAP | TEST_GAP | SEMANTIC_GAP`.

| # | Mismatch | Classification | Root cause |
|---|---|---|---|
| 1 | Quarantined funds appear in primary table | **API_GAP** | `GET /api/re/v1/funds` → [repe.list_funds](backend/app/services/repe.py:23) filters only by `status != 'archived'`. Migration 463 quarantines orphans with `status='closed'` + `[QUARANTINED]` name prefix; this endpoint does not honor either signal. |
| 2 | Header fund count ≠ table row count | **API_GAP** (downstream of #1) | Two different endpoints (`/api/re/v1/funds` and `/api/re/v2/environments/{envId}/portfolio-kpis`) define "fund" differently. There is no single canonical selector. |
| 3 | Page assembles three independent payloads client-side | **FRONTEND_GAP** | [page.tsx](repo-b/src/app/lab/env/[envId]/re/page.tsx) calls `listReV1Funds`, `getPortfolioAuthoritativeStates`, and `getReV2EnvironmentPortfolioKpis` and merges them in React state. Any mismatch between sources produces an incoherent UI; no central reconciliation. |
| 4 | NAV reconciliation alert fires on mismatched row sets | **SEMANTIC_GAP** | The alert in `DataIntegrityBanner.tsx` is correct that something is wrong, but its message blames "NAV computation" when the actual cause is row-set divergence. The alert was authored without a single canonical contract to compare against. |
| 5 | `weighted_dscr` always blank | **SEMANTIC_GAP** | The metric is defined in the legacy `re_fund_quarter_state` table but the snapshot writer at `re_authoritative_snapshots.py` does not project it into `canonical_metrics`. The header reads from `canonical_metrics`, so it always sees `null`. |
| 6 | Header IRR presented as a single number with no method | **SEMANTIC_GAP** | The header label is `Gross IRR` / `Net IRR`. It is, in fact, the NAV-weighted average of per-fund IRRs (math is correct in [get_released_portfolio_kpis](backend/app/services/re_authoritative_snapshots.py:1040)). But "portfolio IRR" colloquially implies a portfolio-level cashflow XIRR, which this is not. The number disagrees visibly with any table-row IRR; without a method label this looks like a bug. |
| 7 | Trend chart fund set diverges from table fund set | **SELECTOR_GAP** | Three different inline definitions of "included fund" exist: chart filters `name NOT ILIKE '%[QUARANTINED]%'` ([re_v2.py:347](backend/app/routes/re_v2.py)); reconciliation does the same ([re_reconciliation.py:559](backend/app/services/re_reconciliation.py)); header KPI uses `promotion_state='released'`. None reference a single source. |
| 8 | No backend test asserts header.fund_count == primary_table.row_count | **TEST_GAP** | [re-fund-null-state.spec.ts](repo-b/tests/repe/re-fund-null-state.spec.ts) covers the fail-closed Unavailable rendering rule; [test_re_env_portfolio.py](backend/tests/test_re_env_portfolio.py) tests `get_portfolio_kpis` in isolation. No test makes the cross-endpoint coherence assertion. |

**Dominant gap:** `API_GAP` (#1, #2). Fixing the endpoint contract is the keystone — once the page consumes one canonical payload that defines "included" once, gaps #3, #4, #7 disappear by construction. `SEMANTIC_GAP` on #5 (DSCR) and #6 (IRR method) require additive fixes (legacy bridge + method badge). `TEST_GAP` is filled by the new Playwright spec.

---

## 5. Progress ledger — what already works

Genuine progress made in earlier waves. The plan should not duplicate this work.

| Working today | File / artifact | Why it counts |
|---|---|---|
| Released authoritative snapshots populate correctly for the 3 active Meridian funds at 2026Q2 | [verification/runners/asset_operating_cf_run.py](verification/runners/asset_operating_cf_run.py), `re_authoritative_fund_state_qtr` rows | The producer side of the trust chain works |
| Quarantined orphan funds identified and tagged in the database | [463_meridian_orphan_fund_dedup.sql](repo-b/db/schema/463_meridian_orphan_fund_dedup.sql) | The signal exists; the consumer side (`/api/re/v1/funds`) just doesn't honor it |
| `get_released_portfolio_kpis` correctly NAV-weights IRR with explicit denominator and excludes scope-incomplete funds | [backend/app/services/re_authoritative_snapshots.py:1040-1199](backend/app/services/re_authoritative_snapshots.py) | The weighted-average math is sound — the new selector reuses it; we don't reinvent |
| Per-cell `Unavailable` rendering with `null_reason` works | [PortfolioFundTable.tsx](repo-b/src/components/repe/portfolio/PortfolioFundTable.tsx), [useAuthoritativeState](repo-b/src/hooks/useAuthoritativeState.ts) | The UI primitive exists; we just stop putting quarantined rows in front of it |
| `re-fund-null-state.spec.ts` enforces no-fake-zero rendering | [repo-b/tests/repe/re-fund-null-state.spec.ts](repo-b/tests/repe/re-fund-null-state.spec.ts) | Existing protection survives the refactor unchanged |
| State-lock invariant lint catches legacy reads on KPI surfaces | [verification/lint/no_legacy_repe_reads.py](verification/lint/no_legacy_repe_reads.py) | Will catch any regression in the new selector that bypasses authoritative state |
| `PLAYWRIGHT_BYPASS_AUTH` guardrail locked at the layout level | [repo-b/src/app/lab/env/[envId]/re/layout.test.tsx](repo-b/src/app/lab/env/[envId]/re/layout.test.tsx) | Test harness cannot accidentally weaken production behavior |
| Gross-to-net audit page already proves the per-fund authoritative read path works end-to-end | [audit/ui_gross_to_net/](audit/ui_gross_to_net/) | The single-fund audit pattern is the model the new portfolio page follows |

---

## 6. Actionable next fix

The implementation phases below correspond to the items in the approved plan. Each row names: file/table/function implicated, smallest safe fix, test that proves it, receipt path.

| # | Gap | File implicated | Smallest safe fix | Test that proves it | Receipt path |
|---|---|---|---|---|---|
| 1 | API_GAP — quarantined funds in primary table | [backend/app/services/repe.py:23](backend/app/services/repe.py) (`list_funds`) — but the **page** is the right place to fix, not this generic listing endpoint | Page consumes a new canonical payload from `/api/re/v2/environments/{envId}/fund-portfolio` instead of `/api/re/v1/funds`. `repe.list_funds` is left alone (other callers exist; it's a generic listing) | Backend test 1 (`excludes_quarantined`) | `audit/fund_portfolio_coherence/sql_receipt.sql` |
| 2 | API_GAP — fund count != row count | [backend/app/services/re_fund_portfolio_coherent.py](backend/app/services/re_fund_portfolio_coherent.py) (NEW) | Single payload returns `portfolio_summary.fund_count` and `fund_rows[]` from one query against `re_fund_portfolio_included_v` | Backend test 4 (`fund_count_matches_rows`); Playwright assertion 1 | `selector_receipt.md` |
| 3 | FRONTEND_GAP — three-call stitch | [repo-b/src/app/lab/env/[envId]/re/page.tsx](repo-b/src/app/lab/env/[envId]/re/page.tsx) lines 181, 185, 209 | Replace three calls with one `getFundPortfolioCoherent()` | Existing typecheck + Playwright spec passes | `selector_receipt.md` |
| 4 | SEMANTIC_GAP — alert message blames symptom | [DataIntegrityBanner.tsx](repo-b/src/components/repe/portfolio/DataIntegrityBanner.tsx) | Drop the inline NAV-mismatch check; surface server-side `nav_reconciliation` strip with `Δ` and `✓ Reconciled` status | Backend test 5 (`nav_reconciles`); Playwright assertion 4 | `screenshots/after_kpi_reconciliation.png` |
| 5 | SEMANTIC_GAP — DSCR always blank | [backend/app/services/re_fund_portfolio_coherent.py](backend/app/services/re_fund_portfolio_coherent.py) | Bridge `weighted_dscr` from `re_fund_quarter_state` with explicit `provenance: "legacy_quarter_state"`; surface in UI tooltip | Backend test 9 (`weighted_dscr_provenance`) | `selector_receipt.md` (provenance section) |
| 6 | SEMANTIC_GAP — IRR method invisible | [PortfolioKpiBar.tsx](repo-b/src/components/repe/portfolio/PortfolioKpiBar.tsx) | Render `[NAV-weighted, n=N]` badge from `payload.provenance.irr_method` | Backend test 11 (`irr_method_label_locked`); Playwright assertion 5 | `screenshots/after_kpi_reconciliation.png` |
| 7 | SELECTOR_GAP — three definitions of included | [repo-b/db/schema/535_re_fund_portfolio_included_view.sql](repo-b/db/schema/535_re_fund_portfolio_included_view.sql) (NEW) | Postgres view as single source of truth for "included". Page consumes it now; `fund-trend` and `re_reconciliation.py` migrate in follow-up. | View definition + plan-recorded follow-up | `sql_receipt.sql` (view DDL + sample queries) |
| 8 | TEST_GAP — no cross-endpoint coherence test | [repo-b/tests/repe/re-fund-portfolio-coherence.spec.ts](repo-b/tests/repe/re-fund-portfolio-coherence.spec.ts) (NEW) | Playwright spec asserts `header.fundCount == table.rowCount`, no `[QUARANTINED]` in primary table, diagnostics panel populated, NAV reconciles, IRR method badge present | Spec passes 6/6 | `playwright_results.txt` |

### Out of scope (filed as follow-ups)

- Migrating [re_v2.py:347](backend/app/routes/re_v2.py) `/fund-trend` and [re_reconciliation.py:559](backend/app/services/re_reconciliation.py) to consume `re_fund_portfolio_included_v`. Until then the chart-vs-table count assertion is left out of the Playwright spec.
- Writing `weighted_dscr` into `canonical_metrics` during snapshot promotion. Bridge from legacy table is the transitional read.
- A true portfolio-level cashflow XIRR (vs. NAV-weighted average of fund IRRs). The NAV-weighted number stays, but it is now **labeled** `[NAV-weighted, n=N]` so it cannot be miscalled "portfolio IRR".

---

## Conclusion

The Fund Portfolio incoherence is dominated by an **API_GAP**: a single endpoint (`/api/re/v1/funds`) returns rows the rest of the system has already excluded. The producer side of the trust chain (released authoritative snapshots, scope-completeness gates, NAV-weighted IRR math) is sound — earlier waves did real work. What is missing is a single canonical *consumer* contract for the page. The plan introduces that contract as a Postgres view + a thin coherent-payload service, refactors the page to consume only it, and locks the contract with backend + Playwright tests. Quarantined rows move to a clearly-labeled diagnostics panel; the IRR method becomes visible; DSCR gains explicit provenance.
