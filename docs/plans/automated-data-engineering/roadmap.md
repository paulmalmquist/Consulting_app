# Roadmap — deferred past PR 1

None of this is in PR 1. The non-goals in `eval-plan.md` enforce that.

## Phase status

**Phase 1 — Governed Operational Fabric: IN REVIEW** (PR #180,
https://github.com/paulmalmquist/Consulting_app/pull/180, branch
`phase-1-governed-fabric`). Bundles PR 1 (ADE surface), PR 1b (governance stats +
warehouse seam), PR 2 (workflow registry), PR 3 (audit dashboard + BigQuery export
scaffold). 37 ADE-suite tests pass, ruff clean, tree-wide tsc 0 errors; Gates 1–3
passed. Phase 2 (Intelligence Card System, PR 4) is held until this is in review/merged
to keep the control-plane / product-surface review boundary clean.

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
