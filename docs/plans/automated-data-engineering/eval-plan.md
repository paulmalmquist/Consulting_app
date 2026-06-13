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
- no endpoint performs external provider calls, credential validation, or CLI execution
- ADE routes carry the same auth protection as the telemetry routes

## Frontend

- `repo-b` typecheck/build passes (project convention)
- route loads at `/lab/env/telemetry-demo/automated-data-engineering`, full-bleed, no lab sidebar
- standard telemetry/lab routes still render correctly (no double-wrap regression)
- skill table populated from real manifest or fail-closed
- connector map displays declared status + reason; no fabricated liveness
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
