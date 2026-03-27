# Meta Prompt Template — MSA Feature Card → Build Directive

---

You are building a Winston feature identified by the MSA Rotation Engine during a research sweep of **Tampa Water Street / Channel District** on **2026-03-26**.

## Feature: Cap Rate Trend Chart — Submarket Time Series Visualization

**Category:** visualization
**Priority:** 37.80/100
**Target Module:** msa-intelligence
**Lineage:** Originated from tampa-water-st 2026-03-26 brief. Gap: No cap rate trend chart for submarket over time. Affects virtually all zones — every brief would benefit from historical cap rate context.

## Why This Exists

During the Phase 1 research sweep of Tampa Water Street / Channel District, the engine needed a time-series visualization showing cap rate trends for the submarket over 5-10 years by asset class. The research brief only had point-in-time cap rates (e.g. 6.3% retail), but no trend data. A historical visualization would show pricing trajectory and help identify compression/expansion cycles. This capability does not currently exist in Winston. Per CAPABILITY_INVENTORY.md, Winston has REPE financials, asset analytics, and scenario modeling, but no submarket-level cap rate time series. Building it will improve research quality for virtually all zones, not just Tampa.

## Specification

**Inputs:**
- msa_zone_id
- asset_class (multifamily, office, retail, industrial)
- date_range (start_year, end_year)

**Outputs:**
- time_series_chart_data (quarterly cap rate values)
- trend_direction (compressing, expanding, stable)
- basis_point_change (over selected period)

**Acceptance Criteria:**
1. Chart renders cap rate by quarter for at least 3 years
2. Supports multifamily, office, retail, industrial asset classes
3. Trend arrow and bps change annotation on chart
4. Falls back gracefully when historical data is sparse (shows available data points with "limited data" indicator)

**Test Cases:**
1. Render Tampa multifamily cap rate 2021-2026 — should show quarterly data points with trend line
2. Render Nashville office cap rate with sparse data — should degrade gracefully with available points
3. Compare two asset classes on same chart — both lines render with legend

## Schema Impact

May need `msa_cap_rate_history` table or extend `msa_zone_metric` with temporal cap rate data. Recommended approach:

```sql
CREATE TABLE msa_cap_rate_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  msa_zone_id UUID REFERENCES msa_zone(id),
  asset_class TEXT NOT NULL CHECK (asset_class IN ('multifamily', 'office', 'retail', 'industrial')),
  quarter DATE NOT NULL,
  cap_rate NUMERIC(5,2),
  data_source TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(msa_zone_id, asset_class, quarter)
);
```

## Files to Touch

- `repo-b/src/components/msa/CapRateTrendChart.tsx` — New React component using Recharts LineChart
- `backend/app/services/msa_metrics.py` — Add `get_cap_rate_history()` service function
- `backend/app/routes/msa_routes.py` — Add GET `/api/v1/msa/zones/{zone_id}/cap-rate-history` endpoint
- `repo-b/db/schema/` — New migration for `msa_cap_rate_history` table (find next migration number)

## Implementation Instructions

1. Read `CLAUDE.md` and follow its dispatch rules
2. Read `docs/CAPABILITY_INVENTORY.md` — confirm this feature does not already exist
3. Read `docs/LATEST.md` for current production status
4. Plan the implementation before writing code
5. Start with the database migration — create the `msa_cap_rate_history` table
6. Build the backend service function in `msa_metrics.py` that queries cap rate history and computes trend direction + bps change
7. Add the API route in `msa_routes.py`
8. Build the React component using Recharts (LineChart with multiple series support)
9. Integrate the chart into the zone brief view
10. Run linters and type checks
11. Stage only changed files (never `git add -A`)
12. Commit with message referencing the MSA feature card:
   ```
   feat(msa): Cap Rate Trend Chart — Submarket Time Series Visualization

   Feature Card: 3fbd2b8e-5008-47be-b8fb-acc556171afb
   Lineage: tampa-water-st 2026-03-26 brief — no cap rate trend data for submarket

   Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
   ```
13. Push with conflict handling: `git pull --rebase origin main && git push origin main`
14. Update the feature card status in Supabase to `built`

## Proof of Execution

After building, the coding agent must:
- Verify the feature works by running at least one test case (Tampa multifamily chart renders)
- Update the card status from `prompted` to `built`
- Write a summary to `docs/ops-reports/coding-sessions/msa-2026-03-26.md`
- Note whether this feature would have improved the Tampa Water Street research brief that surfaced it
