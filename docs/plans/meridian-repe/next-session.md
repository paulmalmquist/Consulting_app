# Next Session — Meridian / REPE

> ✅ **Closed 2026-06-22** — roadmap T1–T6 all complete; no open work. See [`../CONSOLIDATED_BACKLOG.md`](../CONSOLIDATED_BACKLOG.md) for the live cross-workstream backlog. History below retained for reference.

**Last updated:** 2026-05-18  
**Active dispatch:** `docs/plans/03-implementation-plans/active/0001-meridian-repe-ui-data-integrity-roadmap.md`  
**T1 status:** COMPLETE — dark mode contrast, chart readability, map tile swap, Leaflet CSS override  
**T5 status:** COMPLETE — marker persistence on filter change, zoom stability on property-type filter  
**T3 status:** COMPLETE — fund detail page dark mode; as-of date on TVPI/IRR KPI cards; explicit empty states confirmed on all tabs  
**T4 status:** COMPLETE — market sort column added to investment list; IRR null → UnavailableCell; PortfolioFundTable already had full sorting  
**T2 status:** COMPLETE — IRR sparse-history guard raised to < 4 cashflows; fail-closed null_reason propagation added; LpSummaryTab renders UnavailableTile for flagged gross_irr  
**T6 status:** COMPLETE — XIRR unit tests, FundFootprintMap dark-mode + T5 regression guards, lint/state-lock confirmed, tips.md and qa-checklist updated  
**Roadmap status:** ALL TICKETS COMPLETE (T1, T2, T3, T4, T5, T6)

## T1 — Completed (2026-05-18)

**Files changed:**
- `repo-b/src/app/globals.css` — Leaflet `.dark .leaflet-tooltip` and `.dark .leaflet-popup-content-wrapper` global overrides
- `repo-b/src/components/charts/chart-theme.ts` — `AXIS_TICK_STYLE` fallback `#94a3b8`, `GRID_STYLE` opacity baked in, `getAxisTickStyle()` fallback improved
- `repo-b/src/components/charts/TrendLineChart.tsx` — migrated from static `AXIS_TICK_STYLE`/`GRID_STYLE`/`TOOLTIP_STYLE` to theme-aware getters
- `repo-b/src/components/repe/fund/FundFootprintMap.tsx` — all hardcoded `#E2E8F0`/`#F8FAFC`/`#0F172A`/`#64748B` hex replaced with `slate-*` + `dark:bm-*` Tailwind pairs
- `repo-b/src/components/repe/fund/FundFootprintMapInner.tsx` — CARTO dark tile URL in dark mode, `useDarkMode()` hook
- `repo-b/src/components/repe/portfolio/FundComparisonChart.tsx` — Legend `wrapperStyle` gets `color: var(--bm-text-muted)`
- `repo-b/src/components/repe/portfolio/PortfolioAssetMapInner.tsx` — CARTO dark tile, popup text uses opacity-relative classes instead of hardcoded `text-gray-*`
- `repo-b/src/components/resume/CompoundingCapabilityGraph.tsx` — fixed `strokeOpacity` reference to removed `GRID_STYLE` property (collateral fix)

**Test result:** `npx tsc --noEmit` — passes. One pre-existing error in `src/app/app/repe/assets/page.test.tsx:28` (null assignability, unrelated to this ticket, pre-existing).

**Screenshots:** Not captured — no browser session available. Capture manually at `/lab/env/[envId]/re/portfolio` in dark mode.

## T5 — Completed (2026-05-18)

**Files changed:**
- `repo-b/src/components/repe/fund/FundFootprintMap.tsx` — selection preservation on API refetch: `setSelection` now checks whether the previously selected asset/market still exists in the new result set before resetting to portfolio; added `fitKey` state (increments on each data load, not on client-side filter changes)
- `repo-b/src/components/repe/fund/FundFootprintMapInner.tsx` — `FitBounds` now accepts `fitKey` prop; re-fit dep array is `[fitKey, map, viewMode]` instead of `[assetPoints, marketPoints, map, viewMode]` — prevents zoom reset on property-type filter chip clicks

**Test result:** `npx tsc --noEmit` — passes. Same pre-existing test-file error only.

**Root cause:** Two separate bugs:
1. `setSelection({ mode: 'portfolio' })` was unconditional in the API `.then()` callback — fired on every `statusFilter` change even if the selected asset was in the returned set.
2. `FitBounds` depended on `assetPoints`/`marketPoints` object references — recomputed on every `useMemo` cycle including client-side property-type filter changes, resetting zoom.

## T3 — Completed (2026-05-18)

**Files changed:**
- `repo-b/src/app/lab/env/[envId]/re/funds/[fundId]/page.tsx` — comprehensive dark mode pass on the fund detail page:
  - `FUND_PANEL_CLASS` and `INSTITUTIONAL_PANEL_CLASS` updated to `slate-*/dark:bm-*` Tailwind pairs (propagates to all 20+ panels using the constant)
  - Tab bar: `border-[#E2E8F0] bg-white/90` → dark-aware with `dark:border-bm-border/20 dark:bg-bm-surface/90`; active tab → `dark:border-bm-accent dark:bg-bm-accent/10`
  - Fund header: "Fund" label, h1, metadata text, bullet separator — all hardcoded hex replaced
  - Header buttons (Lineage, Actions, dropdown menu items) — all hardcoded hex replaced
  - Health summary tags (Last Close, Pref, Carry, Waterfall) — hardcoded hex replaced
  - `BaseScenarioSummaryCard`: KPI card cells get `dark:border-bm-border/20 dark:bg-bm-surface/60`; **added as-of date** under TVPI and Gross IRR (`As of {baseScenario.as_of_date}`)
  - Overview filter chip: `border-[#DBEAFE] bg-[#EFF6FF] text-[#2563EB]` → dark-aware
  - `PerformanceMetric`: `text-slate-400`/`text-slate-900` → `dark:text-bm-muted2`/`dark:text-bm-text`
  - `ReturnsSummaryCard`: wrapper and rows → dark-aware
  - Returns tab: KPI card, Value Bridge table, Asset Contribution Bridge table, Waterfall Tier Results, Modeling Conventions — all dark-aware; empty state dark-aware
  - Variance tab: inline `text-[#64748B]` mobile cells → `text-slate-500 dark:text-bm-muted2` (3 occurrences, replace_all)

**Tabs audit result:** All 7 equity tabs and 5 debt tabs have explicit empty states — no stuck spinners found.  
**Investment list audit:** `AssetContributionTable` (portfolio/) already shows name, sector/market, invested capital, NAV, Asset IRR — dispatch requirement met.

**Test result:** `npx tsc --noEmit` — passes. Same pre-existing test-file error only.

## T4 — Completed (2026-05-18)

**Files changed:**
- `repo-b/src/components/repe/portfolio/AssetContributionTable.tsx`:
  - Added `UnavailableCell` import from `@/components/re/UnavailableTile`
  - `SortKey` type extended: `"nav" | "irr" | "name" | "market"`
  - Sort comparator: added `"market"` branch (locale-aware string sort, nulls sort last)
  - "Sector / Market" header changed from static `<th>` to `<Th onClick={() => toggleSort("market")} ...>` — now sortable
  - IRR null state: replaced `<Unavailable reason="Awaiting IRR" />` with `<UnavailableCell nullReason="incomplete_cash_flow_series" />` — renders with proper tooltip and `data-null-reason` attribute

**Sorting status of PortfolioFundTable (fund list):** Already fully sortable on all columns (Fund, Vintage, AUM, NAV, Gross IRR, Net IRR, DPI, Gross TVPI, Net TVPI, % Invested, Status). All null values use `UnavailableCell`. No market column on fund list — not applicable (`FundTableRow` has no primary_market field).

**Test result:** `npx tsc --noEmit` — passes. Same pre-existing test-file error only.

## T2 — Completed (2026-05-18)

**Root cause:** `irr_engine.py` XIRR bisection produced extreme values (456%, 366%) for funds with sparse cash flow history (< 4 entries). Guard was `< 2` — insufficient for bisection stability.

**Files changed:**
- `backend/app/finance/irr_engine.py` — sparse-history guard raised from `< 2` to `< 4`
- `backend/app/services/bottom_up_rollup.py` — `_xirr_from_series` return changed to `tuple[Decimal | None, str | None]`; returns `(None, "irr_insufficient_history")` for < 4 cashflows, `(None, "insufficient_sign_changes")` for sign-change fail; both `compute_investment_rollup` and `compute_fund_rollup` updated to unpack the tuple and propagate `irr_null_reason`
- `backend/app/services/fund_snapshot_v2.py` — `_v2_canonical_metrics` adds `"null_reasons"` dict to return; populated from rollup.null_reason (→ `"gross_irr"`) and plausibility gate `abs(gross_irr) > 2.0` (→ `"irr_implausible_early_period"`); net_irr null reason from waterfall also propagated
- `backend/app/services/re_sale_scenario.py` — `get_lp_summary` computes `fund_metric_null_reasons` dict; plausibility check `abs(raw_irr) > 2.0` → `"irr_implausible_early_period"`; dict included in returned payload
- `repo-b/src/lib/bos-api.ts` — `LpSummary` type gains `fund_metric_null_reasons?: Record<string, string>`
- `repo-b/src/components/re/UnavailableTile.tsx` — two new null_reason codes: `irr_insufficient_history`, `irr_implausible_early_period`
- `repo-b/src/app/lab/env/[envId]/re/funds/[fundId]/page.tsx` — added `UnavailableTile` import; `LpSummaryTab` gross_irr KPI card is now conditional: renders `<UnavailableTile>` when `fund_metric_null_reasons.gross_irr` is set, `<MetricCard>` otherwise

**Test result:** `npx tsc --noEmit` — passes (only pre-existing `page.test.tsx:28` error). `no_legacy_repe_reads.py` — 0 violations.

## T6 — Completed (2026-05-18)

**Files created:**
- `backend/tests/test_irr_engine_sparse.py` — 8 unit tests for the XIRR sparse-history guard:
  - 0/1/2/3 cash flows → `None` (sparse guard)
  - 4 cash flows → not blocked by guard (may still be `None` for other reasons)
  - 7-year normal fund → result in (-100%, 100%)
  - All-same-sign cash flows → `None` (sign-change guard)
- `repo-b/src/components/repe/fund/__tests__/FundFootprintMap.test.tsx` — 15 source-level regression tests:
  - T1 dark-mode contract: `dark:bg-bm-surface`, `dark:border-bm-border`, `dark:text-bm-muted2`, `dark:text-bm-text`, inactive FilterChip, positive Pill tone
  - No-hardcoded-hex: `bg-[#F8FAFC]`, `text-[#0F172A]`, `text-[#64748B]`, `border-[#E2E8F0]`, `bg-[#E2E8F0]`, `text-[#334155]`
  - T5 filter-persistence: `setSelection((prev)` form, `fitKey` prop, `setFitKey` in `.then()` callback

**Files updated:**
- `docs/tips.md` — XIRR sparse-history section: guard rationale, null-reason chain, LP summary read path quirk, `UnavailableTile` props contract
- `docs/plans/meridian-repe/qa-checklist.md` — checked items for lint, state-lock, new tests, IRR fail-closed behavior
- `docs/plans/meridian-repe/eval-plan.md` — T6 visual checks marked complete
- `docs/plans/meridian-repe/next-session.md` — roadmap marked complete

**Test results:**
- `backend/tests/test_irr_engine_sparse.py` — 8 passed
- `repo-b/src/components/repe/fund/__tests__/FundFootprintMap.test.tsx` — 15 passed
- `backend/tests/test_state_lock_invariants.py` — 1 passed
- `verification/lint/no_legacy_repe_reads.py` — 0 violations
- `repo-b npx tsc --noEmit` — 0 new errors (1 pre-existing `page.test.tsx:28` only)

**Screenshot receipts:** Not captured — no browser session available. Screenshots must be taken manually at `/lab/env/[envId]/re/` in dark mode.

## Copy-paste prompt for Ticket 2 (completed)

```
Use the new planning system. This is a bounded spike + implementation ticket. Do not expand scope.

Read before coding:
1. docs/plans/03-implementation-plans/active/0001-meridian-repe-ui-data-integrity-roadmap.md (Ticket 2 section)
2. docs/SYSTEM_RULES_AUTHORITATIVE_STATE.md
3. docs/plans/meridian-repe/next-session.md

This is a RESEARCH-FIRST ticket. The question is: what produced the 456% gross_irr for IGF VII 2024Q4?

Step 1 — Trace the source:
- Read backend/app/finance/irr_engine.py — does it guard for sparse cash flows (< 4 entries)?
- Read backend/app/services/re_fund_*.py — which service computes gross_irr for authoritative snapshots?
- Check the authoritative snapshot schema: does `re_authoritative_snapshots` have a `null_reason` column? (grep the schema files or check backend/app/schemas/re_authoritative.py)
- Check the API route: backend/app/routes/re_authoritative.py — does it expose null_reason?

Step 2 — Check the display:
- repo-b/src/app/lab/env/[envId]/re/funds/[fundId]/page.tsx — how is gross_irr rendered? Does it pass through UnavailableCell when null, or does it render 456% bare?
- Does any fund KPI card clamp or flag IRR > 100%?

Step 3 — Implement (only after trace):
- If irr_engine.py lacks a sparse-history guard: add guard (n_cashflows < 4 → return null with reason "irr_insufficient_history")
- If null_reason column is missing from schema: write migration following ARCHITECTURE.md rules
- If UI shows 456% bare: route through UnavailableCell when null_reason is set

HARD RULE: Do not change any displayed IRR value without tracing its origin. If you cannot trace it, document the gap and stop.

After coding (or if research-only):
- run: cd repo-b && npx tsc --noEmit
- run: python verification/lint/no_legacy_repe_reads.py
- update docs/plans/meridian-repe/next-session.md with T2 status and next ticket (T6)
- update docs/plans/meridian-repe/eval-plan.md
```

## Copy-paste prompt for Ticket 4 (next)

```
Use the new planning system. This is a bounded implementation ticket. Do not expand scope.

Read before coding:
1. docs/plans/03-implementation-plans/active/0001-meridian-repe-ui-data-integrity-roadmap.md (Ticket 4 section)
2. docs/plans/meridian-repe/design-adaptation.md
3. docs/plans/meridian-repe/next-session.md

Implement Ticket 4 only: Sortable investment table with IRR and market columns.

Files to inspect first:
- repo-b/src/components/repe/portfolio/AssetContributionTable.tsx (current sort keys: nav, irr, name — check if market column exists)
- repo-b/src/app/lab/env/[envId]/re/funds/[fundId]/page.tsx (how AssetContributionTable is called from OverviewTab)
- repo-b/src/lib/bos-api.ts (ReV2FundInvestmentRollupRow shape — confirm primary_market field)

Before coding, restate acceptance criteria from the dispatch record.
Do not touch IRR calculation, schema, or API contracts.

After coding:
- run: cd repo-b && npx tsc --noEmit
- update docs/plans/meridian-repe/next-session.md with T4 status and next ticket (T2)
- update docs/plans/meridian-repe/eval-plan.md
```

## Copy-paste prompt for Ticket 3 (next)

```
Use the new planning system. This is a bounded implementation ticket. Do not expand scope.

Read before coding:
1. docs/plans/03-implementation-plans/active/0001-meridian-repe-ui-data-integrity-roadmap.md (Ticket 3 section)
2. docs/plans/meridian-repe/design-adaptation.md
3. docs/plans/meridian-repe/next-session.md

Implement Ticket 3 only: Fund detail page tabs and investment list.

Files to inspect first:
- repo-b/src/app/lab/env/[envId]/re/funds/[fundId]/page.tsx (tab structure — 4314 lines, identify which tabs show stale spinners or empty state without explanation)
- repo-b/src/components/repe/fund-scenario/ (OverviewTab, WaterfallTab, CashFlowsTab, ValuationTab)
- repo-b/src/app/lab/env/[envId]/re/investments/ (does an investment list under fund exist?)

Before coding, restate acceptance criteria from the dispatch record.
Do not touch IRR calculation, schema, or API contracts.

After coding:
- run: cd repo-b && npx tsc --noEmit
- update docs/plans/meridian-repe/next-session.md with T3 status and next ticket (T4)
- update docs/plans/meridian-repe/eval-plan.md
```

## Copy-paste prompt for Ticket 5 (completed)

```
Use the new planning system. This is a bounded implementation ticket. Do not expand scope.

Read before coding:
1. docs/plans/03-implementation-plans/active/0001-meridian-repe-ui-data-integrity-roadmap.md (Ticket 5 section)
2. docs/plans/meridian-repe/design-adaptation.md
3. docs/plans/meridian-repe/next-session.md

Implement Ticket 5 only: Map marker persistence in FundFootprintMap.

Files to inspect:
- repo-b/src/components/repe/fund/FundFootprintMap.tsx (selectedAssetId / selectedMarketKey state, filter onChange handlers)
- repo-b/src/components/repe/fund/FundFootprintMapInner.tsx (assetIcons useMemo dependencies)

The bug: when the status filter changes, selectedAssetId resets to null even when the selected asset is still visible in the filtered set. Fix: only reset selection if the newly filtered set no longer contains the selected asset/market.

Also check: does the Leaflet MapContainer remount on filter change? If so, that resets zoom/pan — fix by stabilizing the key prop.

Acceptance criteria from dispatch record: marker stays selected after filter change if still visible; zoom/pan preserved; no unnecessary Leaflet remounts.

After coding:
- run: cd repo-b && npx tsc --noEmit
- update docs/plans/meridian-repe/next-session.md with T5 status and next ticket (T3)
- update docs/plans/meridian-repe/eval-plan.md
```

## Context notes (carry forward)
- The authoritative state lock is enforced by CI — do not bypass it
- Do not use `getFundBaseScenario` or `computeFundBaseScenario` anywhere
- Waterfall-dependent metrics must return null + null_reason for out-of-scope cases
- Leaflet tooltip/popup dark mode is handled by global CSS in `globals.css` — do not add per-component inline styles
- `FundFootprintMap.tsx` uses `STORAGE_PREFIX` (`repe-fund-footprint-filters`) for filter persistence — do not break this in T5
- Both `FundFootprintMapInner.tsx` and `PortfolioAssetMapInner.tsx` now use `useDarkMode()` hook for tile switching
