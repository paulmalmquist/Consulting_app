# Eval plan — ADE Ops Orchestrator (PR 1)

Backend `backend/tests/test_ade_ops_*.py`, frontend `AdeOpsConsole.test.tsx`.

## Registry / tier (test_ade_ops_registry.py)
- The 5 PR-1 commands present and executable (tier ≤1).
- Tier-executability invariant: every tier ≥2 skill is `executable=False`; every executable skill has a wired executor.
- No skill def carries a shell/command string (word-boundary patterns).

## Supervisor (test_ade_ops_supervisor.py)
- **No-write wall:** tier ≥2 skills → `blocked` / `write_capability_not_enabled`, and a spy proves the executor is never invoked.
- **Anti-fabrication:** every non-blocked result has evidence with a non-empty `source`; blocked results carry a `null_reason`.
- Cloud commands (freshness/cost/rightsize) fail closed `data_source_not_configured` (no recommendation, no evidence).
- `trust_number` with no metric → `invalid_inputs`. Unknown skill → `unknown_skill`.
- `scan pipelines` reports `cloud_pipelines = data_source_not_configured` while registries are real (degraded, per-source).
- **Receipts:** written with `decision_type="ade_op"` on success; on insert failure → `receipt_status=failed` + `receipt_write_failed`, `receipt_id=None` (never silent); skipped with no business context.

## Route (test_ade_ops_routes.py)
- Unauthenticated `/skills`, `/runs`, `/run` → 401 (auth fail closed, not empty).
- `/runs` empty + `runs_read_unavailable` only on a read failure.
- `/run` tier-2 → 200 with `status:"blocked"`.
- Migration static check: 484 keeps the 4 prior decision_type values + adds `ade_op`, drops the old constraint.

## Frontend (AdeOpsConsole.test.tsx)
- Catalog renders; tier ≥2 marked "Not available — write capability not enabled"; capability banner shown; empty receipts state; receipts `null_reason` (unavailable) state.

## Migration verification (manual / CI)
Apply 484 via Supabase CLI; confirm an `ade_op` insert succeeds AND prior values still insert.
