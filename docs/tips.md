# Visualization Tips

Patterns and conventions discovered during Deal Radar refactors.

## Radial Chart Conventions

- **4 rings max** for radial stage progression — executives lose context beyond 4 concentric bands.
- **Sector labels outside the circle, bold** — never inside wedges where they compete with data.
- **Ring labels on a single reference spoke** between the last and first sector (e.g., -112.5 degrees) so labels are between data, not over it.

## Color Encoding

- Limit operational colors to **3 signals**: active (blue), attention (amber), risk (red). Everything else is neutral gray.
- Do not use color to encode sector — sector is already encoded by angular position.
- Do not use shape to encode sector — it duplicates the wedge encoding and adds legend complexity.

## Deal Size Encoding

- Use **dot diameter** for deal size with 3 discrete tiers (<$50M, $50-150M, >$150M).
- Continuous scaling is harder to read at a glance. Discrete tiers give instant readability.

## Collision Handling

- Apply **deterministic jitter** (seeded from node ID) of ±3 degrees angle and ±6px radius to prevent overlapping markers while keeping layout stable across re-renders.
- Follow jitter with a multi-pass push-apart loop for remaining overlaps.

## Center Summary Panel

- Use the empty center of radial charts for a **pipeline summary** (deal count, total value, key stage counts).
- This replaces the need for a separate KPI strip above the chart.

## Tooltip Design

- Hover tooltips should show: Name, Sector, Stage, Market, Estimated Size, Probability, Lead Partner.
- Clicking a marker should navigate to the detail page — tooltips are for preview only.

## Filter Performance

- Date range filters (30d, 90d, YTD, All) applied client-side against lastUpdatedAt field avoid extra API calls.
- Use useDeferredValue for search text to avoid blocking the radar render on every keystroke.

## REPE Investor Ops

- Capital calls and distributions in the lab REPE workspace should use page-level overview endpoints, not thin list endpoints. The durable contracts are `GET /api/re/v2/capital-calls/overview` and `GET /api/re/v2/distributions/overview`, each returning summary metrics, lifecycle rollups, table rows, filter options, and insight panels in one payload.
- The REPE object model and finance engine are separate identity systems. Bridge them with `fin_fund.fund_code = repe_fund.fund_id::text` and `fin_participant.external_key = re_partner.partner_id::text` when investor-ops pages need finance rows to reconcile back to REPE funds and investors.
- Do not query finance capital tables with legacy aliases like `call_id`, `fund_id`, `event_id`, or `total_amount`. The real columns are `fin_capital_call_id`, `fin_fund_id`, `fin_distribution_event_id`, `gross_proceeds`, and `net_distributable`.
- Capital-call lifecycle should be derived from requested vs. received vs. due date, not only from `fin_capital_call.status`: `issued`, `partially_funded`, `fully_funded`, `overdue`.
- Distribution lifecycle should be derived from payout coverage plus event status because `fin_distribution_payout` has no status column: `declared`, `allocated`, `approved`, `paid`.
- Demo seeds for these pages should be mathematically coherent and cover every lifecycle state. Keep `requested = received + outstanding` for capital calls and `declared = paid + pending` for distributions so KPI, lifecycle, and table totals reconcile in zero-data environments.
