# Meta Prompt — MSA Feature Card → Build Directive

---

You are building a Winston feature identified by the MSA Rotation Engine during a research sweep of **Tampa-Water Street** on **2026-03-26**.

## Feature: Opportunity Zone Boundary Overlay — Parcel-Level OZ Eligibility Map

**Category:** visualization
**Priority:** 15.00/100
**Target Module:** msa-intelligence
**Lineage:** Originated from tampa-water-st 2026-03-26 brief. Gap: No OZ boundary overlay with zone geometry. Tampa has 23 OZs with 2026 sunset urgency. Frequency moderate — primarily affects FL, OH, PA, TX zones with active OZ tracts. Lower priority than data connectors.

## Why This Exists

During the Phase 1 research sweep of Tampa-Water Street, the engine identified that Tampa has 23 designated federal Opportunity Zones with tax benefits sunsetting after 2026. There is no way to visualize which parcels within a zone fall inside OZ-eligible census tracts. A visual overlay would instantly show investors which parcels qualify for remaining OZ benefits. This capability does not currently exist in Winston. Building it will improve research quality for zones in FL, OH, PA, and TX with active OZ tracts.

## Specification

**Inputs:**
- `msa_zone_id` — the zone to overlay
- `zone_geometry_polygon` — the zone's geographic boundary

**Outputs:**
- `oz_eligible_parcels` — list of parcels within OZ tracts
- `oz_tract_ids` — census tract identifiers for matched OZ tracts
- `overlay_map_geojson` — GeoJSON for rendering the overlay

**Acceptance Criteria:**
1. Load CDFI Fund OZ tract boundaries for the relevant state/county
2. Intersect OZ tracts with zone geometry polygon
3. Render overlay map showing OZ-eligible vs non-eligible areas
4. Display sunset date and remaining benefit window
5. Click parcel to see OZ tract ID and eligibility details

**Test Cases:**
1. Tampa zone → Expected: shows correct 23 OZ tracts
2. Zone with no OZ overlap → Expected: shows empty result gracefully
3. Map renders correctly at different zoom levels

## Schema Impact

May need an `oz_tract` table with a geometry column, or use the PostGIS extension for spatial queries. If PostGIS is not enabled, consider storing OZ tract boundaries as GeoJSON in a JSONB column and doing intersection client-side with Turf.js.

## Files to Touch

- `repo-b/src/components/msa/OZOverlayMap.tsx` — **NEW** React component for the OZ overlay
- `backend/app/services/msa_oz_service.py` — **NEW** service for OZ data loading and intersection
- `backend/app/routes/msa_routes.py` — **EXTEND** with OZ overlay endpoints

### Additional files to read for context:
- `backend/app/services/msa_data_collectors.py` — data collection patterns to follow
- `backend/app/services/msa_zone_brief.py` — zone brief service for zone geometry data
- `repo-b/src/components/msa/` — existing MSA components for style consistency
- `repo-b/src/app/lab/env/[envId]/msa/` — existing MSA pages for routing patterns
- If the Block-Level Transaction Heat Map (e6a863fe) has been built, read `repo-b/src/components/msa/SubmarketMap.tsx` for Mapbox GL patterns to reuse

## Implementation Instructions

1. Read `CLAUDE.md` and follow its dispatch rules
2. Read `docs/CAPABILITY_INVENTORY.md` — confirm this feature does not already exist
3. Read `docs/LATEST.md` for current production status
4. Plan the implementation before writing code
5. **Data source:** Download OZ census tract shapefiles from the CDFI Fund: https://www.cdfifund.gov/opportunity-zones. These are published as shapefiles with census tract FIPS codes. Convert to GeoJSON for storage.
6. **Backend service:** Create `msa_oz_service.py` with:
   - `load_oz_tracts(state_fips: str) -> list[dict]` — loads OZ tract boundaries for a state
   - `intersect_zone_oz(zone_geometry: dict, oz_tracts: list) -> dict` — returns GeoJSON of OZ areas within the zone
   - `get_oz_details(tract_id: str) -> dict` — returns OZ designation details, sunset date, and remaining benefits
7. **Schema decision:** Check if PostGIS is enabled (`SELECT PostGIS_Version()`). If yes, use spatial columns and ST_Intersects. If no, store GeoJSON in JSONB and do intersection with Turf.js on the frontend.
8. **API route:** Add `GET /api/v1/msa/zones/{zone_id}/oz-overlay` to `msa_routes.py` returning GeoJSON feature collection.
9. **Frontend:** Build `OZOverlayMap.tsx` using the same Mapbox GL patterns as SubmarketMap (if available) or react-map-gl directly. Two layers: OZ-eligible (green fill, 0.3 opacity) and non-eligible (red fill, 0.1 opacity). Click handler shows tract details in a side panel.
10. **Sunset urgency:** Display a prominent banner: "OZ benefits sunset December 31, 2026 — X months remaining" when viewing zones with active OZ tracts.
11. **Integration:** Add an OZ tab or toggle to the existing MSA zone detail page.
12. Run linters and type checks
13. Stage only changed files (never `git add -A`)
14. Commit with message referencing the MSA feature card:
    ```
    feat(msa): Opportunity Zone Boundary Overlay — Parcel-Level OZ Eligibility Map

    Feature Card: 320cf0ff-6844-4347-9fd2-72bbb42fe4e5
    Lineage: Tampa-Water Street brief 2026-03-26, OZ sunset urgency

    Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
    ```
15. Push with conflict handling: `git pull --rebase origin main && git push origin main`
16. Update the feature card status in Supabase to `built`

## Proof of Execution

After building, the coding agent must:
- Verify the feature works by running at least one test case (Tampa zone should show 23 OZ tracts)
- Update the card status from `prompted` to `built`
- Write a summary to `docs/ops-reports/coding-sessions/msa-2026-03-27.md`
- Note whether this feature would have improved the Tampa-Water Street research brief that surfaced it
