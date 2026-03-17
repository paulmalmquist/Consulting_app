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

## REPE Model Workflow

### Status State Machine
- The model status state machine is `draft → official_base_case → archived`. Only `draft` allows edits to scope, overrides, and assumptions. `official_base_case` and `archived` are both fully locked — treat them as `isLocked = status === "official_base_case" || status === "archived"` everywhere in the UI.
- Enforce locking at the API layer, not just the UI. Add `_assert_model_unlocked()` before any scope/override mutation endpoint and return HTTP 409 with a clear `error_code` when locked. UI-only guards get bypassed.
- The status badge is not a button. Users change status via explicit actions ("Set as Official Base Case", "Return to Draft", "Archive") — not by clicking the badge. Use confirmation dialogs for destructive or irreversible transitions.

### Auto-Recalc vs. Save vs. Lock
- **Save** = persist an override value to the database (happens on `onBlur` per field, no explicit Save button needed).
- **Recalculate** = re-run the scenario engine with current overrides and return updated results (triggered automatically after every save, with a 600ms debounce).
- **Lock** = prevent further edits (status change to `official_base_case` or `archived`).
- Keep these three actions visually and semantically distinct. A "Save & Recalculate" button conflates two concerns and obscures what's happening.

### Auto-Recalc Hook Pattern
- State machine: `idle → dirty → recalculating → idle`. The transition `dirty → recalculating` is debounced (600ms). Use a `needsRerunRef` boolean to handle the case where a new trigger fires while already recalculating — queue exactly one re-run, not N re-runs.
- Pass `enabled = !isLocked && assetCount > 0` so the hook never fires on locked models or empty scenarios.
- Preserve the last successful result during recalculation. Render it at `opacity-60` with a spinner overlay rather than replacing with a skeleton — skeleton is for the truly-empty first-load state only.
- Wire `triggerRecalc()` to: blur-save on any override field, asset add/remove, override reset.

### Idempotency via Input Hash
- Before running the scenario engine, compute a hash of the sorted asset IDs and sorted override key-values. Check the most recent `re_model_run` for a completed run with the same hash. If found, return the cached result — skip the engine entirely.
- Store the `input_hash` on new run rows. This makes "change override back to original value → re-run" fast and prevents cascading re-computation.
- Hash input: `sorted(asset_ids) + sorted((scope_id, key, value) for each override)`. Use SHA-256 or a stable deterministic hash.

### CircularCreateButton Convention
- Primary create actions across the REPE workspace use a circular `+` button (`rounded-full`, `bg-bm-accent`) with an `aria-label` and `title` tooltip. No visible text label on the button itself.
- Exception: "Create Your First X" empty-state CTAs use full-text buttons — the button text provides the context that the tooltip would otherwise give.
- Apply the same component (`CircularCreateButton`) across all REPE list pages (Models, Funds, Distributions, Capital Calls) for visual consistency.

### Schema Readiness Check
- Expose a `GET /api/re/v2/health/schema` endpoint that runs a trivial query (`SELECT 1 FROM re_model LIMIT 0`) and returns `{"ready": true}` or `{"ready": false, "error_code": "SCHEMA_NOT_MIGRATED"}`. This lets the frontend distinguish between "user has no data" and "migrations haven't run yet."
- When any page-level API call returns `error_code === "SCHEMA_NOT_MIGRATED"`, render a guided empty state ("Modeling Environment Not Initialized") with a Retry button instead of a raw error string. Never surface infrastructure error messages directly to users.

## REPE Fund Returns

- The authoritative current-state fund return engine now lives behind `GET /api/re/v2/funds/[fundId]/base-scenario`. Treat this route as the ownership-aware bridge from asset marks and realizations into fund-level waterfall and return metrics.
- Base-scenario economics should be assembled in this order: asset actuals or assumptions -> asset gross and net value -> ownership-adjusted fund share -> realized and unrealized fund pools -> waterfall tiers -> DPI/RVPI/TVPI/IRR outputs.
- Do not roll fund value from gross asset values. Use attributable asset economics only: JV ownership when present, explicit `re_asset_realization` events for disposed assets, and scenario sale assumptions for hypothetical liquidation.
- Seeded REPE funds should include a mix of active and disposed assets, explicit asset cost basis, coherent debt balances, and at least a few sub-100% ownership cases so base-scenario TVPI and waterfall outputs reconcile back to believable asset-level inputs.
