# Meta Prompt — MSA Feature Card → Build Directive

---

You are building a Winston feature identified by the MSA Rotation Engine during a research sweep of **Miami-Wynwood** on **2026-03-24**, with a priority bump from **Orlando Creative Village/Parramore** on **2026-03-27**.

## Feature: Block-Level Transaction Heat Map — Submarket Intelligence Layer

**Category:** visualization
**Priority:** 27.20/100
**Target Module:** MSA Intelligence — Visualization
**Lineage:** First identified: Miami-Wynwood brief 2026-03-24 (Tier 1, high transaction velocity zone). High-impact visualization gap explicitly called out in brief. Cross-zone frequency 7/10 — most valuable for Tier 1 urban zones with dense transaction data. Priority bumped +2.0 on 2026-03-27: Orlando brief specifically requested census-tract-level heat map for transaction activity and rent levels.

## Why This Exists

During the Phase 1 research sweep of Miami-Wynwood, the engine needed an interactive map layer showing closed transaction locations, pipeline project pins, and distress concentrations at block or parcel level within a submarket zone. This is distinct from the Zone Intelligence Dashboard brief viewer — this is a spatial drill-down using comp data already captured in zone briefs plus Mapbox GL, enabling identification of specific micro-pockets of activity within a zone. This capability does not currently exist in Winston. Building it will improve research quality for 7 out of 10 zones (most valuable for Tier 1 urban zones with dense transaction data), not just the one that surfaced it.

## Specification

**Inputs:**
- `msa_zone_id` — the zone to visualize
- `date_range` — temporal filter for transactions
- `layers_to_show` — one or more of: transactions | pipeline | distress

**Outputs:**
- Interactive Mapbox GL map
- Transaction pins with tooltip (address, price, type, date, buyer)
- Pipeline project polygons with unit count and status
- Distress heat gradient by ZIP

**Acceptance Criteria:**
1. Renders within 2 seconds for zones with fewer than 50 comps
2. Transaction pins are clickable with full comp detail
3. Pipeline layer shows project status color-coding (pre-construction/under-construction/completed)
4. Map exports as PNG for report embedding
5. Works on mobile with pinch-to-zoom

**Test Cases:**
1. Zone: `miami-wynwood` → Expected: 3+ transaction pins including 545Wyn, Mana assemblage, Wynwood Norte
2. Zone: `miami-wynwood`, Layer: pipeline → Expected: EDITION Residences, 1600 Edgewater, Evolve Wynwood 35 shown

## Schema Impact

Add `lat`/`lng` and `geojson_boundary` columns to `msa_zone`. Add `comp_lat`, `comp_lng` to zone_brief comps JSONB. A geocoding service is needed to resolve addresses to coordinates.

## Files to Touch

- `repo-b/src/components/msa/SubmarketMap.tsx` — **NEW** React component using Mapbox GL JS
- `repo-b/src/app/lab/env/[envId]/msa/` — **NEW** map page route
- `backend/app/services/msa_geocoder.py` — **NEW** geocoding service (use Mapbox Geocoding API or OpenCage)

### Additional files to read for context:
- `backend/app/services/msa_zone_brief.py` — the zone brief service that produces the comp data this map will visualize
- `backend/app/services/msa_data_collectors.py` — data collection patterns to follow
- `repo-b/src/app/lab/env/[envId]/msa/` — existing MSA pages for layout/routing patterns
- `repo-b/src/components/msa/` — existing MSA components for style consistency
- `backend/app/routes/msa_routes.py` — existing MSA API routes to extend

## Implementation Instructions

1. Read `CLAUDE.md` and follow its dispatch rules
2. Read `docs/CAPABILITY_INVENTORY.md` — confirm this feature does not already exist
3. Read `docs/LATEST.md` for current production status
4. Plan the implementation before writing code
5. **Backend first:** Create `msa_geocoder.py` with a geocode function that takes an address string and returns lat/lng. Support batch geocoding for zone briefs. Cache results to avoid repeated API calls.
6. **Schema:** Add lat/lng columns to the msa_zone table and comp_lat/comp_lng to the zone_brief comps JSONB structure. Write a migration.
7. **API route:** Add a GET endpoint to `msa_routes.py` that returns GeoJSON feature collections for a given zone_id, filtered by layer type and date range.
8. **Frontend:** Build `SubmarketMap.tsx` using `react-map-gl` (Mapbox GL JS wrapper for React). Implement three toggleable layers: transaction pins, pipeline polygons, distress heat. Use Mapbox's built-in heatmap layer type for distress.
9. **Page route:** Create the map page at `/lab/env/[envId]/msa/map` with layer toggle controls, date range picker, and a side panel for comp detail on pin click.
10. **Export:** Add a "Download PNG" button using `map.getCanvas().toDataURL()`.
11. Run linters and type checks
12. Stage only changed files (never `git add -A`)
13. Commit with message referencing the MSA feature card:
    ```
    feat(msa): Block-Level Transaction Heat Map — Submarket Intelligence Layer

    Feature Card: e6a863fe-53b0-4f13-b98f-87de818a74ca
    Lineage: Miami-Wynwood brief 2026-03-24, Orlando bump 2026-03-27

    Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
    ```
14. Push with conflict handling: `git pull --rebase origin main && git push origin main`
15. Update the feature card status in Supabase to `built`

## Proof of Execution

After building, the coding agent must:
- Verify the feature works by running at least one test case (miami-wynwood zone should show 3+ transaction pins)
- Update the card status from `prompted` to `built`
- Write a summary to `docs/ops-reports/coding-sessions/msa-2026-03-27.md`
- Note whether this feature would have improved the Miami-Wynwood and Orlando research briefs that surfaced it
