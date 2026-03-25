# Meta Prompt — Supply Pipeline Delivery Schedule — Units-by-Quarter vs. Demand Chart

**Feature Card:** 03a36c0e-a620-489c-925f-29cf45511a62
**Generated:** 2026-03-24
**Priority:** 49/100
**Status:** prompted

---

You are building a Winston feature identified by the MSA Rotation Engine during a research sweep of **West Palm Beach — Downtown** on **2026-03-23** (brief_id: 8b05bdf7).

## Feature: Supply Pipeline Delivery Schedule — Units-by-Quarter vs. Demand Chart

**Category:** visualization
**Priority:** 49/100
**Target Module:** portfolio_dashboard
**Lineage:** First surfaced in wpb-downtown Zone Intelligence Brief dated 2026-03-23. WPB has 4,085+ units under construction (including a $772M CityPlace construction loan) with no quarterly delivery visualization. The gap applies to all 14 watchlist zones — every submarket brief identifies supply pipeline data but Winston has no chart for it. This is the first user-facing supply risk visualization in the MSA Intelligence surface.

## Why This Exists

During the Phase 1 research sweep of West Palm Beach — Downtown, the engine identified 4,085+ units under construction but could not chart when units deliver relative to demand absorption. REPE analysts need a quarterly units-delivered vs. net-absorption waterfall to assess supply risk timing — the central question in any acquisition decision. This capability does not currently exist in Winston. Building it will improve research quality for all 14 zones, not just the one that surfaced it.

## Specification

**Inputs:**
- `msa_zone_id` (UUID) — zone to visualize
- Brief signals JSONB from `msa_zone_intel_brief.signals` — extract pipeline data that the research sweep captured
- Optionally: `delivery_schedule` JSONB (if separately stored after schema extension) — array of `{quarter: "2026-Q2", units: int}` objects
- Net absorption series: quarterly estimates from `msa_absorption_model` outputs (see card 7e571201) or fallback to brief signals

**Outputs (chart rendered in UI):**
- Stacked bar chart: units delivered by quarter (next 8 quarters, Q1 through Q8 from current date)
- Overlay line: net absorption trend (quarterly, matching the bar chart timeframe)
- Key metrics panel below chart:
  - `supply_overhang_units` — cumulative excess supply in units (positive = oversupply)
  - `months_of_supply` — supply overhang / monthly absorption rate
  - `peak_delivery_quarter` — the quarter with the highest projected unit deliveries
- Empty state: if no pipeline data available for the zone, render a clear data gap warning with a note that data will populate when the next brief runs

**Acceptance Criteria:**
- Chart renders with at least 4 forward quarters of data when brief signals contain pipeline information
- Fallback to web-sourced delivery estimates when detailed CoStar data unavailable (use brief signals `pipeline_units_under_construction` distributed evenly across 4Q as a safe assumption)
- Chart is downloadable as PNG from the Winston dashboard (use Recharts `toDataURL` or equivalent)
- Updates automatically when new brief runs (via Supabase Realtime subscription on `msa_zone_intel_brief`)
- Empty state renders gracefully with zero errors when no brief exists for a zone
- `peak_delivery_quarter` label displayed prominently on the chart

**Test Cases:**
1. **WPB pipeline data:** Zone has brief with `pipeline_units_under_construction=4085`; chart shows quarterly distribution bars summing to ~4085, absorption line below the bars in peak quarters, `months_of_supply` > 12
2. **No pipeline data zone:** Zone has brief but `pipeline_units_under_construction` is null/absent → empty state with message "Supply pipeline data unavailable for this zone — will populate on next research sweep"
3. **No brief at all:** Zone has no `msa_zone_intel_brief` rows → empty state with message "No research sweep completed yet"
4. **Miami-Wynwood:** `pipeline_units=1317` across mixed-use/multifamily → chart shows 4Q distribution, metrics panel shows lower `months_of_supply` than WPB given smaller pipeline

## Schema Impact

The chart reads from existing `msa_zone_intel_brief.signals` JSONB — no new columns required.

Optional: add a `delivery_schedule` JSONB column to `msa_zone_intel_brief` for storing per-quarter delivery estimates when richer data is available. If you add this, create `repo-b/db/schema/419_msa_delivery_schedule.sql` (or combine with the absorption model migration if it exists). This column is optional — the chart must work without it using the fallback.

## Files to Touch

**New files to create:**
- `repo-b/src/components/msa/SupplyPipelineChart.tsx` — React component rendering the stacked bar + line chart
  - Use Recharts (`ComposedChart` with `Bar` and `Line`) — already available in the project
  - Props: `{ msa_zone_id: string, signals: Record<string, any> | null, brief_id?: string }`
  - Include PNG download button using canvas `toDataURL`
  - Include empty state component for missing data cases
- `repo-b/src/components/msa/index.ts` — barrel export for MSA components (create the `msa/` directory)

**Files to modify:**
- `repo-b/src/app/lab/env/[envId]/msa/page.tsx` — add `SupplyPipelineChart` to the Zone Intelligence Brief view section
  - If this page does not yet exist, create it as part of the MSA Intelligence lab environment (see card 4068f9fe which introduced the msa environment)
  - Import and render `<SupplyPipelineChart msa_zone_id={zone.msa_zone_id} signals={latestBrief?.signals ?? null} brief_id={latestBrief?.brief_id} />`
- `backend/app/services/msa_rotation_engine.py` — when writing a brief, extract delivery schedule from signals and store in structured format within `signals.delivery_schedule` JSONB array if not already structured

**Do NOT touch:**
- Any credit, PDS, or AI gateway services
- `backend/app/services/market_regime_engine.py`
- Non-MSA chart components

## Implementation Instructions

1. Read `CLAUDE.md` — this feature routes to `agents/frontend.md` for the React component and `agents/lab-environment.md` for the lab page integration
2. Read `docs/CAPABILITY_INVENTORY.md` — confirm no MSA supply chart already exists (it does not — MSA Rotation Engine capabilities are not listed in the inventory)
3. Read `docs/LATEST.md` — MSA environment OPERATIONAL per 2026-03-24; Zone Intelligence Dashboard (card 4068f9fe) may already be building; coordinate with it
4. Read `repo-b/db/schema/418_msa_rotation_engine.sql` — understand `msa_zone_intel_brief.signals` JSONB structure
5. Read `docs/msa-features/prompts/4068f9fe-zone-intelligence-dashboard.md` — understand the MSA lab page structure where this chart will live
6. Check if `repo-b/src/app/lab/env/[envId]/msa/page.tsx` exists; if not, create it as a minimal page that renders the Zone Brief with the SupplyPipelineChart embedded
7. Check what Recharts chart components are already used in `repo-b/src/components/charts/` — follow existing patterns for chart styling and color scheme
8. Implement `SupplyPipelineChart.tsx` with Recharts `ComposedChart`
9. Wire Supabase Realtime subscription if the MSA page already implements it (follow the pattern from existing Realtime-enabled pages)
10. Run `tsc --noEmit` from `repo-b/` and fix any TypeScript errors
11. Stage only changed files
12. Commit:
    ```
    feat(msa): supply pipeline delivery schedule chart

    Feature Card: 03a36c0e-a620-489c-925f-29cf45511a62
    Lineage: WPB brief 8b05bdf7 (4085 units under construction, no chart)
    Renders: 8-quarter stacked bar + absorption overlay + PNG export

    Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
    ```
13. Push: `git pull --rebase origin main && git push origin main`
14. Update feature card status:
    ```sql
    UPDATE msa_feature_card SET status = 'built', updated_at = now() WHERE card_id = '03a36c0e-a620-489c-925f-29cf45511a62';
    ```

## Proof of Execution

After building, the coding agent must:
- Verify the chart renders for WPB zone (or any zone with `pipeline_units_under_construction` in brief signals) — screenshot or describe what renders
- Verify empty state renders for a zone with no brief
- Update card status from `prompted` to `built`
- Write a summary to `docs/ops-reports/coding-sessions/msa-2026-03-24.md` noting whether the WPB supply chart would have added clarity to the brief

## Dependency Note

This chart is **independent** of the absorption model (card 7e571201) but becomes richer when the absorption model is available — the net absorption line on the chart pulls from absorption model outputs when they exist. Build this card without waiting for the absorption model; use a simplified quarterly absorption estimate (current_occupancy × typical_quarterly_absorption_rate) as a fallback absorption line.
