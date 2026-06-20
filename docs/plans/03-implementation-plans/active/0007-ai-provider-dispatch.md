# Dispatch Record 0007 — AI Provider Dispatch (Standalone Governed Spine)

**Created:** 2026-06-17
**Status:** PR 1 COMPLETE (backend spine + CLI + route + migration + tests; not yet merged/deployed) · PRs 2–6 planned
**Environment:** Platform core — model dispatch layer (standalone, beside the production AI gateway)
**Deliverable type:** New backend service package + CLI + governed route + migration

Full plan: `C:\Users\paulm\.claude\plans\i-ll-frame-this-as-noble-unicorn.md`

---

## Context

A CLI-first model dispatch layer that routes each request to a provider/model by task mode,
risk, and privacy — OpenAI for code/tool execution, Claude for long-context planning and
adversarial review, Gemma-on-GCP for cheap private inference — with a per-call receipt and no
silent fallback between providers.

Exploration set the foundation: **production Winston is OpenAI-only.** `ai_gateway.py` runs OpenAI
Chat Completions exclusively; Anthropic exists only in `psychrag_llm.py` and `attachment_classifier.py`;
there is no Vertex/Gemma anywhere. So PR 1 builds the dispatch spine **standalone**, beside the
production gateway, exercised through a CLI, a governed route, and receipts — reusing durable
primitives (`model_registry`, `governance.record_decision`, the MCP registry pattern, `PermissionMode`)
and never touching the live chat path.

## Architecture decisions (locked with the user)

1. **Config = Python registry + env flags**, not YAML (the repo has no YAML config).
2. **Providers: OpenAI real · Claude real · Gemma fails-closed** (no Vertex creds wired in PR 1).
3. **Standalone — `ai_gateway.py` and `request_router.py` untouched.** Integration into live chat is a later PR.
4. **No fabrication / fail closed.** Every dispatch returns a real provider result or a transparent
   `BLOCKED`/`UNAVAILABLE`/`DEGRADED` with a `null_reason`. Fallback is opt-in per request and recorded.
5. **New `ProviderDef` registry**, not `ModelCaps` reuse (the latter is an OpenAI sanitizer).
6. **Receipts reuse `ai_decision_audit_log`** via `governance.record_decision(decision_type="provider_dispatch")`;
   a failed receipt is surfaced (`receipt_status="failed"`, `receipt_write_failed`), never a phantom id.

## Dispatch routing
- **Owning surfaces (new):** `backend/app/services/ai_dispatch/`, `backend/app/routes/ai_dispatch.py`,
  `scripts/ai_dispatch/`, `docs/reference/AI_PROVIDER_DISPATCH.md`, `docs/plans/ai-provider-dispatch/`,
  `.skills/ai-provider-dispatch/SKILL.md`.
- **Backend hook:** registered in `backend/app/main.py` next to `ai_audit_router`. Does NOT import `ai_gateway`.
- **Config:** env vars in `backend/app/config.py` (`AI_DISPATCH_ENABLED`, `AI_DISPATCH_ALLOW_FALLBACK`,
  `AI_DISPATCH_ANTHROPIC_MODEL`, `GEMMA_VERTEX_*`).
- **DB/schema:** `repo-b/db/schema/541_ai_dispatch_decision_type.sql` (extends the `407` `decision_type`
  CHECK to add `provider_dispatch`; idempotent; defensively also unions `ade_op`).
- **Route prefix:** `/api/ai/dispatch` (sibling of `/api/ai/audit`).
- **CI guardrails:** `validate_assistant_runtime.mjs` (SKILL.md + instruction-index), ruff, pytest.
- **Risk level:** Low (read-only by default; `POST /run` flag-gated off; production gateway untouched).

## Ticket index

| # | Phase | Ticket | DB migration | Risk | Status |
|---|---|---|---|---|---|
| 1 | 1 | models + ProviderDef registry + policy gate | no | Low | DONE 2026-06-17 |
| 2 | 1 | provider adapters (openai real, anthropic real, gemma stub) | no | Low | DONE 2026-06-17 |
| 3 | 1 | supervisor + receipts (fail-closed receipt guard) | no | Low | DONE 2026-06-17 |
| 4 | 1 | migration 541 + route `/api/ai/dispatch` + register in main.py | yes (541) | Low | DONE 2026-06-17 |
| 5 | 1 | backend tests (registry/policy/supervisor/route) — 33 passing | no | Low | DONE 2026-06-17 |
| 6 | 1 | CLI `scripts/ai_dispatch/` (providers/route/ask/eval) + eval suite | no | Low | DONE 2026-06-17 |
| 7 | 1 | docs/skill/guardrails/instruction-index/CLAUDE.md/ADO backlog | no | Low | DONE 2026-06-17 |

## Real-data vs fail-closed (the no-fabrication proof)

| Provider | Modes it can win | PR 1 behavior |
|---|---|---|
| OpenAI | code, tool_execution, sql_draft, eval_grading, + low/med summarization | REAL — instrumented client + `sanitize_params()` |
| Claude | planning, adversarial_review, research_synthesis | REAL — httpx Messages adapter; available iff `ANTHROPIC_API_KEY` set |
| Gemma | summarization, classification, low_risk_rag, log_explanation, telemetry_narrative | FAILS CLOSED `provider_not_configured`; never code/sql/tool, never high-risk, never sensitive |

## Verification (run, not assumed)
- `pytest backend/tests/test_ai_dispatch_*.py` — **33 passed**.
- `ruff check backend/app/services/ai_dispatch backend/app/routes/ai_dispatch.py backend/tests/test_ai_dispatch_*.py` — clean.
- CLI smoke (`providers`, `route`, `eval`, `ask`) — routing correct; eval 4/4; `ask` fail-closed receipt confirmed.
- Migration 541: apply via `supabase db query --linked`; confirm CHECK allows `provider_dispatch` and the prior values.
- Independence: grep confirms no `ai_gateway`/`request_router` import in the new package.

## Deferred (PR 2–6)
PR 2: read-only admin panel + real eval grading + Gemma promotion criteria · PR 3: real Gemma-on-Vertex
adapter · PR 4: cost/latency metering + budget guard · PR 5: integrate into the live gateway behind a flag ·
PR 6: explicit fallback chains with `fallback_chain_exhausted`.
