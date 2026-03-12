# Real Estate Fund Performance Dashboard

> Comprehensive fund-level performance view for quarterly investor reporting and ongoing asset management.

## Purpose

Track portfolio-level IRR, equity multiple, and NAV against underwriting targets.
Surface geographic concentration, deal pipeline status, and individual asset
NOI performance so the fund manager can identify underperformers and prepare for
quarterly investor calls.

---

## Primary Users

- Fund manager preparing quarterly LP reports
- Asset managers tracking property-level performance
- Investment committee reviewing acquisition pipeline

---

## Key Metrics

- IRR (Gross and Net)
- Equity Multiple (TVPI, DPI)
- Fund NAV (Portfolio NAV)
- NOI (asset level)
- Occupancy Rate
- DSCR
- LTV

---

## Data Sources

- Winston fund-level aggregates (`repe_fund`, `repe_deal`)
- Winston asset statements (IS / KPI / CF tables)
- Winston loan data (`repe_loan`) for LTV and debt maturity

---

## Filters

- Fund (dropdown — select which fund to view)
- Quarter (date picker — default: current quarter)
- Scenario (actual vs budget vs proforma)
- Property type (multi-select: multifamily, office, retail, industrial)

---

## Layout

Row 1 — KPI strip (full width)
- Gross IRR, Net TVPI, Portfolio NAV, Weighted Occupancy

Row 2 — Two panels
- Left (8 cols): NOI trend — quarterly actuals across all fund assets
- Right (4 cols): Key variance metrics (NOI vs budget, occupancy vs UW)

Row 3 — Full width
- Deal pipeline bar chart — deals by stage (prospecting → LOI → due diligence → closed)

Row 4 — Full width
- Asset performance comparison table — actual vs underwriting for each asset
  (columns: Asset Name, NOI Actual, NOI Budget, Variance %, Occupancy, DSCR)

Row 5 — Two panels
- Left (6 cols): Debt maturity schedule by quarter
- Right (6 cols): Occupancy trend — quarterly by property type

---

## Visualizations

- `metrics_strip` — Row 1 KPI summary (4 metrics)
- `trend_line` — NOI trend (Row 2 left)
- `metrics_strip` — Variance strip (Row 2 right, compact)
- `bar_chart` — Deal pipeline (Row 3)
- `comparison_table` — Asset performance vs UW (Row 4)
- `bar_chart` — Debt maturity schedule (Row 5 left)
- `trend_line` — Occupancy trend (Row 5 right)

---

## Interactions

- Click fund filter → all widgets re-scope to selected fund
- Click row in asset performance table → open asset detail page
- Click bar in deal pipeline → filter to deals in that stage
- Quarter picker → all time-series widgets shift quarter window

---

## Outputs

- Export asset performance table to CSV
- Export full dashboard as PDF (LP report format)
- Share read-only dashboard link with investors

---

## Entity Scope

Scope: fund
Filter: All assets in the selected fund
Quarter: current quarter (auto-detected)

---

## Notes for Winston Agent

- Fund-level metrics (IRR, TVPI, DPI, RVPI) require `entity_type: fund`; asset metrics
  (NOI, DSCR, Occupancy) require `entity_type: asset`. The generate endpoint handles
  both via the 12-column grid — fund KPIs go in `metrics_strip`, asset data in the table.
- Deal pipeline data comes from `repe_deal` — the bar chart should group by `deal_status`.
  This is not yet a built-in widget section; the `bar_chart` widget will fall back to
  NOI data unless a custom section is added to the section registry.
- The debt maturity chart uses `repe_loan.maturity_date` — if that column is missing,
  the bar chart will show NOI-by-quarter as a fallback (acceptable for MVP).
- For the comparison table, Winston maps `comparison_table` to UW vs actual — this is
  the correct widget for the asset performance row.
- Budget data for assets acquired after 2024-01-01 may be absent — `comparison_table`
  shows "N/A" gracefully via `DataAvailability.has_budget = false`.
