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
- `scan pipelines` reports per-provider `cloud:<provider>` config status (default not_configured) while registries are real (degraded, per-source).
- **Receipts:** written with `decision_type="ade_op"` on success; on insert failure → `receipt_status=failed` + `receipt_write_failed`, `receipt_id=None` (never silent); skipped with no business context.

## Recommendation engine — PR 4 (test_ade_ops_recommendations.py)
- Freshness: no as_of → blocked durable_source_unavailable; failed → incident follow-up; stale → cadence-change candidate (Tier 1, no dry-run).
- Cost: missing billing → blocked, **no `expected_impact`** (no savings); available → rank candidate only, still no dollar figure.
- Rightsize: missing evidence → blocked, no resize, no dry-run; all evidence → candidate with **text-only** dry-run (NOT EXECUTED), Tier 2 + approval_required + rollback_required, and the dry-run text contains **no executable command token** (alter/resize/modify-instance/run-now/terminate/drop).
- ADO payload: `import_ready:true`, `pushed:false`.
- Executor wiring: cost/rightsize emit one artifact per provider (blocked by default, candidate-not-action); freshness attaches a recommendation; `recommendations` serializes in `to_dict()`.
- The recommendations module contains **no execution token** (subprocess/os.system/alter table/run-now/gcloud/aws/snowsql).

## Cloud inventory adapters — PR 3 (test_ade_ops_cloud.py)
- Every adapter with no input → `not_configured` + provider-specific null_reason; no fabricated `observed_at`; `rightsizing_candidate_available=False`.
- Rows present but missing identity (account/workspace/project/region) → explicit null_reason.
- Mocked output normalizes into the ONE `ProviderInventoryObservation` model; provider detail lives in `raw_summary`.
- **Read-only wall:** the adapters module contains no write verb (alter/drop/terminate/modify/delete/resize/insert/run-now/start-job-run); `READ_ONLY_VERBS` is read-only only.
- Rollup defaults to `not_configured` for all four; a mock flips a provider to `configured`.
- Executor wiring: `scan pipelines` carries `cloud:<provider>` status; `show cost hotspots` is availability-only and BLOCKED by default (never recommends in PR 3); `recommend rightsize` stays recommendation-disabled.

## Freshness adapter — PR 2 (test_ade_ops_freshness.py)
- Fresh durable product → `ok` with real evidence (product, status, **non-null as_of**, age, target cadence); every evidence item sourced.
- Stale / failed pipeline → `degraded` with a cadence recommendation referencing the real age.
- Cloud platform (snowflake/databricks/gcp/aws/bigquery) → fail closed `data_source_not_configured` (deferred to PR 3).
- Unknown product → `data_source_not_configured`; missing product id → `invalid_inputs`; registered product with **no row** → `durable_source_unavailable` (no fabricated timestamp).

## Route (test_ade_ops_routes.py)
- Unauthenticated `/skills`, `/runs`, `/run` → 401 (auth fail closed, not empty).
- `/runs` empty + `runs_read_unavailable` only on a read failure.
- `/run` tier-2 → 200 with `status:"blocked"`.
- Migration static check: 484 keeps the 4 prior decision_type values + adds `ade_op`, drops the old constraint.

## Frontend (AdeOpsConsole.test.tsx)
- Catalog renders; tier ≥2 marked "Not available — write capability not enabled"; capability banner shown; empty receipts state; receipts `null_reason` (unavailable) state.

## Migration verification (manual / CI)
Apply 484 via Supabase CLI; confirm an `ade_op` insert succeeds AND prior values still insert.
