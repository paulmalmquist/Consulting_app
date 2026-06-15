# Eval plan — PR 1 acceptance matrix

This is the durable test plan for the ADE PR 1 surface. Copied from the approved plan; a
future PR that changes the surface updates this file in the same change.

## Backend

- `pytest backend/tests/test_ade_routes.py` passes
- `/api/ade/skill-registry` returns >0 tools or `null_reason: "mcp_registry_unavailable"`
- list endpoint omits full JSON schema bodies (explicit test)
- `/api/ade/skill-registry/{name}` returns full schema for one tool (explicit test)
- `/api/ade/connectors` returns only declared statuses
- no connector with `status: "live"` lacks an `evidence_path` (explicit test)
- `/api/ade/runs` returns business-scoped rows or `null_reason: "audit_read_unavailable"`
  (audit events have no `env_id` column; see `security-and-trust-boundaries.md`)
- `/api/ade/governance-stats` returns aggregate decision stats or
  `null_reason: "governance_stats_unavailable"`; zero decisions yields
  `success_rate: null`, not a division error
- the warehouse export seam raises `NotImplementedError` with and without BQ
  credentials present (never a silent no-op)
- no endpoint performs external provider calls, credential validation, or CLI execution
- ADE routes carry the same auth protection as the telemetry routes

## Backend — PR 2 connector lifecycle

- `pytest backend/tests/test_ade_connector_lifecycle.py` passes; `test_ade_routes.py` stays green
- `/api/ade/connector-lifecycle` returns every declared connector with a `state` in the
  eight-state set, or `null_reason: "connector_lifecycle_unavailable"` (fails closed)
- `read_validated` appears ONLY when a registered safe validator ran and returned `ok`
  (explicit test: Git via the in-process MCP registry validator)
- `validate=false` returns the declared floor with no receipts and no `read_validated`
- credential-missing → `credential_pending`; degraded/validator-exception → `degraded`;
  blocked → `blocked` (explicit tests via injected validators)
- a `live` connector with no validator stays `discovered` + `null_reason: "no_validator_available"`
- receipts carry no secret-looking values (explicit test)
- the opt-in Postgres validator degrades (never raises) with no DB

## Backend — PR 3 provider reachability

- `pytest backend/tests/test_ade_provider_reachability.py` passes; PR 1/PR 2 ADE
  suites stay green
- Postgres validator is wired by default and dropped when
  `ADE_ENABLE_POSTGRES_VALIDATOR=false`
- HTTP validators (GitHub/Vercel/Railway): missing token → `credential_missing`
  with **no outbound call** (explicit test asserts `httpx.request` is never called)
- invalid token (401/403), timeout, 5xx, and transport error all → `degraded`, never `ok`
- a real 2xx → `ok` (the only `read_validated` path)
- only GET is ever issued (explicit test captures the method)
- the bearer token never appears in a receipt (explicit test with a fake secret)
- all HTTP is mocked in CI; no live network call

## Frontend

- `repo-b` typecheck/build passes (project convention)
- route loads at `/lab/env/telemetry-demo/automated-data-engineering`, full-bleed, no lab sidebar
- standard telemetry/lab routes still render correctly (no double-wrap regression)
- skill table populated from real manifest or fail-closed
- connector map displays declared status + lifecycle state + risk tier; no fabricated liveness
- a card opens a drawer showing the validation receipt, or "no validation attempt" when none ran
- Execution Receipts displays rows or `null_reason`
- Capability Claim strip present on Overview
- all five component states (Loading/Loaded/Empty/Unavailable/Error) implemented
- telemetry sidebar link works

## Docs

- ADE plan folder + `security-and-trust-boundaries.md` exist
- ADRs use the template; append-only
- `connector-inventory.md` matches `ade_connectors.py` declarations
- `python gen_ade_backlog.py` regenerates identical CSV/PS1
- prose passes an `anti-ai-style.md` read

## Non-goals protected (must be FALSE at merge)

- BYO-key / provider-abstraction code added
- live ADO writes performed
- cloud probing / env-var liveness inference added
- new DB migrations created
- production deploy triggered
