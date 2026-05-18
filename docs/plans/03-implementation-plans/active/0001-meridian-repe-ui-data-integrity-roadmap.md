# Dispatch Record 0001 — Meridian REPE UI & Data Integrity Roadmap

**Created:** 2026-05-16  
**Status:** Active  
**Environment:** Meridian REPE  
**Deliverable type:** Multi-ticket roadmap (code changes + eval coverage)

---

## Raw Idea

The Meridian REPE environment has accumulated visual and data integrity debt:
1. Charts and maps render with light-mode hardcoded colors that break in the dark operator console.
2. Fund 7 (IGF VII) shows 456% gross IRR — plausibly a XIRR artifact on sparse early history, needs fail-closed handling.
3. The fund detail page tabs and investment list need structural polish.
4. The investment table lacks sortable IRR and market columns.
5. Map markers reset on filter change (persistence bug).
6. No regression tests or screenshot receipts exist for this environment.

---

## Step 1 — Environment Classification

**Primary folder:** `docs/plans/meridian-repe/`  
**Sub-environment:** Fund footprint map, fund detail, portfolio comparison, investment list

---

## Step 2 — Shared Standard Impact

| Axis | Triggered? | Secondary folder |
|---|---|---|
| Color tokens / dark mode | YES | `01-shared-standards/design-system/tokens.md` |
| Cards, charts, maps | YES | `01-shared-standards/design-system/component-contracts.md` |
| Environment theming | YES | `01-shared-standards/design-system/environment-theming.md` |
| AI fail-closed rules | YES | `01-shared-standards/ai-runtime/fail-closed-rules.md` |
| Golden path evals | YES | `01-shared-standards/evals/golden-paths.md` |
| Regression suite | YES | `01-shared-standards/evals/regression-suite.md` |
| Authoritative state | YES | `docs/SYSTEM_RULES_AUTHORITATIVE_STATE.md` |
| DB migration required | NO (Ticket 2 is read-only audit first) | — |
| Vercel deploy required | YES (after each ticket) | `agents/deploy.md` |

---

## Step 3 — Deliverable Type

**Code change** (Tickets 1, 3, 4, 5) + **Research/spike** (Ticket 2) + **Eval coverage** (Ticket 6)

---

## Step 4 — Required Reading Per Ticket

All tickets must read:
- `CLAUDE.md`
- `docs/plans/00-dispatch/routing-map.md`
- `docs/plans/meridian-repe/README.md`
- `docs/plans/meridian-repe/architecture.md`

Tickets 1, 3, 4, 5 (visual) also read:
- `docs/plans/01-shared-standards/design-system/design-system-charter.md`
- `docs/plans/01-shared-standards/design-system/tokens.md`
- `docs/plans/meridian-repe/design-adaptation.md`

Ticket 2 (data integrity) also reads:
- `docs/SYSTEM_RULES_AUTHORITATIVE_STATE.md`
- `docs/plans/01-shared-standards/ai-runtime/fail-closed-rules.md`
- `docs/plans/meridian-repe/ai-behavior.md`

Ticket 6 (tests) also reads:
- `docs/plans/01-shared-standards/evals/eval-charter.md`
- `docs/plans/01-shared-standards/evals/regression-suite.md`
- `docs/plans/meridian-repe/eval-plan.md`
- `docs/plans/meridian-repe/qa-checklist.md`

---

## Ticket Index

| # | Title | Risk | DB Migration | First? |
|---|---|---|---|---|
| [T1](#ticket-1) | Dark-mode contrast, chart readability, graph/map alignment | Low | No | **YES — start here** |
| [T2](#ticket-2) | Fund 7 IRR authoritative-source audit and fail-closed display correction | Medium | Possibly | No |
| [T3](#ticket-3) | Fund detail page tabs and investment list | Low | No | No |
| [T4](#ticket-4) | Sortable investment table with IRR and market columns | Low | No | No |
| [T5](#ticket-5) | Map marker persistence | Low | No | No |
| [T6](#ticket-6) | Meridian REPE visual/data regression harness and screenshot receipts | Low | No | No |

---

## Ticket 1 — Dark-mode contrast, chart readability, graph/map alignment {#ticket-1}

### Why first

Visual, no schema risk, immediately verifiable by screenshot. Proves the planning → eval → receipt loop before touching anything financially sensitive. If this breaks something, rollback is a one-line CSS revert.

### Scope boundary (read before touching anything)

This ticket does NOT touch:
- Financial calculations, IRR logic, or XIRR engine
- Seed data or demo fixture values
- Schema, migrations, or API contracts
- Fund 7 IRR — that is T2

If you find yourself looking at `irr_engine.py` or any backend service, stop and re-read this boundary.

### Routed folders

- Primary: `docs/plans/meridian-repe/`
- Design system: `docs/plans/01-shared-standards/design-system/tokens.md`, `environment-theming.md`, `component-contracts.md`
- Eval: `docs/plans/meridian-repe/eval-plan.md` (visual checks section)

### Files to inspect

| File | Why |
|---|---|
| `repo-b/src/components/repe/fund/FundFootprintMap.tsx` | Hardcoded light-mode hex values throughout: `#F8FAFC`, `#0F172A`, `#64748B`, `#E2E8F0` |
| `repo-b/src/components/repe/fund/FundFootprintMapInner.tsx` | Leaflet tooltip JSX uses hardcoded `text-[#0F172A]`, `text-[#64748B]`, `text-[#334155]` — all light-mode |
| `repo-b/src/components/repe/portfolio/FundComparisonChart.tsx` | Uses `bg-white` + `dark:bg-bm-surface/30` — chart `<Legend>` wrapperStyle is a static object, not CSS-var aware |
| `repo-b/src/components/charts/chart-theme.ts` | `AXIS_TICK_STYLE` fallback is `rgba(107,114,128,0.8)` — unreadable on dark bg at opacity 0.8; `getAxisTickStyle()` reads `--bm-chart-axis` which is `#475569` — borderline |
| `repo-b/src/components/repe/portfolio/FundTrendPanel.tsx` | Inspect for hardcoded colors |
| `repo-b/src/components/repe/portfolio/PortfolioAssetMap.tsx` | Inspect for hardcoded light styles |
| `repo-b/src/components/repe/portfolio/PortfolioAssetMapInner.tsx` | Inspect for hardcoded light styles |

### Specific issues identified

1. **`FundFootprintMap.tsx` — `PANEL_CLASS` and metric cards**: `bg-[#F8FAFC]`, `bg-white/90`, `border-[#E2E8F0]`, text `text-[#0F172A]`, `text-[#64748B]` — all hardcoded light. In dark operator console these render as a blinding white panel floating inside a dark shell.

2. **`FundFootprintMapInner.tsx` — Leaflet tooltip content**: `AssetTooltip` and `MarketTooltip` use hardcoded Tailwind `text-[#0F172A]`, `text-[#64748B]`, `text-[#334155]`. Leaflet renders these as static HTML injected into the DOM — dark mode classes on the parent don't cascade.

3. **`FundFootprintMapInner.tsx` — OSM light tile layer**: OpenStreetMap light tiles (`tile.openstreetmap.org`) clash visually with the dark Novendor shell. Should swap to a dark basemap (CARTO Voyager Dark or similar OSM-compatible dark tile) in dark mode.

4. **`FundComparisonChart.tsx` — Legend**: `wrapperStyle={{ fontSize: 10, paddingTop: 4 }}` has no color — Recharts defaults Legend text to inherited color, which may be black on dark backgrounds depending on rendering context.

5. **`chart-theme.ts` — static `AXIS_TICK_STYLE`**: `rgba(107,114,128,0.8)` is a medium gray at 80% opacity — low contrast against dark chart backgrounds. The theme-aware `getAxisTickStyle()` reads `--bm-chart-axis: #475569` which is also low-contrast on near-black backgrounds.

6. **Container alignment**: `FundFootprintMap.tsx` uses rounded corners / shadow / border from `PANEL_CLASS` that may not match the 4px/6px/8px border radius scale from `tokens.md`.

### Implementation notes

**Do not** redesign the component. Make the smallest safe change:

1. Replace hardcoded hex colors in `FundFootprintMap.tsx` sub-components (`SummaryMetric`, `FilterChip`, `MetricCard`, `PANEL_CLASS`) with Tailwind semantic dark variants or CSS vars. E.g. `text-[#0F172A]` → `text-slate-900 dark:text-slate-100`, `bg-[#F8FAFC]` → `bg-slate-50 dark:bg-bm-surface`. Preserve visual hierarchy — secondary labels should remain visually subordinate, not promoted to primary weight.

2. Fix `FundFootprintMapInner.tsx` Leaflet tooltip styles. Tailwind `dark:` variants do not cascade into Leaflet's DOM-injected `.leaflet-tooltip` element. Fix with a global CSS override (see `docs/tips.md` Leaflet Dark Mode section): `.dark .leaflet-tooltip { background: var(--bm-surface); color: var(--bm-text); border-color: var(--bm-border); }`. Do not add inline styles per-tooltip.

3. Swap tile URL to CARTO dark in dark mode: check `document.documentElement.classList.contains('dark')` at mount and pick the appropriate tile URL. CARTO dark: `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png`. Attribution: `&copy; <a href="https://carto.com/">CARTO</a>`.

4. Fix `FundComparisonChart.tsx` Legend: `wrapperStyle={{ fontSize: 10, paddingTop: 4, color: 'var(--bm-text-muted)' }}`.

5. In `chart-theme.ts`: prefer `getAxisTickStyle()` over the static `AXIS_TICK_STYLE` export. Do not delete `AXIS_TICK_STYLE` (it may have external callers), but update its fallback to a higher-contrast value and add a `getAxisTickStyle()` call path for any component that renders in both modes. Audit components that `import { AXIS_TICK_STYLE }` directly and migrate them to the getter.

6. Container alignment: fund comparison chart and fund footprint map must align vertically at 100% zoom. Use deterministic heights (e.g. `h-[360px]` or a shared class) rather than `min-h` + `flex-1` combinations that produce different results depending on sibling content. Check the parent layout in the portfolio page.

### Acceptance criteria

- [ ] Fund page graph and map are aligned in both light and dark mode at 100% browser zoom
- [ ] Dark-mode chart plots, axis labels, ticks, and legends are readable without squinting
- [ ] Fund footprint panel (`PANEL_CLASS`) does not render as a white card inside the dark operator shell
- [ ] Leaflet tooltip text is readable in dark mode (not black text on white tooltip via Leaflet default)
- [ ] Map tile layer uses a dark-appropriate basemap in dark mode
- [ ] Unselected dark-mode secondary labels remain visually subordinate — do not promote every secondary label to primary weight
- [ ] Risk quadrant or related chart text that uses the same `chart-theme.ts` path is improved if reachable without expanding scope
- [ ] No schema, API, calculation, or seed data changes
- [ ] TypeScript passes: `cd repo-b && npx tsc --noEmit`
- [ ] No new browser console errors

### Tests required

- [ ] Screenshot of portfolio page in dark mode — before and after (save to `docs/plans/meridian-repe/screenshots/`)
- [ ] Screenshot of fund footprint map with marker visible in dark mode
- [ ] `cd repo-b && npx tsc --noEmit` passes
- [ ] Browser console shows no new errors

### Screenshot / receipt requirements

Save screenshots at:
- `docs/plans/meridian-repe/screenshots/T1-before-dark-chart.png`
- `docs/plans/meridian-repe/screenshots/T1-after-dark-chart.png`
- `docs/plans/meridian-repe/screenshots/T1-after-dark-map.png`

Update `docs/plans/meridian-repe/eval-plan.md` visual checks section with pass/fail after screenshots taken.

### Risk

**Low.** CSS-only changes and tile URL swap. No API calls, no schema changes. Rollback = revert file.

### DB migration

No.

### tips.md lesson (if learned)

> Leaflet tooltip content uses `.leaflet-tooltip` CSS class injected into document body — Tailwind `dark:` variants don't cascade into it. Fix with a global `.dark .leaflet-tooltip` override in the REPE environment's CSS, or use inline styles with CSS vars.

---

## Ticket 2 — Fund 7 IRR authoritative-source audit and fail-closed display correction {#ticket-2}

### Routed folders

- Primary: `docs/plans/meridian-repe/`
- AI runtime: `docs/plans/01-shared-standards/ai-runtime/fail-closed-rules.md`
- Authoritative state: `docs/SYSTEM_RULES_AUTHORITATIVE_STATE.md`
- Eval: `docs/plans/meridian-repe/eval-plan.md` (AI answer evals + smoke test)

### Files to inspect

| File | Why |
|---|---|
| `backend/app/finance/irr_engine.py` | XIRR implementation — does it guard against sparse cash flows? |
| `backend/app/services/re_fund_*.py` | Which service computes gross_irr for snapshot ingestion? |
| `backend/app/routes/re_authoritative.py` | Does the authoritative snapshot endpoint expose irr_insufficient_history null_reason? |
| `backend/app/schemas/re_authoritative.py` | Is `null_reason` typed as an enum with `irr_insufficient_history`? |
| `repo-b/src/app/lab/env/[envId]/re/funds/[fundId]/page.tsx` | How is IRR displayed — does it show null_reason if present? |
| `repo-b/src/components/repe/fund-scenario/OverviewTab.tsx` | Does OverviewTab handle null gross_irr with a chip? |

### Research tasks (do before code — this is a spike, not a display tweak)

The question is not "what number looks right." The question is:

1. What table or view produced the 456% value? Trace the API response for IGF VII 2024Q4 back to the DB query — is it coming from `re_authoritative_snapshots`, a base scenario table, or a live XIRR computation?
2. What cash flows support it? Query the underlying cash flow rows for IGF VII. Count them. Are there fewer than 4 entries? Is the earliest entry recent?
3. What period is the value as-of? Is the snapshot released or draft?
4. Does the UI currently show 456% as a plain number, or does it show a flag/chip? If it shows 456% bare, that is the display bug regardless of root cause.
5. Is `null_reason` a field on the authoritative snapshot schema? If not, this ticket may require a migration.

### Implementation notes

**Do not guess at a fix. Document the trace first.**

If root cause is confirmed as sparse XIRR:
1. Add a guard in `irr_engine.py` — if `n_cashflows < threshold`, return `null` with `null_reason: "irr_insufficient_history"`.
2. Propagate `null_reason` through the authoritative snapshot schema if not already present.
3. UI: fund KPI card must show "Insufficient history" chip, not 456%.
4. Winston must flag any IRR > 100% for a mature fund as possibly anomalous — see `ai-behavior.md` special rules.

**Do not just change the displayed value.** If you change 456% to 12.8% in a fixture without tracing the source, the next snapshot run will restore 456% and the display fix will silently regress.

**DB migration may be required.** Verify whether `null_reason` column exists before writing migration.

### Acceptance criteria

- [ ] IGF VII 2024Q4 gross_irr either shows a plausible value or shows `null_reason: "irr_insufficient_history"` chip in the UI
- [ ] Winston, when asked "What is the IRR for IGF VII?", returns the value with as-of date and snapshot source — or returns null_reason if history is insufficient
- [ ] `irr_engine.py` has a guard for sparse cash flow history
- [ ] No fund with `gross_irr > 1.0` displays without a flag or null_reason
- [ ] `verification/lint/no_legacy_repe_reads.py` passes
- [ ] `backend/tests/test_state_lock_invariants.py` passes

### Tests required

- [ ] Unit test in `backend/tests/` for `irr_engine.py` sparse cash flow guard
- [ ] Smoke test: `curl -s "http://localhost:8000/api/v2/re/funds" | jq '.[] | select(.irr > 1.0)'` — any result must have `null_reason` field

### Risk

**Medium.** Touches financial calculation engine. Must not break IRR for funds with normal history.

### DB migration

Possibly. Verify whether `re_authoritative_snapshots` already has a `null_reason` column.

---

## Ticket 3 — Fund detail page tabs and investment list {#ticket-3}

### Routed folders

- Primary: `docs/plans/meridian-repe/`
- Design: `docs/plans/01-shared-standards/design-system/component-contracts.md`
- Eval: `docs/plans/meridian-repe/qa-checklist.md`

### Files to inspect

| File | Why |
|---|---|
| `repo-b/src/app/lab/env/[envId]/re/funds/[fundId]/page.tsx` | 4,314 lines — identify tab structure, which tabs exist, which render placeholder content |
| `repo-b/src/components/repe/fund-scenario/OverviewTab.tsx` | Is the overview tab complete? |
| `repo-b/src/components/repe/fund-scenario/WaterfallTab.tsx` | Does waterfall tab show real data or placeholder? |
| `repo-b/src/components/repe/fund-scenario/CashFlowsTab.tsx` | Cash flows tab completeness |
| `repo-b/src/app/lab/env/[envId]/re/investments/` | Investment list under fund — does it exist? |

### Implementation notes

- Identify all tabs on the fund detail page that show placeholder or skeleton content
- For each incomplete tab: either wire it to the correct API or add an explicit "Coming soon" state (not a loading spinner that never resolves)
- Investment list under fund: must show deal name, status, committed capital, IRR if available, market
- Do NOT build net-new features — polish and wire existing structure

### Acceptance criteria

- [ ] All fund detail tabs either show real data or an explicit empty state (not a stuck spinner)
- [ ] Investment list renders with at least: name, status, committed capital
- [ ] KPI cards on overview tab show IRR, TVPI, DPI with as-of dates per `design-adaptation.md`

### Risk

**Low.** UI-only. No schema changes expected.

### DB migration

No.

---

## Ticket 4 — Sortable investment table with IRR and market columns {#ticket-4}

### Routed folders

- Primary: `docs/plans/meridian-repe/`
- Design: `docs/plans/01-shared-standards/design-system/component-contracts.md`

### Files to inspect

| File | Why |
|---|---|
| `repo-b/src/components/repe/FundsList.tsx` | Existing fund list — is it sortable? |
| `repo-b/src/app/lab/env/[envId]/re/investments/` | Investment table or list — check existing columns |
| `repo-b/src/components/repe/workspace/` | Table wrappers, context rail, column patterns |
| `backend/app/routes/re_fund.py` | Does the fund list endpoint support sorting params? |

### Implementation notes

- Add client-side column sorting for: fund name, vintage, IRR, TVPI, total NAV, market (if applicable)
- IRR column must show null_reason chip if IRR is unavailable, not 0% or blank
- Sort should be stable (secondary sort by fund name on tie)
- Do not add server-side sorting until client-side is proven to work correctly

### Acceptance criteria

- [ ] Clicking a column header sorts the investment/fund table
- [ ] IRR column handles null values with null_reason chip, not dash or 0%
- [ ] No new network requests triggered by sort (client-side only)

### Risk

**Low.** UI only.

### DB migration

No.

---

## Ticket 5 — Map marker persistence {#ticket-5}

### Routed folders

- Primary: `docs/plans/meridian-repe/`
- Eval: `docs/plans/meridian-repe/qa-checklist.md`

### Files to inspect

| File | Why |
|---|---|
| `repo-b/src/components/repe/fund/FundFootprintMap.tsx` | Filter state lives here — check `STORAGE_PREFIX` and `useState` for selected asset/market |
| `repo-b/src/components/repe/fund/FundFootprintMapInner.tsx` | Marker re-creation on `useMemo` — does dependency array include filter state? |
| `repo-b/src/components/repe/portfolio/PortfolioAssetMap.tsx` | Same issue may exist here |

### Implementation notes

The bug: when the status filter changes (owned/pipeline/all), the `assetIcons` `useMemo` in `FundFootprintMapInner.tsx` recomputes — this is correct. However, if `selectedAssetId` is reset to `null` on filter change in the parent (`FundFootprintMap.tsx`), the selected marker loses its highlight state on filter change even when the asset is still visible.

Fix: do not reset `selectedAssetId` on filter change if the selected asset is still in the filtered set. Only reset if the selected asset is no longer visible.

Also check: does Leaflet's `MapContainer` remount on filter change? If so, the map resets zoom and center. This is a heavier bug — if present, stabilize the key prop on `MapContainer`.

### Acceptance criteria

- [ ] Selecting a marker, then changing the status filter, keeps the marker selected if it is still visible
- [ ] Zoom and pan position is preserved across filter changes
- [ ] No unnecessary Leaflet remounts

### Risk

**Low.** State management only.

### DB migration

No.

---

## Ticket 6 — Meridian REPE visual/data regression harness and screenshot receipts {#ticket-6}

### Routed folders

- Primary: `docs/plans/meridian-repe/`
- Eval: `docs/plans/01-shared-standards/evals/regression-suite.md`, `docs/plans/01-shared-standards/evals/eval-taxonomy.md`
- Eval: `docs/plans/meridian-repe/eval-plan.md`
- QA: `docs/plans/meridian-repe/qa-checklist.md`

### Files to create/update

| File | Action |
|---|---|
| `repo-b/src/components/repe/fund/__tests__/FundFootprintMap.test.tsx` | Visual smoke test — does the component render without crashing? |
| `backend/tests/test_irr_engine_sparse.py` | Unit test for XIRR guard (from Ticket 2) |
| `docs/plans/meridian-repe/screenshots/` | Screenshot baseline from Tickets 1–5 |
| `docs/plans/meridian-repe/eval-plan.md` | Update visual checks with pass/fail status |
| `docs/plans/meridian-repe/qa-checklist.md` | Update with confirmed-passing items |
| `docs/tips.md` | Append Leaflet dark mode lesson and any other learnings |

### What this ticket is

T6 is not polish. It is the permanent guardrail that makes Tickets 1–5 durable. Its outputs are not optional cleanup — they are the evidence layer that prevents the next coding session from silently regressing what T1–T5 fixed.

### Implementation notes

- Run the full regression suite and record results explicitly (not "passed" — show the output)
- Confirm `no_legacy_repe_reads.py` and `test_state_lock_invariants.py` still pass
- Screenshot baseline must show dark mode chart readability as locked state — if a future T1-equivalent regression breaks it, the diff is detectable
- Write at least one component render test for `FundFootprintMap` that fails if the component renders with a hardcoded light background in dark mode
- Update `next-session.md` with open items after T6 completes

### Acceptance criteria

- [ ] `python verification/lint/no_legacy_repe_reads.py` passes with 0 violations
- [ ] `cd backend && python -m pytest tests/test_state_lock_invariants.py -v` passes
- [ ] Screenshot baseline saved for Meridian REPE in dark mode (fund list, fund detail, portfolio map)
- [ ] `eval-plan.md` visual checks section updated with confirmed-passing items
- [ ] `tips.md` updated with at least one reusable lesson

### Risk

**Low.** Testing and documentation only.

### DB migration

No.

---

## Post-session update checklist

After each ticket:
- [ ] Update `docs/plans/meridian-repe/next-session.md` with what's next
- [ ] Update `docs/plans/meridian-repe/backlog.md` with new bugs found
- [ ] If a design contract changed → update `docs/plans/01-shared-standards/design-system/`
- [ ] Add any reusable lesson to `docs/tips.md`
- [ ] Update this dispatch record with implementation notes (add `**Implemented:**` section under each ticket)

---

## Recommended implementation order

**T1 → T5 → T3 → T4 → T2 → T6**

- **T1** — visual, no schema risk, proves the planning → eval → receipt loop
- **T5** — simple state bug, confirms map interaction works before T3/T4 build on it
- **T3, T4** — UI structure and table; now that map and dark mode are confirmed working
- **T2** — data archaeology; may take more than one session; do not start until T1–T4 are complete
- **T6** — permanent guardrail; runs last because it locks in what everything else produced

**Do not start with T2.** It is a trace-the-source investigation with uncertain scope. Spending the first session in data archaeology produces nothing shippable and demoralizes the loop. Start with T1, ship something visible, confirm the system works.

---

## Gaps discovered during dispatch

1. `docs/plans/meridian-repe/architecture.md` flagged several "Needs verification" items — Supabase table names for funds, assets, snapshots still unverified. Ticket 2 will surface these.
2. No Playwright test fixtures exist for the Meridian REPE environment. Ticket 6 creates the baseline.
3. The portfolio map (`PortfolioAssetMap.tsx` / `PortfolioAssetMapInner.tsx`) was not inspected in detail — T1 should also audit these for the same hardcoded color pattern found in `FundFootprintMap.tsx`.
4. `docs/plans/03-implementation-plans/` was created fresh — no prior implementation plans exist for this environment.
