# Meridian Forensic — Engine Hardening Pass (2026-04-19)

## Status
Part A in progress. Correctness gate shipped (commit `46c4be15`).

## What shipped
- [backend/tests/test_repe_snapshot_consistency.py](backend/tests/test_repe_snapshot_consistency.py) — 10 tests. Correctness gate for Part B re-promotion.
- [backend/tests/test_repe_golden_asset.py](backend/tests/test_repe_golden_asset.py) + [backend/tests/fixtures/repe_golden_asset.json](backend/tests/fixtures/repe_golden_asset.json) — 7 tests. Asset-level arithmetic oracle.
- 17/17 passing locally.

## What's next (in order)
1. **A6 — Reconciliation endpoint.** Extend [backend/app/services/re_reconciliation.py](backend/app/services/re_reconciliation.py) with `build_environment_reconciliation(env_id, quarter)`. Add `GET /api/re/v2/environments/{env_id}/reconciliation/{quarter}` in [backend/app/routes/re_v2.py](backend/app/routes/re_v2.py). Write `backend/tests/test_reconciliation.py` with ownership-mismatch fixture. Response shape, `parent_expected` definition per level, and `snapshot_version` requirements are documented in the plan at [/Users/paulmalmquist/.claude/plans/fizzy-sprouting-sundae.md](/Users/paulmalmquist/.claude/plans/fizzy-sprouting-sundae.md) §A6.
2. **A2/A3/A4 — Guardrail tests.** `test_repe_single_source_of_truth.py` (INV-1), `test_repe_period_coherence.py` (INV-2), `test_repe_no_duplicate_funds.py` (seed idempotency). Styles match existing invariant tests (mock/patch-based, no DB).
3. **A7 — Playwright.** `repo-b/tests/repe/re-fund-null-state.spec.ts` — assert "Unavailable" rendering and no `$0` / `—` on net metric tiles.
4. **Part A verification.** Full regression + vitest + tsc + lint + playwright.
5. **Part B data re-promotion.** IGF VII proving ground → MREF III investigation → MCOF I scope expansion. Blocks on user input for MREF III total_called question and MCOF I fund docs.

## Gate
**Part B does not run until A1 + A5 remain green AND the reconciliation endpoint is in place.** The correctness gate (A1/A5) proves the engine is sound; the reconciliation endpoint is the diagnostic surface used to validate each re-promotion.

## Plan
Full plan: [/Users/paulmalmquist/.claude/plans/fizzy-sprouting-sundae.md](/Users/paulmalmquist/.claude/plans/fizzy-sprouting-sundae.md)

## Prior session final report
The 11-phase forensic audit already shipped on 2026-04-11. Do not regenerate. Amend [verification/receipts/meridian_forensic_2026-04-11/final_report.md](verification/receipts/meridian_forensic_2026-04-11/final_report.md) §7 with a `§7a — 2026-04-19 Re-Promotion Delta` section when Part B completes. Required fields per fund: new verdict + reason, snapshot_version (before), snapshot_version (after), delta summary for NAV/IRR/DPI, unresolved blockers.
