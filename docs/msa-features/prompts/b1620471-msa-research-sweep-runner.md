# Meta Prompt — MSA Research Sweep Runner: Phase 1 Automation

**Feature Card:** b1620471-880b-44f7-9410-b88c0e011ed9
**Generated:** 2026-03-22
**Status:** prompted

---

You are building a Winston feature identified by the MSA Rotation Engine during a cold-start audit on **2026-03-22**.

## Feature: MSA Research Sweep Runner — Phase 1 Automation

**Category:** workflow
**Priority:** 72/100
**Target Module:** msa_rotation_engine
**Lineage:** Identified during 2026-03-22 msa-gap-detection cold-start audit. All 14 zones have last_rotated_at = NULL and zero briefs exist in msa_zone_intel_brief. The sweep task is defined but has never produced output. This is the root blocker for the entire MSA pipeline.

## Why This Exists

During the Phase 1 research sweep audit, the engine needed to execute structured research across all 6 source categories for overdue rotation zones. This capability does not currently exist in a working state in Winston. Building it will improve research quality for all 14 zones, not just the one that surfaced it. Without this working, the Phase 2 (gap detection) and Phase 3 (feature card generation) tasks cannot start — the entire MSA pipeline is blocked.

## Specification

**Inputs:**
- `msa_zone` table rows: `zone_slug`, `zone_name`, `tier`, `last_rotated_at`, `rotation_cadence_days`
- `skills/msa-rotation-engine/config/source_registry.json` — query templates for all 6 research categories
- Today's date for `run_date` field

**Outputs:**
- `msa_zone_intel_brief` row in Supabase with `feature_gaps_identified` JSONB populated
- `docs/msa-intel/{zone_slug}-{date}.json` local file written to the repo
- `docs/msa-intel/TODAY_ROTATION.json` pointer file (always points to the most recent sweep output)
- Updated `last_rotated_at` on the `msa_zone` row for the swept zone

**Acceptance Criteria:**
- `TODAY_ROTATION.json` exists and contains a valid `zone_slug` after each run
- `msa_zone_intel_brief` has at least 1 row with non-null `feature_gaps_identified` (array with ≥ 3 entries)
- `msa_zone.last_rotated_at` updates correctly after the sweep
- The Phase 2 task (`msa-gap-detection`) can successfully read the output and create cards from it

**Test Cases:**
1. Run sweep on `wpb-downtown` (West Palm Beach Downtown), verify brief JSON is written both locally (`docs/msa-intel/wpb-downtown-2026-03-22.json`) and to Supabase `msa_zone_intel_brief`
2. Verify rotation algorithm picks the zone with the highest `days_since_rotation / rotation_cadence_days` ratio — i.e., most overdue zone wins
3. Verify `feature_gaps_identified` is an array with at least 3 entries after a real or mock sweep

## Schema Impact

No new tables needed. `msa_zone_intel_brief` and `msa_zone` already exist. The sweep writes to existing columns:
- `msa_zone_intel_brief.raw_sources` (JSONB) — raw search results per category
- `msa_zone_intel_brief.signals` (JSONB) — extracted signals
- `msa_zone_intel_brief.feature_gaps_identified` (JSONB array) — gaps surfaced
- `msa_zone.last_rotated_at` (timestamp) — updated after successful sweep

## Files to Touch

**Scheduled task definition (primary):**
- `orchestration/` or `scripts/` — locate the existing `msa-research-sweep` task definition; fix or replace the execution logic
- The task should be a Python or TypeScript script that: (1) queries `msa_zone` for the most overdue zone, (2) runs the 6-category research protocol using web search with templates from `source_registry.json`, (3) writes output to Supabase and local file

**Skill reference (read-only for implementation guidance):**
- `skills/msa-rotation-engine/SKILL.md` — read Phase 1 section for the full research protocol
- `skills/msa-rotation-engine/config/source_registry.json` — 6 research categories with query templates
- `skills/msa-rotation-engine/templates/zone_brief.json` — expected output schema

**Supabase tables to write:**
- `msa_zone_intel_brief` — primary output table
- `msa_zone` — update `last_rotated_at`

**Local output directories:**
- `docs/msa-intel/` — JSON brief output and TODAY_ROTATION.json pointer

## Implementation Instructions

1. Read `CLAUDE.md` and follow its dispatch rules — this is a `workflow` / `orchestration` task; route through `agents/data.md` for schema questions
2. Read `docs/CAPABILITY_INVENTORY.md` — confirm MSA sweep is not already built (as of 2026-03-20 it is not listed)
3. Read `docs/LATEST.md` — note current production status; the repe_fast_path bug is the top priority but does not touch MSA code; proceed
4. Read `skills/msa-rotation-engine/SKILL.md` — understand the full 3-phase pipeline before writing code
5. Read `skills/msa-rotation-engine/config/source_registry.json` — the 6 research categories are: `transaction_activity`, `supply_pipeline`, `demand_drivers`, `rent_and_occupancy`, `capital_markets`, `regulatory_political`
6. Read `skills/msa-rotation-engine/templates/zone_brief.json` — use this as the output schema
7. Locate the existing sweep task in `orchestration/` — check if it exists and what it does
8. Implement the rotation selector: `SELECT zone_slug, zone_name, tier, last_rotated_at, rotation_cadence_days FROM msa_zone WHERE tenant_id = 'bd1615b0-ecce-4f59-bdda-e24d99f6adfa' ORDER BY (EXTRACT(EPOCH FROM (now() - COALESCE(last_rotated_at, '2000-01-01'::timestamptz))) / (rotation_cadence_days * 86400)) DESC LIMIT 1`
9. For each of the 6 source categories, execute web searches using the query templates from `source_registry.json`, substituting `{zone_name}`, `{year}`, `{asset_class}` (default: `multifamily`)
10. Aggregate results into the `zone_brief.json` schema, populate `feature_gaps_identified` with at least 3 identified gaps
11. Write to Supabase `msa_zone_intel_brief` and update `msa_zone.last_rotated_at`
12. Write local JSON to `docs/msa-intel/{zone_slug}-{date}.json` and update `docs/msa-intel/TODAY_ROTATION.json`
13. Run linters and type checks before committing
14. Stage only changed files — never `git add -A`
15. Commit with:
    ```
    feat(msa): MSA Research Sweep Runner — Phase 1 Automation

    Feature Card: b1620471-880b-44f7-9410-b88c0e011ed9
    Lineage: Cold-start audit 2026-03-22 — root blocker for MSA pipeline

    Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
    ```
16. Push: `git pull --rebase origin main && git push origin main`
17. Update the feature card in Supabase: `UPDATE msa_feature_card SET status = 'built' WHERE card_id = 'b1620471-880b-44f7-9410-b88c0e011ed9'`

## Proof of Execution

After building, the coding agent must:
- Run test case 1: sweep `wpb-downtown`, verify `docs/msa-intel/wpb-downtown-{date}.json` exists and `TODAY_ROTATION.json` contains `"zone_slug": "wpb-downtown"`
- Query Supabase: `SELECT COUNT(*) FROM msa_zone_intel_brief WHERE zone_id IN (SELECT zone_id FROM msa_zone WHERE zone_slug = 'wpb-downtown')` — should return ≥ 1
- Query Supabase: `SELECT last_rotated_at FROM msa_zone WHERE zone_slug = 'wpb-downtown'` — should be today's date
- Update card status from `prompted` to `built`
- Write summary to `docs/ops-reports/coding-sessions/msa-2026-03-22.md`
- Note: This feature would have directly unblocked the msa-gap-detection and msa-feature-builder tasks that failed during the 2026-03-22 cold-start audit
