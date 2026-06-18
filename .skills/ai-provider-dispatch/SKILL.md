---
id: ai-provider-dispatch
kind: skill
status: active
source_of_truth: true
topic: ai-infrastructure
owners:
  - backend
  - cross-repo
intent_tags:
  - model-dispatch
  - provider-routing
  - ai-infrastructure
triggers:
  - model dispatch
  - provider dispatch
  - provider routing
  - route between openai and claude
  - gemma on gcp
  - dispatch a model
  - which model should handle
entrypoint: false
handoff_to:
  - feature-dev
when_to_use: "Use when working on the standalone AI provider dispatch layer — routing requests between OpenAI, Claude, and Gemma by mode/risk/privacy, its CLI, its governed route, receipts, or the provider registry/policy."
when_not_to_use: "Do not use for the production chat gateway (ai_gateway.py) or request_router.py latency lanes — those are separate and owned by ai-copilot. This layer is standalone and does not touch them."
surface_paths:
  - backend/app/services/ai_dispatch/
  - backend/app/routes/ai_dispatch.py
  - scripts/ai_dispatch/
  - docs/reference/AI_PROVIDER_DISPATCH.md
name: ai-provider-dispatch
description: "Configure and operate the standalone AI provider dispatch layer — policy-based routing across OpenAI, Claude, and Gemma with per-call receipts and no silent fallback."
---

# AI Provider Dispatch

A governed model router that selects a provider/model per request by task mode, risk, and privacy,
records a receipt, and fails closed rather than substituting a provider silently. It is **standalone** —
it does not touch the production `ai_gateway`.

## Provider roles
- **OpenAI** — code, tool execution, SQL drafting, eval grading; the high-risk/sensitive default.
- **Claude (Anthropic)** — planning, adversarial review, research synthesis.
- **Gemma (GCP Vertex)** — cheap private inference (summarization, classification, low-risk RAG, log
  explanation, telemetry narrative). **Fail-closed until a later PR wires Vertex.** Never code/SQL/tool,
  never HIGH risk, never SENSITIVE.

## Where things live
- Service: `backend/app/services/ai_dispatch/` (`models`, `registry`, `policy`, `providers/`,
  `supervisor`, `receipts`).
- Route: `backend/app/routes/ai_dispatch.py` (`/api/ai/dispatch`).
- CLI: `scripts/ai_dispatch/` — `python -m scripts.ai_dispatch.cli {providers|route|ask|eval}`.
- Reference: `docs/reference/AI_PROVIDER_DISPATCH.md`. Plan: `docs/plans/ai-provider-dispatch/`.

## Hard rules (see `docs/plans/ai-provider-dispatch/ai-behavior.md`)
- No silent fallback: an unavailable chosen provider fails closed unless the request sets `allow_fallback`.
- No fabrication: a non-success returns a `null_reason`, never an invented answer.
- Never claim a receipt that did not write: `receipt_status="failed"` + `receipt_write_failed`.
- Gemma boundaries are structural (allowed_modes + max_risk + max_privacy), not advisory.

## Common tasks
- Add/adjust a provider: edit `registry.py` (`ProviderDef`) and, for routing preference, `policy.py`.
- Add a mode: extend `TaskMode` in `models.py`, the provider `allowed_modes`, and `_PREFERENCE` in `policy.py`.
- Wire a real provider call: implement the adapter in `providers/`; mark it implemented in `registry._IMPLEMENTED`.
- New `null_reason`: add to `DispatchNullReason`, document in `fail-closed-rules.md`, add a negative test.

## Guardrails
- Keep the package free of `ai_gateway` / `request_router` imports (standalone invariant).
- `decision_type="provider_dispatch"` needs migration `541`; coordinate the CHECK with the ADE Ops change.
- `POST /run` is cost-bearing and flag-gated by `AI_DISPATCH_ENABLED` (default off).
