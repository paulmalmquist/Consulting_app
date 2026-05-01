# REPE Winston Mutation Loop Receipt

Date: 2026-05-01

## Scope

- Added change-set lifecycle tables:
  - `re_change_sets`
  - `re_change_items`
  - `re_change_validations`
  - `re_change_impact_preview`
  - `re_change_approvals`
  - `re_change_audit_receipts`
- Added canonical-table write guard triggers that raise `forbidden_direct_write_canonical_table` unless `app.change_set_committing` is set inside the commit transaction.
- Added MCP mutation tools:
  - `repe.stage_change`
  - `repe.validate_change`
  - `repe.compute_change_impact`
  - `repe.approve_change`
  - `repe.commit_change`
  - `repe.rollback_change`
- Added deterministic validators and audit-receipt helpers in backend services.

## Regression Coverage

- `backend/tests/test_re_change_set_lifecycle.py`
- `backend/tests/test_re_change_validation_rules.py`
- `backend/tests/test_re_forbidden_canonical_writes.py`
- `backend/tests/test_re_change_impact_preview.py`
- `backend/tests/test_re_change_audit_receipt.py`
- `backend/tests/test_re_change_rollback.py`
- `repo-b/tests/repe/winston-write-stage-vs-commit.spec.ts`
- `repo-b/tests/repe/winston-write-blocked-validator.spec.ts`

## Verification

- Run targeted backend tests with `cd backend && python3.11 -m pytest tests/test_re_change_*.py tests/test_re_forbidden_canonical_writes.py`.
- Live commit behavior requires the migration to be applied and target-table adapters to be registered for each writable staging table.
