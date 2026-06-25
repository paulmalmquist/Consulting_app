# Next session handoff

## Update (2026-06-25) — Phase 2A–2D complete + backend deployed

Phase 2 is shipped and prod-verified (see `roadmap.md` → "Phase 2A–2D COMPLETE"). New telemetry-side
files to know:
- `repo-b/src/lib/telemetry/relationshipSafety.ts` — join-safety classifier (safe/bridge/unsafe/unverifiable).
- `repo-b/src/lib/telemetry/deCapabilities.ts` — aerospace DE capability map + registry matcher.
- `repo-b/src/lib/telemetry/workflowTemplates.ts` — read-only templates + executability.
- `repo-b/src/lib/telemetry/dataEngineeringReceipts.ts` — client for the real receipt action.
- Backend: `POST/GET /api/telemetry/data-engineering/{profile-metadata,receipts}` in
  `backend/app/routes/telemetry.py` (action namespace `ade.de.*`, written via `app.services.audit`).

**Backend deploy reminder:** 2D added backend endpoints. The Railway backend is NOT GitHub-connected —
after merging a backend change, run `scripts/deploy_backend.sh` from a tree == origin/main, then
`curl /api/version` to confirm the SHA. Frontend (Vercel) auto-deploys; backend does not.

What remains for Data Engineering: the dedicated pipeline/DQ feed, palette unification, and — the big
one — real governed MCP skills for the unbacked capabilities (profile_source, infer_grain,
validate_relationship, etc.). Until those exist, 2B shows them declared-only and 2C templates blocked,
which is correct. That backend work is the "Analytical engine" section of `roadmap.md`.

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
