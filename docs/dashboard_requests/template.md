# Dashboard Name

> One-line description of what this dashboard is for.

## Purpose

Describe the business question this dashboard answers. Be specific — what decision
does this help the user make? What would they do differently after seeing it?

Example: "Track monthly net operating income performance vs budget across all fund assets,
identify underperformers early, and monitor debt maturity risk."

---

## Primary Users

Who will use this dashboard and in what context.

Examples:
- Asset manager reviewing weekly portfolio health
- Fund manager preparing for quarterly investor call
- Acquisitions team benchmarking new deals against existing portfolio

---

## Key Metrics

List the metrics that must appear. Use exact names from the Winston metric catalog where
possible (see schema.md for the full list).

- NOI
- Occupancy Rate
- DSCR
- Equity Multiple
- Net Asset Value

---

## Data Sources

Where the data comes from. Winston will map these to actual API routes automatically.

Examples:
- Winston asset statements (IS / CF / KPI tables)
- Winston fund-level aggregates
- Uploaded financial model (Excel)
- Databricks warehouse (via MCP)
- API integration (CoStar, Yardi, etc.)

---

## Filters

Dashboard-level filters the user can interact with.

Examples:
- Fund (dropdown)
- Property type (multi-select: multifamily, office, retail, industrial)
- Market / MSA (dropdown)
- Date range / quarter (date picker)
- Scenario (actual vs budget vs proforma)
- Asset manager (text search)

---

## Layout

Describe the visual structure row by row. The 12-column grid is assumed.

Row 1 — KPI strip (full width)
- IRR, Equity Multiple, Portfolio NAV, Weighted Occupancy

Row 2 — Two panels
- Left (8 cols): NOI trend chart — quarterly actuals vs budget
- Right (4 cols): Variance summary metrics strip

Row 3 — Full width
- Asset performance table (comparison table, actual vs underwriting)

Row 4 — Two panels
- Left (6 cols): Occupancy trend by asset
- Right (6 cols): Debt maturity schedule (bar chart)

---

## Visualizations

List chart types needed. Match to available Winston widget types.

Available types:
- `metrics_strip` — horizontal row of KPI cards (4 per row)
- `trend_line` — time-series line chart (quarterly)
- `bar_chart` — quarterly bar chart, optionally stacked
- `waterfall` — NOI bridge (EGI → OpEx → NOI)
- `statement_table` — full income statement or cash flow table
- `comparison_table` — UW vs actual scorecard / watchlist
- `text_block` — free-text annotation or markdown notes

Requested:
- metrics_strip (KPI summary)
- trend_line (NOI trend, quarterly actuals vs budget)
- bar_chart (debt maturity by quarter)
- comparison_table (underwriter vs actual by asset)

---

## Interactions

Describe interaction behaviors in plain English. Winston will parse these into
a structured interaction model. Use these trigger/action keywords:

**Triggers:** `click`, `hover`, `row click`, `map click`, `kpi click`, `range select`, `reset`
**Actions:** `filter`, `drilldown`, `highlight`, `cross-filter`, `expand`, `update kpi`, `reset all`
**Scope:** add "global" or "all charts" for dashboard-wide effects; default is local.
**Persistence:** add "url" for shareable/bookmarkable interactions.

Examples:
- clicking a bar filters the asset table and KPI strip (global)
- row click in comparison table drills down into that asset's trend chart
- map click filters the detail table and updates KPI cards (global, url)
- kpi click expands the income statement rows below it
- reset button clears all interaction state
- hovering a bar highlights the same asset across all charts (global)

---

## Measure Intent

Controls which metrics appear and how deeply analytical the dashboard should be.

**Depth options:** `executive` (board-facing, fewer metrics), `operational` (exception-driven),
`analytical` (full data, all suggested metrics)

**User type options:** `asset manager`, `fund manager`, `investor`, `ic`

**Suggestion mode:** include `exact` to suppress companion measure suggestions.

Examples:
```
- Depth: executive
- User type: fund manager
- Required: GROSS_IRR, NET_TVPI, PORTFOLIO_NAV
- Also show: DPI, WEIGHTED_LTV
- Suggest companion measures: yes
```
```
- Depth: operational
- User type: asset manager
- Required: NOI, OCCUPANCY, DSCR_KPI
- exact — do not add other metrics
```

---

## Table Behavior

Controls whether and how a data table appears. If omitted, Winston infers one automatically.

**Include options:** `always include`, `on select` (appears when row/region clicked),
`on drill`, `expandable` (collapsed by default), `none` (suppress table)

**Type options:** `ranked`, `exceptions`, `grouped summary`, `detail grid`, `scorecard`

Examples:
- Always include a ranked table sorted by NOI descending
- Show detail table only when a row is clicked (on_select)
- Type: exceptions table — assets with DSCR below 1.15
- none — presentation dashboard, no table needed

---

## Outputs

Report or export features.

Examples:
- Export visible table to CSV
- Export full dashboard as PDF (investor-ready)
- Share link (read-only, no login required)
- Subscribe to weekly email delivery

---

## Entity Scope

What entities does this dashboard cover?

- `asset` — individual properties
- `investment` — deals / positions
- `fund` — fund-level aggregates
- `portfolio` — all funds in environment

Scope: asset
Filter: All assets in fund `[fund name or ID]`
Quarter: Q1 2026

---

## Notes for Winston Agent

Any constraints, gotchas, or prior art the agent should know.

Examples:
- This replaces the existing "Weekly Asset Report" template — don't duplicate it
- The debt maturity chart needs actual loan maturity dates from the `repe_loan` table
- Occupancy should use physical occupancy, not economic occupancy
- Budget data may be missing for assets acquired after 2024 — show "N/A" gracefully
