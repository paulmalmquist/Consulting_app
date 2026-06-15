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
| `GET /api/ade/connector-lifecycle` | **PR 2** — derived read-only lifecycle over the declared inventory (see below) |
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

## New in PR 2 — connector lifecycle (read-only)

PR 2 promotes the static declared inventory into a derived lifecycle state machine.
It is read-only end to end; nothing is persisted and no migration is added.

States: `declared → discovered → credential_pending → validating → read_validated →
degraded → blocked → retired`.

| Piece | Code |
|---|---|
| Lifecycle service | `backend/app/services/ade_connector_lifecycle.py` — derives each connector's state from its declared status (the floor) plus any safe validator that ran |
| Validator interface + safe validators | `backend/app/services/ade_connector_validators.py` — a connector reaches `read_validated` ONLY when a registered safe read-only validator runs and returns `ok` |
| Validation receipt | `ValidationResult.to_receipt()` in the validators module — `{outcome, detail, checked}`, no secrets |
| Endpoint | `GET /api/ade/connector-lifecycle?validate=true` — fails closed with `null_reason: "connector_lifecycle_unavailable"` |
| UI | `repo-b/src/components/automated-data-engineering/ConnectorMap.tsx` shows declared status + lifecycle state + risk tier, with a receipt drawer |

Honesty boundary: the declared status (`live|stub|script|missing`) maps to a lifecycle
*floor* (`missing→declared`, `stub/script/live→discovered/declared`). A connector can only
move **up** to `read_validated` when a real validator confirms reachability — never from the
declaration alone, and never from env-var presence. PR 2 registers exactly **one** validator
by default: the in-process MCP registry check for the Git connector (counts registered tools,
no I/O, no credentials). A Postgres `SELECT 1` validator is implemented and tested but kept
**opt-in** (`OPTIONAL_VALIDATORS`) so the endpoint never depends on a live DB in CI. No new
cloud connector is implemented. Connectors with no safe validator keep their floor state and
carry a `null_reason` (e.g. `no_validator_available`, `implementation_is_stub`).

## New in PR 3 — read-only provider reachability validators

PR 3 adds reachability validators to the PR 2 lifecycle. Still read-only; the lifecycle
service, receipt object, endpoint, and UI contract are unchanged — this PR only adds
entries to the validator set in `backend/app/services/ade_connector_validators.py`.

| Validator | What it does |
|---|---|
| Postgres (promoted) | `SELECT 1` via the existing pool. Moved from opt-in into the wired set, gated per-env by `ADE_ENABLE_POSTGRES_VALIDATOR` (default on). In-infra, no HTTP. |
| GitHub | `GET https://api.github.com/user` |
| Vercel | `GET https://api.vercel.com/v9/projects?limit=1` |
| Railway | `GET https://backboard.railway.app/graphql/v2` |

The three HTTP validators share one helper, `http_probe()` — the first ADE code to make a
real outbound call. Its rules are the honesty + safety boundary:

- **GET only**, via `httpx`, with a **hard 5s per-request timeout**. A constant
  (`_ALLOWED_HTTP_METHOD = "GET"`) gates the method.
- **Missing token → `credential_pending`, and NO outbound call is made.** Env-var presence
  is never treated as validation; absence is the fail-closed signal.
- **2xx → `read_validated`** (the only success path). **401/403** (token present but
  invalid) → `degraded`. **Timeout / transport error / any other non-2xx** → `degraded`.
  Never `read_validated` on failure.
- The token is **never echoed** into a receipt; `detail` uses neutral wording
  ("credential not configured", "credential accepted") so no secret-shaped substring appears.

In CI and any checkout without provider tokens (the default), the three HTTP validators
resolve to `credential_pending` and make zero network calls. Tests mock `httpx.request`; no
live call is ever made in CI.

## Portability classification (`PORTABILITY.MD`)

| Layer | What |
|---|---|
| Platform core | the ADE package (`repo-b/src/components/automated-data-engineering/` + lib + proxy) and `backend/app/routes/automated_data_engineering.py`. Env-agnostic, parameterized by `envId`/`businessId`. |
| Environment package | the telemetry mount: the `isDomainRoute` entry and one `TelemetrySidebar` link. Any environment can add the same mount. |
| Client config | connector inventory entries (`connector-inventory.md` / `ade_connectors.py`). Per-client deployments declare their own connectors. |
