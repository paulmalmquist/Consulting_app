# REPE Winston Read Eval Loop Receipt

Date: 2026-05-01

## Scope

- Added REPE capability registry, scenario tables, SQL assertions, metric contracts, and eval observations in `repo-b/db/schema/607_winston_eval_repe_extensions.sql`.
- Added deterministic SQL functions:
  - `repe.fn_eligible_metric_history`
  - `repe.fn_classify_unavailable_metric`
- Added MCP read tools:
  - `repe.resolve_repe_context`
  - `repe.get_authoritative_fund_snapshots`
  - `repe.rank_funds_by_metric_change`
  - `repe.get_metric_provenance`
  - `repe.explain_unavailable_metric`
- Added `repe.run_readonly_sql_with_contract` to block writes, legacy tables, and unscoped SQL.
- Wired Meridian structured fund metric rankings to `repe.rank_funds_by_metric_change` and added frontend `comparison_result` / `unavailable_with_reason` renderers.
- The generic retrieval-empty copy is now paired with a reason code when it appears.

## Regression Coverage

- `backend/tests/test_repe_eval_screenshot_regression.py`
- `backend/tests/test_repe_eval_all_null_brutal.py`
- `backend/tests/test_repe_eval_rank_funds_by_metric_change.py`
- `repo-b/tests/repe/winston-comparison-result.spec.ts`
- `repo-b/tests/repe/winston-eval-unavailable-reason.spec.ts`

## Verification

- Run backend targeted tests with `cd backend && python3.11 -m pytest tests/test_repe_eval_screenshot_regression.py tests/test_repe_eval_all_null_brutal.py tests/test_repe_eval_rank_funds_by_metric_change.py`.
- Apply schema with `supabase db push --linked` before live eval runs.
