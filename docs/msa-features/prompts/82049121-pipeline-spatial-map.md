# Meta Prompt — MSA Feature Card → Build Directive

You are building a Winston feature identified by the MSA Rotation Engine during a research sweep of **Nashville WeHo (nash-weho)** on **2026-03-29**.

## Feature: Development Pipeline Spatial Map — Project Overlay with Infrastructure Context

**Category:** visualization
**Priority:** 24.0/100
**Target Module:** msa_zone_dashboard
**Card ID:** 82049121-6e41-4a61-9d66-d4d2b80896ae
**Lineage:** Identified during 2026-03-29 rotation into nash-weho because the brief surfaced 7 pipeline projects around GEODIS Park but no way to visualize their spatial clustering or proximity to the stadium catalyst

## Why This Exists

During the Phase 1 research sweep of Nashville WeHo, the engine surfaced 7 active/planned development projects clustered around GEODIS Park but had no way to visualize their spatial clustering or infrastructure proximity premium. This capability does not currently exist in Winston. Building it will improve research quality for any zone with active development pipelines, not just the one that surfaced it.

## Specification

**Inputs:**
- `msa_zone_id`
- Pipeline project list (name, address, type, units/SF, status, estimated delivery)
- Infrastructure catalyst points (name, type, lat/lng)

**Outputs:**
- Interactive map with project markers color-coded by status (planned/under construction/delivered)
- Infrastructure catalyst overlay with radius rings (0.25mi, 0.5mi, 1mi)
- Summary panel: total units/SF by status within each radius band

**Acceptance Criteria:**
- Map renders all pipeline projects with correct geocoded positions
- Infrastructure catalysts shown with labeled radius rings
- Clicking a project marker shows detail popup with name, type, units, delivery date
- Summary panel aggregates correctly by radius band
- Works for any zone that has pipeline data in msa_zone_intel_brief

**Test Cases:**
1. Load nash-weho zone: Wedgewood Village, Memoir May Hosiery, 430 Chestnut, Delux WeHo all appear as markers
2. GEODIS Park appears as infrastructure catalyst with radius rings
3. Summary shows correct unit counts within 0.5mi of GEODIS Park
4. Load a zone with no pipeline data: map renders empty with appropriate message

## Schema Impact

May need `msa_pipeline_project` table (zone_id, project_name, address, lat, lng, asset_type, units, sf, status, est_delivery) if we want persistent pipeline data beyond briefs. Otherwise can render from brief JSON.

**Decision guidance:** Start by rendering from brief JSON to validate the UX. If the feature proves valuable, add the persistent table in a follow-up card.

## Files to Touch

- `repo-b/src/app/lab/env/[envId]/msa/components/PipelineMap.tsx` (new) — Main interactive map component using Mapbox GL or Leaflet
- `repo-b/src/app/lab/env/[envId]/msa/components/InfrastructureOverlay.tsx` (new) — Radius ring overlay for catalyst points
- `backend/app/services/msa_zone_service.py` — Add pipeline geocoding endpoint or extend existing zone data response

### Context Files to Read Before Building

- `repo-b/src/app/lab/env/[envId]/msa/` — Existing MSA zone dashboard components for pattern reference
- `backend/app/services/msa_zone_service.py` — Current zone service structure
- `backend/app/routes/msa_routes.py` — Current MSA route patterns
- `repo-b/src/lib/bos-api.ts` — API client patterns for frontend
- `CLAUDE.md` — Routing and dispatch rules
- `docs/CAPABILITY_INVENTORY.md` — Confirm no duplicate exists
- `docs/LATEST.md` — Current production status

## Implementation Instructions

1. Read `CLAUDE.md` and follow its dispatch rules
2. Read `docs/CAPABILITY_INVENTORY.md` — confirm this feature does not already exist
3. Read `docs/LATEST.md` for current production status
4. Plan the implementation before writing code
5. Implement following existing repo patterns
6. For the map component, check if Mapbox GL or Leaflet is already in `repo-b/package.json` — use whichever is present; if neither, prefer Leaflet (lighter weight, no API key required)
7. Extract pipeline project data from `msa_zone_intel_brief.brief_json` — parse the development pipeline section
8. Geocode addresses using an existing geocoding utility or add a simple one
9. Run linters and type checks
10. Stage only changed files (never `git add -A`)
11. Commit with message referencing the MSA feature card:
    ```
    feat(msa): Development Pipeline Spatial Map with infrastructure overlay

    Feature Card: 82049121-6e41-4a61-9d66-d4d2b80896ae
    Lineage: nash-weho rotation surfaced 7 pipeline projects around GEODIS Park with no spatial visualization

    Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
    ```
12. Push with conflict handling: `git pull --rebase origin main && git push origin main`
13. Update the feature card status in Supabase to `built`

## Proof of Execution

After building, the coding agent must:
- Verify the feature works by running at least one test case
- Update the card status from `prompted` to `built`
- Write a summary to `docs/ops-reports/coding-sessions/msa-2026-03-29.md`
- Note whether this feature would have improved the research brief that surfaced it
