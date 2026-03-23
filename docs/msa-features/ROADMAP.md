# MSA Feature Roadmap

> Auto-updated by `msa-feature-builder` scheduled task.
> Last updated: 2026-03-22

---

## Backlog Summary

| Status | Count |
|---|---|
| identified | 0 |
| specced | 2 |
| prompted | 3 |
| built | 0 |
| verified | 0 |
| **Total** | **5** |

---

## Top 5 Cards by Priority

| Rank | Card | Priority | Status | Category |
|---|---|---|---|---|
| 1 | MSA Research Sweep Runner — Phase 1 Automation | 72 | **prompted** | workflow |
| 2 | County Assessor / Recorder Live Data Connector | 65 | **prompted** | data_source |
| 3 | Sub-MSA Acquisition Score Calculator | 60 | **prompted** | calculation |
| 4 | Zone Intelligence Dashboard — Submarket Heat Map + Brief Viewer | 54 | specced | visualization |
| 5 | BLS QCEW + FRED Employment Series Auto-Pull for MSA Zones | 48 | specced | data_source |

---

## Prompts Ready for Coding Session (3 PM autonomous loop)

The following prompts are ready in `docs/msa-features/prompts/` for the 3 PM autonomous coding session:

1. **`b1620471-msa-research-sweep-runner.md`** — Priority 72 — ROOT BLOCKER. The msa-research-sweep task has never executed. All 14 zones have `last_rotated_at = NULL` and zero briefs exist. This must be built first — nothing else in the MSA pipeline can run without it.

2. **`e769041f-county-assessor-connector.md`** — Priority 65 — Category 1 data gap. County assessor/recorder data is the top transaction activity source across all 14 zones. Currently falls back to unstructured web search. A structured connector would produce deed records and lis pendens instead of landing pages.

3. **`30ef9cb6-sub-msa-acquisition-score-calculator.md`** — Priority 60 — Rotation algorithm blocker. All 14 `msa_zone` rows have `rotation_priority_score = 0.00`. The scoring weights config exists but no service consumes it. This builds the scoring engine and updates zone scores after each brief.

**Recommended build order:** 1 → 2 → 3 (the sweep runner unlocks briefs, which the score calculator needs as input)

---

## Cards Completed This Week

None yet — first prompted batch is 2026-03-22.

---

## Projected Next Builds

After the 3 prompted cards are built (targeting 2026-03-22 to 2026-03-25):

| Next Card | Priority | Status | Dependency |
|---|---|---|---|
| Zone Intelligence Dashboard — Submarket Heat Map + Brief Viewer | 54 | specced (needs prompt) | Needs brief data from sweep runner |
| BLS QCEW + FRED Employment Series Auto-Pull | 48 | specced (needs prompt) | Independent; can build in parallel |

---

## Pipeline Health Notes (2026-03-22)

- **Root cause of empty backlog:** The `msa-research-sweep` task is defined but has never produced output — zero briefs in `msa_zone_intel_brief`. This caused `msa-gap-detection` to find no inputs and create no cards, which caused `msa-feature-builder` to find no specced cards. Today's batch was the first successful card creation from a cold-start audit.
- **All 14 zones** have `last_rotated_at = NULL` and `rotation_priority_score = 0.00`
- **No conflicts** with current non-MSA build priorities (fast-path pipeline fix, chat workspace bugs)
- **Feature radar overlap:** None — MSA cards are infrastructure-layer and don't touch CRM, extraction engine, or dashboard composer

---

## Card Status Definitions

| Status | Meaning |
|---|---|
| `identified` | Gap found during research sweep; needs human or AI review to decide if worth building |
| `specced` | Spec written in `spec_json`; ready to be converted to a meta prompt |
| `prompted` | Meta prompt written and ready for coding agent to execute |
| `built` | Code committed and pushed; awaiting verification |
| `verified` | Test cases pass; card closed |
