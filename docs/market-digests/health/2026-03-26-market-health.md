# Market Intelligence Environment Health Report

**Date:** 2026-03-26
**Environment:** c3d8f2a1-7b4e-4f9c-a6d2-e8f1b3c5d7a9
**Industry:** market_rotation (financial_markets)
**URL:** https://www.paulmalmquist.com/lab/env/c3d8f2a1-7b4e-4f9c-a6d2-e8f1b3c5d7a9/markets

## Overall Status: DEGRADED

The environment page loads and renders its layout correctly, but a persistent **"No database connection"** banner prevents all sections from populating with live data. The UI shell is intact; the data layer is broken.

## Pages Checked

| Section | Status | Notes |
|---|---|---|
| Overview tab | FAIL | KPI cards all show dashes/zeroes (Regime: —, Net P&L: +$0, Top Signal: —, Equity: $—, Win Rate: 0%). Equity Curve chart empty. Top Signals widget empty. Open Positions table shows headers only. |
| Signals tab | FAIL | Table headers render (Asset Class, Category, Strength, Direction, Status, Source) but zero data rows. Category filter dropdown present but no data to filter. |
| Hypotheses tab | FAIL | Completely blank content area below the tab bar. |
| Positions tab | FAIL | Table headers render (Ticker, Direction, Entry, Current, P&L, Return %, Status) but zero data rows. |
| Performance tab | FAIL | Stats cards render with zeroed values (Total Trades: 0, Win Rate: 0%, Profit Factor: —, Avg Win/Loss: $0/$0, Total P&L: $0). Equity Curve chart empty. |
| Research tab | NOT CHECKED | Skipped (root cause identified as DB connection). |
| Watchlist tab | NOT CHECKED | Skipped (root cause identified as DB connection). |
| Sidebar nav | PASS | All sidebar links render correctly: Environments, Pipeline, Uploads, Chat, Metrics, Market Intelligence, AI, Audit, AI Audit. |

## Data Integrity: DB vs UI

| Metric | Supabase (DB) | UI Display | Match? |
|---|---|---|---|
| Active market segments | 34 | 0 (not displayed) | NO |
| Intel briefs (last 7 days) | 16 (4/day for 4 days: Mar 23-26) | 0 | NO |
| Trading feature cards | 33 total (28 identified, 5 spec_ready) | 0 | NO |

The database has healthy data: 34 active segments, 16 recent intel briefs running consistently at 4/day, and 33 feature cards in the pipeline. The UI displays none of this because of the broken database connection.

## Bugs Found

### BUG-1 (P0): No database connection
- **Severity:** Critical
- **Description:** Orange banner reads "No database connection" on every tab. This is the root cause of all empty sections.
- **Impact:** 100% of dashboard data is missing. The environment is non-functional for any market intelligence use case.
- **Likely cause:** The environment's Supabase connection string or API key may not be configured, or the client-side DB adapter is failing to initialize.

### BUG-2 (P2): Hypotheses tab has no skeleton/empty state
- **Severity:** Low
- **Description:** Unlike Signals and Positions (which show table headers), the Hypotheses tab renders a completely blank area with no table structure, placeholder text, or empty state message.
- **Impact:** UX inconsistency. Users see nothing and have no indication of what this tab should contain.

### BUG-3 (P2): KPI cards show misleading zeroes instead of error state
- **Severity:** Low
- **Description:** When the DB is disconnected, the Overview KPI bar shows "Net P&L: +$0", "Equity: $—", "Win Rate: 0%" instead of a clear error or "N/A" state. This could mislead users into thinking there is simply no data rather than a system failure.
- **Impact:** Misleading UI state when the data layer is down.

## Missing Features / Broken Interactions

1. **No dedicated Segment Grid view** - The task spec references checking all 34 segments in a segment grid, but no segment grid is visible on any tab. This may not be built yet, or it may be behind the DB connection wall.
2. **No Intelligence Briefs section** - Despite 16 briefs in the DB, no dedicated briefs panel exists on the visible tabs. May be part of the Research tab (not checked) or not yet built.
3. **No Feature Card Pipeline view** - 33 cards exist in DB but no pipeline/kanban view is visible. May not be built yet.
4. **No Cross-Vertical Alerts section** - Not visible on any checked tab.
5. **No charts render** - Equity Curve placeholder exists but shows empty dashed-line box with no axes or labels.

## Priority Items for Tomorrow's Planning/Coding

1. **P0 - Fix database connection** - Investigate why the environment reports "No database connection." Check if the env config in `lab_environments` table has valid Supabase credentials, and whether the client-side adapter (likely in the `/lab/env/[envId]/markets` page component) is correctly reading them. This blocks all other work.
2. **P1 - Verify data rendering after DB fix** - Once the connection is restored, rerun this health check to see if the 34 segments, 16 briefs, and 33 feature cards populate correctly.
3. **P2 - Add empty states** - Hypotheses tab needs table headers or placeholder content. KPI cards should show "N/A" or error indicators when DB is unavailable.
4. **P2 - Build missing sections** - Segment Grid, Intelligence Briefs panel, Feature Card Pipeline, and Cross-Vertical Alerts may need to be implemented if they don't exist behind the DB connection.
