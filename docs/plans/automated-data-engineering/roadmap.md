# Roadmap — deferred past PR 1

None of this is in PR 1. The non-goals in `eval-plan.md` enforce that.

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

## Surface and packaging

- Full playbook doc set (PR 1 ships the panel skeleton only)
- Marketing page on novendor.ai
- Budget pass via `plan-budget-augmentor`
- Generated-JSON connector inventory source if the md/py mirror drifts
