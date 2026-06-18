# Architecture — ADE Ops Orchestrator (PR 1)

Built on durable primitives; **no** import of `ade_connectors`/`ade_connector_*`.

## Backend — `backend/app/services/ade_ops/`
| File | Role |
|---|---|
| `models.py` | `RiskTier` (0–5) + `RISK_TIER_TO_PERMISSION` (display map onto `PermissionMode`), `OpsMode`, `OpsStatus(OK/DEGRADED/BLOCKED)`, `OpsConfidence`, `OpsNullReason` (8), `Evidence` (mandatory non-empty `source`), `OpsSkillDef`, `OpsCommandRequest` (no shell/command field), `OpsRunResult` (+`receipt_status`). |
| `registry.py` | `ops_registry`: ~10 families; 5 tier-0/1 executable commands; tier ≥2 skills `executable=False`. Registration enforces "only tiers 0–1 may be executable". |
| `executors.py` | One read-only executor per command. Real evidence from durable sources OR fail-closed. `EXECUTORS` maps only the executable commands. |
| `supervisor.py` | `run_skill`: lookup → risk-tier gate (tier ≥2/non-executable ⇒ `blocked/write_capability_not_enabled`, executor never invoked) → dispatch → receipt. |
| `freshness.py` (PR 2) | `DURABLE_PRODUCTS` registry → reads a product's own freshness contract (`tel_pipeline_status`); real age + cadence recommendation; fail-closed otherwise. |
| `cloud/models.py` (PR 3) | The ONE shared `ProviderInventoryObservation` (provider, account_or_workspace, region, resource_type/id, observed_at, evidence_source, status, null_reason, runtime/cost/freshness_observation_available, rightsizing_candidate_available=False, nested `raw_summary`) + `ProviderConfigStatus` rollup. |
| `cloud/adapters.py` (PR 3) | Four parse-only read-only adapters (snowflake/databricks/gcp/aws) normalizing mocked CLI/query output into observations; fail closed on missing identity; no write verb (test-enforced). |
| `cloud/providers.py` (PR 3) | `config_status` / `all_provider_status`: rolls observations into per-provider configured/not_configured/unavailable. Env presence ≠ configured; only a real read flips it. |
| `recommendations.py` (PR 4) | `AdeOpsRecommendation` (one common shape) + boring/explainable rules (`freshness_recommendation`/`cost_recommendation`/`rightsize_recommendation`) + `dry_run_text` (text-only, NOT EXECUTED) + `ado_ticket_payload` (import-ready, `pushed:false`). `risk_tier` derived: dry-run artifact ⇒ Tier 2 + approval_required + rollback_required; else Tier 1. |

PR 4 executor wiring: cost/rightsize/freshness attach `recommendations: list[dict]` to `OpsRunResult` (pre-serialized, to avoid a models↔recommendations import cycle). Candidate-only — no provider command issued; cost asserts no dollar savings; rightsize blocked by default (no utilization adapter). Tier-2 *skills* stay non-executable; only the *artifact's* `risk_tier` reflects a recommended action. Apply/rollback is PR 5.

PR 3 executor wiring: `scan_pipelines` adds per-provider `cloud:<provider>` config evidence; `show_cost_hotspots` reports per-provider cost-observation availability but never recommends (blocked by default); `recommend_rightsize` stays recommendation-disabled. Optimization is PR 4.

Receipts via `governance.record_decision(decision_type="ade_op", …)` →
`ai_decision_audit_log`. `record_decision` returns `None` on failure (it swallows
the DB error); the supervisor maps that to `receipt_status=failed` +
`receipt_write_failed` and never claims a `receipt_id`.

## Migration
`repo-b/db/schema/484_ade_ops_decision_type.sql` — looks up + drops the auto-named
inline `decision_type` CHECK from 407, re-adds a stably-named CHECK including
`ade_op` (all prior values preserved). Idempotent.

## Route — `backend/app/routes/ade_ops.py` (`/api/ade/ops`)
`GET /skills`, `GET /skills/{name}`, `GET /runs` (business-scoped; empty+null_reason
only on read failure), `POST /run` (tier ≥2 → 200 `status:"blocked"`). All
require auth (`require_authenticated_request`). Registered in `backend/app/main.py`.

## Frontend — `ade-ops` (independent of the deletable `ade` package)
Proxy `repo-b/src/app/api/ade-ops/[...path]/route.ts` (auth-gated, forwards to
`/api/ade/ops`); lib `repo-b/src/lib/ade-ops/api.ts`; console
`repo-b/src/components/ade-ops/` (capability banner, skill catalog by lane,
runnable read-only commands, receipts; all five states); route
`repo-b/src/app/lab/env/[envId]/ade-ops/page.tsx`; `isDomainRoute` regex updated
in `LabEnvironmentShell.tsx` for full-bleed.
