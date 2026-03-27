# Meta Prompt Template — MSA Feature Card → Build Directive

---

You are building a Winston feature identified by the MSA Rotation Engine during a research sweep of **Tampa Water Street / Channel District** on **2026-03-26**.

## Feature: Score Delta Tracking — Rotation-over-Rotation Comparison

**Category:** workflow
**Priority:** 32.00/100
**Target Module:** msa-intelligence
**Lineage:** Originated from tampa-water-st 2026-03-26 brief. Gap: Score delta tracking across rotation runs not yet implemented. First rotation had no baseline. Affects every zone on every subsequent rotation — universal workflow improvement.

## Why This Exists

During the Phase 1 research sweep of Tampa Water Street, the engine produced a composite acquisition score of 6.7/10 with individual signal scores. However, there was no way to compare this against a previous rotation's scores because delta tracking doesn't exist yet. Once zones rotate again, the system should auto-compute deltas for each signal category and composite score, highlighting what improved or degraded. Per CAPABILITY_INVENTORY.md, Winston has the MSA Rotation Engine operational but no run-over-run comparison capability. This is a net-new workflow enhancement that improves every subsequent rotation for every zone.

## Specification

**Inputs:**
- msa_zone_id
- current_brief_id
- previous_brief_id (auto-detected or explicit)

**Outputs:**
- composite_delta (numeric change in overall score)
- signal_deltas_by_category (dict: signal_name -> {previous, current, delta, direction})
- trend_summary (human-readable narrative)

**Acceptance Criteria:**
1. Auto-detect previous brief for same zone (query by zone_id + created_at ordering)
2. Compute delta for composite and each of 6 signal categories
3. Generate human-readable trend summary (e.g. "demand_drivers: +1.5, accelerating")
4. Handle first-rotation gracefully (no delta, note "first run — baseline established")
5. Include delta in brief JSON output and markdown report

**Test Cases:**
1. Zone with 2+ briefs shows correct deltas — composite delta matches manual calculation
2. Zone with only 1 brief shows "N/A — first rotation baseline" with no error
3. Delta correctly identifies which signals improved vs degraded — positive delta = improved, negative = degraded

## Schema Impact

Add `previous_brief_id` FK to `zone_brief` table, or simply query by zone + date:

```sql
-- Option A: FK approach
ALTER TABLE zone_brief ADD COLUMN previous_brief_id UUID REFERENCES zone_brief(id);

-- Option B: Query approach (preferred — no schema change)
-- Just query: SELECT * FROM zone_brief WHERE msa_zone_id = $1 ORDER BY created_at DESC LIMIT 2
```

Recommended: Option B (query approach) to avoid schema migration. The delta computation is a service-layer concern, not a data model concern.

## Files to Touch

- `skills/msa-rotation-engine/templates/zone_brief.json` — Add `score_deltas` section to brief template
- `backend/app/services/msa_rotation.py` (if exists, otherwise create or extend the appropriate MSA service) — Add `compute_score_deltas()` function
- Brief generation code (wherever zone briefs are assembled) — Call delta computation after scoring, inject into output

### Key Logic

```python
def compute_score_deltas(zone_id: str, current_brief: dict) -> dict:
    """Compare current brief scores against most recent previous brief for same zone."""
    # 1. Query previous brief: SELECT * FROM zone_brief WHERE msa_zone_id = zone_id AND id != current_brief_id ORDER BY created_at DESC LIMIT 1
    # 2. If no previous brief: return {"status": "first_rotation", "baseline_established": True}
    # 3. Extract signal scores from both briefs
    # 4. Compute deltas per signal and composite
    # 5. Classify direction: improving (delta > 0.5), degrading (delta < -0.5), stable
    # 6. Generate trend summary string
    return {
        "composite_delta": current_composite - previous_composite,
        "signal_deltas": {
            "demand_drivers": {"previous": 7.0, "current": 7.5, "delta": 0.5, "direction": "improving"},
            # ... for each signal
        },
        "trend_summary": "Overall: +0.3 (improving). demand_drivers: +0.5 accelerating. supply_risk: -0.2 stable.",
        "previous_brief_id": previous_brief_id,
        "previous_brief_date": previous_brief_date
    }
```

## Implementation Instructions

1. Read `CLAUDE.md` and follow its dispatch rules
2. Read `docs/CAPABILITY_INVENTORY.md` — confirm this feature does not already exist
3. Read `docs/LATEST.md` for current production status
4. Read the existing MSA rotation code to understand how briefs are generated and scored
5. Implement `compute_score_deltas()` as a pure function that takes zone_id and current brief data
6. Query Supabase for the most recent previous brief for the same zone
7. Compute deltas for composite score and each of the 6 signal categories
8. Generate a human-readable trend summary
9. Integrate delta computation into the brief generation pipeline (call after scoring, before output)
10. Add delta section to the zone_brief JSON template and markdown report output
11. Run linters and type checks
12. Stage only changed files (never `git add -A`)
13. Commit with message referencing the MSA feature card:
    ```
    feat(msa): Score Delta Tracking — Rotation-over-Rotation Comparison

    Feature Card: 77cf09b9-617d-4c68-8dcc-d78cbb958d13
    Lineage: tampa-water-st 2026-03-26 brief — no previous_brief baseline for delta tracking

    Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
    ```
14. Push with conflict handling: `git pull --rebase origin main && git push origin main`
15. Update the feature card status in Supabase to `built`

## Proof of Execution

After building, the coding agent must:
- Verify the feature works by running at least one test case (zone with 1 brief returns "first rotation" gracefully)
- Update the card status from `prompted` to `built`
- Write a summary to `docs/ops-reports/coding-sessions/msa-2026-03-26.md`
- Note whether this feature would have improved the Tampa Water Street research brief that surfaced it (answer: not for the first run, but will improve all future Tampa rotations)
