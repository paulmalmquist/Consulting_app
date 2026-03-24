# Debt Fund Reporting Hierarchy — Scoping Plan

**Date:** 2026-03-24
**Status:** Proposed
**Target personas:** Kayne Anderson, Rialto (dual equity + debt fund shops)

---

## Problem Statement

Winston already has significant debt plumbing: `re_loan` schema, covenant testing, debt surveillance service, watchlist events, amortization schedules, and MCP covenant tools. The fund schema even has `strategy: 'equity' | 'debt'` on `repe_fund`.

**But the fund detail page treats every fund the same.** The tab set is hardcoded: `Overview → Performance → Scenarios → Asset Variance → LP Summary`. These tabs are equity-native — NOI variance, occupancy, sector/geography exposure, sale scenarios. A debt fund doesn't think in NOI and occupancy; it thinks in UPB, weighted average coupon, DSCR coverage, maturity ladders, and covenant health.

The debt surveillance features exist as standalone services called from MCP tools and API routes, but they're not woven into the fund → investment → asset reporting hierarchy that drives the fund detail page. A Kayne Anderson PM switching between their equity fund and their debt fund should feel like two purpose-built experiences under one roof.

---

## What Already Exists (Don't Rebuild)

| Layer | What's built | Where |
|---|---|---|
| Schema | `repe_fund.strategy` enum ('equity'\|'debt'), `repe_deal.deal_type`, `repe_cmbs_asset` for debt-backed assets | `265_repe_object_model.sql` |
| Schema | `re_loan` table with UPB, rate, spread, maturity, amortization, IO period | `322_re_debt_seed.sql` |
| Schema | `re_loan_covenant_definition`, `re_loan_covenant_result_qtr`, `re_covenant_alert` | `319_covenant_alerts_and_notices.sql` |
| Service | `re_debt_surveillance.py` — `list_loans`, `list_covenants`, `get_covenant_results`, `run_covenant_tests` | `backend/app/services/` |
| Service | `re_rollup.py` — hierarchical aggregation (asset → deal → JV → fund) with `debt_balance` column | `backend/app/services/` |
| Service | `re_amortization.py` — amortization schedule computation | `backend/app/services/` |
| Routes | `/api/re/surveillance/compute`, `/api/re/surveillance/{asset_id}/{quarter}` | `backend/app/routes/` |
| MCP | `covenant_tools.py` — `_check_covenant_compliance`, `_list_covenant_alerts` | `backend/app/mcp/tools/` |
| Frontend | Fund detail page with `TABS` array, fetches `getFiLoans`, `getFiCovenantResults`, `getFiWatchlist` | `funds/[fundId]/page.tsx` |
| Types | `FiLoan`, `FiCovenantResult`, `FiWatchlistEvent`, `RepeFund.strategy` | `bos-api.ts` |

---

## What Needs to Change

### Phase 1: Strategy-Aware Tab Set (Fund Detail Page)

**File:** `repo-b/src/app/lab/env/[envId]/re/funds/[fundId]/page.tsx`

The `TABS` constant is currently static. Change it to be strategy-driven:

```typescript
// Current (equity-only)
const TABS = ["Overview", "Performance", "Scenarios", "Asset Variance", "LP Summary"] as const;

// Proposed
const EQUITY_TABS = ["Overview", "Performance", "Scenarios", "Asset Variance", "LP Summary"] as const;
const DEBT_TABS = ["Overview", "Loan Book", "Covenant Health", "Maturity & Rate", "LP Summary"] as const;

// Select at render time based on detail.strategy
const TABS = detail?.strategy === "debt" ? DEBT_TABS : EQUITY_TABS;
```

**Equity tabs stay exactly as they are.** No regression risk for existing equity fund demos.

### Phase 2: Debt Fund Overview Tab

Replace the equity-oriented Overview content when `strategy === 'debt'`. Instead of NOI waterfall, occupancy, and sector exposure, show:

| Metric Card | Source | Notes |
|---|---|---|
| Total UPB (Unpaid Principal Balance) | SUM of `re_loan.upb` for fund | Replaces Portfolio NAV as the headline number |
| Weighted Avg Coupon | Weighted by UPB across loans | Key debt fund KPI |
| Weighted Avg DSCR | From `re_loan_covenant_result_qtr` | Fund-level covenant health at a glance |
| Portfolio LTV | Debt balance / collateral value from rollup | Already computed in `re_fund_aggregation` |
| Loan Count | COUNT of `re_loan` for fund | Portfolio breadth |
| Watchlist Count | COUNT of active `re_covenant_alert` with severity ≥ warning | Risk signal |

**Portfolio composition charts** shift from sector/geography to:
- **Rate type mix** (fixed vs floating pie chart from `re_loan.rate_type`)
- **Collateral type mix** (property type distribution from linked assets)
- **Maturity profile** (bar chart of UPB by maturity year)

### Phase 3: Loan Book Tab (New)

A dedicated loan-level table — the core operating view for a debt fund PM.

| Column | Source |
|---|---|
| Loan Name | `re_loan.loan_name` |
| Borrower / Property | Linked `repe_asset.name` via `re_loan.asset_id` |
| UPB | `re_loan.upb` |
| Rate (type + value) | `re_loan.rate_type`, `re_loan.rate`, `re_loan.spread` |
| Maturity | `re_loan.maturity` |
| DSCR | Latest from `re_loan_covenant_result_qtr` |
| LTV | Latest from `re_loan_covenant_result_qtr` |
| Covenant Status | Badge: Pass / Watch / Breach from `re_covenant_alert` |

**Row click** → drill into investment detail page (which already exists at `investments/[investmentId]/page.tsx`).

**Backend work:** New endpoint `GET /api/re/funds/{fund_id}/loan-book` that joins `re_loan` → `re_loan_covenant_result_qtr` (latest quarter) → `re_covenant_alert` (active) and returns the composite rows. This is a read join, not a new service — it composes existing tables.

### Phase 4: Covenant Health Tab (New)

Fund-level covenant monitoring dashboard:

- **Summary strip:** X loans passing / Y on watch / Z in breach
- **Covenant results table:** Loan × covenant type matrix showing current quarter results with headroom and trend (improving/declining vs prior quarter)
- **Watchlist panel:** Active `re_covenant_alert` entries sorted by severity, with breach reason and headroom
- **Trend chart:** Fund-level weighted DSCR and LTV over last 4-8 quarters (from `re_loan_covenant_result_qtr` aggregated)

All data already exists in the schema. This tab is purely a composition/rendering task — `getFiCovenantResults` and `getFiWatchlist` are already called by the page but only lightly displayed today.

### Phase 5: Maturity & Rate Tab (New)

Interest rate risk and maturity management:

- **Maturity ladder:** Stacked bar chart showing UPB maturing by year, colored by rate type
- **Rate sensitivity table:** What happens to portfolio debt service at +50, +100, +150 bps (leverages `re_amortization.py` for recomputation)
- **IO expiration timeline:** Loans transitioning from IO to amortizing, with dates and payment impact
- **Refinancing exposure:** Loans maturing within 12/24 months as % of total UPB

**Backend work:** New endpoint `GET /api/re/funds/{fund_id}/rate-sensitivity` that takes basis point shocks as params and returns projected debt service changes per loan. The amortization service already handles the math — this endpoint orchestrates it across the fund's loan book.

### Phase 6: Investment Detail Page — Debt Mode

**File:** `repo-b/src/app/lab/env/[envId]/re/investments/[investmentId]/page.tsx`

When the parent fund is `strategy: 'debt'`, the investment detail should shift focus:

- **Header metrics:** UPB, coupon, maturity date, DSCR, LTV (instead of NOI, cap rate, occupancy)
- **Loan detail panel:** Full loan terms, amortization schedule (already built as `AmortizationViewer` component), payment history
- **Covenant panel:** All covenant definitions and quarterly test results for this specific loan
- **Collateral panel:** Linked property details — this is where occupancy and NOI still matter, but framed as "collateral performance" not "investment performance"

### Phase 7: Rollup Adjustments

**File:** `backend/app/services/re_fund_aggregation.py`

The fund quarter state already includes `weighted_ltv` and `weighted_dscr`. Extend it to also compute and store:

- `total_upb` — SUM of loan UPB
- `weighted_avg_coupon` — UPB-weighted average rate
- `watchlist_count` — COUNT of active covenant alerts
- `io_exposure_pct` — % of UPB in IO period

These are lightweight additions to the existing rollup pipeline. They get stored in `re_fund_quarter_state` (may need 4 new columns) and flow through to the frontend via the existing `getReV2FundQuarterState` API.

---

## What This Does NOT Include

- **No new lab environment.** This lives in the existing `re` (REPE) environment.
- **No new entity types.** Fund → Deal → Asset hierarchy stays. Loans are already entity-attached.
- **No schema rewrites.** All tables exist. We're adding ~4 columns to `re_fund_quarter_state` and 2 new read-only API endpoints.
- **No changes to equity fund behavior.** Gated entirely on `fund.strategy === 'debt'`.

---

## Implementation Sequence

| Order | Phase | Effort | Risk |
|---|---|---|---|
| 1 | Strategy-aware tab set | Small (1 file, ~30 lines) | Zero — equity path unchanged |
| 2 | Loan Book tab + backend endpoint | Medium (new tab component + 1 endpoint) | Low — joins existing tables |
| 3 | Debt fund Overview metrics | Medium (conditional rendering in Overview) | Low — parallel path to equity overview |
| 4 | Covenant Health tab | Medium (new tab component, existing APIs) | Low — data already fetched |
| 5 | Maturity & Rate tab + rate sensitivity endpoint | Medium-High (new tab + new endpoint + amort orchestration) | Medium — rate sensitivity math needs testing |
| 6 | Investment detail debt mode | Medium (conditional rendering) | Low — AmortizationViewer already exists |
| 7 | Rollup column additions | Small (4 columns + aggregation logic) | Low — additive migration |

**Total estimate:** ~3-4 focused build sessions. Phases 1-4 can demo well on their own. Phase 5 is the premium feature for rate-sensitive shops like Kayne Anderson.

---

## Demo Value

After Phase 4, you can run a Kayne Anderson / Rialto demo showing:

1. **Fund list** → Two funds: "KA Equity Fund IV" and "KA Debt Fund II" side by side
2. **Click equity fund** → Standard equity Overview with NOI, occupancy, sector exposure
3. **Click debt fund** → Completely different experience: UPB, coupon, DSCR, loan book, covenant health
4. **Same platform, same hierarchy, fund-type-aware reporting.** That's the pitch.

This directly counters Juniper Square's Tenor (which treats everything as a document pipeline) and Yardi (which requires separate debt modules). Winston does it in one unified hierarchy.

---

## Impact Statement

Phases ready to build immediately with no schema changes: Phases 1-4 (tab set, loan book, overview, covenant health)
New backend endpoints needed: 2 (loan-book composite, rate-sensitivity)
New schema columns: 4 (on existing `re_fund_quarter_state` table)
Equity fund regression risk: Zero — all changes gated on `strategy === 'debt'`
