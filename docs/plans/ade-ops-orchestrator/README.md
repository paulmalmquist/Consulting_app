# ADE Ops Orchestrator

A governed agentic data-engineering **operations** layer — a supervisor of
risk-tiered skills that turns platform telemetry into safe, approved, reversible
improvements to freshness, cost, quality, and trust. Loop: **Observe → Diagnose →
Recommend → Plan → Approve → Execute → Watch.** AI helps in the middle; execution
stays deterministic, allowlisted, approval-gated, auditable.

This is distinct from the **Automated Data Engineering** connector product
surface (`ade_connectors`, being removed on another branch). The Ops layer is
built on durable primitives (MCP registry, `ai_decision_audit_log`, governance)
and is independent of that surface.

## Status
PR 1 shipped: read-only skeleton + 5 commands (recommendation-only, tiers 0–1).
Write-capable (tier ≥2) skills are registered/visible but cannot execute.

## Folder
- `architecture.md` — code map.
- `roadmap.md` — the 6-PR arc.
- `ai-behavior.md` — hard agent boundaries + null_reasons.
- `eval-plan.md` — negative tests (fail-closed, no-write, anti-fabrication).
- `ado/ado-backlog.json` — import-ready Epic/Feature/Stories/Tasks.

## Surfaces
Backend `backend/app/services/ade_ops/` + `backend/app/routes/ade_ops.py`
(`/api/ade/ops`). Frontend `repo-b/src/components/ade-ops/` + `/lab/env/[envId]/ade-ops`.
Migration `repo-b/db/schema/484_ade_ops_decision_type.sql`.
