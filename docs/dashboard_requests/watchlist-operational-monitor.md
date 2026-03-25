# Portfolio Watchlist — Operational Monitor

> Exception-driven, asset-manager-facing dashboard. Surfaces underperformers
> fast, wires every visual to a shared selection, and shows deal-level detail
> on demand.

## Purpose

Flag assets that are underperforming their underwriting targets on NOI,
occupancy, or DSCR so that asset managers can triage weekly and focus
remediation on the highest-risk positions first. The dashboard should behave
as an operational monitor — dense, exception-driven, with cross-filtering
between every visual.

---

## Primary Users

Asset managers doing weekly portfolio triage. They need to go from summary
KPIs → underperformer list → individual asset detail within three clicks.

---

## Key Metrics

- NOI (actual vs budget)
- Occupancy Rate
- DSCR
- LTV
- Net Cash Flow
- NOI Variance %

---

## Data Sources

- Winston asset statements (IS / CF / KPI tables)
- Winston underwriting benchmarks (from re_model_override)
- Loan data for LTV and DSCR (`repe_loan`)

---

## Filters

- Fund (dropdown — required, no default shows all)
- Quarter (date picker — default: current quarter)
- Scenario (actual vs budget)
- Severity threshold (dropdown: any / warn >5% miss / danger >10% miss)

---

## Layout

Row 1 — KPI strip (full width)
- Total assets in scope, assets flagged warn, assets flagged danger, weighted avg DSCR

Row 2 — Two panels
- Left (7 cols): NOI variance bar chart — all assets, sorted worst to best, colored by severity
- Right (5 cols): Compact metrics strip — portfolio NOI actual, portfolio NOI budget, variance %

Row 3 — Full width
- Exceptions table — all assets sorted by NOI variance ascending (worst first)
  Columns: Asset Name, Flag, NOI Actual, NOI Budget, Variance %, Occupancy, DSCR, Last Reviewed

Row 4 — Two panels (revealed when asset is selected in row 3)
- Left (6 cols): NOI trend for selected asset — 8 quarters actual vs budget
- Right (6 cols): DSCR trend for selected asset — with 1.0x and 1.15x reference lines

---

## Visualizations

- `metrics_strip` — Row 1 summary KPIs
- `bar_chart` — NOI variance bar chart (Row 2 left) — sorted, color-coded by severity
- `metrics_strip` — Compact variance metrics (Row 2 right)
- `comparison_table` — Exceptions table (Row 3) — always visible, sortable
- `trend_line` — NOI trend for selected asset (Row 4 left) — on_select, comparison=budget
- `trend_line` — DSCR trend for selected asset (Row 4 right) — on_select, reference_lines=[1.0, 1.15]

---

## Interactions

- clicking a bar in the NOI variance chart cross-filters the exceptions table and KPI strip (global)
- row click in exceptions table drills down — reveals the two trend charts in Row 4 (on_drill)
- row click in exceptions table updates KPI strip to show that asset only (global, update kpi)
- selecting a fund filter updates all charts (global, url persistence)
- hovering a bar highlights the same asset row in the exceptions table (sync_selection)
- reset button clears all interaction state and returns to portfolio view
- clicking the same row again in the exceptions table collapses Row 4 (deselect)

---

## Measure Intent

- Depth: operational
- User type: asset manager
- Required: NOI, OCCUPANCY, DSCR_KPI, LTV
- Also show: NET_CASH_FLOW, NOI_MARGIN
- Suggest companion measures: yes
- When showing NOI, always prefer variance chart over raw value chart

---

## Table Behavior

- Always include the exceptions table (visible at all times)
- Type: exceptions table — assets sorted by NOI variance ascending
- Columns: ASSET_NAME, RISK_FLAG, NOI, NOI_BUDGET, NOI_VARIANCE_PCT, OCCUPANCY, DSCR_KPI, LAST_REVIEWED
- Threshold highlighting: DSCR below 1.15 = warn amber; below 1.0 = danger red
- Threshold highlighting: NOI variance below -5% = warn amber; below -10% = danger red

---

## Outputs

- Export exceptions table to CSV
- Flag selected assets for follow-up (mark with reviewed timestamp)

---

## Entity Scope

Scope: asset
Filter: All assets in selected fund
Quarter: current quarter (auto-detected)

---

## Notes for Winston Agent

- Row 4 (the two trend charts) should render with `visibility: on_select` —
  they do not appear until a row is clicked in the exceptions table.
- The NOI variance bar chart should use `comparison: budget` on the bar_chart
  widget config and `format: percent` so bars show % deviation from budget.
- The DSCR trend chart needs `reference_lines: [{y: 1.0, label: "Covenant", color: "#EF4444"}, {y: 1.15, label: "Warn", color: "#F59E0B"}]`.
- DSCR below 1.0 is a hard covenant breach — the flag column in the table
  should show "DANGER" for those assets; 1.0–1.15 should show "WATCH".
- The exceptions table should be sortable by every column so the asset manager
  can re-sort by occupancy or LTV after the initial NOI sort.
- `NET_CASH_FLOW` is a suggested metric — include it in the KPI strip if
  the measure suggestion engine returns it as required or suggested.
