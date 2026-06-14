# Architecture — Automated Data Engineering

ADE is a surfacing layer over machinery that already exists. This file maps the product
onto real code and classifies the pieces per `PORTABILITY.MD`.

## Existing fabric (reused, not rebuilt)

| Product concept | Code |
|---|---|
| Skill contract | `backend/app/mcp/registry.py` — frozen `ToolDef` with Pydantic input/output models, `permission`, `side_effect_class`, `permission_required` (`PermissionMode`), `confirmation_required`, `lane_tags`, `skill_tags`, per-tool `AuditPolicy` redaction, `manifest()`/`describe_all()` discovery |
| Audit persistence | `backend/app/mcp/audit.py` — mandatory two-phase write confirmation; redaction applied at write time |
| Turn receipts | `backend/app/assistant_runtime/turn_receipts.py` (`ToolReceipt`, `DispatchDecision`, `PermissionMode`, `SideEffectClass`, `Lane`) |
| Prompt receipts | `backend/app/services/prompt_receipts.py` |
| Data-platform method | `docs/plans/RS_ANALYTICS_PLATFORM_PLAN.md` — see below; ADE links, never restates |

## Data-platform method (link, don't duplicate)

The method content lives in `docs/plans/RS_ANALYTICS_PLATFORM_PLAN.md`:

- Medallion / data product model — section 6, "BigQuery Data Product Model"
- Metric registry / semantic layer — section 7, "Semantic Layer and Metrics Governance"
- Lineage, DQ monitoring, fail-closed ETL — section 13, "Data Quality, Observability, and Trust"
- Cost guardrails — section 12, "Usage Budget and Cost Governance"
- 12-step ticket→PR loop — section 9, "Azure DevOps Ticket-to-CI/CD Automation Workflow"
- Skills/tool registry concept — section 11, "Centralized Skills and Tool Registry"

## New in PR 1

### Backend: read-only product API

`backend/app/routes/automated_data_engineering.py`, prefix `/api/ade`, registered in
`backend/app/main.py` with the same auth/guard pattern as the telemetry routes.

| Endpoint | Source |
|---|---|
| `GET /api/ade/skill-registry` | `registry.describe_all()` via a side-effect-safe bootstrap; list view strips full JSON schema bodies |
| `GET /api/ade/skill-registry/{name}` | `registry.get(name)`; full input schema for one tool |
| `GET /api/ade/connectors` | static declaration in `backend/app/services/ade_connectors.py` (the code mirror of `connector-inventory.md`) merged with per-module MCP tool counts |
| `GET /api/ade/runs` | existing audit read path, scoped and limited; fails closed with `null_reason` if a scoped read is unavailable |
| `GET /api/ade/governance-stats` | `governance.compute_audit_stats` over `ai_decision_audit_log` (decision volume, success rate, latency, grounding distribution, top tools), plus warehouse-export readiness from `ade_warehouse_export.warehouse_export_configured()` |

Every response carries `null_reason` (null when healthy). No endpoint calls external
clouds, validates credentials, runs CLIs, reads raw secrets, or infers liveness from env
vars. Connector status is declaration-backed only. One scoped exception:
`warehouse_export_configured()` reports whether BigQuery export *configuration* is
present (`GOOGLE_APPLICATION_CREDENTIALS` + `BQ_PROJECT_ID`). It states configuration
presence, never connection health, and the export seam itself
(`backend/app/services/ade_warehouse_export.py`) raises `NotImplementedError` rather
than pretending to run.

### Frontend: portable control-room package

`repo-b/src/components/automated-data-engineering/` — `AdeShell` (left rail +
full-bleed, modeled on `repo-b/src/components/telemetry/TelemetryShell.tsx`), overview
with a Capability Claim strip, skill registry table with detail drawer, connector map,
receipts feed, playbooks panel, and local primitives. Typed client in
`repo-b/src/lib/automated-data-engineering/api.ts`; catch-all proxy at
`repo-b/src/app/api/ade/[...path]/route.ts`. Neutral branding throughout — no RS or
telemetry references inside the package.

Routes mount at `repo-b/src/app/lab/env/[envId]/automated-data-engineering/` as a
full-bleed lab domain route (via the `isDomainRoute` regex in `LabEnvironmentShell.tsx`).

## Portability classification (`PORTABILITY.MD`)

| Layer | What |
|---|---|
| Platform core | the ADE package (`repo-b/src/components/automated-data-engineering/` + lib + proxy) and `backend/app/routes/automated_data_engineering.py`. Env-agnostic, parameterized by `envId`/`businessId`. |
| Environment package | the telemetry mount: the `isDomainRoute` entry and one `TelemetrySidebar` link. Any environment can add the same mount. |
| Client config | connector inventory entries (`connector-inventory.md` / `ade_connectors.py`). Per-client deployments declare their own connectors. |
