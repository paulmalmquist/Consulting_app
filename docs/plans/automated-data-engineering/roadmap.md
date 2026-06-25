# Roadmap — deferred past PR 1

None of this is in PR 1. The non-goals in `eval-plan.md` enforce that.

## Milestone: Connector Fabric Foundation — COMPLETE (2026-06-15)

PRs 1–3 form a complete vertical slice and are the closed **Connector Fabric Foundation**
milestone. Everything past it is polish/ops, not a blocker.

- **PR 1 (#179)** — ADE product surface: skill registry, declared connector inventory,
  execution receipts, governance stats, all read-only over the existing MCP/audit fabric.
- **PR 2 (#186, ADO #581)** — connector lifecycle state machine + validation receipts; a
  connector reaches `read_validated` only when a real validator runs and emits a receipt.
- **PR 3 (#188, ADO #589/#590)** — real read-only provider reachability: GET-only, hard
  timeouts, missing-token → `credential_pending` with no outbound call, no token leakage.

ADE coding is **paused** here. If it resumes, start with **PR 4B (connector
remediation UI polish)** — it improves the live surface without touching real credentials.
Defer **PR 4A (local opt-in live-token validation runbook)** until proof against real
tokens is actually needed; it is ops evidence, not product experience. Do not add BYO keys.

## Milestone: Composed telemetry presentation — Phase 1 COMPLETE (2026-06-24, PR #337)

The standalone telemetry mount was reframed into a composed **Data Engineering** section in the
telemetry sidebar (`/lab/env/[envId]/telemetry/data-engineering/*`), with two modes — Agent
Workbench and Run Autopsy. Data-semantics pages (grain, relationships & lineage, pipelines &
quality) reuse the telemetry metadata catalog; agent/governance pages read the portable `/api/ade/*`
endpoints with telemetry primitives. Old `/automated-data-engineering/*` routes 307-redirect in. The
ADE core package is unchanged and still portable (ADR 0002 follow-up note). This was IA + framing
only — no new backend.

**Deferred to Phase 2 (presentation; not shown as if they exist today):**

- **Join-safety classification UI** — safe / bridge-required / blocked verdicts + recommended bridge
  paths, derived from edge confidence + grain mismatch. (Depends on the Analytical engine items below.)
- **Guided scenario walkthrough** — e.g. "can vibration + chamber temperature explain failed Stargate
  prints?" rendered as found-sources → grain → unsafe-direct-join → bridge → feature proposal → gates →
  receipt. Deterministic, clearly labeled illustrative.
- **Aerospace-scoped default skill view** in Agent Workbench (profile / infer-grain / validate-join /
  generate-contract / propose-feature), with the full registry behind an advanced toggle.
- **Workflow templates** surfaced in the section (ingest source, add governed metric, create feature
  table, investigate stale metric) instead of a bare "Not available."
- **Dedicated pipeline-run + DQ-assertion frontend feed** (today Pipelines & Quality derives stage
  health from catalog node `status` only).
- **Palette unification** between the ADE `C` tokens and the telemetry `C` tokens.

## Shipped

- **PR 2 — Connector Lifecycle State Machine (read-only).** ADO Story #581. The static
  declared inventory now derives an eight-state lifecycle
  (`declared → discovered → credential_pending → validating → read_validated → degraded
  → blocked → retired`) with validation receipts. One safe validator wired by default
  (in-process MCP registry); Postgres ping implemented opt-in. See `architecture.md`
  "New in PR 2". Still read-only — no BYO keys, no provider abstraction, no live writes.

- **PR 3 — Read-only Provider Reachability Validators.** ADO Stories #589 (Postgres) +
  #590 (HTTP). Postgres `SELECT 1` promoted from opt-in into the wired set, gated per-env
  by `ADE_ENABLE_POSTGRES_VALIDATOR`. GitHub / Vercel / Railway each get a read-only
  validator built on a shared `http_probe()` helper: GET-only, hard 5s timeout, missing
  token → `credential_pending` with no outbound call, 2xx → `read_validated`, anything
  else → `degraded`. First ADE code to make a real outbound call; tokens never echoed into
  receipts; tests mock HTTP so CI makes no live call. See `architecture.md` "New in PR 3".
  Still read-only — no BYO keys, no provider abstraction, no writes, no autonomous setup.

## Model access (ADR 0001)

- Provider abstraction with three modes: Winston-managed (current), bring-your-own-key,
  enterprise connector (Azure OpenAI, Bedrock, Vertex, Claude Enterprise).
- Data-classification/redaction gate in front of any non-managed model path.
- Per-tenant key storage and rotation.

## Net-new connectors

- GitHub PRs/issues (`gh`-equivalent in app code)
- Vercel and Railway (currently operator CLI only)
- BigQuery / Google Cloud (per `docs/plans/RS_ANALYTICS_PLATFORM_PLAN.md`)
- Databricks real implementation (replace the `databricks_source.py` stub)
- Confluent as a governed MCP skill (transport exists; skill exposure does not)
- Live ADO board creation through `azure-devops-intake`

## Analytical engine

- Grain detection
- Fanout/join risk analysis
- Metric-conflict detection
- Data contracts
- Entity resolution
- Trust scoring

## Hardening

- Authenticated reads on `/api/ade/*` (PR 1 matches the telemetry open-read posture;
  see `security-and-trust-boundaries.md`)
- `env_id` scoping for receipt reads once audit events carry an env column

## Audit BigQuery Export

Implementation target for the seam in `backend/app/services/ade_warehouse_export.py`
(every entry point currently raises `NotImplementedError`):

- Read `app.audit_events` from Postgres (the operational source of truth)
- Batch-load to BigQuery `winston_ops.audit_events_bq` via `google-cloud-bigquery`
- Fail closed on missing credentials — never report success without
  `GOOGLE_APPLICATION_CREDENTIALS` and `BQ_PROJECT_ID`
- Idempotent by event id so re-runs do not duplicate rows

## Expand Skill Registry Policy Metadata

Follow-up to PR 1: extend the skill registry / MCP tool metadata so the registry
becomes the policy-binding layer for governed model/tool execution. Touches
`ToolDef` across the registry, so it is its own work item — it does **not** block
PR 2 (the Workflow Registry skill picker only needs name/description/permission).

Terminology this work pins down:

- **MCP tool** — executable backend capability (`backend/app/mcp/registry.py`).
- **Skill** — product-facing governed capability exposed to users/agents.
- A skill may wrap one MCP tool, multiple MCP tools, or a deterministic analyzer.

Metadata fields to add to `ToolDef` / its `manifest()`:

- `risk_level`, `cost_class`, `latency_class`
- `allowed_models`, `preferred_router_model`, `preferred_summary_model`, `escalation_model`
- `sql_policy` (raw_sql_allowed, allowed_query_modes, requires_dry_run, max_estimated_cost_usd)
- `grounding_required`, `citation_required`, `evals_required`, `null_behavior`
- `requires_confirmation` (promote the existing field into the policy block)

Acceptance criteria:

- `/api/ade/skill-registry` returns the expanded policy metadata
- Existing tool registrations are backfilled or safely defaulted (no tool ships without policy metadata)
- Tests verify defaults, required fields, and fail-closed behavior
- No agent/model routing path uses a tool that lacks policy metadata
- Reusable lessons captured in `tips.md`

Filed via roadmap (in-repo deferral record) on 2026-06-13: the
`azure-devops-intake` skill is not installed in this checkout and no ADO
credentials are configured here, so live board creation happens when intake next
runs. The generator (`ado/gen_ade_backlog.py`) remains the import source of truth.

## Surface and packaging

- Full playbook doc set (PR 1 ships the panel skeleton only)
- Marketing page on novendor.ai
- Budget pass via `plan-budget-augmentor`
- Generated-JSON connector inventory source if the md/py mirror drifts
