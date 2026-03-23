# Meta Prompt — Sub-MSA Acquisition Score Calculator

**Feature Card:** 30ef9cb6-7d82-45e3-afaa-6514002a88ed
**Generated:** 2026-03-22
**Status:** prompted

---

You are building a Winston feature identified by the MSA Rotation Engine during a cold-start audit on **2026-03-22**.

## Feature: Sub-MSA Acquisition Score Calculator

**Category:** calculation
**Priority:** 60/100
**Target Module:** deal_analyzer
**Lineage:** Identified during 2026-03-22 cold-start audit. All 14 msa_zone rows have rotation_priority_score = 0.00, meaning the rotation algorithm cannot distinguish zone priority. The scoring weights config file exists (skills/msa-rotation-engine/config/scoring_weights.json) but no backend service consumes it.

## Why This Exists

During the Phase 1 research sweep, the engine needed to score submarket-level acquisition attractiveness to power the rotation algorithm. This capability does not currently exist in Winston. The existing REPE financial modeling suite (IRR, Monte Carlo, scenario engine) operates at the deal/asset level, not at the submarket/zone level. Building it will improve research quality for all 14 zones — the rotation algorithm is currently unable to prioritize zones because all scores are 0.00.

## Specification

**Inputs:**
- `msa_zone_id` (UUID) — which zone to score
- Zone Intelligence Brief signals JSONB (from `msa_zone_intel_brief.signals`) — the raw signal inputs
- Scoring weights from `skills/msa-rotation-engine/config/scoring_weights.json` — already written, needs to be consumed

**Outputs:**
- `composite_acquisition_score` (float, 0-100, scaled from the 0-10 internal scale)
- Component scores (each 0-10):
  - `transaction_velocity_score`
  - `supply_risk_score`
  - `demand_momentum_score`
  - `rent_trajectory_score`
  - `capital_access_score`
  - `regulatory_risk_score`
- `score_narrative` (string, 3-5 sentences explaining the main drivers)
- `score_delta` (float or null) — change vs. prior brief if one exists; null on first scoring

**Acceptance Criteria:**
- Score is deterministic for same inputs (idempotent calculation)
- All 6 component scores are computed and stored
- After scoring, `msa_zone.rotation_priority_score` is updated
- Score narrative is readable by a non-quant LP — avoid jargon; explain in plain English what is driving the score up or down

**Test Cases:**
1. Score `wpb-downtown` with mock signals: `{transaction_velocity: 7, distress_level: 4, supply_risk: 6, rent_growth: 8, demand_drivers: 7, capital_availability: 6, regulatory_favorability: 5}` — verify composite is in range 0-100 and matches the formula: `(0.20×7) + (0.15×4) + (-0.15×6) + (0.20×8) + (0.15×7) + (0.10×6) + (0.05×5)` × 10 = verify result
2. Verify `score_delta` is null when no prior brief exists for the zone
3. After scoring, query `SELECT rotation_priority_score FROM msa_zone WHERE zone_slug = 'wpb-downtown'` — verify it matches the computed composite score

## Scoring Formula

From `skills/msa-rotation-engine/config/scoring_weights.json`:

```
composite = (
    (transaction_velocity × 0.20) +
    (distress_level × 0.15) +
    (supply_risk × -0.15) +      ← negative: more supply = lower score
    (rent_growth × 0.20) +
    (demand_drivers × 0.15) +
    (capital_availability × 0.10) +
    (regulatory_favorability × 0.05)
) × 10   ← scale from 0-10 to 0-100
```

All component inputs are on a 1-10 scale. The engine must extract these from the `signals` JSONB or default to 5 (neutral) if a signal is missing.

## Schema Impact

Add a `component_scores` JSONB column to `msa_zone_intel_brief` to store the per-component breakdown:

```sql
ALTER TABLE msa_zone_intel_brief
ADD COLUMN IF NOT EXISTS component_scores JSONB;

ALTER TABLE msa_zone_intel_brief
ADD COLUMN IF NOT EXISTS composite_acquisition_score FLOAT;

ALTER TABLE msa_zone_intel_brief
ADD COLUMN IF NOT EXISTS score_narrative TEXT;

ALTER TABLE msa_zone_intel_brief
ADD COLUMN IF NOT EXISTS score_delta FLOAT;
```

After scoring, also update `msa_zone.rotation_priority_score` (column already exists, currently 0.00 for all rows).

**Write the migration to `repo-b/db/schema/` following the existing migration naming convention (next available number after 419).**

## Files to Touch

**New service (primary build target):**
- `backend/app/services/msa_scoring_engine.py` — scoring engine service
  - Class `MSAScoringEngine` with methods:
    - `score_zone(msa_zone_id: UUID) -> ScoringResult` — main entry point
    - `_extract_signals(brief_signals: dict) -> dict` — parse signals JSONB into component inputs
    - `_compute_component_scores(signals: dict) -> dict` — apply weights
    - `_compute_composite(component_scores: dict) -> float` — weighted sum
    - `_generate_narrative(signals: dict, component_scores: dict, composite: float) -> str` — AI-generated explanation
    - `_get_prior_composite(zone_id: UUID) -> float | None` — look up prior brief for delta

**New migration:**
- `repo-b/db/schema/420_msa_zone_intel_brief_scoring_columns.sql` (or next available migration number — check `repo-b/db/schema/` for the current highest)

**MCP tool (expose to AI copilot):**
- `backend/app/mcp/` — add to `repe_market` category (which may be created by the county assessor connector feature card e769041f)
  - Tool: `score_msa_zone` with inputs: `zone_slug` or `msa_zone_id`
  - Returns composite score, component breakdown, and narrative

**Reference files to read before coding:**
- `skills/msa-rotation-engine/config/scoring_weights.json` — the exact weights to use (already written)
- `backend/app/services/` — read an existing calculation service (e.g., IRR or scenario engine) for service class patterns
- `backend/app/mcp/` — read an existing MCP tool for schema conventions
- `repo-b/db/schema/419_*` — read the most recent migration for naming and structure conventions

## Implementation Instructions

1. Read `CLAUDE.md` — this is a calculation / data service task; route through `agents/bos-domain.md` with `agents/data.md` for the migration
2. Read `docs/CAPABILITY_INVENTORY.md` — confirm no MSA scoring engine exists (as of 2026-03-20, REPE financial modeling exists but at deal level only — this is a submarket-level service)
3. Read `docs/LATEST.md` — no conflicts; fast-path pipeline bug is separate from MSA scoring
4. Read `skills/msa-rotation-engine/config/scoring_weights.json` — internalize the weights before writing any code
5. Check `repo-b/db/schema/` for the current highest migration number: `ls repo-b/db/schema/ | sort | tail -5`
6. Write the migration SQL file with the 4 new columns on `msa_zone_intel_brief`
7. Build `msa_scoring_engine.py` with the class structure above
8. For narrative generation: use the existing AI gateway in `backend/app/services/ai_gateway.py` — pass component scores and a system prompt asking for a 3-5 sentence non-jargon explanation
9. Add the `score_msa_zone` MCP tool
10. Apply the migration via Supabase: use the `apply_migration` MCP tool or run via Supabase CLI
11. Run ruff, tsc, and any existing test suite before committing
12. Stage only changed files
13. Commit with:
    ```
    feat(msa): Sub-MSA Acquisition Score Calculator

    Feature Card: 30ef9cb6-7d82-45e3-afaa-6514002a88ed
    Lineage: Cold-start audit 2026-03-22 — rotation algorithm blocked by all-zero scores

    Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
    ```
14. Push: `git pull --rebase origin main && git push origin main`
15. Update the feature card: `UPDATE msa_feature_card SET status = 'built' WHERE card_id = '30ef9cb6-7d82-45e3-afaa-6514002a88ed'`

## Proof of Execution

After building, the coding agent must:
- Run test case 1 with mock signals and verify the composite matches the formula manually
- Run `SELECT rotation_priority_score FROM msa_zone LIMIT 5` — at least some values should be non-zero after scoring any zone with a populated brief
- Verify the narrative is readable: share one example narrative in the coding session summary
- Update card status from `prompted` to `built`
- Write summary to `docs/ops-reports/coding-sessions/msa-2026-03-22.md` (append if file exists)
- Note: This feature directly enables the rotation algorithm to prioritize zones — all 14 zones currently have score 0.00 and the algorithm cannot function
