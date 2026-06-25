# Agent Builder Eval Lifecycle + Staged Publish Gate

**ADO:** Story #735 under Feature #477 / Epic #476  
**Risk:** High  
**Status:** Implemented locally; database application and authenticated browser verification pending  
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

- Focused backend Agent Builder/MCP/AI dispatch/Control Tower suite: 79 passed.
- Backend Agent Builder persistence/route suite: 26 passed.
- Ruff: passed.
- Frontend focused Agent Builder/Control Tower/proxy/schema-order suite: 15 passed.
- Frontend Agent Builder component suite: 7 passed.
- Frontend typecheck: passed.
- Frontend lint: passed.
- Targeted migration dry-run: migrations 10035 and 10036, 65 statements parsed, none executed.
- Database application: blocked because no local `DATABASE_URL` or `SUPABASE_DB_URL` is configured.
- Authenticated browser screenshots: pending database application and a usable local platform session.

## Next production ticket

Apply and verify migrations 10035/10036 in an authorized non-production Supabase environment, run
authenticated desktop/mobile smoke, and attach eval/run/receipt database evidence. After that,
implement durable approval resume and cancellation before considering production execution.
