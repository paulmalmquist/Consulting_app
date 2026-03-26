# Meta Prompt — MSA Feature Card → Build Directive

---

You are building a Winston feature identified by the MSA Rotation Engine during a research sweep of **Miami-Wynwood/Edgewater** on **2026-03-24**.

## Feature: Lis Pendens / NOD Scraper — County Clerk by Neighborhood

**Category:** data_source
**Priority:** 39.20/100
**Target Module:** MSA Intelligence — Data Collectors
**Lineage:** First identified: Miami-Wynwood brief 2026-03-24. Distress signal had null lis_pendens_count and nod_count. Affects all FL county zones and likely TX, GA, OH zones with active Clerk portals. Cross-zone frequency 7/10.

## Why This Exists

During the Phase 1 research sweep of Miami-Wynwood/Edgewater, the engine needed to assess neighborhood-level distress signals via lis pendens and Notice of Default filings. The Miami-Dade Clerk portal does not offer machine-readable zone-level exports without a paid subscription. Without this data, the distress_level signal in zone briefs is null, leaving a critical gap in the acquisition opportunity scoring model. Building this scraper will improve research quality for 7 out of 10 watchlist zones (all FL counties plus TX, GA, OH zones with active Clerk portals).

## Specification

**Inputs:**
- `county_fips or county_name` — which county to query
- `zip_codes` — array of ZIP codes that define the zone boundary
- `date_range` — lookback period (default: last 90 days)

**Outputs:**
- `lis_pendens_count` — count of lis pendens filings by ZIP
- `nod_count` — count of Notice of Default filings by ZIP
- `distress_index` — computed as `count / total_parcels` for the ZIP
- `data_freshness` — timestamp of the most recent filing found

**Acceptance Criteria:**
1. Returns lis pendens count for Miami-Dade by ZIP within 60 seconds
2. Handles at least 5 county clerk portal formats (Miami-Dade, Broward, Cook, Dallas, Harris)
3. Falls back to null with `source_unavailable` flag when portal blocks scraping
4. Feeds `distress_level` signal in zone brief automatically on each sweep run

**Test Cases:**
- ZIP 33127 (Miami-Dade): expected count > 0
- ZIP 33301 (Broward): expected count > 0

## Schema Impact

Add `lis_pendens_count`, `nod_count` columns to zone_brief signals JSONB; no new tables needed.

## Files to Touch

- `backend/app/services/msa_data_collectors.py` — Add new `lis_pendens_scraper` function. Follow the existing collector function pattern in this file.
- `backend/app/services/msa_research_sweep.py` — Integrate scraper into the sweep pipeline so it runs automatically during Phase 1 zone sweeps.

**Existing patterns to follow:**
- Check existing functions in `backend/app/services/msa_data_collectors.py` for the collector interface pattern
- Signal storage should match existing jsonb patterns in `msa_zone_intel_brief.signals`
- HTTP scraping should use the existing `httpx` async client patterns used elsewhere in the backend

**Implementation notes:**
- County clerk portals vary significantly in structure. Design a base scraper class with county-specific subclasses or adapter functions.
- Priority order for portal support: Miami-Dade (FL) → Broward (FL) → Cook (IL) → Dallas (TX) → Harris (TX)
- Respect rate limits and add appropriate delays between requests
- Cache results per ZIP per day to avoid redundant scraping

## Implementation Instructions

1. Read `CLAUDE.md` and follow its dispatch rules
2. Read `docs/CAPABILITY_INVENTORY.md` — confirm this feature does not already exist
3. Read `docs/LATEST.md` for current production status
4. Check existing patterns in `backend/app/services/msa_data_collectors.py`
5. Plan the implementation before writing code:
   - Design the scraper interface with county-specific adapters
   - Plan graceful degradation when portals block or change format
   - Include caching strategy (per ZIP per day)
6. Implement following existing repo patterns
7. Run linters and type checks
8. Stage only changed files (never `git add -A`)
9. Commit with message referencing the MSA feature card:
   ```
   feat(msa): Lis Pendens / NOD Scraper — County Clerk by Neighborhood

   Feature Card: 5bcffc26-4d0a-41bc-8c51-9e763d259ba9
   Lineage: Miami-Wynwood brief 2026-03-24. Distress signal null for lis_pendens and NOD. Affects 7/10 watchlist zones.

   Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
   ```
10. Push with conflict handling: `git pull --rebase origin main && git push origin main`
11. Update the feature card status in Supabase to `built`

## Proof of Execution

After building, the coding agent must:
- Verify the feature works by running at least one test case (mock Miami-Dade portal response → correct lis pendens count extraction for ZIP 33127)
- Update the card status from `prompted` to `built`
- Write a summary to `docs/ops-reports/coding-sessions/msa-{date}.md`
- Note whether this feature would have improved the Miami-Wynwood research brief that surfaced it (answer: yes — distress_level signal would have been populated instead of null)
