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

## Operating-System Page Layout

Patterns for high-density "regional COO command center" style pages.

### Header Density
- Compress the header: `px-4 py-3`, `text-xl` title, single-line description. Module notes go inline as compact chips, not as separate cards below.
- The PDS Enterprise OS badge is a small pill next to the title, not a separate row.
- Remove marketing/explanatory hero boxes. Replace with operational signals.

### Signals Strip
- Place a horizontal strip of computed operational signals immediately below the header and lens control. Each signal is a compact pill: icon + one-line message + color encoding.
- Compute signals from backend data: count markets below plan, staffing pressure regions, backlog coverage ratio, red project count, delinquent timecards.
- Signal tones: danger (red, threshold-based), warn (amber), positive (green), neutral (gray).
- Signals should be the first thing visible after the lens control — they answer "what needs my attention right now?"

### Segmented Control for Operating Lens
- The management lens (Market / Account / Project / Resource) is the **primary** page control — render it as a large segmented control (`inline-flex rounded-xl border p-1` with `rounded-lg px-5 py-2` buttons), not small pills buried inside a card.
- Horizon (MTD/QTD/YTD/Forecast) and role preset are **secondary** controls — render them smaller on the same row, right-aligned.
- No section headers or card wrappers around controls. They're structural, not content.

### Financial Cards with Context
- Metric strip cards show: label, value, **% variance vs plan inline**, and a delta arrow with trend value.
- Use `tabular-nums` for all numeric values.
- Inline variance color: `text-red-300` if < -5%, `text-amber-300` if < 0%, `text-emerald-300` if >= 0%.
- Compact card sizing: `rounded-xl p-3`, `text-xl` value (not `text-2xl`).

### Leaderboard Table
- For any "market" or "account" lens page, prefer a sortable leaderboard over the raw performance table.
- Columns: entity name, revenue, revenue vs plan (%), CI, backlog, forecast, utilization, risk score.
- Risk score is computed client-side from variance %, red project count, client risk accounts, and utilization. Render with a `PdsRiskBadge` component.
- Default sort: risk score descending (worst first).
- Clickable entity names link to the drill page.

### Spacing
- Use `space-y-3` between sections (not `space-y-4`).
- Section headers: `text-base font-semibold` (not `text-lg`), with `mt-1` gap.
- Overall goal: increase visible information above the fold by 40-60%.

### Risk Encoding
- Use a reusable `PdsRiskBadge` component with 4 levels: critical (red, >= 80), high (orange, >= 60), moderate (amber, >= 40), low (green, < 40).
- Badge has a colored dot + text label in a small pill.

## Revenue Operations Program

### Pipeline Design
- Work backwards from cash collected, not forwards from awareness. Every stage should answer "what evidence proves we're closer to getting paid?"
- The existing consulting pipeline stages (lead → contacted → discovery → proposal → negotiation → closed_won) map cleanly to the revenue-backwards framework. No schema changes needed.
- Win probabilities in the CRM (5% → 10% → 25% → 50% → 70% → 100%) are realistic for consulting sales cycles. Don't inflate them.

### Offer Architecture
- Three offers at different price points and commitment levels: Workshop ($3.5-10K) → Diagnostic ($7.5-15K) → Audit/Implementation ($25-150K). The workshop and diagnostic are designed as conversion vehicles, not standalone products.
- Always lead with the diagnostic or workshop for new relationships. The platform pilot (Winston SaaS) is a conversion endpoint, not a cold-start sale.
- Price anchoring: show the full implementation price first, then present the diagnostic as a low-risk entry point.

### Autonomous Revenue Tasks
- Revenue-oriented scheduled tasks follow the weekly rhythm: Monday pipeline, Tuesday proof assets, Wednesday outreach, Thursday demo/objections, Friday review.
- Four new daily/weekly tasks supplement the rhythm: daily-pipeline-health (6:30 AM), daily-follow-up-sequencing (10 AM), weekly-crm-hygiene (Friday 6 AM), weekly-product-feedback-synthesis (Friday 7 AM).
- All revenue task outputs go to docs/revenue-ops/ subdirectories. The morning-ops-digest should include revenue-ops status in its daily compilation.

### Sales Signals Integration
- The daily sales-signal-discovery task (4 PM) already produces qualified prospects. Revenue ops should consume these signals on Monday morning during pipeline review.
- Current active prospects from signals: Vistria Group, Kayne Anderson, Alloy Development, Cliffwater. These are seeded in the target framework.

### CRM Usage
- The Consulting Revenue OS schema (migration 280) already has everything needed: leads, contacts, outreach logs, proposals, revenue schedules, engagement tracking. No new tables required.
- Lead scoring uses 5 components: pain clarity (0-25), budget signal (0-25), authority (0-20), timeline (0-20), fit (0-10). Score >= 50 means qualified.
- Outreach templates track use_count and reply_count. Retire templates with 0 replies after 10+ uses.

### Content and Proof Assets
- Proof assets are ranked by revenue impact in docs/revenue-ops/proof-backlog.md. The Tuesday proof-asset-builder task picks from this backlog.
- LinkedIn content should tie to offer themes, not generic AI thought leadership. Every post should be traceable to one of the three offers.
- The diagnostic questionnaire is the single most important proof asset — it's needed before any Offer A pitch can happen.

## REPE Fund-Scenario Workspace Patterns

### JV as First-Class Return Object

- The fund waterfall lives at the fund level but real economics often live at the JV layer
- Always surface JV-level ownership (LP/GP/partner %) alongside waterfall tier economics
- JV summary data is computed from the asset query's `re_jv` JOIN — no separate query needed for the overview strip
- Full JV detail (partner shares, waterfall tiers, quarterly state) lives behind a dedicated `/jv-detail` endpoint, lazy-loaded when the JV/Ownership tab opens

### Enriched Waterfall Tier Summaries

- The `BaseScenarioTierSummary` type carries both definition fields (`hurdle_rate`, `definition_split_gp/lp`, `catch_up_percent`) and computed fields (`effective_lp_split`, `effective_gp_split`, `is_active`, `is_fully_satisfied`, `starting_obligation`)
- Track `tierStartingObligation` per tier type: RoC uses `totalUnreturned`, pref uses `totalPref`, catch-up uses `targetCatchUp`, split uses `remaining`
- `is_fully_satisfied` = `total_amount >= starting_obligation - 0.01` (epsilon guard)

### Quarterly Timeline Architecture

- Multi-quarter data comes from a dedicated `/quarterly-timeline` endpoint that aggregates across `re_fund_quarter_state`, `re_fund_metrics_qtr`, `re_capital_ledger_entry`, `re_gross_net_bridge_qtr`, `re_fee_accrual_qtr`, and `re_fund_expense_qtr`
- Each source is queried independently by quarter range, then merged by quarter key
- The CashFlowsTab provides range selection (4Q/8Q/12Q/20Q) — the hook `useQuarterlyTimeline` recomputes `fromQuarter` from the current quarter minus N

### Scenario Compare Pattern

- No dedicated compare endpoint needed — client-side diffing of N `FundBaseScenario` responses is sufficient
- Deltas use bps for IRR, x for multiples, $ for money
- Green = improvement, red = degradation (not just positive/negative)

### Tab Framework

- All 10 fund-scenario tabs are defined in `FundScenarioTabBar.tsx` with `enabled: boolean` flags
- Tabs consuming the current scenario data receive `scenarioResult` directly
- Tabs needing additional data (JV detail, quarterly timeline) use dedicated hooks that lazy-load on tab open
- The `onTabChange` callback enables cross-tab navigation from Overview links ("View JV Detail →")

### Base Case vs Draft Status

- "Set as Official Base Case" button only appears on `draft` status models
- "Return to Draft" lives behind a `...` overflow menu on `official_base_case` models — not a prominent button
- The official base case page shows a locked status badge; destructive actions are behind the overflow menu
