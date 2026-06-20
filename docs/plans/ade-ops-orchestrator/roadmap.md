# Roadmap — ADE Ops Orchestrator

Read-only first, recommendations second, dry-run third, approval-gated execution last.

## PR 1 — Skeleton + 5 commands — SHIPPED
Risk tiers 0–5; supervisor-of-skills; read-only `/api/ade/ops`; receipts to
`ai_decision_audit_log`; console; tier ≥2 visible but non-executable; fail-closed
honesty. Commands: `scan pipelines` (real, cloud not configured), `can I trust
this number` (real degraded), `assess freshness` / `show cost hotspots` /
`recommend rightsize` (fail closed until adapters land).

## PR 2 — Freshness adapter — SHIPPED (ADO #652/#653)
`assess freshness` is real for Winston-owned **durable** data products. A product
registry (`backend/app/services/ade_ops/freshness.py::DURABLE_PRODUCTS`) maps a
product id to its own durable freshness contract; PR 2 wires the Telemetry
pipeline-status handshake (`tel_pipeline_status`: status fresh|stale|failed +
as_of_ts + reason) and recommends a cadence from the real age vs the product's
declared target. Fresh → `ok`; stale/failed → `degraded` with a recommendation.
**No fabrication:** unknown product, missing row, or any **cloud platform**
(snowflake/databricks/gcp/aws/bigquery) fails closed — cloud freshness is PR 3.

## PR 3 — Cloud read-only inventory adapters — SHIPPED (ADO #673/#674)
Read-only adapters for Snowflake / Databricks / GCP / AWS that detect whether a
provider's telemetry is configured and normalize available metadata into ONE
shared `ProviderInventoryObservation` model (`backend/app/services/ade_ops/cloud/`)
— provider-specific detail in nested `raw_summary`, never new core fields.
Adapters are **parse-only** (no command execution) and **read-only** (a test
asserts no write verb appears). Fail closed with an explicit null_reason on any
missing CLI/auth/account/project/workspace/region; env-var presence is never
treated as "configured" — only a real (here: mocked) read producing usable rows
flips a provider to configured. Wiring: `scan pipelines` reports per-provider
config status; `show cost hotspots` reports per-provider cost-OBSERVATION
availability but **does not recommend** (blocked by default); `recommend
rightsize` stays recommendation-disabled. No credentials in CI; tests use mocked
output only. Optimization is PR 4.

## PR 4 — Recommendation engine — SHIPPED (ADO #676/#677)
Observations → governed recommendation **artifacts**, never actions. One common
`AdeOpsRecommendation` shape (`recommendations.py`): finding, recommendation,
confidence, risk_tier, expected_impact, evidence[], assumptions[], null_reason,
dry_run_artifact, approval_required, next_step, observation_window,
rollback_required. Boring/explainable rules — FRESHNESS: stale→cadence-change
candidate, failed→incident follow-up, no as_of→blocked durable_source_unavailable;
COST: cost-observation present→rank hotspots (candidate, **no dollar savings**),
missing billing→blocked/degraded no estimate; RIGHTSIZE: runtime+cost+utilization
present→candidate with **text-only** dry-run (Tier 2 + approval + rollback flags),
missing any→blocked no resize. The dry-run is descriptive text labelled NOT
EXECUTED; the ADO payload is local/import-ready (`pushed:false`) — real tickets
route through azure-devops-intake. **No provider execution, no writes, no schedule
changes, no rollback/exec logic.** `risk_tier` on the artifact describes the
recommended action's tier; the command stays tier-1 read-only. Tier-2 *skills*
remain non-executable. Apply/rollback is PR 5.

## PR 5 — Approval-gated execution (split into 5A / 5B / 5C)

### PR 5A — Approval Escrow + Execution Preflight — SHIPPED (ADO #678/#679)
The approval/execution-CONTROL spine with **no provider writes**. A PR-4
recommendation is escrowed into an `ApprovalRequest` (opaque token + TTL + human
state pending/approved/expired/blocked) in `ade_ops_approvals` (migration 614,
RLS, plus a schema-level `CHECK (executed = false)` that rejects any execution
row). A human can approve (token + TTL checked, fails closed on wrong token /
expiry / blocked); preflight requires rollback plan + observation window + target
+ provider + risk tier + evidence. **The invariant:** `EXECUTION_ENABLED=False`,
no provider-write/subprocess path exists, and `can_execute` returns
`execution_not_enabled` even for an approved, preflight-passed request. Allowlist
is data-shape only (no commands). Receipts for create/approve via
`ai_decision_audit_log`. UI shows the four states + an "execution disabled"
banner. Tier 3/4 skills remain non-mutating.

### PR 5B — Simulated (non-prod) execution only — SHIPPED (ADO #681/#682)
Proves the approved-execution ceremony end-to-end against a SIMULATED executor
(`simulation.py`): approved + preflight + `execution_mode='simulation'` →
simulated execute → receipt → observation window → optional simulated rollback
receipt. **Real providers stay impossible:** `nonprod`/`prod` modes return
`real_execution_not_enabled` (no real executor exists), `approvals.EXECUTION_ENABLED`
stays False, the simulation module reaches no provider/subprocess (test-enforced),
and migration 615 relaxes the schema CHECK to `executed=false OR
execution_mode='simulation'` (verified: a `prod` executed=true insert is rejected,
`simulation` allowed). UI shows `executed:true` only as a "Simulated" state with
the mode visible. The real, fully-gated single write is PR 5C.

### PR 5C — First real provider write: Snowflake non-prod AUTO_SUSPEND only — SHIPPED (ADO #683/#684)
The ONE real, reversible action: `ALTER WAREHOUSE <allowlisted> SET AUTO_SUSPEND
= <approved int>` — Snowflake only, non-prod only, one action_kind, allowlisted
warehouses only. No resize/tasks/dynamic-tables/prod/arbitrary/user-supplied SQL,
no subprocess, no other provider. SQL is built from typed fields and re-validated
by a strict parser (`validate_sql`) that accepts only that exact statement shape
against an allowlisted warehouse (rejects semicolons, comments, piggybacks, resize,
wrong case, non-int, non-allowlisted). Rollback SQL is generated and validated
BEFORE execution. Gated by approval + preflight + allowlist + rollback + observation
window + env flag (`ADE_OPS_REAL_EXEC_ENABLED`, default off) + non-prod (prod
blocked). The Snowflake client is injected (CI mock; no creds; real connector only
behind the flag). Migration 616 tightens the schema CHECK so a real (`nonprod`)
executed row is permitted ONLY for `provider='snowflake'` +
`action_kind='warehouse_auto_suspend'` with both SQL hashes present (verified:
without-hashes and prod rejected, with-hashes allowed). Receipt records
before/after, actor, approval id, preflight, SQL hash, rollback SQL hash,
observation window. NOT a Snowflake write framework — one boring reversible
mutation. Broader execution + post-change watch is PR 6.

## PR 6 — Incidents + post-change watcher (split into 6A / 6B)

### PR 6A — Post-Change Watcher + Observation Evaluation — SHIPPED (ADO #685/#686)
Evaluates an executed change (simulated PR 5B or real non-prod PR 5C) during its
observation window and produces a verdict — **evaluate + recommend, never act**.
`watcher.py::evaluate(req, observation, now)` reads the receipt + observation
window and returns one of: `accepted` (improved/stable, window closed) ·
`still_observing` (window open) · `degraded` (failed/stale telemetry) ·
`rollback_recommended` (worse outcome — **artifact only, executes nothing**) ·
`insufficient_evidence` (no observation evidence — never success). The verdict
cites evidence + null_reason. No provider write, no auto-rollback, no schedule
change (a test asserts the module has no execution token). Route: `POST
/approvals/{id}/watch` (optional observation evidence) + `GET /approvals/watch`
(watcher state, honest by default); both receipted. UI `WatcherPanel`
distinguishes simulated / live non-prod / unavailable evidence.

### PR 6B — Incident state machine
Data-incident state machine, blast-radius mapping, closeout report. Auto-rollback
execution remains a **later, explicit** decision — not bundled into the watcher.

## Later
Centralized scheduling (Railway/Vercel cron → a trigger endpoint); remaining
skill families (quality, contracts, metrics governance, AI-answer safety).
