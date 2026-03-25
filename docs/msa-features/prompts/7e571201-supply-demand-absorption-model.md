# Meta Prompt — Supply-Demand Absorption Model for Submarket Acquisition Scoring

**Feature Card:** 7e571201-8baf-4eca-b3fe-62bd2823a37f
**Generated:** 2026-03-24
**Priority:** 54/100
**Status:** prompted

---

You are building a Winston feature identified by the MSA Rotation Engine during a research sweep of **West Palm Beach — Downtown** on **2026-03-23** (brief_id: 8b05bdf7) and subsequently confirmed by the **Miami — Wynwood/Edgewater** sweep on **2026-03-24** (brief_id: 04f9abb1).

## Feature: Supply-Demand Absorption Model for Submarket Acquisition Scoring

**Category:** calculation
**Priority:** 54/100
**Target Module:** deal_analyzer
**Lineage:** First surfaced in wpb-downtown Zone Intelligence Brief dated 2026-03-23 (brief_id: 8b05bdf7). The research agent explicitly flagged inability to compute supply-demand absorption without submarket delivery schedule and net absorption data. This gap blocks the acquisition score for all 14 zones — each submarket brief needs absorption modeling to produce a meaningful composite_acquisition_score. Priority bumped 2026-03-24: Miami-Wynwood has 1,317 multifamily units under construction — absorption timeline modeling urgently needed for Tier 1 scoring accuracy.

## Why This Exists

During the Phase 1 research sweep of West Palm Beach — Downtown and Miami — Wynwood, the engine needed to compute net absorption relative to pipeline deliveries to produce a meaningful `demand_momentum_score`. Without this, the Sub-MSA Acquisition Score Calculator (card 30ef9cb6, already prompted) cannot receive a valid `demand_momentum_score` input — leaving the acquisition score incomplete for all 14 zones. This capability does not currently exist in Winston. Building it will improve research quality for all 14 zones, not just the ones that surfaced it.

## Specification

**Inputs:**
- `msa_zone_id` (UUID) — which zone to model
- `quarterly_units_delivered` (int) — units delivered in the trailing 4 quarters (from permit data, brief signals, or web research)
- `quarterly_net_absorption` (float) — trailing 4Q net absorption in units (from RealPage, BLS QCEW, or brief signals)
- `current_occupancy_rate` (float, 0–1) — current occupancy from RealPage or brief signals
- `pipeline_units_under_construction` (int) — units in construction pipeline with expected delivery in next 4–8Q
- `employment_growth_yoy` (float, optional) — % YoY employment growth from BLS QCEW or FRED (used to calibrate demand momentum); falls back to national benchmark if absent

**Outputs:**
- `supply_overhang_units` (int) — pipeline units minus projected absorption over next 4Q; negative = undersupply
- `months_of_supply` (float) — supply_overhang_units / average_monthly_absorption; standard industry metric
- `demand_momentum_score` (float, 0–10) — primary output consumed by the acquisition score calculator; higher = stronger demand relative to supply
- `absorption_rate_quarterly` (float) — estimated average quarterly absorption for the zone
- `model_confidence` (str: "high" | "medium" | "low") — based on data completeness; "low" when using national benchmarks
- `methodology_note` (str) — one-sentence note on data sources and fallback assumptions used

**Acceptance Criteria:**
- Model runs server-side on every new brief insertion (triggered from `msa_rotation_engine.py` after brief is written)
- Results stored as part of the brief's `signals` JSONB under key `absorption_model` and the computed `demand_momentum_score` passed to the acquisition score calculator
- Fallback: if zone-level absorption data is unavailable, use RealPage national MSA benchmark for the submarket asset class (multifamily/office/mixed)
- `demand_momentum_score` produced is consumed by the existing Sub-MSA Acquisition Score Calculator (card 30ef9cb6) as the `demand_momentum_score` input
- Unit test passes: WPB inputs (4,085 units under construction, 95.5% occupancy, +0.51% rent growth, +1.4% employment) → model outputs `demand_momentum_score` in range 3.5–5.5 (low-medium demand given high pipeline)
- Stress test passes: 10,000 units in pipeline, flat employment → `demand_momentum_score` ≤ 2.0 (low), `supply_overhang_units` strongly positive
- When `employment_growth_yoy` is None, service uses national benchmark without error
- `model_confidence` = "low" whenever national benchmark fallback is used

**Test Cases:**
1. **WPB supply overhang:** `pipeline_units=4085`, `occupancy=0.955`, `employment_growth_yoy=0.014`, `quarterly_net_absorption=850` → `demand_momentum_score` in [3.5, 5.5], `months_of_supply` ~12–18, `model_confidence="medium"`
2. **Stress case:** `pipeline_units=10000`, `employment_growth_yoy=0.0`, `quarterly_net_absorption=500` → `demand_momentum_score` ≤ 2.0, `supply_overhang_units` > 8000
3. **Miami-Wynwood:** `pipeline_units=1317`, `occupancy=0.94`, `employment_growth_yoy=0.022` → `demand_momentum_score` in [5.5, 7.5] (stronger demand, smaller pipeline relative to Miami metro)
4. **No data fallback:** All optional inputs absent → model runs with national benchmarks, `model_confidence="low"`, no exception raised

## Schema Impact

Add `absorption_model` key to the `signals` JSONB in `msa_zone_intel_brief`. **No new columns or tables required** — the model outputs are stored within the existing `signals` JSONB field (schema migration 418_msa_rotation_engine.sql is already in place).

The `demand_momentum_score` output is passed to the acquisition score calculator service as a computed signal — also stored within `signals` JSONB.

If a migration is needed to add an `absorption_model_outputs` JSONB column to `msa_zone_intel_brief` for clearer separation, add a migration file at `repo-b/db/schema/419_msa_absorption_outputs.sql`. Keep it additive only.

## Files to Touch

**New files to create:**
- `backend/app/services/msa_absorption_model.py` — new service implementing the absorption model logic
  - Class: `MSAAbsorptionModel`
  - Method: `compute(msa_zone_id, quarterly_units_delivered, quarterly_net_absorption, current_occupancy_rate, pipeline_units_under_construction, employment_growth_yoy=None) -> dict`
  - Include national benchmark fallback constants for multifamily/office/mixed asset classes
  - Include `demand_momentum_score` scaling formula (0–10, calibrated so score ~5 = balanced market, >7 = strong demand tailwind, <3 = oversupply risk)

**Files to modify:**
- `backend/app/services/msa_rotation_engine.py` — call `MSAAbsorptionModel.compute()` after each brief write; store results in `signals` JSONB; pass `demand_momentum_score` to the acquisition score calculator if it exists
- `skills/msa-rotation-engine/config/scoring_weights.json` — verify `demand_momentum_score` weight is registered; add if missing

**Optional (if separate column desired):**
- `repo-b/db/schema/419_msa_absorption_outputs.sql` — additive migration to add `absorption_model_outputs JSONB` column to `msa_zone_intel_brief`

**Do NOT touch:**
- `backend/app/services/ai_gateway.py` — not relevant
- `backend/app/services/market_regime_engine.py` — separate concern
- Any credit or PDS services

## Implementation Instructions

1. Read `CLAUDE.md` and follow its dispatch rules — this feature routes to `agents/bos-domain.md` for the service and `agents/data.md` for any schema migration
2. Read `docs/CAPABILITY_INVENTORY.md` — confirm `msa_absorption_model` service does not already exist
3. Read `docs/LATEST.md` — check production status; MSA environment is OPERATIONAL per 2026-03-24 status
4. Read `backend/app/services/msa_rotation_engine.py` — understand the brief write flow and where to hook in the absorption model call
5. Read `repo-b/db/schema/418_msa_rotation_engine.sql` — understand the `msa_zone_intel_brief.signals` JSONB structure
6. Read `docs/msa-features/prompts/30ef9cb6-sub-msa-acquisition-score-calculator.md` — understand the acquisition score calculator that consumes `demand_momentum_score`
7. Read `skills/msa-rotation-engine/config/scoring_weights.json` — verify `demand_momentum_score` weight exists
8. Implement `msa_absorption_model.py` with clean Python typing and docstrings
9. Integrate into `msa_rotation_engine.py` brief write flow
10. Run `ruff check backend/` and fix any linting errors before committing
11. Stage only changed files (never `git add -A`)
12. Commit with message referencing the MSA feature card:
    ```
    feat(msa): supply-demand absorption model for submarket scoring

    Feature Card: 7e571201-8baf-4eca-b3fe-62bd2823a37f
    Lineage: WPB brief 8b05bdf7 + Miami-Wynwood 04f9abb1 (2026-03-24)
    Unblocks: demand_momentum_score input for acquisition score calculator

    Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
    ```
13. Push: `git pull --rebase origin main && git push origin main`
14. Update feature card status in Supabase:
    ```sql
    UPDATE msa_feature_card SET status = 'built', updated_at = now() WHERE card_id = '7e571201-8baf-4eca-b3fe-62bd2823a37f';
    ```

## Proof of Execution

After building, the coding agent must:
- Run the WPB test case (inputs above) and confirm `demand_momentum_score` is in [3.5, 5.5]
- Run the stress test case and confirm `demand_momentum_score` ≤ 2.0
- Update card status from `prompted` to `built`
- Write a summary to `docs/ops-reports/coding-sessions/msa-2026-03-24.md` noting whether this would have improved the WPB brief that surfaced it

## Dependency Note

This prompt should be executed **before** the acquisition score calculator (30ef9cb6) is run on a real brief, since the calculator requires `demand_momentum_score` as a scored input. If the acquisition score calculator is already built, wire `demand_momentum_score` from this service into the existing calculator immediately.
