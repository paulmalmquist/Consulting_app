# Next session handoff

## Update (2026-06-24, PR #337) — composed telemetry presentation, Phase 1

The telemetry mount is no longer the standalone `/automated-data-engineering` domain route. It is now a
composed **Data Engineering** section in the telemetry sidebar
(`/lab/env/[envId]/telemetry/data-engineering/*`, components in
`repo-b/src/components/telemetry/data-engineering/`) with two modes (Agent Workbench, Run Autopsy).
Data-semantics pages reuse the telemetry metadata catalog; agent/governance pages read `/api/ade/*`.
The old routes 307-redirect in. **The ADE core package was not touched** (ADR 0002 still holds; see the
follow-up note in `docs/adr/automated-data-engineering/0002-surface-portability.md`).

Phase 2 presentation backlog is in `roadmap.md` → "Composed telemetry presentation" (join-safety UI,
guided scenario, aerospace skill view, workflow templates, pipeline/DQ feed, palette unification). The
deeper analytical work those depend on (grain detection, join risk, data contracts) is the existing
"Analytical engine" section.

## What PR 1 shipped

- This docs folder and the ADRs in `docs/adr/automated-data-engineering/`
  (0001 model access, 0002 surface portability).
- Read-only product API: `backend/app/routes/automated_data_engineering.py`
  (`/api/ade/skill-registry`, `/skill-registry/{name}`, `/connectors`, `/runs`) plus the
  connector declaration in `backend/app/services/ade_connectors.py` and tests in
  `backend/tests/test_ade_routes.py`.
- Portable control room: `repo-b/src/components/automated-data-engineering/`, lib at
  `repo-b/src/lib/automated-data-engineering/api.ts`, proxy at
  `repo-b/src/app/api/ade/[...path]/route.ts`, routes under
  `repo-b/src/app/lab/env/[envId]/automated-data-engineering/`, mounted full-bleed via
  `isDomainRoute` with one link from the telemetry sidebar.
- Import-ready ADO backlog in `ado/` (generator, CSV, PS1 — not run against the board).

## Where the contracts live

- Skill contract and discovery: `backend/app/mcp/registry.py`
- Audit and receipts: `backend/app/mcp/audit.py`,
  `backend/app/assistant_runtime/turn_receipts.py`, `backend/app/services/prompt_receipts.py`
- Connector inventory: `connector-inventory.md` mirrored by `ade_connectors.py`
  (update both together; backend never parses markdown)
- Acceptance criteria: `eval-plan.md`
- Method content stays in `docs/plans/RS_ANALYTICS_PLATFORM_PLAN.md` — link, never restate

## First candidate PR 2 tickets

1. Import the ADO backlog through `azure-devops-intake` and settle the area path
   (candidates listed in `backlog.md`).
2. Confluent as a governed MCP skill — the transport exists
   (`backend/app/events/transport.py`); expose it through the registry contract.
3. GitHub PR/issue connector (first `missing` → `live` move; updates both inventory files).
4. Generated-JSON connector inventory source if the md/py mirror has already drifted.
5. Start the provider-abstraction work only with an explicit decision to revisit ADR 0001.

## Rules that carry over

Read-only-first, declared statuses only, `null_reason` on every degraded path, neutral
branding inside the core package, and the non-goals list in `eval-plan.md`.
