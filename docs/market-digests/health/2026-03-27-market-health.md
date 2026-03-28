# Market Intelligence Environment Health Report

**Date:** 2026-03-27
**Environment:** c3d8f2a1-7b4e-4f9c-a6d2-e8f1b3c5d7a9
**Industry:** market_rotation (financial_markets)
**URL:** https://www.paulmalmquist.com/lab/env/c3d8f2a1-7b4e-4f9c-a6d2-e8f1b3c5d7a9/markets

## Overall Status: DEGRADED (Day 5 — unchanged from 2026-03-22)

The "No database connection" banner persists across all tabs. The UI shell loads correctly but zero live data renders. This is now the fifth consecutive day this environment has been in a degraded state. The root cause — a broken client-side DB connection — remains unresolved.

## Pages Checked

| Section | Status | Notes |
|---|---|---|
| Overview tab | FAIL | KPI bar shows Regime: —, Net P&L: +$0, Top Signal: —, Equity: $—, Win Rate: 0%. Equity Curve chart placeholder is empty. Top Signals widget is empty. Open Positions table renders headers only (Ticker, Entry, Current, P&L, Return, Status). |
| Signals tab | FAIL | Table headers render (Asset Class, Category, Strength, Direction, Status, Source) with a "Filter by category..." dropdown. Zero data rows. |
| Hypotheses tab | FAIL | Completely blank content area below the tab bar. No table headers, no skeleton, no empty-state message. |
| Positions tab | NOT CHECKED | Skipped — root cause is the same DB connection failure affecting all tabs. |
| Performance tab | FAIL | Stats cards show zeroed values (Total Trades: 0, Win Rate: 0%, Profit Factor: —, Avg Win/Loss: $0/$0, Total P&L: $0). Equity Curve chart empty. Closed Trade P&L chart empty. |
| Research tab | NOT CHECKED | Skipped — same root cause. |
| Watchlist tab | NOT CHECKED | Skipped — same root cause. |
| Sidebar nav | PASS | All sidebar links render correctly: Environments, Pipeline, Uploads, Chat, Metrics, Market Intelligence, AI, Audit, AI Audit. |

## Data Integrity: DB vs UI

| Metric | Supabase (DB) | UI Display | Match? |
|---|---|---|---|
| Active market segments | 34 | 0 (not displayed) | NO |
| Intel briefs (last 7 days) | 20 | 0 | NO |
| Trading feature cards | 53 total (48 identified, 5 spec_ready) | 0 | NO |

The database continues to accumulate healthy data. Segment count holds steady at 34. Intel briefs have grown from 16 (yesterday) to 20, confirming the daily brief pipeline is still running. Feature cards have grown from 33 to 53 (48 identified + 5 spec_ready), a net add of 20 new cards in 24 hours. None of this data is visible in the UI.

## Bugs Found

### BUG-1 (P0): No database connection — Day 5
- **Severity:** Critical
- **Description:** Orange banner reads "No database connection" on every tab. Root cause of all empty sections. This bug has been open since at least 2026-03-22.
- **Impact:** 100% of dashboard data is missing. The environment is completely non-functional.
- **Likely cause:** The environment's Supabase connection string or API key is not configured, or the client-side DB adapter fails to initialize. Needs investigation in the `/lab/env/[envId]/markets` page component and the `lab_environments` table config.
- **Escalation note:** Five consecutive days without a fix. This should be treated as the top priority for the next coding session.

### BUG-2 (P2): Hypotheses tab has no skeleton/empty state
- **Severity:** Low
- **Description:** Unlike Signals and Positions (which show table headers), the Hypotheses tab renders a completely blank area with no structure, placeholder text, or empty state message.
- **Impact:** UX inconsistency. Carried forward from 2026-03-26 report.

### BUG-3 (P2): KPI cards show misleading zeroes instead of error state
- **Severity:** Low
- **Description:** When the DB is disconnected, the Overview KPI bar shows "Net P&L: +$0", "Equity: $—", "Win Rate: 0%" instead of clear error indicators.
- **Impact:** Misleading UI state. Carried forward from 2026-03-26 report.

## Missing Features / Broken Interactions

1. **No dedicated Segment Grid view** — 34 segments exist in DB but no segment grid is visible on any tab.
2. **No Intelligence Briefs section** — 20 briefs in DB, no dedicated briefs panel visible.
3. **No Feature Card Pipeline view** — 53 cards in DB but no pipeline/kanban view visible.
4. **No Cross-Vertical Alerts section** — Not visible on any checked tab.
5. **No charts render** — Equity Curve and Closed Trade P&L placeholders exist but are empty.

## Trend Analysis (5-Day Window)

| Date | Status | Segment Count | Brief Count (7d) | Feature Cards | Change |
|---|---|---|---|---|---|
| 2026-03-22 | DEGRADED | 34 | — | — | Initial report |
| 2026-03-23 | DEGRADED | 34 | — | — | No change |
| 2026-03-24 | DEGRADED | 34 | — | — | No change |
| 2026-03-26 | DEGRADED | 34 | 16 | 33 (28+5) | Brief/card tracking added |
| 2026-03-27 | DEGRADED | 34 | 20 | 53 (48+5) | DB data growing, UI still broken |

The data pipeline is healthy and accelerating (20 new feature cards in 24h). The UI remains completely blocked by the DB connection bug.

## Priority Items for Tomorrow's Planning/Coding

1. **P0 — Fix database connection (DAY 5)** — This is now critically overdue. Investigate: (a) the `lab_environments` table for this env_id's DB config, (b) the client-side Supabase adapter in the markets page component, (c) whether environment variables or API keys are missing. Without this fix, the entire Market Intelligence surface is dead.
2. **P1 — Verify data rendering after DB fix** — Once connected, rerun health check to confirm 34 segments, 20 briefs, and 53 feature cards render correctly.
3. **P2 — Add empty states** — Hypotheses tab needs table structure. KPI cards need error indicators.
4. **P2 — Build missing sections** — Segment Grid, Intelligence Briefs panel, Feature Card Pipeline, Cross-Vertical Alerts.
