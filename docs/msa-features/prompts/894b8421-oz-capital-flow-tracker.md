# Meta Prompt — MSA Feature Card → Build Directive

You are building a Winston feature identified by the MSA Rotation Engine during a research sweep of **Nashville WeHo (nash-weho)** on **2026-03-29**.

## Feature: Opportunity Zone Capital Flow Tracker — Census Tract Investment Volume

**Category:** data_source
**Priority:** 9.0/100
**Target Module:** data_connectors
**Card ID:** 894b8421-f0cf-41c5-a57b-df57f7f692a4
**Lineage:** Identified during 2026-03-29 rotation into nash-weho because WeHo contains OZ-designated census tracts but capital flows into those tracts were untraceable through public web search

## Why This Exists

During the Phase 1 research sweep of Nashville WeHo, the engine identified OZ-designated census tracts but could not estimate how much OZ-qualified capital has actually been deployed. Currently Winston can map OZ boundaries but cannot assess whether OZ incentives are actually driving investment into the zone. This gap means supply risk scoring lacks a critical demand-side signal. This capability does not currently exist in Winston. Building it will improve research quality for any zone containing OZ tracts, not just the one that surfaced it.

## Specification

**Inputs:**
- `msa_zone_id`
- Census tract IDs (OZ-qualified tracts within zone)
- `date_range`

**Outputs:**
- Estimated OZ capital deployed by tract (from proxy signals)
- New entity formation count in OZ tracts (state SOS filings)
- Construction permit dollar volume in OZ tracts
- Comparison to non-OZ adjacent tracts as control

**Acceptance Criteria:**
- Pulls at least one proxy signal (permit $ or new LLC count) for OZ tracts in the zone
- Aggregates by quarter to show trend
- Compares OZ tract activity to adjacent non-OZ tracts
- Clearly labels data as proxy estimates, not actual QOF capital

**Test Cases:**
1. Load nash-weho: identify WeHo OZ census tracts, pull Davidson County building permit dollar volume for those tracts
2. Show quarter-over-quarter trend for at least 4 quarters
3. Compare to adjacent non-OZ tracts in same submarket
4. Handle zone with no OZ tracts gracefully (e.g. some suburban zones)

## Data Source Risk Assessment

**HIGH RISK:** This feature depends on external data sources that may have limited programmatic access:
- IRS Form 8996 aggregate data — published annually with significant lag; may not have tract-level granularity
- State SOS filings — varies by state; some have APIs (Florida Sunbiz), others are scrape-only
- Building permit data — varies by county; Nashville/Davidson County permits may be available via open data portal

**Recommended approach:** Start with the most accessible data source (likely building permits via open data portals) and expand. Design the architecture to accept multiple signal types so new sources can be plugged in incrementally.

## Schema Impact

Extends msa_zone table or adds `msa_oz_tract_signal` table (zone_id, tract_id, signal_type, period, value). Lightweight.

**Important:** Follow the database guardrails from CLAUDE.md:
- Include `env_id TEXT NOT NULL` and `business_id UUID NOT NULL`
- Enable RLS with tenant-isolation policy
- Use next sequential number in `repo-b/db/schema/`
- Add `COMMENT ON TABLE` explaining purpose

## Files to Touch

- `backend/app/services/msa_oz_tracker.py` (new) — Core service: lookup OZ tract IDs for a zone, fetch proxy signals, aggregate by quarter, compare OZ vs non-OZ
- `backend/app/routes/msa_routes.py` — Add OZ capital flow endpoint
- `repo-b/src/app/lab/env/[envId]/msa/components/OZCapitalPanel.tsx` (new) — Frontend panel showing OZ capital flow charts and OZ vs non-OZ comparison

### Context Files to Read Before Building

- `backend/app/services/msa_zone_service.py` — Current zone service patterns
- `backend/app/routes/msa_routes.py` — Existing MSA route patterns
- `repo-b/src/app/lab/env/[envId]/msa/` — Existing MSA dashboard components
- `CLAUDE.md` — Routing, dispatch rules, and database guardrails
- `ARCHITECTURE.md` — Schema conventions and table prefixes
- `docs/CAPABILITY_INVENTORY.md` — Confirm no duplicate exists
- `docs/LATEST.md` — Current production status

## Implementation Instructions

1. Read `CLAUDE.md` and follow its dispatch rules (especially database guardrails)
2. Read `ARCHITECTURE.md` for schema conventions
3. Read `docs/CAPABILITY_INVENTORY.md` — confirm this feature does not already exist
4. Read `docs/LATEST.md` for current production status
5. Plan the implementation before writing code
6. **Start with building permits as the primary proxy signal** — check Nashville Open Data Portal (data.nashville.gov) for building permit APIs
7. Design the service with a pluggable signal architecture:
   - `BaseOZSignalProvider` abstract class
   - `BuildingPermitProvider` (first implementation)
   - `EntityFormationProvider` (future)
   - `IRSAggregateProvider` (future)
8. For OZ census tract lookup, use HUD's Qualified Opportunity Zone list (static dataset, downloadable)
9. Implement the schema migration following CLAUDE.md database guardrails
10. Build the frontend panel with Recharts (already in repo-b) for quarterly trend visualization
11. Run linters and type checks
12. Stage only changed files (never `git add -A`)
13. Commit with message referencing the MSA feature card:
    ```
    feat(msa): Opportunity Zone Capital Flow Tracker with proxy signal architecture

    Feature Card: 894b8421-f0cf-41c5-a57b-df57f7f692a4
    Lineage: nash-weho rotation found OZ tracts but capital flows were untraceable

    Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
    ```
14. Push with conflict handling: `git pull --rebase origin main && git push origin main`
15. Update the feature card status in Supabase to `built`

## Proof of Execution

After building, the coding agent must:
- Verify the feature works by running at least one test case
- Update the card status from `prompted` to `built`
- Write a summary to `docs/ops-reports/coding-sessions/msa-2026-03-29.md`
- Note whether this feature would have improved the research brief that surfaced it
