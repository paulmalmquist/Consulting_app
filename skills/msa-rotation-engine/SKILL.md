---
name: msa-rotation-engine
description: Daily-rotating deep-dive engine that cycles through a curated watchlist of sub-MSA zones, executing a three-phase pipeline per rotation — Research → Gap Detection → Feature Enhancement. Each day's MSA focus produces actionable market intelligence AND concrete Winston build directives derived from what the research surfaced. Use when Paul says "rotate into [zone]", "what's the MSA focus today", "run the rotation engine", "research [market]", "what feature gaps did we find", or when any scheduled msa-* task runs.
---

# MSA Rotation Engine

A daily-rotating deep-dive engine that cycles through a curated watchlist of sub-MSA zones. Rather than broad metros, the watchlist targets neighborhood/submarket-level granularity where actual acquisition decisions happen.

The core insight: most REPE platforms treat market data as a static layer. This skill makes market research a **generative input to product development**. Every day Winston gets smarter about one specific market, and the gaps discovered during research become features.

## Three-Phase Pipeline

### Phase 1: Research Sweep (`msa-research-sweep`)

A structured research protocol against the target zone — not generic googling, but an acquisition analyst's due diligence checklist automated:

| Category | What to find | Public sources |
|---|---|---|
| Transaction Activity | Sales comps, deed transfers, lis pendens, NODs, 1031 patterns, buyer mix | County assessor/recorder, public records |
| Supply Pipeline | Building permits, entitled projects, demolitions, zoning variances, PUD amendments | County/city permit portals, planning commission agendas |
| Demand Drivers | Employment (BLS QCEW), employer moves, population migration (IRS SOI), transit projects | BLS, Census ACS, FRED, local business journals |
| Rent & Occupancy | Asking rents by bedroom, concessions, effective rent deltas, occupancy by vintage, STR penetration | Zillow, Apartments.com, local MLS, AirDNA signals |
| Capital Markets | Bank CRE lending (FFIEC), agency volume, CMBS delinquency, local REIT/fund activity | FFIEC call reports, SEC EDGAR 13F, FRED |
| Regulatory | Rent control proposals, impact fees, OZ status, tax reassessment cycles | City council agendas, state legislature trackers |

**Output:** A Zone Intelligence Brief (structured JSON) stored in both Supabase (`msa_zone_intel_brief`) and `docs/msa-intel/{zone_slug}-{date}.json`.

### Phase 2: Gap Detection (`msa-gap-detection`)

Reads the day's Zone Intelligence Brief and audits Winston's current codebase against what the research needed. Every time the research hit a wall (data source not integrated, calculation not supported, visualization missing), it becomes a Feature Card.

**Gap categories:**
1. **data_source** — Needed data but no connector exists
2. **calculation** — Wanted to compute something the engine doesn't support
3. **visualization** — A chart/map/heatmap would communicate the finding better
4. **model** — No way to score or rank across zones comparatively
5. **workflow** — Research took too many steps that should be a single pipeline

**Output:** Feature Cards stored in Supabase (`msa_feature_card`) and `docs/msa-features/cards-{date}.md`.

### Phase 3: Feature Enhancement (`msa-feature-builder`)

Converts top Feature Cards into meta prompts ready for the autonomous coding session:

1. Prioritizes today's cards against the existing backlog
2. Generates the build prompt with full context (what, why, schema impact, tests, proof-of-execution)
3. Tags the feature to the appropriate Winston module
4. Logs lineage — every feature traces back to the specific rotation run that surfaced it

**Output:** Meta prompts written to `docs/msa-features/prompts/` and card status updated in Supabase.

## Zone Watchlist

Stored in Supabase `msa_zone` table. 14 zones across 3 tiers:

**Tier 1 — Active Deal Flow** (rotate every 5–7 days):
WPB Downtown, Miami Wynwood, FTL Flagler Village, Tampa Water Street, Orlando Creative Village

**Tier 2 — Opportunistic/Contrarian** (rotate every 10–14 days):
Jacksonville Brooklyn, Nashville WeHo, Charlotte South End, Raleigh Downtown South, Austin East Riverside

**Tier 3 — Macro Bellwethers** (rotate monthly):
Phoenix Tempe, Dallas Deep Ellum, Denver RiNo, Atlanta Westside

## Rotation Selection Algorithm

The scheduler picks today's zone based on:

```sql
SELECT msa_zone_id, zone_slug, zone_name, tier,
       EXTRACT(DAY FROM now() - COALESCE(last_rotated_at, '2020-01-01')) AS days_since_rotation,
       rotation_cadence_days,
       rotation_priority_score
FROM msa_zone
WHERE is_active = true
  AND tenant_id = '{tenant_id}'
ORDER BY
  -- Overdue zones first (days since > cadence)
  CASE WHEN EXTRACT(DAY FROM now() - COALESCE(last_rotated_at, '2020-01-01')) >= rotation_cadence_days
       THEN 0 ELSE 1 END,
  -- Then by heat score (external signal bumps)
  rotation_priority_score DESC,
  -- Then by staleness
  last_rotated_at ASC NULLS FIRST
LIMIT 1;
```

After selection, update: `UPDATE msa_zone SET last_rotated_at = now() WHERE msa_zone_id = '{selected}';`

## Schema

Tables live in Supabase (migration `418_msa_rotation_engine.sql`):

- **`msa_zone`** — Zone watchlist with tier, cadence, PostGIS polygon, heat score
- **`msa_zone_intel_brief`** — Daily research output per zone (signals JSON, composite score, findings)
- **`msa_feature_card`** — Gap-to-feature pipeline (category, priority, spec, meta prompt, status, lineage)

## Scheduled Task Map

All tasks use the `msa-` prefix for sidebar organization:

| Task | Time | Model | Phase | Pushes to git? |
|---|---|---|---|---|
| `msa-rotation-scheduler` | 04:00 | haiku | Zone selection | No (Supabase only) |
| `msa-research-sweep` | 04:30 | sonnet | Phase 1 | Yes |
| `msa-gap-detection` | 21:00 | sonnet | Phase 2 | Yes |
| `msa-feature-builder` | 21:30 | sonnet | Phase 3 | Yes |
| `msa-rotation-digest` | 22:00 | sonnet | Summary | Yes |

## Output Folders

| Folder | Contents |
|---|---|
| `docs/msa-intel/` | Zone Intelligence Briefs (JSON + markdown) |
| `docs/msa-features/` | Feature Cards and meta prompts |
| `docs/msa-features/prompts/` | Build-ready prompts for coding sessions |
| `docs/msa-digests/` | Daily rotation summaries |

## Integration Points

- The existing `autonomous-coding-session` (3 PM) should read `docs/msa-features/prompts/` alongside `docs/feature-radar/` when picking its daily task
- The `morning-ops-digest` should include MSA rotation status in the daily brief
- Feature Cards with status `prompted` are ready for the coding agent to pick up
- The weekly code quality audit should track MSA feature card completion rates

## Manual Triggers

- `/rotate` or `/rotate wpb-downtown` — Force a specific zone rotation
- Phase 1 can be run independently: "research [zone_slug]"
- Feature cards can be queried: "what MSA feature gaps are open?"
- Heat score can be bumped manually: "bump priority for [zone_slug]" (e.g., after a rate change or major transaction)

## Production Hardening

All scheduled tasks follow the patterns in `skills/winston-autonomous-loop/SKILL.md` Production Hardening section:
- Git auth via PAT-in-remote-URL
- Stale lock clearing before git operations
- Pull-rebase-push for conflict handling
- Daily scheduling (7 days/week)
- CI verification for any task that pushes code
