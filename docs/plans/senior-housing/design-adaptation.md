# Senior Housing — Design Adaptation

## Purpose in the design system

Senior Housing is a healthcare real estate analytics surface. It shares REPE infrastructure but the domain emphasis is different: occupancy, census trends, operator performance, and market rents. The visual language should feel like a professional healthcare operations dashboard — clean, metric-focused, institutional.

## Accent choices
- Primary: `--nv-purple-400` (brand)
- Occupancy positive: `--nv-success` (above benchmark)
- Occupancy negative: `--nv-error` (below benchmark)
- Census trend: `--nv-amber-400` (caution / declining trend)

## Density
Medium. Occupancy and NOI are the primary KPIs and must be visible without scrolling. Operator comparison tables may be dense.

## Component emphasis
- Occupancy rate must be a prominent KPI card, not a table cell
- RevPAR (Revenue per Available Room/Unit) must be shown alongside occupancy for context
- Operator performance must be comparable across portfolio (sortable table)
- HUD market rent benchmarks should appear alongside property-level rent data

## What this environment must NOT do
- Treat occupancy the same way REPE treats IRR — it has different null semantics (0% is real, not null)
- Show census trends without a time axis
- Use financial waterfall terminology (this is healthcare REIT, not private equity)
