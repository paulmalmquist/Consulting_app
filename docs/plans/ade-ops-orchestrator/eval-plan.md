# Eval plan — ADE Ops Orchestrator (PR 1)

Backend `backend/tests/test_ade_ops_*.py`, frontend `AdeOpsConsole.test.tsx`.

## First real provider write — PR 5C (test_ade_ops_snowflake.py + ApprovalsPanel.test.tsx)
- SQL built from typed fields only; `validate_sql` accepts ONLY `ALTER WAREHOUSE <allowlisted> SET AUTO_SUSPEND = <int>` and rejects semicolons, piggyback statements, comments, resize, wrong case, non-int, non-allowlisted.
- Blocked: env flag off · prod environment · no approval · expired · missing observation · missing rollback · non-allowlisted warehouse · non-snowflake provider.
- Happy path: exactly one validated statement sent to the (mock) client; before/after + distinct SQL/rollback hashes recorded.
- Rollback SQL generated + validated **before** execution — an invalid rollback value blocks and nothing runs.
- A provider error reports `failed` (not executed), rollback SQL available.
- No user-supplied SQL path (signature has no `sql` param; params are typed); no subprocess token in the module.
- Schema: migration 616 permits a real `nonprod` executed row ONLY for snowflake + warehouse_auto_suspend + both hashes (verified via Supabase CLI: without-hashes rejected, prod rejected, with-hashes allowed).
- FE: banner states the one gated action + everything-else-impossible; a real execution renders "Live · non-prod" with before→after + SQL hash.

## Simulated execution — PR 5B (test_ade_ops_simulation.py + ApprovalsPanel.test.tsx)
- Without approval / expired approval / missing rollback-observation-evidence (preflight fail) → blocked, executed stays False.
- Valid approval + preflight + `mode='simulation'` → simulated execute succeeds, executed=True, observation window opened, plan says "no provider command issued".
- Real modes (`nonprod`/`prod`) → `real_execution_not_enabled`; unknown mode → blocked.
- Simulated rollback records (requires rollback plan + prior execution) and touches no provider.
- PR 5A invariant intact: `approvals.EXECUTION_ENABLED is False`; `attempt_execution` still executed:false. Simulation module (docstrings stripped) has no provider/subprocess token.
- Schema: migration 615 `CHECK (executed=false OR execution_mode='simulation')` rejects a `prod` executed=true insert, allows `simulation` (verified via Supabase CLI).
- FE: banner states only-simulated/real-impossible; `executed:true` renders a "Simulated" tag + the mode; non-executed shows `executed:false`.

## Approval escrow + preflight — PR 5A (test_ade_ops_approvals.py + ApprovalsPanel.test.tsx)
- Recommendation → pending request; a blocked recommendation escrows blocked and cannot be approved out.
- Human approve sets approved + approver + approved_at; wrong token → `invalid_approval_token` (fails closed); past TTL → `expired`.
- Preflight requires all six (rollback_plan, observation_window, target_ref, provider, risk_tier, evidence); missing any → not passed.
- **The invariant:** `EXECUTION_ENABLED is False`; even approved + preflight-passed → `can_execute` returns `execution_not_enabled`; `attempt_execution` returns `executed:false`. Not-approved/preflight-failed also cannot execute.
- Allowlist is shape-only and disabled; module (code, docstrings stripped) contains no execution token (subprocess/alter/run-now/gcloud/aws/snowsql/…).
- Schema guard: `ade_ops_approvals.CHECK (executed = false)` rejects an `executed=true` insert (verified via Supabase CLI).
- FE: the four states render; an execution-disabled banner always shows; `executed:false` is surfaced; read failure fails closed to empty.

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
