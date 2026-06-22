---
id: ade-ops-orchestrator
kind: skill
status: active
source_of_truth: true
topic: agentic-data-engineering-ops
owners:
  - backend
  - repo-b
intent_tags:
  - ade-ops
  - data-engineering-operations
  - orchestration
  - freshness
  - cost
  - rightsize
  - lineage
  - governance
triggers:
  - ade ops
  - ade scan pipelines
  - assess freshness
  - show cost hotspots
  - recommend rightsize
  - can i trust this number
  - data engineering operations
entrypoint: false
handoff_to:
  - feature-dev
when_to_use: "Use for the governed Agentic Data Engineering Operations layer — a read-only supervisor of risk-tiered skills (inventory, freshness, cost, compute, quality, lineage, metrics, incidents, contracts, execution) that turns platform telemetry into recommendations and receipts. PR 1 is read-only/recommendation-only; write-capable (tier >=2) skills are visible but not executable."
when_not_to_use: "Do not use for the separate Automated Data Engineering connector product surface (ade_connectors / connector-lifecycle / validators). Do not use to apply cloud writes — execution is approval-gated and not enabled in PR 1."
surface_paths:
  - backend/app/services/ade_ops/
  - backend/app/routes/ade_ops.py
  - repo-b/src/components/ade-ops/
  - repo-b/src/lib/ade-ops/
  - repo-b/src/app/lab/env/[envId]/ade-ops/
  - repo-b/db/schema/484_ade_ops_decision_type.sql
  - docs/plans/ade-ops-orchestrator/
name: ade-ops-orchestrator
description: "Governed agentic data-engineering operations layer (ADE Ops Orchestrator): a supervisor that routes a command to a risk-tiered skill, runs only read-only/recommendation skills (tiers 0-1), records an immutable receipt to ai_decision_audit_log, and fails closed with a null_reason. Built on durable primitives (MCP registry, governance/audit), independent of the deletable ade_connectors surface. Tier >=2 skills are registered but cannot execute."
---

# ADE Ops Orchestrator

A governed operations control plane for data engineering. The loop is
**Observe → Diagnose → Recommend → Plan → Approve → Execute → Watch**; AI helps
in the middle (classify, prioritize, explain, recommend) while execution stays
deterministic, allowlisted, approval-gated, and auditable.

## Hard boundaries

- AI may recommend, summarize, classify, draft tickets, generate dry-run patches.
- AI may **not**: apply prod changes without approval; invent missing data; mark
  stale data as current; change metric definitions without owner approval; run
  arbitrary shell commands; backfill locked finance periods without authorization.

## Risk tiers

`0` read-only inventory · `1` recommendation only · `2` dry-run patch/ticket ·
`3` non-prod write · `4` prod write · `5` rollback/emergency. **PR 1 executes
only tiers 0–1.** Tier ≥2 skills are registered and visible but return
`blocked` / `write_capability_not_enabled`.

## Fail-closed honesty

A skill returns real evidence (every `Evidence.source` non-empty) **or** an
explicit `null_reason` — never a fabricated number. Cloud-dependent commands
(freshness, cost, rightsize) fail closed with `data_source_not_configured`
until their adapters land. Receipts persist to `ai_decision_audit_log`
(`decision_type="ade_op"`); a failed receipt write surfaces as `degraded` with
`receipt_write_failed`, never silently dropped.

## Build sequence

PR 1 = read-only skeleton + 5 commands (`scan pipelines`, `assess freshness`,
`show cost hotspots`, `recommend rightsize`, `can I trust this number`). PR 2–6
add adapters, recommendation heuristics, approval-gated execution, and the
incident/post-change watcher. See `docs/plans/ade-ops-orchestrator/roadmap.md`.
