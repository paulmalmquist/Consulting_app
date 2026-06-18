# AI Provider Dispatch

A governed model router that selects a provider/model per request by task mode, risk, and privacy,
records a per-call receipt, and fails closed rather than substituting a provider silently.

- **OpenAI** — code, tool execution, structured/SQL drafting, eval grading.
- **Claude (Anthropic)** — long-context planning, adversarial review, research synthesis.
- **Gemma (GCP Vertex)** — cheap private inference: summarization, classification, low-risk RAG,
  log explanation, telemetry narrative. **Fail-closed in PR 1** (no Vertex creds wired yet).

## Why this exists

Production Winston is OpenAI-only today. This layer makes provider choice explicit, auditable, and
policy-gated, so stronger reasoning models are never silently replaced by a cheap open model, and a
cheap open model is never trusted with code, writes, high-risk, or sensitive data.

## Status

PR 1 (standalone spine) is built: backend package, CLI, governed route, migration 541, and tests.
It does not touch the production `ai_gateway`. See the dispatch record
`docs/plans/03-implementation-plans/active/0007-ai-provider-dispatch.md`.

## Files in this folder

- `architecture.md` — components, contracts, and the durable primitives reused.
- `roadmap.md` — the 6-PR arc.
- `ai-behavior.md` — the hard agent boundaries (what the layer may and may not do).
- `eval-plan.md` — null-reason coverage and the Gemma promotion criteria.

## Surfaces

- Backend: `backend/app/services/ai_dispatch/`, `backend/app/routes/ai_dispatch.py`
- CLI: `scripts/ai_dispatch/` (`python -m scripts.ai_dispatch.cli ...`)
- Reference: `docs/reference/AI_PROVIDER_DISPATCH.md`
- Skill: `.skills/ai-provider-dispatch/SKILL.md`
