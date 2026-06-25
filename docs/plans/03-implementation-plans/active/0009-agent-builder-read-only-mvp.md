# Agent Builder Read-Only MVP

**ADO:** Story #478 under Feature #477 / Epic #476
**Risk:** High
**Status:** Implemented locally; superseded for active work by Story #735 eval/publish gate
**Last updated:** 2026-06-25

## Outcome

The telemetry Agent Control Tower now preserves the existing Run Console and adds five governed modes:
Agent Builder, Agent Registry, Run History, Tool Registry, and Evals.

The MVP provides:

- `agent-graph/v1` with ten typed node kinds and typed edges.
- Immutable Save Draft versioning with optimistic concurrency.
- Graph linting for DAG structure, reachability, terminal paths, gate handles, schema pins, read-only
  permissions, budgets, and secret-shaped data.
- Live governed prompt execution through AI dispatch with strict JSON Schema output validation.
- Sensitive/private-tier routing that forces Gemma and does not fall back to an external model.
- Read-only MCP execution with canonical schema digests and runtime permission re-checks.
- A no-write `telemetry.preview_score_window` tool.
- Synchronous dry-runs with persisted steps, ordered events, receipts, hashes, redacted payloads, and
  simulated pending approvals.
- Six tenant-scoped draft templates; only capabilities present in this slice may report success.
- A persisted eval lifecycle and staged publish gate are now implemented under follow-on Story #735;
  see `0010-agent-builder-eval-publish-gate.md`.

## Persistence

Migration: `repo-b/db/schema/10035_agent_builder_mvp.sql`.

Tables:

- `ai_agent_workflows`
- `ai_agent_workflow_versions`
- `ai_agent_runs`
- `ai_agent_run_steps`
- `ai_agent_run_events`
- `ai_agent_receipts`
- `ai_agent_approvals`

All seven tables include `env_id`, `business_id`, RLS, comments, and tenant indexes. Run events and
receipts have DB-level update/delete guards.

## API

Implemented under `/api/agent-builder`:

- `GET /palette`, `/mcp-tools`, `/workflows`, `/workflows/{id}`, `/runs`
- `POST /workflows`, `/workflows/{id}/validate`, `/workflows/{id}/dry-run`
- `PATCH /workflows/{id}/draft`
- `GET /runs/{runId}`, `/runs/{runId}/events`

The Next.js same-origin proxy forwards authenticated platform-session scope headers.

## Verification status

- Backend Agent Builder/MCP/AI dispatch/Control Tower regressions: 87 passed.
- Frontend telemetry, proxy, schema-order, and Control Tower regressions: 172 passed.
- Frontend typecheck: passed.
- Frontend lint: passed with existing repository warnings.
- Migrations 10035 and 10036 targeted dry-run: 65 statements parsed; no statements executed.
- Full frontend suite remains red from three pre-existing REPE fund-page tests stuck on
  `Loading fund...`; the initial baseline had five failures in the same file. The operator approved
  proceeding with that recorded exception.
- Full backend suite exceeded ten minutes; the focused owning-surface suite is green.

## Deferred

- Production publish and production run.
- Real approval resolution/resume.
- Cancellation and replay execution.
- Production-only visual/smoke evidence and production publication.
- Vector retrieval and Databricks analytics export.
- Write-capable MCP nodes.
- Applying migration 10035 or deploying any service.

## Next ticket

Apply and verify migrations 10035/10036 in an authorized non-production database, then run
authenticated desktop/mobile browser smoke and capture persisted workflow/eval/run/receipt evidence.
