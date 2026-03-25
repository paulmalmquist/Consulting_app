# Meta Prompt — Zone Intelligence Dashboard: Submarket Heat Map + Brief Viewer

> **Card ID:** 4068f9fe-2e68-42b6-84e2-c1acb1348c17
> **Status:** prompted (as of 2026-03-23)
> **Priority:** 54/100
> **Category:** visualization
> **Target Module:** portfolio_dashboard

---

You are building a Winston feature identified by the MSA Rotation Engine during a 2026-03-22 cold-start audit of the `msa_zone`, `msa_zone_intel_brief`, and `msa_feature_card` tables.

## Feature: Zone Intelligence Dashboard — Submarket Heat Map + Brief Viewer

**Category:** visualization
**Priority:** 54/100
**Target Module:** portfolio_dashboard
**Lineage:** Identified during 2026-03-22 cold-start audit. The MSA rotation engine has schema, skill, and scheduled tasks defined, but zero frontend surface. An analyst has no way to interact with zone intelligence through the Winston UI. Lab environment type list (CAPABILITY_INVENTORY.md) does not include an MSA or market-intelligence environment type.

## Why This Exists

During the 2026-03-22 cold-start audit, the engine found that `msa_zone`, `msa_zone_intel_brief`, and `msa_feature_card` tables contain structured zone data but no Winston frontend surface exists to display it. REPE analysts and acquisition teams have no UI to view zone acquisition scores, today's active brief, or the feature backlog. Building this turns the MSA Rotation Engine from a background data process into a user-facing acquisition intelligence tool. This affects all 14 active zones.

## Specification

**Inputs:**
- `msa_zone` rows (all active zones — 14 rows with composite_score, tier, last_rotated_at, rotation_priority_score)
- `msa_zone_intel_brief` (latest brief per zone — signals JSONB, findings text, brief_date)
- `msa_feature_card` rows (open cards by priority — status, gap_category, priority_score, title)
- Mapbox or Leaflet tile layer for geographic overlay (use Leaflet — already available in repo or CDN)

**Outputs:**
- Zone watchlist table with acquisition scores, tier badges (A/B/C/D), last-rotated date, and color-coded rows
- "Today's Active Zone" highlight card showing composite score, key findings bullets, and supply/demand signal gauges
- Supply/demand signal mini-charts (sparklines) per zone row
- Feature card backlog table with gap_category, priority_score, and status filters

**Acceptance Criteria:**
- Dashboard loads all 14 zones in < 2s
- Clicking a zone shows its latest brief (or empty state if no brief yet)
- Acquisition score updates on the page when a new brief is inserted to Supabase (Supabase Realtime subscription or polling fallback)
- Mobile-responsive — usable on iPad in the field
- Empty state is handled gracefully when `msa_zone_intel_brief` has no rows

**Test Cases:**
- Load dashboard with empty `msa_zone_intel_brief` table — verify empty state messaging rather than broken UI
- Insert a mock brief for `wpb-downtown` zone, verify score and findings update without page reload
- Verify feature card table filters by `gap_category` correctly (e.g. filter to `data_source` only)

## Schema Impact

No new tables. Read-only access to:
- `msa_zone` — all rows
- `msa_zone_intel_brief` — latest per zone (join on `zone_id`, order by `brief_date DESC`, limit 1 per zone)
- `msa_feature_card` — open cards (`status IN ('identified','specced','prompted','built')`)

Access via Supabase REST client (`@supabase/supabase-js`) already available in `repo-b`. Use Supabase Realtime for live updates if complexity is low; otherwise use 30-second polling.

## Files to Touch

### New files (create):
```
repo-b/src/app/lab/env/[envId]/msa/
repo-b/src/app/lab/env/[envId]/msa/page.tsx          ← main dashboard page
repo-b/src/app/lab/env/[envId]/msa/layout.tsx         ← layout wrapper (copy from re/layout.tsx pattern)
repo-b/src/app/lab/env/[envId]/msa/error.tsx          ← error boundary (copy from re/error.tsx pattern)
repo-b/src/components/msa/MsaZoneWatchlist.tsx         ← zone table with tier badges and scores
repo-b/src/components/msa/MsaActiveBriefCard.tsx       ← highlighted active zone brief viewer
repo-b/src/components/msa/MsaScoreGauge.tsx            ← composite score gauge (0-100)
repo-b/src/components/msa/MsaFeatureBacklog.tsx        ← feature card backlog table
repo-b/src/components/msa/MsaSparkline.tsx             ← mini supply/demand signal charts
```

### Existing files to modify:
```
repo-b/src/components/lab/environments/constants.ts   ← add 'msa_intelligence' to industries array and INDUSTRY_DISPLAY_MAP
repo-b/src/app/lab/env/[envId]/page.tsx               ← add isMsaEnvironment() guard if needed for routing
```

### Reference patterns to read before coding:
```
repo-b/src/app/lab/env/[envId]/re/page.tsx            ← environment landing page pattern
repo-b/src/app/lab/env/[envId]/re/intelligence/       ← intelligence sub-page pattern
repo-b/src/components/repe/RepeIndexScaffold.tsx       ← table scaffolding pattern used across REPE
repo-b/src/components/charts/TrendLineChart.tsx        ← chart component pattern for sparklines
```

## Codebase Orientation

Before writing code:
1. Read `docs/CAPABILITY_INVENTORY.md` — confirm MSA lab environment does not exist (it does not as of 2026-03-22)
2. Read `docs/LATEST.md` — MSA Rotation Engine is BLOCKED (cold start, no briefs yet). The dashboard must handle empty data gracefully — this is the primary UX challenge.
3. Read `repo-b/src/components/lab/environments/constants.ts` to understand the industry type system before adding `msa_intelligence`
4. Read `repo-b/src/app/lab/env/[envId]/re/page.tsx` for the environment page pattern
5. Check Supabase table schemas by querying: `SELECT column_name, data_type FROM information_schema.columns WHERE table_name IN ('msa_zone', 'msa_zone_intel_brief', 'msa_feature_card') ORDER BY table_name, ordinal_position;`

## Implementation Instructions

1. Read `CLAUDE.md` and follow its dispatch rules (this is a frontend feature → `agents/frontend.md` and `.skills/feature-dev/SKILL.md`)
2. Read `docs/CAPABILITY_INVENTORY.md` — confirm MSA lab environment does not already exist
3. Read `docs/LATEST.md` for current production status
4. Query Supabase to understand the actual column shapes of `msa_zone`, `msa_zone_intel_brief`, and `msa_feature_card` before building components
5. Add `msa_intelligence` to the industries array in `constants.ts` with display label "MSA Market Intelligence"
6. Build the main `/msa/page.tsx` first with a skeleton that queries all three tables
7. Build `MsaZoneWatchlist.tsx` — the core table. Use `RepeIndexScaffold` pattern for consistency. Tier badge should use color: A=green, B=blue, C=yellow, D=red.
8. Build `MsaActiveBriefCard.tsx` — displays the brief for whichever zone has the highest `rotation_priority_score`. If no briefs exist, show "No briefs generated yet — the MSA Research Sweep must run first."
9. Build `MsaFeatureBacklog.tsx` — simple table, filter by `gap_category` dropdown
10. Add Supabase Realtime subscription in `page.tsx` for `msa_zone_intel_brief` inserts — update the active brief card on new data
11. Run `tsc --noEmit` from `repo-b/` to confirm no TypeScript errors
12. Run `npm run lint` from `repo-b/` to confirm no ESLint errors
13. Stage only changed files (never `git add -A`)
14. Commit with:
    ```
    feat(msa): Zone Intelligence Dashboard — Submarket Heat Map + Brief Viewer

    Feature Card: 4068f9fe-2e68-42b6-84e2-c1acb1348c17
    Lineage: Cold-start audit 2026-03-22. MSA rotation engine had zero frontend surface.
    Adds msa_intelligence lab environment type with zone watchlist, brief viewer,
    score gauges, and feature backlog table. Empty-state safe for pre-sweep state.

    Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
    ```
15. `git pull --rebase origin main && git push origin main`
16. Update feature card status in Supabase: `UPDATE msa_feature_card SET status = 'built', updated_at = now() WHERE card_id = '4068f9fe-2e68-42b6-84e2-c1acb1348c17';`

## Proof of Execution

After building, the coding agent must:
- Verify the feature works by opening the MSA dashboard in a browser or running a component test
- Run at least one test case (empty-state test is the most important given MSA is pre-sweep)
- Update the card status from `prompted` to `built` in Supabase
- Write a summary to `docs/ops-reports/coding-sessions/msa-2026-03-23.md`
- Note whether this dashboard would have been useful if the sweep runner (card `b1620471`) had already run

## Dependency Note

**This feature depends on the MSA Research Sweep Runner (card `b1620471`, priority 72, already prompted).** The dashboard will be fully functional only after the sweep runner runs and populates `msa_zone_intel_brief`. However, the dashboard MUST be built now because:
1. It validates the Supabase schema is correct
2. It provides a Realtime subscriber that will light up the moment the first brief is written
3. The empty-state UX is valuable on its own (shows zones exist, scores are TBD)

Build the dashboard defensively — assume zero rows in `msa_zone_intel_brief` until told otherwise.
