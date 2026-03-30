# Meta Prompt — MSA Feature Card → Build Directive

You are building a Winston feature identified by the MSA Rotation Engine during a research sweep of **Orlando Creative Village / Parramore** on **2026-03-27**.

## Feature: Municipal Regulatory Agenda Monitor — Zoning/PUD/Impact Fee Tracker

**Category:** workflow
**Priority:** 12.6/100
**Target Module:** msa-rotation-engine
**Card ID:** 06f24f3d-5875-4191-b3e1-bd411b7f5a84
**Lineage:** Gap identified during Orlando Creative Village/Parramore zone research on 2026-03-27. The research sweep could not detect pending zoning changes or impact fee modifications from the Orlando city council agenda. Cross-zone applicability: ~10 of 14 watchlist zones have active city council agendas with land-use actions.

## Why This Exists

During the Phase 1 research sweep of Orlando Creative Village/Parramore, the engine could not programmatically detect pending zoning changes or fee modifications that would affect development feasibility and supply risk scoring. Orlando's Unlocked Open-Door Program (permit fee rebates) and CRA funding decisions were only discoverable via manual web search. A regulatory agenda monitor would ingest city council meeting agendas (typically published as PDFs or HTML) and extract land-use actions relevant to watchlist zones, feeding the regulatory_favorability signal with real-time policy changes instead of point-in-time snapshots. This capability does not currently exist in Winston. Building it will improve research quality for ~10 of 14 watchlist zones, not just the one that surfaced it.

## Specification

**Inputs:**
- `city_council_agenda_url`
- `planning_commission_agenda_url`
- `zone_boundary_geojson`

**Outputs:**
- `regulatory_action_feed` — structured list of extracted land-use actions
- `zoning_change_alerts` — alerts when a zoning variance or PUD amendment affects a watchlist zone
- `impact_fee_delta_log` — log of impact fee schedule changes with before/after values

**Acceptance Criteria:**
- Parses at least 3 city agenda formats (Orlando, Miami, Tampa)
- Extracts zoning variance and PUD amendment items with parcel or address reference
- Maps extracted items to msa_zone_id via geocoding or ZIP match
- Alerts when impact fee schedule changes affect a watchlist zone
- Runs on a weekly cadence aligned with typical council meeting schedules

**Test Cases:**
1. Input: Orlando City Council agenda PDF from 2026-03-24 → Expected: Extracts any land-use items mentioning Parramore, Creative Village, or OZ tracts
2. Input: Tampa City Council agenda from 2026-03-17 → Expected: Extracts Channel District or Water Street zoning items if present

## Schema Impact

New table: `msa_regulatory_action` (zone_id, action_type, source_url, meeting_date, description, status).
New column on `msa_zone_intel_brief`: `regulatory_actions_since_last_brief` (integer count).

**Important:** Follow the database guardrails from CLAUDE.md:
- Include `env_id TEXT NOT NULL` and `business_id UUID NOT NULL`
- Enable RLS with tenant-isolation policy
- Use next sequential number in `repo-b/db/schema/`
- Add `COMMENT ON TABLE` explaining purpose

## Files to Touch

- `backend/app/services/msa_regulatory_monitor.py` (new) — Core service: fetch agenda URL, parse PDF/HTML, extract land-use items, geocode/match to zones
- `backend/app/routes/msa_intelligence.py` — Add endpoint for regulatory action feed and alerts
- `skills/msa-rotation-engine/source_registry.json` — Add city agenda source URLs for Orlando, Miami, Tampa

### Context Files to Read Before Building

- `backend/app/services/msa_zone_service.py` — Current zone service patterns
- `backend/app/routes/msa_routes.py` — Existing MSA route patterns
- `backend/app/services/` — Check for existing PDF parsing utilities (text_extractor.py, extraction_engine.py)
- `skills/msa-rotation-engine/` — Engine structure and source registry format
- `CLAUDE.md` — Routing, dispatch rules, and database guardrails
- `ARCHITECTURE.md` — Schema conventions and table prefixes
- `docs/CAPABILITY_INVENTORY.md` — Confirm no duplicate exists
- `docs/LATEST.md` — Current production status

## Implementation Instructions

1. Read `CLAUDE.md` and follow its dispatch rules (especially database guardrails)
2. Read `ARCHITECTURE.md` for schema conventions
3. Read `docs/CAPABILITY_INVENTORY.md` — confirm this feature does not already exist
4. Read `docs/LATEST.md` for current production status
5. Check existing extraction/parsing services in `backend/app/services/` for reuse
6. Plan the implementation before writing code
7. Start with Orlando agenda format as the primary target, then generalize
8. Use Python libraries already in the project for PDF parsing (check `backend/requirements.txt`)
9. Design the parser to be format-pluggable: each city gets a parser adapter
10. Implement the schema migration following CLAUDE.md database guardrails
11. Run linters and type checks
12. Stage only changed files (never `git add -A`)
13. Commit with message referencing the MSA feature card:
    ```
    feat(msa): Municipal Regulatory Agenda Monitor for zoning/PUD/impact fee tracking

    Feature Card: 06f24f3d-5875-4191-b3e1-bd411b7f5a84
    Lineage: Orlando Creative Village rotation could not detect pending zoning changes from city council agendas

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
