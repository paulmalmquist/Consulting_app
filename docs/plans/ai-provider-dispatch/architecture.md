# Architecture

## Flow

```
AIRequest (task, mode, risk, privacy, allow_fallback, forced_provider)
  -> policy.select_provider        # eligibility + preference, records every rejection
  -> registry.available            # implemented AND env configured
  -> provider adapter .complete()  # only on a SUCCESS decision
  -> governance.record_decision    # receipt: decision_type="provider_dispatch"
  -> DispatchResult                # status, provider, answer, receipt_id/status, null_reason
```

## Components (`backend/app/services/ai_dispatch/`)

- `models.py` — enums (`ProviderName`, `TaskMode`, `RiskLevel`, `Privacy`, `DispatchStatus`,
  `DispatchNullReason`) and pydantic contracts (`AIRequest`, `RoutingDecision`, `DispatchResult`,
  `ProviderDef`, `ProviderCompletion`). Pure — no DB import.
- `registry.py` — `provider_registry` singleton of `ProviderDef`s. `available()` is true only when a
  provider is *implemented* AND every `requires_env` var is set. Gemma is not implemented in PR 1, so it
  is always unavailable. Mirrors `backend/app/mcp/registry.py`.
- `policy.py` — `select_provider()`. Eligibility = mode in `allowed_modes` AND risk/privacy within the
  provider's ceilings (risk checked first, then privacy, then capability). Preference per mode picks the
  home provider; an eligible-but-unavailable home fails closed unless `allow_fallback` is set. Every
  non-selected provider is recorded in `rejected`.
- `providers/` — adapters behind a sync `Provider` protocol: `openai_provider` (instrumented client +
  `model_registry.sanitize_params`), `anthropic_provider` (httpx Messages API, mirroring
  `psychrag_llm`), `gemma_vertex_provider` (fail-closed stub).
- `supervisor.py` — `run_dispatch()` (validate → route → dispatch on SUCCESS → receipt) and
  `route_only()` (dry-run). Never raises.
- `receipts.py` — maps a dispatch onto `governance.record_decision`; `list_dispatch_runs` reads them back.

## Route (`backend/app/routes/ai_dispatch.py`, prefix `/api/ai/dispatch`)

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/providers` | none | provider list + availability |
| GET | `/providers/{name}` | none | one provider |
| POST | `/route` | none | dry-run routing decision (no model call) |
| GET | `/runs` | required | recent receipts, tenant-scoped, fail-closed empty on read failure |
| POST | `/run` | required | execute; gated by `AI_DISPATCH_ENABLED` (default off) |

## Durable primitives reused (not rebuilt)

- `backend/app/services/governance.py` `record_decision` / `list_decisions` → `ai_decision_audit_log`.
- `backend/app/services/model_registry.py` `sanitize_params` / `map_openai_error` (OpenAI adapter).
- `backend/app/services/ai_client.py` `get_instrumented_sync_client`.
- `backend/app/services/audit.py` `redact_dict` (applied inside `record_decision`).
- `backend/app/mcp/registry.py` — the frozen-dataclass + singleton pattern.

## The receipt CHECK constraint

`407_ai_decision_audit_log.sql` constrains `decision_type` to four values; a `provider_dispatch` insert
is rejected and `record_decision` swallows it (returns `None`). Migration `541` extends the CHECK. Until
it applies, receipts fail honestly (`receipt_status="failed"`, `receipt_write_failed`), never a phantom id.
Coordination: the ADE Ops plan also extends this CHECK (`ade_op`); migration 541 unions both values so
order does not matter, and is idempotent.

## Independence

The new package imports no `ai_gateway` / `request_router` symbols. The production chat path is untouched;
this layer is exercised only via the CLI, the `/api/ai/dispatch` route, and evals.
