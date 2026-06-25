# Agent Builder Read-Only MVP

**ADO:** Story #478 under Feature #477 / Epic #476
**Risk:** High
**Status:** Deployed to production; authenticated visual verification blocked by empty reviewer credentials
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

- PR #372 and integration hotfix PR #374 merged to `main`.
- GitHub main CI run `28192467071`: passed.
- Vercel production deployment `dpl_6ncptiPffmvGK84wbK5nUqzTRghS`: Ready and aliased to
  `novendor.ai`.
- Railway production deployment `08bbf248-f39c-4fa4-8669-bffe6d51a014`: healthy.
- Migrations 10035 and 10036 applied to the linked Supabase project.
- Production telemetry dry-run `afe01788-530b-4f79-8e1d-ca1331996523`: succeeded with five steps,
  twelve events, and five receipts.
- Authenticated desktop/mobile visual smoke is blocked because the production
  `TELEMETRY_REVIEWER_USERNAME` and `TELEMETRY_REVIEWER_PASSWORD` values currently export empty.

## Deferred

- Production publish and production run.
- Real approval resolution/resume.
- Cancellation and replay execution.
- Production-only visual/smoke evidence and production publication.
- Vector retrieval and Databricks analytics export.
- Write-capable MCP nodes.
- Authenticated visual smoke after reviewer credential repair.

## Next ticket

Apply and verify migrations 10035/10036 in an authorized non-production database, then run
authenticated desktop/mobile browser smoke and capture persisted workflow/eval/run/receipt evidence.
