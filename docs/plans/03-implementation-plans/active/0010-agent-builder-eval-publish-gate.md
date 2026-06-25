# Agent Builder Eval Lifecycle + Staged Publish Gate

**ADO:** Story #735 under Feature #477 / Epic #476  
**Risk:** High  
**Status:** Deployed and production-verified through API/data evidence; authenticated visual verification pending
**Last updated:** 2026-06-25

## Outcome

The read-only Agent Builder now has a persisted eval lifecycle instead of an informational shell.
Every eval run is pinned to an immutable workflow version and produces append-only per-case evidence.

Implemented:

- Additive migration `10036_agent_builder_evals.sql`.
- Eval suites, cases, runs, results, and promoted failure memory.
- Deterministic graph, tool-contract, permission, fail-closed, cost, regression, and replay checks.
- Explicit N/A results for RAG, visual smoke, and production smoke when those capabilities/evidence
  are absent.
- Failed run promotion into regression memory.
- Regression blocking until the current version has a later matching successful dry-run.
- Staged-only publish gate for the current immutable version.
- Real Evals UI with expected/actual/assertion evidence and trace links.
- Registry readiness status, builder staging control, and Run History regression promotion.

Production publication, production execution, write-capable tools, and approval resume remain
disabled and fail closed.

## Persistence

Migration `repo-b/db/schema/10036_agent_builder_evals.sql` adds:

- `ai_agent_eval_suites`
- `ai_agent_eval_cases`
- `ai_agent_eval_runs`
- `ai_agent_eval_results`
- `ai_agent_failure_memory`

It also adds `published_by`, `published_at`, and `publish_blockers` to immutable workflow versions.
All five tables are tenant scoped with RLS, comments, and indexes. Eval results and failure memory
have database-level update/delete guards.

## Publish readiness

Staged publication requires PASS for:

- Graph lint
- Tool contracts
- Permissions
- Fail-closed behavior
- Cost controls
- Regression cases
- Replay determinism

RAG grounding may be N/A while `agent-graph/v1` has no RAG node. Visual and production smoke remain
N/A in this local increment. They do not authorize production publication; the API rejects any
publish status other than `staged`.

## API

Added:

- `POST /api/agent-builder/workflows/{id}/evals/run`
- `GET /api/agent-builder/workflows/{id}/evals`
- `GET /api/agent-builder/eval-runs/{evalRunId}`
- `POST /api/agent-builder/runs/{runId}/promote-failure`
- `POST /api/agent-builder/workflows/{id}/publish` (`staged` only)

## Verification

- Migration 10036 is applied in production with tenant RLS and append-only guards.
- Production eval run `e06f0dcc-2ee8-411c-9ef0-7bc1792feade` completed `staged_ready` with ten
  results: seven PASS, three explicit N/A, and zero blockers.
- Staged publish succeeded for immutable workflow `2d28240d-1f89-45a5-95b3-7f45c2979a2e`.
- GitHub main CI run `28192467071`, Railway health, and Vercel production deployment are green.
- Authenticated browser screenshots remain blocked until the production telemetry reviewer
  credentials are populated.

## Next production ticket

Repair the production reviewer credentials and complete authenticated desktop/mobile smoke. After
that, implement durable approval resume and cancellation before considering production execution.
