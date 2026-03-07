# Winston AI Pipeline — Defensive Audit & Hardening Plan

**Triggered by:** `gpt-5-mini` rejecting `temperature=0.2` with HTTP 400
**Scope:** Full AI request pipeline from command input to UI response
**Approach:** Work backwards from the visible failure, uncover every nearby class of failure

---

## SECTION A — Failure Taxonomy
Every likely failure category in the Winston AI command/request pipeline, ordered by severity.

---

### A1. Unsupported Model Parameter Injection

**Why it happens:** The request router assigns parameters (temperature, max_tokens, reasoning_effort) based on lane classification, but the parameter set is not validated against the target model's capabilities. When OpenAI changes which parameters a model supports — as happened with `gpt-5-mini` dropping custom temperature — the hardcoded values become API errors.

**Likely symptoms:** HTTP 400 from OpenAI with `unsupported_value` or `invalid_request_error`. Raw JSON error surfaces in the UI.

**Impact severity:** Critical — blocks all requests routed to the affected lane.

**Already present?** YES — this is the reported bug. `temperature=0.2` is set in Lane B (line 276 of `request_router.py`) for `gpt-5-mini`, and `gpt-5-mini` only supports `temperature=1`.

**Isolated or systemic?** SYSTEMIC. The same pattern exists for:
- `temperature=0.1` in Lane A (line 124) → also uses `gpt-5-mini`
- `temperature=0.3` in Lane D deep reasoning (line 209) → uses `gpt-5`
- `temperature=0.2` in the default fallback (line 325) → uses `gpt-5`
- `temperature=0.3` in `pds_executive/narrative.py` (line 153) → uses `OPENAI_CHAT_MODEL`
- `temperature=0.7` in `query_rewriter.py` (line 47) → uses `OPENAI_CHAT_MODEL_FAST`
- `temperature=0.3` in `repo-b/ask/route.ts` (line 234) → TypeScript fallback path
- `temperature=0.2` in `repo-c/app/llm.py` (line 55) → secondary LLM module

If `gpt-5` also restricts temperature (or restricts it to different values than `gpt-5-mini`), Lanes C, D, and the default fallback ALL break simultaneously.

---

### A2. Model Name Rotation / Deprecation

**Why it happens:** OpenAI deprecates model slugs on a regular cadence. The codebase has hardcoded defaults (`gpt-5-mini`, `gpt-5`) in `config.py` lines 67–82. When a model slug is retired, every lane breaks unless the env var is updated.

**Likely symptoms:** HTTP 404 or `model_not_found` from OpenAI. Silent failure in cost tracker (unknown model → falls back to `gpt-4o-mini` pricing, underreporting costs).

**Impact severity:** Critical — total platform outage until env vars are updated.

**Already present?** Latent. The `cost_tracker.py` already has stale model names (`gpt-5.4`, `gpt-5.3-codex`, `gpt-5.1`) suggesting models have been swapped before. The cost tracker fallback (line 45) silently returns `gpt-4o-mini` pricing for unknown models, which means cost dashboards are wrong whenever a new model is deployed.

**Isolated or systemic?** Systemic. Every file that instantiates an OpenAI client with a model name is affected: `ai_gateway.py`, `rag_reranker.py`, `query_rewriter.py`, `narrative.py`, `rag_indexer.py`, `repo-b/ask/route.ts`, `repo-c/llm.py`.

---

### A3. `max_tokens` vs `max_completion_tokens` Mismatch

**Why it happens:** GPT-5 and o-series models require `max_completion_tokens` instead of `max_tokens`. The gateway checks this via `_uses_max_completion_tokens()` (line 43–46), which matches models starting with `o1`, `o3`, or `gpt-5`. But the detection is prefix-based — any new model family (e.g., `gpt-6`, `claude-`, `gemini-`) would fall through to `max_tokens`, which may or may not be correct.

**Likely symptoms:** HTTP 400 `invalid_request_error` on `max_tokens`, or silently ignored parameter leading to unexpectedly truncated or overlong outputs.

**Impact severity:** High — breaks request or produces garbage.

**Already present?** The current code handles `gpt-5` and `o1/o3` correctly. But the `rag_reranker.py` (lines 138–147) and `query_rewriter.py` (lines 44–48) each have their own independent `_is_gpt5` check that duplicates this logic. If you add a model via env var that doesn't start with `gpt-5` but still requires `max_completion_tokens`, the gateway handles it but the reranker and query rewriter don't — they'll send the wrong parameter.

**Isolated or systemic?** Systemic — three separate files implement the same detection logic independently.

---

### A4. `reasoning_effort` on Non-Reasoning Models

**Why it happens:** The request router sets `reasoning_effort="medium"` on Lane C and `"high"` on Lane D. The gateway passes this through if `route.reasoning_effort` is truthy (line 594). If the target model doesn't support `reasoning_effort` (e.g., `gpt-4o-mini` configured as a fallback, or any non-OpenAI model), the API will reject it.

**Likely symptoms:** HTTP 400 from OpenAI, or silently ignored parameter giving false confidence about reasoning depth.

**Impact severity:** High — breaks Lane C and D if model is swapped.

**Already present?** Latent. Works today because `gpt-5` supports `reasoning_effort`. Breaks the moment someone sets `OPENAI_CHAT_MODEL_STANDARD=gpt-4o` in env vars.

**Isolated or systemic?** Isolated to the gateway dispatch path, but affects two lanes.

---

### A5. Temperature on Reasoning Models (Incomplete Guard)

**Why it happens:** The gateway has a guard at lines 590–592: skip temperature if `_is_reasoning_model()` OR `_uses_max_completion_tokens()`. This means temperature is skipped for ALL `gpt-5` models (because `_uses_max_completion_tokens` returns true for `gpt-5*`). But the guard is a negative check — "don't set temperature if model is reasoning-like." The actual bug is that `gpt-5-mini` isn't matched by `_is_reasoning_model()` (it doesn't start with `o1`/`o3` and doesn't contain "reasoning"), but IS matched by `_uses_max_completion_tokens()` (starts with `gpt-5`). So the guard DOES skip temperature for `gpt-5-mini`.

Wait — if the guard is working, why did the user see the error? **Most likely cause: the reported error comes from a code path that DOESN'T use the gateway guard.** The `pds_executive/narrative.py` (line 153) hardcodes `temperature=0.3` with no model check. The `repo-b/ask/route.ts` fallback (line 234) hardcodes `temperature=0.3`. The `repo-c/llm.py` hardcodes `temperature=0.2`. Any of these bypass the gateway's parameter sanitization entirely.

**Likely symptoms:** The exact error reported. HTTP 400 `unsupported_value` on temperature.

**Impact severity:** Critical — actively occurring.

**Already present?** YES — in satellite code paths that bypass the gateway.

**Isolated or systemic?** Systemic. Every file that calls OpenAI directly (not through the gateway) is unprotected.

---

### A6. Raw API Error Leaking to UI

**Why it happens:** The gateway catches OpenAI errors and emits them as SSE `error` events. The frontend's `askAi()` function reads the error message and displays it. But the error message is the raw OpenAI JSON — `{'error': {'message': "Unsupported value: 'temperature' does not support 0.2..."}}` — not a user-friendly message.

**Likely symptoms:** Users see internal API error JSON in the command bar. Looks like a crash, erodes trust.

**Impact severity:** Medium — functional issue (no data loss), but terrible UX for a financial platform.

**Already present?** YES — this is literally what the user saw.

**Isolated or systemic?** Systemic. Every OpenAI error class (rate limit, context overflow, invalid model, auth failure) surfaces raw. The frontend has specific hints for 404 and 401 HTTP status codes, but no normalization for OpenAI API-level errors within a 200 SSE stream.

---

### A7. No Retry Logic for Transient Model Errors

**Why it happens:** The gateway's model invocation (line 609) has no retry wrapper. If OpenAI returns a transient 500, 502, 503, or rate-limit 429, the request fails immediately. There is no exponential backoff, no retry with a fallback model, and no circuit breaker.

**Likely symptoms:** Intermittent failures during OpenAI incidents. Users see errors that would have succeeded on retry.

**Impact severity:** High — causes unnecessary failures during degraded conditions.

**Already present?** YES. The only timeout protection is the frontend's 90-second abort signal. The backend has no retry logic anywhere in the model call path.

**Isolated or systemic?** Systemic. Same issue in `rag_reranker.py`, `query_rewriter.py`, `narrative.py`, `rag_indexer.py`.

---

### A8. No Fallback Model on Primary Failure

**Why it happens:** `OPENAI_CHAT_MODEL_FALLBACK` is defined in config.py (line 82) as `gpt-5-mini`, but it is never used anywhere in the codebase. There is no code path that catches a model error and retries with the fallback model.

**Likely symptoms:** When the primary model fails, the request fails — even though a fallback is configured.

**Impact severity:** High — the fallback model is a dead config value.

**Already present?** YES. Grep for `OPENAI_CHAT_MODEL_FALLBACK` shows it's defined but never imported or referenced outside config.py.

**Isolated or systemic?** Isolated to config, but the absence of fallback logic is systemic.

---

### A9. Context Window Overflow

**Why it happens:** The gateway sums: system prompt + tool definitions + RAG context + conversation history + user message. There is token budgeting on history and RAG context individually, but no total budget enforcement. With 12+ MCP tools (each adding ~200–500 tokens of schema), a long conversation, and deep RAG retrieval, the total can exceed the model's context window.

**Likely symptoms:** HTTP 400 `context_length_exceeded` from OpenAI. Or silent truncation if the model handles it internally.

**Impact severity:** High — breaks extended analysis sessions, which are the highest-value use case (Lane D).

**Already present?** Likely, for long conversations with many tool calls. No user has reported it yet because most sessions are short.

**Isolated or systemic?** Isolated to long sessions, but structurally guaranteed to happen eventually.

---

### A10. Tool Call JSON Parse Failure

**Why it happens:** During streaming, tool call arguments arrive as partial JSON fragments across multiple chunks. The gateway accumulates these fragments (lines 635–659) and then parses the complete JSON. If the model produces malformed JSON (which happens ~2–5% of the time with complex schemas), `json.loads()` throws and the tool call fails.

**Likely symptoms:** Tool call silently fails. User sees "Unknown tool" or partial execution. No clear error message.

**Impact severity:** Medium — intermittent, but frustrating for tool-heavy workflows.

**Already present?** Highly likely. No JSON repair or retry-with-structured-output logic exists.

**Isolated or systemic?** Isolated to tool-heavy requests (Lanes B, C, D).

---

### A11. Hallucinated Tool Names

**Why it happens:** The model may generate `tool_calls` referencing tool names that don't exist in the registry. The gateway looks up the tool by name (line 695) and returns `{"error": f"Unknown tool: {t_name}"}` if not found. But this error is appended to the message history and the model loops — potentially burning through all `max_tool_rounds` trying the same invalid tool.

**Likely symptoms:** Slow requests that consume all tool rounds, then return an unhelpful error. Token waste.

**Impact severity:** Medium — performance and cost issue.

**Already present?** Likely. No deduplication of failed tool calls across rounds.

**Isolated or systemic?** Isolated to edge cases, but expensive when it occurs.

---

### A12. Tenant/Environment Leakage in Tool Execution

**Why it happens:** Tool execution receives an `McpContext` with resolved scope (env_id, business_id). If the scope resolution is wrong — for example, if the context envelope from the frontend carries a stale business_id from localStorage — the tool may read/write data belonging to the wrong tenant.

**Likely symptoms:** Silent data leakage. User sees data from another business. Or worse: writes to the wrong entity.

**Impact severity:** Critical — data integrity and security.

**Already present?** Unknown without RLS enforcement. The frontend reads `bos_business_id` from localStorage, which persists across sessions and could be stale.

**Isolated or systemic?** Systemic — affects every tool call.

---

### A13. Streaming Parser Brittleness

**Why it happens:** The frontend parses SSE events by splitting on newlines and matching `event:` / `data:` prefixes. If the backend emits malformed SSE (e.g., missing newline between events, or a JSON payload split across TCP chunks), the parser fails silently. The frontend has a catch that treats unparseable data as raw text and appends it to the answer — which means raw JSON could appear in the conversation.

**Likely symptoms:** Garbled text in conversation. Partial JSON visible to user. Tool calls not rendered properly.

**Impact severity:** Medium — UX issue, not data loss.

**Already present?** Intermittently. The regex cleanup in `ConversationPane.tsx` (strips raw tool payloads, resolved_scope blocks, SSE leaks) suggests this has been seen before.

**Isolated or systemic?** Isolated to streaming edge cases, but the cleanup regex indicates it's a recurring problem.

---

### A14. Cost Tracker Silent Fallback to Wrong Pricing

**Why it happens:** `cost_tracker.py` has a hardcoded pricing dictionary. When a model isn't in the dictionary, line 45 falls back to `gpt-4o-mini` pricing. This means if you deploy `gpt-5` (at $5/$20 per million tokens) but the cost tracker doesn't have it (it does currently), or if you use a model variant not in the list, costs are underreported by 10–30x.

**Likely symptoms:** Cost dashboards show impossibly low numbers. Budget alerts never fire. Per-tenant billing is wrong.

**Impact severity:** High — financial impact for the business.

**Already present?** Partially. The tracker has `gpt-5` and `gpt-5-mini` but also has stale entries (`gpt-5.4`, `gpt-5.3-codex`) suggesting the dictionary gets out of sync with actual deployments.

**Isolated or systemic?** Isolated to cost tracking, but impacts business decisions.

---

### A15. Duplicate Model Detection Logic

**Why it happens:** Three files independently implement "is this a gpt-5 model?" checks:
- `ai_gateway.py`: `_is_reasoning_model()` and `_uses_max_completion_tokens()`
- `rag_reranker.py`: `_is_gpt5 = OPENAI_CHAT_MODEL_FAST.lower().startswith("gpt-5")`
- `query_rewriter.py`: `_is_gpt5 = OPENAI_CHAT_MODEL_FAST.lower().startswith("gpt-5")`

When a new model family is introduced, all three must be updated. If one is missed, that code path breaks.

**Likely symptoms:** One code path works, another breaks — confusing intermittent failures depending on which lane/feature is invoked.

**Impact severity:** High — maintenance burden and guaranteed future breakage.

**Already present?** YES — the logic is already divergent (gateway checks for `o1`/`o3`/`gpt-5`, while reranker/rewriter only check `gpt-5`).

**Isolated or systemic?** Systemic design flaw.

---

### A16. No Circuit Breaker on External Dependencies

**Why it happens:** The gateway calls OpenAI, Cohere (reranking), and Supabase (RAG, history) with no circuit breaker. If Cohere is down, every Lane C/D request takes an extra 500ms waiting for the timeout before falling back to LLM reranking. If OpenAI is degraded, every request fails slowly instead of failing fast.

**Likely symptoms:** Cascading latency during outages. P95 latency spikes to 30+ seconds.

**Impact severity:** Medium — performance degradation, not data loss.

**Already present?** Latent. The Cohere timeout (0.5s) is a rudimentary circuit breaker, but there's no state tracking (e.g., "Cohere has failed 5 times in the last minute, stop trying").

**Isolated or systemic?** Systemic across all external service calls.

---

## SECTION B — Root Cause Analysis of the Specific Error

### The Visible Error

```
[Error: Model error (gpt-5-mini): Error code: 400 - {'error': {'message':
"Unsupported value: 'temperature' does not support 0.2 with this model.
Only the default (1) value is supported."}}]
```

### Precise Root Cause

**The error most likely originates from one of the satellite code paths that bypass the gateway's parameter guard**, not from the main `ai_gateway.py` flow. Here's why:

The gateway (lines 590–592) has a guard:
```python
if not _is_reasoning_model(effective_model) and not _uses_max_completion_tokens(effective_model):
    stream_kwargs["temperature"] = route.temperature
```

Since `gpt-5-mini` starts with `gpt-5`, `_uses_max_completion_tokens()` returns `True`, and temperature is skipped. **This guard should work.**

However, the error IS occurring, which means the call is coming from one of these unprotected paths:

1. **`pds_executive/narrative.py` line 153** — hardcodes `temperature=0.3` with model `OPENAI_CHAT_MODEL` (default `gpt-5-mini`). No model capability check.

2. **`query_rewriter.py` line 47** — sets `temperature=0.7` when `_is_gpt5` is False. But `_is_gpt5` checks `OPENAI_CHAT_MODEL_FAST` not the actual model being used. If the env var was changed and the check fails, temperature gets set.

3. **`rag_reranker.py` line 146** — sets `temperature=0` when `_is_gpt5` is False. Same issue as above.

4. **`repo-b/ask/route.ts` line 234** — TypeScript fallback hardcodes `temperature: 0.3`. If the main backend is down and the frontend falls back to this route, the error occurs.

5. **Alternatively**, the env var `OPENAI_CHAT_MODEL_FAST` was recently changed to something that doesn't start with `gpt-5` (e.g., a specific version like `gpt-5-mini-2026-03-01`), causing the `_uses_max_completion_tokens()` check to fail, which would re-enable temperature in the main gateway path.

**Most likely root cause:** Either (1) the narrative service, or (5) a model name variant that doesn't match the prefix check. The user said the command was "create a new fund called winston real estate" — this is a write operation that could invoke the narrative service or be classified as Lane B (tool-backed), which uses `gpt-5-mini` with `temperature=0.2`.

If the model name in the env var is exactly `gpt-5-mini`, the gateway guard works and the error is in a satellite path. If the model name is a dated variant like `gpt-5-mini-2026-03-01`, the prefix check still matches `gpt-5` and the guard works. **The most dangerous scenario is if OpenAI changed the model's behavior (removed temperature support) AFTER the code was written**, and the gateway guard correctly skips it for gpt-5 models but NOT for gpt-5-mini specifically because someone added a special case or override.

### What Else Probably Coexists Nearby

1. `reasoning_effort` will fail on any model that doesn't support it
2. `max_completion_tokens` will fail on older models if someone configures a fallback like `gpt-4o`
3. The cost tracker has stale/missing model entries
4. The fallback model is configured but never used
5. No retry logic means transient failures are permanent
6. Every satellite OpenAI call (reranker, rewriter, narrative, TypeScript fallback) has its own independent parameter logic that diverges from the gateway

---

## SECTION C — Codebase Hunt Plan

### Exact Files to Inspect

| File | What to look for |
|---|---|
| `backend/app/config.py` lines 67–82 | Model name defaults, env var names |
| `backend/app/services/request_router.py` lines 118–336 | Every `temperature=`, `max_tokens=`, `reasoning_effort=` assignment per lane |
| `backend/app/services/ai_gateway.py` lines 32–46 | `_is_reasoning_model()` and `_uses_max_completion_tokens()` — are they complete? |
| `backend/app/services/ai_gateway.py` lines 579–609 | The main parameter dispatch — what gets set, what gets skipped |
| `backend/app/services/rag_reranker.py` lines 115–148 | Independent `_is_gpt5` check, temperature/max_tokens branching |
| `backend/app/services/query_rewriter.py` lines 38–50 | Independent `_is_gpt5` check, temperature/max_tokens branching |
| `backend/app/services/pds_executive/narrative.py` lines 146–155 | Hardcoded `temperature=0.3`, no model check |
| `backend/app/services/cost_tracker.py` lines 5–45 | Pricing dictionary completeness, fallback behavior |
| `repo-b/src/app/api/ai/gateway/ask/route.ts` lines 21–237 | TypeScript fallback with hardcoded params |
| `repo-c/app/llm.py` lines 47–81 | Independent OpenAI/Anthropic calls with hardcoded params |

### Grep Patterns to Run

```
temperature=           → find every hardcoded temperature
max_tokens=            → find every hardcoded max_tokens
max_completion_tokens  → find every usage (should match max_tokens count)
reasoning_effort       → find every assignment
"model":\s*"           → find hardcoded model strings in JSON
model=                 → find model parameter assignments
_is_reasoning          → find all reasoning model checks
_is_gpt5              → find all gpt-5 detection (should be centralized)
_uses_max_completion   → find all max_completion_tokens checks
OPENAI_CHAT_MODEL      → find all model config references
tool_choice            → find all tool calling config
stream_options         → find all streaming config
.chat.completions.create  → find EVERY OpenAI API call site
openai.OpenAI(         → find every client instantiation
openai.AsyncOpenAI(    → find every async client instantiation
FALLBACK               → verify fallback model is actually used
except.*openai         → find all OpenAI error handling
except.*Exception      → find all generic exception catches
```

---

## SECTION D — Permanent Fix Architecture

### D1. Model Capability Registry

Create a centralized registry that knows what each model supports. Every API call consults this registry before sending parameters.

```
MODEL_CAPABILITIES = {
    "gpt-5-mini": {
        "supports_temperature": False,
        "supports_top_p": False,
        "supports_reasoning_effort": True,
        "supports_tools": True,
        "supports_streaming": True,
        "uses_max_completion_tokens": True,
        "max_context_tokens": 128000,
        "max_output_tokens": 16384,
        "supports_structured_output": True,
    },
    "gpt-5": {
        "supports_temperature": False,
        "supports_reasoning_effort": True,
        ...
    },
    "gpt-4o": {
        "supports_temperature": True,
        "supports_reasoning_effort": False,
        "uses_max_completion_tokens": False,
        ...
    },
}
```

This registry replaces ALL prefix-based detection (`startswith("gpt-5")`, `startswith("o1")`) with explicit lookups. Unknown models get conservative defaults (no temperature, no reasoning_effort, use max_completion_tokens).

### D2. Request Sanitizer

A single function that takes (model_name, raw_params) and returns a clean params dict with only the parameters the model supports. Called immediately before every `client.chat.completions.create()`.

```
def sanitize_request(model: str, params: dict) -> dict:
    caps = MODEL_CAPABILITIES.get(model, CONSERVATIVE_DEFAULTS)
    clean = {"model": model, "messages": params["messages"]}

    if caps["supports_temperature"] and "temperature" in params:
        clean["temperature"] = params["temperature"]
    if caps["uses_max_completion_tokens"]:
        clean["max_completion_tokens"] = params.get("max_tokens", params.get("max_completion_tokens", 2048))
    else:
        clean["max_tokens"] = params.get("max_tokens", 2048)
    if caps["supports_reasoning_effort"] and params.get("reasoning_effort"):
        clean["reasoning_effort"] = params["reasoning_effort"]
    if caps["supports_tools"] and params.get("tools"):
        clean["tools"] = params["tools"]
        clean["tool_choice"] = params.get("tool_choice", "auto")
    if params.get("stream"):
        clean["stream"] = True
        clean["stream_options"] = {"include_usage": True}

    return clean
```

This function is used in `ai_gateway.py`, `rag_reranker.py`, `query_rewriter.py`, `narrative.py`, and any other call site. One function, one place to update.

### D3. Response Normalizer

A single function that takes an OpenAI response (streaming or non-streaming) and returns a normalized structure, handling differences between model families (e.g., o-series responses include `reasoning_content`, gpt-5 may differ from gpt-4o in finish_reason semantics).

### D4. Centralized Exception Mapper

Map all OpenAI error codes to user-friendly messages and internal error categories:

```
EXCEPTION_MAP = {
    "invalid_request_error": {
        "temperature": "This model doesn't support custom temperature. Retrying with defaults.",
        "max_tokens": "Token limit not supported for this model. Adjusting automatically.",
        "model_not_found": "The configured AI model is unavailable. Switching to fallback.",
    },
    "rate_limit_error": "Winston is experiencing high demand. Retrying in a moment.",
    "context_length_exceeded": "This conversation is too long. Starting a fresh context.",
    "server_error": "The AI service is temporarily unavailable. Retrying.",
}
```

### D5. Automatic Fallback on Model Error

When the primary model returns a 400 (unsupported parameter) or 404 (model not found):
1. Log the error with full context to Langfuse
2. Strip the offending parameter using the capability registry
3. Retry with sanitized params
4. If retry fails, fall back to `OPENAI_CHAT_MODEL_FALLBACK`
5. If fallback fails, surface a clean error to the user

### D6. UI Error Surface

The frontend should never display raw OpenAI JSON. Instead:
- `error` SSE events should carry a `user_message` (friendly) and a `debug_message` (technical)
- The conversation pane shows the user_message
- The AdvancedDrawer shows the debug_message
- Auto-retry suggestions where appropriate ("Winston encountered an issue. Trying again..." or "This feature isn't available right now.")

---

## SECTION E — Exact Remediation Steps

### Step 1: Create `backend/app/services/model_registry.py`

**What:** Centralized model capability registry + request sanitizer + exception mapper.
**Why:** Eliminates all prefix-based detection scattered across 5 files. Single source of truth for what each model supports.
**Code area:** New file, imported by ai_gateway.py, rag_reranker.py, query_rewriter.py, narrative.py.
**Expected outcome:** No more `_is_gpt5` checks anywhere. No more `_is_reasoning_model()` prefix matching.
**Risk if skipped:** Every model rotation or new model family requires editing 5+ files.

### Step 2: Refactor `ai_gateway.py` Lines 579–609

**What:** Replace the manual parameter construction with a call to the sanitizer from Step 1.
**Why:** The gateway is the primary call path. It needs to be bulletproof.
**Code area:** `ai_gateway.py` lines 579–609.
**Expected outcome:** Gateway can handle any model without parameter errors.
**Risk if skipped:** The main path continues to be vulnerable to model capability changes.

### Step 3: Refactor `rag_reranker.py` Lines 138–148

**What:** Replace the local `_is_gpt5` check with the centralized sanitizer.
**Why:** The reranker creates its own OpenAI client and builds its own params. It needs the same protection.
**Code area:** `rag_reranker.py` lines 138–148.
**Expected outcome:** Reranking LLM fallback works with any model.
**Risk if skipped:** Reranking breaks whenever the model changes.

### Step 4: Refactor `query_rewriter.py` Lines 39–48

**What:** Same as Step 3 — replace local `_is_gpt5` with centralized sanitizer.
**Code area:** `query_rewriter.py` lines 39–48.

### Step 5: Fix `pds_executive/narrative.py` Lines 146–155

**What:** Replace hardcoded `temperature=0.3, max_tokens=500` with a call to the sanitizer.
**Why:** This file has NO model capability checking at all. It's the most likely source of the reported error.
**Code area:** `narrative.py` lines 146–155.
**Expected outcome:** Narrative generation works with any model.
**Risk if skipped:** This path will break on every model change.

### Step 6: Fix `repo-b/ask/route.ts` Lines 225–237

**What:** Add model capability checking to the TypeScript fallback path. Either call the backend's sanitizer or maintain a minimal TypeScript capability map.
**Why:** This is a completely unprotected fallback that hardcodes `temperature: 0.3`.
**Code area:** `repo-b/src/app/api/ai/gateway/ask/route.ts` lines 225–237.
**Expected outcome:** TypeScript fallback path doesn't crash on model parameter mismatches.
**Risk if skipped:** When the main backend is down AND the model doesn't support temperature, users get a double failure.

### Step 7: Implement Retry + Fallback Logic in Gateway

**What:** Wrap the `client.chat.completions.create()` call with retry logic:
- On 429 (rate limit): exponential backoff, 3 retries
- On 500/502/503: immediate retry once, then fallback model
- On 400 (bad param): strip offending param via sanitizer, retry once
- On 404 (model not found): switch to fallback model immediately
**Why:** No retry logic exists anywhere in the codebase. Transient failures become permanent.
**Code area:** `ai_gateway.py` around line 609, and a new retry wrapper in `model_registry.py`.
**Expected outcome:** Transient failures auto-recover. Model deprecations gracefully fall back.
**Risk if skipped:** Every OpenAI hiccup becomes a user-visible error.

### Step 8: Wire Up `OPENAI_CHAT_MODEL_FALLBACK`

**What:** Actually use the fallback model defined in config.py. When the primary model for a lane fails after retry, switch to the fallback.
**Why:** The config exists but is dead code.
**Code area:** `ai_gateway.py` model invocation loop, `config.py` to verify the fallback model is sane.
**Expected outcome:** Model failures have a safety net.
**Risk if skipped:** You have a configured fallback that does nothing.

### Step 9: Normalize Error SSE Events

**What:** Change the `error` SSE event format to include both `user_message` and `debug_message`. Map all OpenAI errors through the exception mapper before emitting.
**Why:** Users currently see raw OpenAI JSON.
**Code area:** `ai_gateway.py` error handling (wherever `yield _sse("error", ...)` is called), and frontend `assistantApi.ts` error parsing.
**Expected outcome:** Users see "Winston couldn't complete this request. Please try again." instead of raw API errors.
**Risk if skipped:** Users lose trust seeing technical errors in a financial platform.

### Step 10: Add Model Capability Validation to Health Check

**What:** Extend `GET /api/ai/gateway/health` to validate that all configured models exist in the capability registry and that the registry entries are sane (e.g., at least one model supports tools, at least one supports temperature if lanes need it).
**Why:** Catches misconfiguration at deploy time instead of runtime.
**Code area:** `ai_gateway.py` health check endpoint (lines 35–53).
**Expected outcome:** Bad model configuration detected immediately after deploy.
**Risk if skipped:** Bad config silently breaks until a user hits it.

---

## SECTION F — Defensive Test Matrix

### Unit Tests

| Test | What it validates |
|---|---|
| `test_sanitizer_strips_temperature_for_gpt5_mini` | temperature removed for models that don't support it |
| `test_sanitizer_keeps_temperature_for_gpt4o` | temperature preserved for models that do support it |
| `test_sanitizer_uses_max_completion_tokens_for_gpt5` | correct token param for gpt-5 family |
| `test_sanitizer_uses_max_tokens_for_gpt4o` | correct token param for gpt-4o family |
| `test_sanitizer_strips_reasoning_effort_for_gpt4o` | reasoning_effort removed for non-reasoning models |
| `test_sanitizer_keeps_reasoning_effort_for_gpt5` | reasoning_effort preserved for gpt-5 |
| `test_sanitizer_unknown_model_conservative_defaults` | unknown model gets safe defaults (no temperature, max_completion_tokens) |
| `test_sanitizer_strips_tools_when_empty` | no tools/tool_choice when tool list is empty |
| `test_exception_mapper_temperature_error` | maps temperature 400 to friendly message |
| `test_exception_mapper_model_not_found` | maps 404 to friendly message |
| `test_exception_mapper_rate_limit` | maps 429 to retry message |
| `test_exception_mapper_context_overflow` | maps context_length_exceeded to friendly message |
| `test_cost_tracker_known_model` | correct pricing for all models in registry |
| `test_cost_tracker_unknown_model_warns` | logs warning (not silent fallback) for unknown model |
| `test_route_decision_all_lanes_valid_params` | every lane's RouteDecision has params compatible with its model |

### Integration Tests

| Test | What it validates |
|---|---|
| `test_lane_a_gpt5mini_no_temperature` | Lane A request to gpt-5-mini succeeds without temperature error |
| `test_lane_b_gpt5mini_tool_call` | Lane B with tools works on gpt-5-mini |
| `test_lane_c_gpt5_reasoning_effort` | Lane C passes reasoning_effort correctly |
| `test_lane_d_deep_reasoning` | Lane D with high reasoning_effort succeeds |
| `test_fallback_on_primary_model_failure` | Primary model 404 → fallback model used |
| `test_retry_on_rate_limit` | 429 → retry succeeds |
| `test_retry_on_transient_500` | 500 → retry succeeds |
| `test_reranker_with_gpt5_model` | Reranker LLM fallback uses correct params for gpt-5 |
| `test_query_rewriter_with_gpt5_model` | Query rewriter uses correct params for gpt-5 |
| `test_narrative_with_gpt5_model` | Narrative service uses correct params for gpt-5 |
| `test_streaming_tool_call_malformed_json` | Graceful handling of partial/malformed tool call JSON |
| `test_streaming_error_event_format` | Error SSE has user_message and debug_message |

### End-to-End Tests

| Test | What it validates |
|---|---|
| `test_create_fund_command_e2e` | "create a new fund called X" → plan → confirm → execute → success |
| `test_model_swap_no_regression` | Change OPENAI_CHAT_MODEL_FAST env var → all lanes still work |
| `test_openai_outage_graceful_degradation` | Mock OpenAI 503 → user sees friendly error, not raw JSON |
| `test_long_conversation_no_context_overflow` | 20+ turn conversation → no context_length_exceeded |
| `test_cross_tenant_isolation` | Requests with business_id A cannot access business_id B data |

---

## SECTION G — Better User-Facing Failure Handling

### Safe Error Copy (what the user sees)

| Failure type | User message |
|---|---|
| Model parameter error (400) | "Winston ran into a configuration issue. Retrying with adjusted settings..." (auto-retry) |
| Model not found (404) | "Winston's AI model is temporarily unavailable. Switching to backup..." (auto-fallback) |
| Rate limit (429) | "Winston is experiencing high demand. Trying again in a moment..." (auto-retry with backoff) |
| Context overflow | "This conversation has gotten quite long. Let me start fresh with the key context." (auto-summarize) |
| Tool execution error | "I wasn't able to complete that action. Here's what happened: [tool-specific error]. Would you like me to try a different approach?" |
| Network/timeout | "I lost connection to the AI service. Please try again." |
| Unknown error | "Something unexpected happened. I've logged the details for the team. Please try again." |

### Developer/Debug Copy (what the AdvancedDrawer shows)

Full OpenAI error JSON, request payload (with PII masked), model name, lane, retry count, trace ID.

### Auto-Retry Behavior

| Error code | Action |
|---|---|
| 400 (bad param) | Strip param via sanitizer → retry once → if fails, fallback model → if fails, surface error |
| 429 (rate limit) | Wait `retry-after` header → retry up to 3 times with exponential backoff |
| 500/502/503 | Immediate retry once → fallback model → surface error |
| 404 (model) | Fallback model immediately → surface error if fallback also fails |
| Context overflow | Summarize oldest conversation turns → retry with compressed context |

### Fail-Closed Behavior (for write operations)

When a command involves mutations (create fund, update asset, execute action):
- NEVER auto-retry with a different model silently — the user confirmed the plan with the original model's judgment
- Surface the error and ask the user to re-confirm
- Log the failed attempt to the audit trail
- The write confirmation gate already exists (PLAN→CONFIRM→EXECUTE) — ensure it's respected even during retries

---

## SECTION H — Red Flags and "Find These Now"

### Punch List: Check Immediately

1. **`pds_executive/narrative.py` line 153** — hardcoded `temperature=0.3` with `OPENAI_CHAT_MODEL` (default `gpt-5-mini`). This is almost certainly broken right now. Open the file and verify.

2. **`repo-b/ask/route.ts` line 234** — hardcoded `temperature: 0.3` with model default `gpt-4o-mini`. If this fallback ever activates with a gpt-5 model, it breaks.

3. **`OPENAI_CHAT_MODEL_FALLBACK`** — grep the entire codebase. It should appear in at least one `import` statement outside `config.py`. If it doesn't, fallback is dead code. (It almost certainly is dead code.)

4. **The actual env var value for `OPENAI_CHAT_MODEL_FAST`** — check Railway. If it's set to a dated model variant (e.g., `gpt-5-mini-2026-02-15`) or an unexpected string, the prefix checks may not match.

5. **OpenAI API changelog for gpt-5-mini** — verify whether temperature was recently removed. If yes, check whether gpt-5 also lost temperature support — that would break Lanes C, D, and the default.

6. **`cost_tracker.py` fallback** — the silent fallback to `gpt-4o-mini` pricing means costs are wrong for any model not in the dictionary. Check if the Langfuse cost dashboard matches actual OpenAI billing.

7. **Context window math** — calculate the worst case: system prompt tokens + 12 tool definitions + max RAG context (3000 tokens for Lane D) + max history (4000 tokens) + user message. Compare against gpt-5-mini's context window. If it's close, you're one long conversation away from overflow.

8. **Tool call JSON accumulation** — in `ai_gateway.py` lines 635–659, verify that the tool call argument accumulator handles `null` index values and out-of-order chunks. This is a known issue with OpenAI streaming.

9. **`repo-c/llm.py`** — this file has hardcoded `temperature=0.2` for OpenAI and separate Anthropic HTTP calls. If this code path is active, it's unprotected.

10. **Every OpenAI client instantiation** — grep for `openai.OpenAI(` and `openai.AsyncOpenAI(`. Each one is a potential unprotected call site. There should be exactly one client, shared across all services. Currently there are at least 4 separate instantiations.

---

## Summary Tables

### Top 10 Fix List (Prioritized)

| # | Fix | Why it's urgent |
|---|---|---|
| 1 | Create centralized model capability registry | Eliminates the entire class of parameter mismatch errors |
| 2 | Create request sanitizer function | Single place to validate params before every API call |
| 3 | Fix `narrative.py` hardcoded temperature | Likely the actual source of the reported bug |
| 4 | Fix `repo-b/ask/route.ts` hardcoded temperature | Unprotected fallback path |
| 5 | Wire up `OPENAI_CHAT_MODEL_FALLBACK` | Dead config → actual fallback behavior |
| 6 | Add retry logic with exponential backoff | No retry logic exists anywhere |
| 7 | Normalize error SSE events (user vs debug message) | Raw OpenAI JSON in UI |
| 8 | Centralize OpenAI client instantiation | 4+ separate clients → one shared client |
| 9 | Fix cost tracker silent fallback | Wrong pricing for unknown models |
| 10 | Add model capability check to health endpoint | Catch misconfig at deploy time |

### Top 10 Grep/Search List

| # | Pattern | Purpose |
|---|---|---|
| 1 | `temperature=` | Find every hardcoded temperature |
| 2 | `max_tokens=` | Find every hardcoded token limit |
| 3 | `.chat.completions.create` | Find every OpenAI API call site |
| 4 | `openai.OpenAI(` and `openai.AsyncOpenAI(` | Find every client instantiation |
| 5 | `_is_gpt5` and `_is_reasoning` | Find every model detection check |
| 6 | `OPENAI_CHAT_MODEL_FALLBACK` | Verify if it's actually used |
| 7 | `except.*Exception` in service files | Find all error handling (or lack thereof) |
| 8 | `yield _sse("error"` | Find every error emission to UI |
| 9 | `reasoning_effort` | Find every reasoning effort assignment |
| 10 | `response_format` | Find any structured output assumptions |

### Most Likely Current Root Cause

The `gpt-5-mini` temperature error is most likely caused by **`pds_executive/narrative.py`** (hardcoded `temperature=0.3` with no model capability check) or by a **model name variant in the env var** that doesn't match the `startswith("gpt-5")` prefix check in the gateway, causing the temperature guard to fail. The "create a new fund" command likely triggers a code path that touches the narrative service or a Lane B classification that somehow bypasses the gateway guard.

### What Will Break Next If We Only Patch Temperature

1. **`reasoning_effort` on non-reasoning models** — the moment someone configures `gpt-4o` as a fallback or standard model, Lanes C and D send `reasoning_effort` to a model that doesn't support it → same class of 400 error.

2. **`max_completion_tokens` on older models** — if any env var is set to a model that doesn't use `max_completion_tokens` (e.g., `gpt-4o-mini`), the gateway sends the wrong parameter.

3. **Cost tracker under-reporting** — every new model variant not in the pricing dictionary silently reports at `gpt-4o-mini` rates. You won't know costs are wrong until the invoice arrives.

4. **Model deprecation** — when OpenAI retires `gpt-5-mini` or `gpt-5`, every lane breaks simultaneously with no fallback. There's no code path that uses `OPENAI_CHAT_MODEL_FALLBACK`.

5. **Reranker and query rewriter** — these have independent `_is_gpt5` checks. When you fix the gateway, they remain broken for any model that doesn't match their local prefix check.

6. **TypeScript fallback** — `repo-b/ask/route.ts` will continue sending `temperature: 0.3` to whatever model it's configured with, completely unprotected.

Patching temperature in one place is whack-a-mole. The systemic fix is the capability registry + sanitizer, which eliminates the entire class of failures permanently.

---
---

## SECTION I — Multi-Turn Workflow State Loss (Context Amnesia)

This is a separate class of failure from parameter mismatches. It was observed live: the assistant correctly parsed fund parameters across two turns, then forgot it was in a creation workflow and treated the fund name as random text.

---

### I1. The Observed Failure

**User turn 1:** "vintage year 2025, fund type closed-end, strategy is value-add"
**Assistant response:** "Got it — vintage 2025, closed-end, value-add. What should we name the fund?"
**User turn 2:** "winston real estate I"
**Expected:** System completes the create_fund flow, shows confirmation summary.
**Actual:** "I didn't catch what you need from 'winston real estate I.' Quick options I can do right away — Show a snapshot, List funds, Create a fund..."

The LLM understood the conversation. The orchestration layer did not.

---

### I2. Root Cause: Re-Classification on Every Turn

The request router (`request_router.py`) classifies every incoming message independently based on text pattern matching (lines 46–99). It has no awareness of whether the user is mid-workflow. When the user sends "winston real estate I" — which matches no intent pattern (no verb, no command keyword) — the router either:

1. **Classifies it as Lane A** (identity/UI-known) because it looks like a name, not a command, and Lane A gets a minimal "I don't understand" response, OR
2. **Classifies it as ambiguous** and the LLM, without sufficient workflow state in context, treats it as a freestanding question rather than a slot-fill continuation.

The system has conversation history in the database (`ai_conversations.py`) and loads recent messages (lines 497–533 of `ai_gateway.py`), but:
- History is token-budgeted and may be truncated (6 messages for Lane A/B, 10 for C/D)
- The `[SYSTEM NOTE: PENDING CONFIRMATION]` annotation only applies to tool calls that reached `confirmed=false` — but in this case, the tool was never called because the first turn was slot-gathering, not tool invocation
- The intent classifier runs BEFORE history is loaded into the prompt, so the lane decision is made without workflow context

**The critical gap:** There is no persistent workflow state object between turns. The system relies entirely on the LLM re-inferring intent from conversation history on every turn. When the history doesn't contain an explicit tool call with `pending_confirmation=true`, the LLM has no strong signal that it's in a creation flow.

---

### I3. Why the Current Design Fails for Multi-Turn Commands

The write-tool confirmation flow (`repe_tools.py` lines 193–299) is designed for a very specific pattern:

```
Turn 1: User says "create a fund"
        → LLM calls _create_fund(confirmed=false, name=None)
        → Tool returns {needs_input: true, missing_fields: ["name"]}
        → System annotates: [PENDING CONFIRMATION for: _create_fund]

Turn 2: User says "Winston Real Estate I"
        → LLM reads history, sees pending _create_fund
        → LLM calls _create_fund(confirmed=false, name="Winston Real Estate I")
        → Tool returns confirmation summary
```

But the actual interaction broke this pattern because the user front-loaded parameters in a conversational way:

```
Turn 1: User says "vintage year 2025, fund type closed-end, strategy is value-add"
        → Router classifies this as... what? Not a clear "create fund" command.
        → LLM responds conversationally: "Got it. What should we name it?"
        → NO tool was called. NO pending_confirmation was set.
        → History stored: just user text + assistant text. No tool_calls annotation.

Turn 2: User says "winston real estate I"
        → Router re-classifies: no verb, no command pattern → Lane A or ambiguous
        → LLM loads history: sees the previous exchange but NO pending tool call
        → LLM doesn't have enough signal to autonomously call _create_fund
        → Falls back to help menu
```

**The design assumes the LLM will always call a tool on the first turn of a workflow.** When the user provides context incrementally and the LLM responds conversationally instead of immediately invoking the tool, the workflow state is lost.

---

### I4. Adjacent Failures in the Same Category

#### I4a. Partial Slot Fill Across Multiple Turns

If a user says "create a fund" and the tool returns `needs_input: ["name", "vintage", "strategy"]`, and the user provides name in turn 2 and vintage in turn 3, the system must re-call the tool each time to track which fields are filled. But if the LLM decides to ask a follow-up question conversationally instead of calling the tool, the slot state is lost.

**Likely frequency:** Common. Users naturally provide information piecemeal.

#### I4b. Confirmation After Context Switch

User starts a create-fund flow, then asks an unrelated question ("what's our current AUM?"), then comes back with "ok, go ahead and create it." The pending confirmation annotation from the earlier turn may be outside the history window (6 messages for Lane B) or the LLM may not connect "go ahead" to the earlier flow.

**Likely frequency:** Moderate. Users multitask.

#### I4c. Lane Misclassification Drops Tool Access

The request router assigns different tool sets per lane. If a follow-up message in a write flow gets classified as Lane A (no tools), the LLM literally cannot call the write tool — even if it knows it should. The user gets a conversational response instead of an action.

**Likely frequency:** High for short follow-up messages like "yes", "call it X", "go ahead". These match no command patterns.

#### I4d. Scope Resolution Drift Between Turns

Turn 1 may resolve to Fund III (confidence 0.98 from entity name match). Turn 2, which is just "winston real estate I", has no entity reference and resolves to session environment (confidence 0.66) or global scope (confidence 0.2). The tool gets called with a different scope than the user expects.

**Likely frequency:** Low but catastrophic when it happens — creates a fund under the wrong entity.

#### I4e. History Truncation Drops Workflow Context

Lane A/B conversations load only the last 6 messages. A multi-turn creation flow with clarifications can easily exceed 6 messages. Once the original "create a fund" message scrolls out of the history window, the LLM loses all workflow context.

**Likely frequency:** Moderate for complex creations with many fields.

#### I4f. The "Yes" Problem

User confirms with "yes", "do it", "confirmed", "go ahead". These are classified as ambiguous by the router (no command verb, no entity). If the LLM doesn't see a clear `[PENDING CONFIRMATION]` annotation in history, it doesn't know what "yes" refers to.

**Likely frequency:** High — this is the most natural way users confirm actions.

---

### I5. Remediation Plan: Workflow State Machine

#### Fix 1: Explicit Workflow State Object

Add a persisted workflow state to the conversation, stored alongside messages in `ai_conversations`:

```
workflow_state = {
    "flow": "create_fund",               # active workflow type
    "phase": "slot_filling",             # slot_filling | pending_confirmation | executing | complete
    "required_fields": ["name", "vintage", "fund_type", "strategy"],
    "collected_fields": {
        "vintage": 2025,
        "fund_type": "closed_end",
        "strategy": "value_add"
    },
    "awaiting": "name",                  # next field needed
    "resolved_scope": {                  # locked scope for this workflow
        "business_id": "...",
        "env_id": "..."
    },
    "tool_name": "_create_fund",         # target tool
    "started_at": "2026-03-07T...",
    "last_updated": "2026-03-07T..."
}
```

This state persists in the database and is loaded on every turn. It survives history truncation, lane re-classification, and context switches.

#### Fix 2: Workflow-Aware Routing Override

Before the request router classifies a message into a lane, check for an active workflow:

```
if conversation has active workflow_state:
    if workflow_state.phase == "slot_filling":
        → route to slot-fill handler (bypass intent classification)
        → extract field value from user message using LLM
        → update workflow_state.collected_fields
        → if all fields complete: advance to pending_confirmation
        → if not: ask for next field
    elif workflow_state.phase == "pending_confirmation":
        → check if message is affirmative ("yes", "do it", "confirmed", etc.)
        → if yes: execute tool with confirmed=true
        → if no/cancel: clear workflow_state
        → if unrelated: pause workflow, handle new request, then remind about pending workflow
    elif workflow_state.phase == "executing":
        → show progress or wait
else:
    → normal lane classification
```

This ensures that "winston real estate I" in the context of a `create_fund` workflow gets routed to the slot filler, not the generic intent classifier.

#### Fix 3: Lock Scope During Active Workflow

When a workflow starts, capture the resolved scope and lock it for the duration of the workflow. All subsequent turns in the same workflow use the locked scope, regardless of what the scope resolver returns for the new message.

This prevents scope drift between turns (I4d above).

#### Fix 4: Expand History Window for Active Workflows

When a workflow is active, override the history limit to include all messages since the workflow started, regardless of lane classification. The token budget for history can be increased for active workflows because the context is more important than general history.

#### Fix 5: Confirmation Keyword Detection

Add an explicit check in the routing layer for confirmation keywords ("yes", "do it", "go ahead", "confirmed", "proceed", "correct", "looks good", "that's right") when a workflow is in `pending_confirmation` phase. Don't send these through intent classification — they're workflow control, not new commands.

#### Fix 6: Command vs Chat Lane Split

Formalize the distinction between transactional commands and conversational queries at the routing level:

**Transactional (deterministic path):** create, update, delete, set, change, add, remove, clone, run, execute
- These enter the workflow state machine
- Tool calls are mandatory, not optional
- Parameters are extracted via structured slot filling, not free conversation
- Confirmation is always required for mutations

**Conversational (LLM path):** what, show, compare, explain, summarize, how, why
- These go through normal lane classification
- LLM responds conversationally
- No workflow state needed

**Ambiguous:** Messages during an active workflow that don't match either category
- Route to the workflow's slot filler first
- If the slot filler can't extract a field value, treat as a conversational aside and remind the user about the pending workflow

#### Fix 7: Domain Command Grammar

Build a formal command catalog that maps natural language and REPE shorthand to structured operations. This reduces dependence on the LLM for intent classification in transactional flows.

The catalog should define for each command:
- Canonical intent name (e.g., `create_fund`)
- Allowed synonyms ("make a fund", "new fund", "set up a fund", "launch fund")
- Required and optional fields with types
- Validation rules (e.g., `sale_date > acquisition_date`)
- Backend tool path
- Confirmation requirement
- Sample utterances for testing

Example entries:

```
create_fund:
  synonyms: [create fund, new fund, make fund, set up fund, launch fund, add fund]
  required: [name]
  optional: [vintage, fund_type, strategy, target_size, currency]
  confirmation: always
  tool: _create_fund

update_sale_date:
  synonyms: [move sale, push sale, change exit, extend hold, hold longer, delay exit]
  required: [asset_id, sale_date]
  optional: [scenario_id]
  validation: sale_date > acquisition_date AND sale_date within model horizon
  confirmation: always
  tool: _update_asset

adjust_noi:
  synonyms: [cut NOI, reduce NOI, increase NOI, change NOI, stress NOI, NOI haircut]
  required: [asset_id, adjustment_pct, period_range]
  optional: [scenario_id]
  confirmation: always
  tool: _update_cash_flow
```

This grammar makes the router's job much simpler: pattern-match against known command synonyms before falling through to generic LLM classification.

---

### I6. Where This Fits in the Existing Audit

This is a different failure axis than the model parameter issues in Sections A–H. The parameter bugs are **API-level failures** (request never succeeds). The workflow state bug is an **orchestration-level failure** (request succeeds but does the wrong thing).

Together they represent the two most dangerous failure modes in the system:

| Failure class | What breaks | User sees | Risk level |
|---|---|---|---|
| Model parameter mismatch (Sections A–H) | API call rejected | Raw error in UI | High — blocks functionality |
| Workflow state loss (Section I) | Correct API call, wrong behavior | "I didn't understand" on a valid input | Critical — erodes trust, breaks multi-step business operations |

The parameter bugs are more visible (hard error). The workflow state bugs are more dangerous (silent failure that looks like the system is dumb, causing users to abandon the platform).

---

### I7. Priority of Workflow Fixes Relative to Existing Audit

Insert these into the Top 10 Fix List:

| Priority | Fix | Category |
|---|---|---|
| 1 | Model capability registry + request sanitizer | API hardening (existing) |
| 2 | **Explicit workflow state object in conversation DB** | **Workflow (new)** |
| 3 | Fix narrative.py hardcoded temperature | API hardening (existing) |
| 4 | **Workflow-aware routing override** | **Workflow (new)** |
| 5 | Wire up OPENAI_CHAT_MODEL_FALLBACK | API hardening (existing) |
| 6 | **Confirmation keyword detection** | **Workflow (new)** |
| 7 | Add retry logic with exponential backoff | API hardening (existing) |
| 8 | Normalize error SSE events | UX (existing) |
| 9 | **Command vs Chat lane split** | **Workflow (new)** |
| 10 | **Domain command grammar catalog** | **Workflow (new)** |

The workflow state object (#2) is higher priority than most API fixes because it affects every multi-turn business operation, not just specific model configurations.

---

### I8. Additional Grep/Search Patterns for Workflow Issues

| # | Pattern | Purpose |
|---|---|---|
| 1 | `pending_confirmation` | Find every place confirmation state is checked/set |
| 2 | `needs_input` | Find every slot-fill return path |
| 3 | `SYSTEM NOTE` | Find every history annotation |
| 4 | `confirmed=false` and `confirmed=true` | Trace the two-phase write flow |
| 5 | `max_history` or `recent\[` | Find history truncation limits |
| 6 | `lane="A"` | Find Lane A routing — does it have tools? |
| 7 | `conversation_id` | Trace where conversation context flows |
| 8 | `workflow` or `flow` or `state_machine` | Check if any workflow tracking exists already |
| 9 | `"yes"` or `"confirm"` in intent patterns | Check if affirmative responses are handled |
| 10 | `route.is_write` | Trace how write operations are flagged and handled |

---

### I9. What Will Break Next If We Don't Fix Workflow State

1. **Every multi-turn creation flow** (fund, deal, asset) will intermittently fail when the user provides information conversationally instead of in a single command. The failure rate increases with the number of required fields.

2. **Confirmation flows** will break whenever the user's "yes" gets classified as Lane A (no tools). The system will respond helpfully instead of executing the confirmed action.

3. **Complex REPE operations** (scenario surgery, model updates, batch asset changes) are impossible without reliable workflow state. "Push sale 12 months and widen exit cap 50 bps for the Miami assets only" requires multi-step tool orchestration that can't rely on the LLM re-inferring intent on every turn.

4. **User trust erosion** — the system looks intelligent on the first turn and dumb on the second. This is worse than being consistently limited, because users can't predict when it will work. They stop using the command center for real work.

5. **The Quick Actions fallback menu** becomes the escape hatch that users learn to rely on. The command center devolves into a button menu with a chat box that sometimes works. This is the opposite of the "Bloomberg Terminal + Cursor AI + Notion AI" experience you're targeting.

---

### I10. Test Matrix for Workflow State

| Test | What it validates |
|---|---|
| `test_create_fund_incremental_slot_fill` | User provides fields across 3 turns → fund created |
| `test_create_fund_single_turn` | "Create a fund called X, vintage 2025, value-add" → works in one turn |
| `test_confirmation_with_yes` | After pending_confirmation, user says "yes" → tool executes |
| `test_confirmation_with_go_ahead` | "go ahead" → same as "yes" |
| `test_context_switch_during_workflow` | User asks unrelated question mid-flow → workflow resumes after |
| `test_workflow_survives_history_truncation` | Active workflow persists even when early messages scroll out |
| `test_scope_locked_during_workflow` | Scope doesn't drift between turns in same workflow |
| `test_cancel_workflow` | User says "never mind" / "cancel" → workflow cleared |
| `test_lane_A_classification_during_workflow` | Short message during active workflow still routes to slot filler |
| `test_ambiguous_name_during_slot_fill` | "winston real estate I" during awaiting=name → fills name field |
| `test_fund_creation_e2e_conversational` | Full conversational flow matching the observed failure → succeeds |
| `test_workflow_timeout` | Abandoned workflow auto-clears after N minutes of inactivity |
