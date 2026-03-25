# Meta Prompt Template — MSA Feature Card → Build Directive

Replace `{placeholders}` with values from the Feature Card.

---

You are building a Winston feature identified by the MSA Rotation Engine during a research sweep of **{zone_name}** on **{brief_date}**.

## Feature: {title}

**Category:** {gap_category}
**Priority:** {priority_score}/100
**Target Module:** {target_module}
**Lineage:** {lineage_note}

## Why This Exists

During the Phase 1 research sweep of {zone_name}, the engine needed to {description}. This capability does not currently exist in Winston. Building it will improve research quality for {frequency_note} zones, not just the one that surfaced it.

## Specification

**Inputs:**
{spec_inputs}

**Outputs:**
{spec_outputs}

**Acceptance Criteria:**
{spec_acceptance_criteria}

**Test Cases:**
{spec_test_cases}

## Schema Impact

{spec_schema_impact}

## Files to Touch

{spec_files_to_touch}

## Implementation Instructions

1. Read `CLAUDE.md` and follow its dispatch rules
2. Read `docs/CAPABILITY_INVENTORY.md` — confirm this feature does not already exist
3. Read `docs/LATEST.md` for current production status
4. Plan the implementation before writing code
5. Implement following existing repo patterns
6. Run linters and type checks
7. Stage only changed files (never `git add -A`)
8. Commit with message referencing the MSA feature card:
   ```
   feat(msa): {title}

   Feature Card: {card_id}
   Lineage: {lineage_note}

   Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
   ```
9. Push with conflict handling: `git pull --rebase origin main && git push origin main`
10. Update the feature card status in Supabase to `built`

## Proof of Execution

After building, the coding agent must:
- Verify the feature works by running at least one test case
- Update the card status from `prompted` to `built`
- Write a summary to `docs/ops-reports/coding-sessions/msa-{date}.md`
- Note whether this feature would have improved the research brief that surfaced it
