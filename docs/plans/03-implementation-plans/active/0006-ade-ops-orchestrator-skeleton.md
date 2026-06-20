# 0006 — ADE Ops Orchestrator: read-only skeleton + 5 commands

- **Status:** PR 1–6 SHIPPED as of 2026-06-20 — skeleton + freshness/cloud adapters + recommendation engine + approval-gated execution (5A/5B/5C) + post-change watcher (6A, #259) + incident state machine (6B, #263) all merged to main. See `docs/plans/ade-ops-orchestrator/roadmap.md` for the full PR ledger; this skeleton doc is historical.
- **Source vision:** `AUTO_ENGINEERING_2.md` (Agentic Data Engineering Operations).
- **Plan folder:** `docs/plans/ade-ops-orchestrator/`.
- **ADO:** Epic "ADE Operations Platform" → Feature "PR 1 skeleton + 5 read-only commands" (created via azure-devops-intake; import file at `docs/plans/ade-ops-orchestrator/ado/ado-backlog.json`).

## Why
Turn platform telemetry into safe, approved, reversible improvements to freshness,
cost, quality, and trust — governed (read-only first). PR 1 is the spine: a
supervisor-of-skills, risk tiers, no-write enforcement, immutable receipts,
fail-closed honesty, and a visible console.

## Foundation decision
Built on **durable primitives only** (MCP registry, `ai_decision_audit_log` via
`governance`, `audit`). Imports **no** `ade_connectors`/`ade_connector_*`. The
separate ADE product surface is being deleted on another branch; this layer is
independent (`/api/ade/ops` backend, `ade-ops` frontend) and survives that removal.

## Delivered (PR 1)
- `backend/app/services/ade_ops/` — models (risk tiers, null reasons, typed inputs,
  receipt contract), registry (~10 families; 5 executable tier-0/1 commands;
  tier ≥2 registered non-executable), executors (real evidence or fail-closed),
  supervisor (tier gate + receipt with honest write-failure).
- `repo-b/db/schema/484_ade_ops_decision_type.sql` — extend the `decision_type`
  CHECK to allow `ade_op` (idempotent; preserves prior values).
- `backend/app/routes/ade_ops.py` (`/api/ade/ops`), registered in `main.py`.
- Frontend: `ade-ops` proxy + lib + console package + lab route + isDomainRoute.
- Tests: 19 backend + 2 frontend; ruff/eslint/typecheck clean.
- Docs/guardrails: fail-closed null_reasons, SKILL.md, instruction-index, CLAUDE.md.

## Real vs fail-closed in PR 1
`scan pipelines` → real (registries + governance), cloud not configured ·
`can I trust this number` → real degraded (governance grounding) · `assess
freshness` / `show cost hotspots` / `recommend rightsize` → fail closed
(`data_source_not_configured`) until adapters land (PR 2–3).

## Deferred → PR 2–6
freshness adapter · cloud read-only inventory adapters · recommendation
heuristics + dry-run patch/ticket (tier 2) · approval-gated execution + rollback
(tier 3–4) · incident state machine + post-change watcher (tier 5) · scheduler.
