# Phase B8 — Bug 3 Fix Verified; Gate 7 Unblocked

**Date:** 2026-04-21
**Status:** Bug 3 fixed, tested, deployed. Gate 7 (re-promotion) is now **unblocked** but NOT executed this session.

## What shipped

- Commit `5b791f0d` on main — `backend/app/services/re_fund_metrics.py` replaces substring `if "carry" in tier_code` with explicit `_TIER_TYPE_MAP` classification. Unknown tier codes raise inside the try block, triggering fail-closed None return.
- New test file [`test_waterfall_carry_classification.py`](backend/tests/test_waterfall_carry_classification.py) — 8 tests covering the three user-required guardrails:

  | Test | Guardrail |
  |---|---|
  | `test_carry_excludes_lp_tier4_split_BUG_3_REGRESSION` | 1. Carry isolation (the exact Bug 3 case: $177M vs $886M) |
  | `test_carry_includes_tier3_catchup` | 1. Catch-up classified as carry_gp |
  | `test_carry_excludes_pref_and_roc_tiers` | 1. Only carry_gp counts |
  | `test_carry_never_exceeds_distributable` | 2. Structural: carry ≤ distributable |
  | `test_carry_approximates_carry_rate_times_profit_european_waterfall` | 2. Economic magnitude: carry ≈ carry_rate × profit |
  | `test_unknown_tier_code_fails_closed` | Future-proofing: fail closed on unmapped tier |
  | `test_tier_type_map_covers_every_engine_tier_code` | Exhaustiveness: greps engine source |
  | `test_igf7_expected_carry_exact` | 3. Golden IGF VII anchor: $177,376,257.39 |

- Deployed to Railway production. Live shadow run against the deployed build confirms engine still emits the same tier amounts (unchanged; classification is metrics-layer only).

## Live verification

### Step 4 — Live shadow re-run

Fresh IGF VII 2026Q2 shadow post-deploy:
- run_id `174c0345-f4bc-4c3e-aa12-c61f50627588`
- `tier_4_carry_split_gp`: **$177,376,257.39** ← real GP carry
- `tier_4_carry_split_lp`: **$709,505,029.58** ← LP residual, NOT carry
- `tier_1_return_of_capital`: $559,492,243.93

`_compute_waterfall_carry` applied to this tier breakdown via the new `_TIER_TYPE_MAP`:
- Old behavior: sum both "carry" substrings → $886,881,286.97 (**5× too high**)
- New behavior: only `carry_gp` classifications → $177,376,257.39 ✓

Regression test `test_igf7_expected_carry_exact` pins this exact $177.4M value as the known-good carry.

### Step 5 — Reconciliation

Post-deploy reconciliation of all 3 Meridian funds against their released snapshots:

| Fund | Rollup NAV | Snapshot NAV | Delta | Status |
|---|---:|---:|---:|---|
| Institutional Growth Fund VII | $1,446,373,530.90 | $1,446,373,530.90 | $0.00 | CLEAN |
| Meridian Credit Opportunities Fund I | $116,680,385.29 | $116,680,385.29 | $0.00 | CLEAN |
| Meridian Real Estate Fund III | $42,852,173.50 | $42,852,173.50 | $0.00 | CLEAN |

Bug 3 fix is metrics-layer only — does not touch ledger, rollup, or snapshot state. No drift introduced.

## Invariant status across all fixes

| Layer | Bug | Status | Verification |
|---|---|---|---|
| Engine (allocation math) | Bug 1 — tier-1 no cap | ✅ fixed | INV-W1/W2/W3 — 10 tests in `test_waterfall_tier_allocations.py` |
| Ledger (economic inputs) | Bug 2 — fund-level calls tagged per-partner | ✅ fixed | INV-L1/L2 — migration 469 enforces at write time |
| Metrics (interpretation) | Bug 3 — substring match includes LP split | ✅ fixed | 8 tests in `test_waterfall_carry_classification.py` |

All three layers now have classification, sum, and exactness guardrails. 137/137 REPE regression tests green. ruff clean.

## Current state

IGF VII authoritative snapshot: **unchanged** (`inv5-rebuild-20260411-full-scope`). Net metrics still carry `null_reason='out_of_scope_requires_waterfall'` at fund level because the snapshot was promoted before this session's fixes. That's the correct fail-closed state for today's data.

Gate 7 (invalidate → rebuild → promote) is unblocked but not executed this session per the single-focus mandate ("fix the labeling, prove it with tests, stop").

## Next session entry point (Gate 7 execution)

The moment all three gates below remain green, promotion can proceed:

1. **Engine** — `test_waterfall_tier_allocations.py` green (INV-W1/W2/W3 hold)
2. **Ledger** — INV-L1/L2 hold on live (re-verify with same query used today)
3. **Metrics** — `test_waterfall_carry_classification.py::test_igf7_expected_carry_exact` green

Then execute:
- Run `meridian_authoritative_snapshot.py` → writes new `draft_audit` snapshot for IGF VII 2026Q2
- Run `compute_return_metrics` for IGF VII 2026Q2 → this call will now succeed with `carry = $177,376,257.39`, producing valid `net_irr`, `net_tvpi`, `gross_net_spread`
- Run partner-level receipt hand-check against the new draft snapshot (4 partners, $0.01 tolerance)
- If all gates green → promote via `promote_authoritative_snapshot.py --target-state=released`
- Post-flight reconciliation endpoint → expect no new `delta_gt_1usd` flags
- Amend `final_report.md §7a` with new snapshot_version, carry value, net_irr, net_tvpi

Hard rule preserved: **do not promote without every arithmetic oracle green.**

## What is NOT changed

- IGF VII `inv5-rebuild-20260411-full-scope` snapshot remains authoritative
- `net_irr = null` / `carry = null` / `trust_status = 'untrusted'` — correct fail-closed
- MREF III / MCOF I untouched — still gated on user-input decisions
- `released_state_lock` trigger untouched

This session peeled the third and final layer of the waterfall pipeline failure. The system is now structurally sound across engine, ledger, and metrics classification; all three have independent invariants and tests. Promotion becomes a procedural step in the next session — not a debugging exercise.
