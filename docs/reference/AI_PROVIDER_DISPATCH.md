# AI Provider Dispatch — reference

A standalone governed model router. Routes each request to OpenAI, Claude, or Gemma by task mode, risk,
and privacy; records a per-call receipt; fails closed instead of substituting a provider silently. It
does not touch the production `ai_gateway`.

## Provider matrix

| Provider | Wins these modes | Max risk | Max privacy | PR 1 state |
|---|---|---|---|---|
| OpenAI | code, tool_execution, sql_draft, eval_grading, summarization, classification, low_risk_rag, log_explanation, telemetry_narrative | high | sensitive | real |
| Claude | planning, adversarial_review, research_synthesis, summarization, log_explanation | high | sensitive | real (needs `ANTHROPIC_API_KEY`) |
| Gemma | summarization, classification, low_risk_rag, log_explanation, telemetry_narrative | medium | internal | real Vertex adapter (creds-gated; fails closed without `GEMMA_VERTEX_*` + ADC). Not promoted; see `docs/plans/ai-provider-dispatch/gemma-vertex-setup.md` |

Preference per mode: code/tool/sql → OpenAI; planning/adversarial/research → Claude;
summarization/classification/rag/log/telemetry → Gemma (then OpenAI/Claude only on opt-in fallback).

## Statuses and null reasons

`status` ∈ `success | degraded | blocked | unavailable`. `null_reason` ∈
`provider_not_configured, capability_unavailable, risk_tier_forbidden, privacy_forbidden,
no_eligible_provider, invalid_inputs, fallback_disabled, provider_call_failed, receipt_write_failed`.

## CLI

```
python -m scripts.ai_dispatch.cli providers
python -m scripts.ai_dispatch.cli route --task "summarize logs" --mode summarization --risk low
python -m scripts.ai_dispatch.cli route --mode code --risk high --provider gemma_gcp   # blocked
python -m scripts.ai_dispatch.cli ask  --mode log_explanation --risk low --task "..." --no-fallback
python -m scripts.ai_dispatch.cli eval --suite routing_policy
```

`providers` and `route` are pure (no DB, no network). `ask` performs a real dispatch and writes a local
receipt mirror under `.ai_receipts/`. `--no-fallback` means no fallback.

## HTTP route (`/api/ai/dispatch`)

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/providers`, `/providers/{name}` | none | provider list / detail |
| POST | `/route` | none | dry-run routing decision |
| GET | `/runs` | required | recent receipts, tenant-scoped |
| POST | `/run` | required | execute; gated by `AI_DISPATCH_ENABLED` |
| GET | `/config` | none | runtime config: `gemma_enabled`, fallback provider/model, `execution_enabled` |
| POST | `/config` | required | flip the runtime Gemma toggle (`{gemma_enabled: bool}`) |

## Gemma toggle + controlled fallback

Gemma is gated by a **runtime, frontend-controllable toggle** (`gemma_enabled`, flipped via `POST /config`
or the admin panel's toggle — no redeploy). For a **Gemma-home mode** (summarization, classification,
low_risk_rag, log_explanation, telemetry_narrative): Gemma serves only when the toggle is **on** AND a
Vertex endpoint is configured/available; otherwise the request **falls back to the small frontier model**
(`AI_DISPATCH_FALLBACK_MODEL`, default `gpt-5-mini` on OpenAI). The fallback is **recorded** on the receipt
(`fallback_used=true`, `rejected[gemma_gcp]=gemma_disabled|gemma_unavailable`), never silent. A **forced**
Gemma request is honored literally and fails closed if Gemma is off — no auto-fallback. The toggle is
process-local and resets to `AI_DISPATCH_GEMMA_ENABLED` on restart.

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `AI_DISPATCH_ENABLED` | `false` | gate `POST /run` (cost-bearing) |
| `AI_DISPATCH_GEMMA_ENABLED` | `false` | initial value of the runtime Gemma toggle |
| `AI_DISPATCH_FALLBACK_PROVIDER` / `AI_DISPATCH_FALLBACK_MODEL` | `openai` / `gpt-5-mini` | small-model fallback for Gemma-home modes when Gemma is off/unavailable |
| `AI_DISPATCH_ALLOW_FALLBACK` | `false` | global fallback guard (per-request opt-in still required) |
| `OPENAI_API_KEY` | — | OpenAI availability (already used platform-wide) |
| `ANTHROPIC_API_KEY` | — | Claude availability (already used by psychrag) |
| `AI_DISPATCH_ANTHROPIC_MODEL` | `claude-opus-4-20250514` | Claude API model id |
| `GEMMA_VERTEX_PROJECT_ID` / `GEMMA_VERTEX_LOCATION` / `GEMMA_VERTEX_ENDPOINT_ID` | — / `us-central1` / — | Gemma Vertex contract (unused in PR 1) |

## Receipts

Each dispatch writes to `ai_decision_audit_log` via `governance.record_decision(decision_type="provider_dispatch")`.
Requires migration `repo-b/db/schema/541_ai_dispatch_decision_type.sql`. If the receipt cannot be written,
the result reports `receipt_status="failed"` and `null_reason="receipt_write_failed"` — never a phantom id.
