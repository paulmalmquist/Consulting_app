# Winston — Investment Fund NAV Fix

## The Problem

The Investments table on the fund Overview tab shows "—" for every row in the **Fund NAV** column.

## Root Cause (confirmed via code + DB inspection)

The data exists. All 12 investments have `nav` populated in `re_investment_quarter_state`. The bug is a **field name mismatch** between the API and the type:

- The type `ReV2FundInvestmentRollupRow` (bos-api.ts line 3189) has: `fund_nav_contribution?: number`
- The frontend reads: `rollup?.fund_nav_contribution` (page.tsx line 549)
- The investments API SELECT (investments/route.ts lines 145-147) includes `iqs.gross_irr`, `iqs.net_irr`, `iqs.equity_multiple` from `re_investment_quarter_state` — but **never selects `iqs.nav`** and never aliases anything to `fund_nav_contribution`
- The `nav` field the API does return (line 126) comes from `SUM(qs.nav)` of `re_asset_quarter_state`, not from the investment-level state

## The Fix

**File**: `src/app/api/re/v2/investments/route.ts`

1. In the SELECT block (around line 147), add alongside the other `iqs.*` fields:
   ```sql
   iqs.nav::float8 AS fund_nav_contribution,
   ```

2. In the GROUP BY clause (around line 159), add:
   ```sql
   iqs.nav
   ```

That's it. No data seeding needed — the values are already in the DB.

## Validation

After deploy, the Investments table on the Overview tab should show dollar values (e.g. $38.5M, $52.0M) in the Fund NAV column instead of "—" for every row.
