# 0031 - Sustainability T12: Acceptance Evals (prove the governed guarantees hold)

- Status: Done (2026-07-13) - tests-only, as the guard required. The suite FOUND a real fail-closed gap in T9 (unguarded reader call); the builder tried to patch production inside this bundle to turn it green, the reviewer blocked it on the guard, and the fix shipped separately as PR #533. That is the guard working exactly as intended.
- Environment: Business OS / Sustainability
- Risk: Low (tests only; no production code)
- Scope: Lock the guarantees the v1 platform claims, as tests that fail if a future change breaks them. One ticket (T12 from plan 0018).
- Master plan: `docs/plans/03-implementation-plans/active/0018-sustainability-tool-planning.md`
- Depends on: T3-T10 (all merged).

## What this ticket is for

The sustainability platform makes three promises. Right now each is enforced only by the code that happens to implement it. This ticket turns them into tests that break loudly if a future change violates them.

1. **It never fabricates a number.** A missing value surfaces its `null_reason`; zero is never substituted.
2. **The same metric reconciles everywhere.** Dashboard, report, and AI all read the one governed reader, so they cannot show different numbers.
3. **Reads go through the single fetch layer.** No surface computes a sustainability metric from raw tables.

Plan 0018 lists 15 acceptance tests. Most target capabilities that are **not in v1** (forecasting, anomaly detection, intake/upload, weather normalization, initiative savings). Writing tests for unbuilt features would be theater. This ticket implements the subset that is real and meaningful today, and says plainly which ones are deferred and why.

## Scope

In scope: a new `backend/tests/test_sustainability_acceptance.py` (no DB; the reader is monkeypatched), covering:

1. **No fabrication (0018 test 3, "a missing emissions factor produces a null reason, not zero").** For each fail-closed reason (`snapshot_unavailable`, `emission_factor_missing`, `metric_definition_missing`, `out_of_certified_scope`): the reader returns `value=None` + that reason, and the value is **not** `0`, `0.0`, `""`, or `"-"`. Assert against the reader (T4), the report bundle (T9), and the unified-query executor path (T10), so no layer can quietly zero-fill.
2. **Reconciliation (0018 test 4, "dashboard and report values reconcile exactly").** For one mocked reader payload, assert that the report bundle's `(metric_key, value, null_reason, unit)` tuples are **identical** to what the reader returned; and that the unified-query result for the same metric key carries the same value and `null_reason`. If any layer transforms a value, this test fails.
3. **Single fetch layer.** A static guard asserting that no sustainability serving module issues its own SQL for a governed metric: `re_sustainability_authoritative.py` is the only module in the governed path that queries the `sus_authoritative_*` tables, and `re_sustainability_report.py` contains no `get_cursor` / `SELECT` / `sus_` table reference. (Mirrors the spirit of `verification/lint/no_legacy_repe_reads.py`.)
4. **Registry integrity.** All six v1 metric keys are registered with `query_strategy='service'` -> `service_function='sustainability_authoritative'`, that service function exists in `_get_service_map()`, and each carries a `down_good` polarity so rising emissions can never be described as an improvement.
5. **Fail-closed on error.** A reader that raises does not produce a number anywhere: the report bundle and the query executor both degrade to a null/empty result rather than a fabricated value.

Out of scope (explicit, and stated in the test module's docstring as deferred with reasons):
- Plan 0018 tests 6, 7, 8, 12 (weather-normalized baseline, forecast interval coverage, anomaly detection, ML exclusion) - **no forecasting or anomaly capability exists in v1**.
- Tests 1, 2, 11 (source bill traces to metric, duplicate bill quarantined, corrected record versioning) - **no intake/upload path in v1**; T11 is deferred to v1.1 by plan 0018 itself.
- Test 15 (report export matches screen) - **no file export in v1**.
- Playwright/browser tests, and any test requiring a live database.

## Acceptance Criteria

### Screen
Not applicable.

### API
Not applicable (tests only).

### DB/Data
- The single-fetch-layer guard asserts `re_sustainability_report.py` contains no `get_cursor`, no `SELECT`, and no direct `sus_` table reference, and that the governed path reads the `sus_authoritative_*` tables only from `re_sustainability_authoritative.py`.

### AI behavior
- The no-fabrication test asserts that for every fail-closed `null_reason`, no layer (reader, report, unified-query executor) returns `0`, `0.0`, `""`, or `"-"` in place of the absent value; each returns `None` plus the reason verbatim.
- The registry-integrity test asserts every v1 metric carries `down_good` polarity, so the copilot cannot describe rising emissions as an improvement.
- The reconciliation test asserts the report and the query executor return values identical to the reader's, so the AI, the report, and the dashboard cannot disagree.

### Evals/tests
- New `backend/tests/test_sustainability_acceptance.py` implements items 1-5 above and passes. Its module docstring names the deferred plan-0018 tests and the reason each is deferred (capability not in v1), so the gap is documented rather than silently skipped.
- `cd backend && python -m ruff check app tests` and `python -m pytest tests/test_sustainability_acceptance.py -q` pass. The existing sustainability tests still pass.

### Regression guard
- Only `backend/tests/test_sustainability_acceptance.py` (new) and this plan are added. **No production code is modified** - if a guarantee does not hold, the fix is a follow-up ticket, not a weakened test.
