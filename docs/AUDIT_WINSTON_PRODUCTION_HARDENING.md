# Winston AI Platform — Production Failure-Class Audit

**Date**: 2026-03-07
**Scope**: Full AI command/gateway/streaming/execution stack
**Trigger**: Permanent "Processing..." stall during multi-turn fund creation
**Auditor**: Staff-level diagnostic, all layers examined

---

## 1. Executive Summary

The Winston AI assistant had a **cascading timeout bug** that permanently stalled the UI during multi-turn tool-calling workflows (like "create a new fund"). The root cause chain: slot-fill amnesia forced extra LLM rounds → total request time exceeded the NextJS proxy's 60-second `AbortSignal.timeout` → the SSE stream was silently killed before the backend emitted its `done` event → the frontend's `reader.read()` hung indefinitely because the abort signal couldn't cancel an already-received ReadableStream body.

**Four fixes were applied** (all deployed):

| Fix | Layer | File | Impact |
|-----|-------|------|--------|
| Connection-only proxy timeout | Proxy | `route.ts:189-205` | Eliminates mid-stream kill |
| Reader abort safety net | Frontend | `assistantApi.ts:964-965` | 90s timeout actually works |
| Emit `done` before persistence | Backend | `ai_gateway.py:1009-1097` | DB slowness can't block stream |
| `run_in_executor` for sync DB | Backend | `ai_gateway.py:426,611,1107,1183` | Unblocks asyncio event loop |

**Beyond the stall fix**, this audit identified **23 additional failure modes** across 6 layers, including 4 critical schema/prompt mismatches that cause 100% tool failure for certain parameter values, and 8 medium-severity lifecycle bugs.

---

## 2. Top 10 Production Risks (Ranked by Severity × Likelihood)

| # | Risk | Severity | Likelihood | Layer | Status |
|---|------|----------|------------|-------|--------|
| 1 | **Schema mismatch: fund_type** — tool says "open-end" but DB CHECK requires "open_end" | P0-Critical | Certain | Schema↔DB | OPEN |
| 2 | **Schema mismatch: strategy** — tool says "core, value-add" but DB only accepts "equity, debt" | P0-Critical | Certain | Schema↔DB | OPEN |
| 3 | **Schema mismatch: deal_type** — tool says "preferred, mezzanine" but DB only accepts "equity, debt" | P0-Critical | Certain | Schema↔DB | OPEN |
| 4 | **Schema mismatch: deal stage** — tool says "screening, due-diligence" but DB has "sourcing, underwriting, ic, closing, operating, exited" | P0-Critical | Certain | Schema↔DB | OPEN |
| 5 | **No tool execution timeout** — a hung DB query in a tool handler blocks the entire stream forever | P1-High | Moderate | Backend | OPEN |
| 6 | **Error paths skip `done` event** — model errors (line 749) and max-rounds (line 802) break the loop without emitting `done` | P1-High | Moderate | Backend | OPEN |
| 7 | **Sync `semantic_search()` blocks event loop** — RAG queries (lines 518/526) are synchronous in async generator | P2-Medium | Moderate | Backend | OPEN |
| 8 | **Double-submit race** — no guard between `setPlanning(true)` and React re-render in `onSend()` | P2-Medium | Moderate | Frontend | OPEN |
| 9 | **No write idempotency** — duplicate `create_fund` calls create duplicate funds | P2-Medium | Low | Tools | OPEN |
| 10 | **Audit failure crashes tool execution** — compliance-first `audit.py:89-92` re-raises if audit DB write fails, even when the tool succeeded | P2-Medium | Low | Tools | OPEN |

---

## 3. Failure Class Inventory

### 3.1 Timeout & Stream Lifecycle (4 issues)

| ID | Issue | File:Line | Severity | Fixed? |
|----|-------|-----------|----------|--------|
| TM-1 | 60s `AbortSignal.timeout` kills SSE mid-stream | `route.ts:194` (was) | P0 | YES |
| TM-2 | `reader.read()` not cancellable by abort signal | `assistantApi.ts:959` (was) | P0 | YES |
| TM-3 | `done` emitted after slow DB persistence | `ai_gateway.py:1223` (was) | P1 | YES |
| TM-4 | Error paths (model error, max rounds) skip `done` | `ai_gateway.py:749,802` | P1 | OPEN |

### 3.2 Event Loop Blocking (5 issues)

| ID | Issue | File:Line | Severity | Fixed? |
|----|-------|-----------|----------|--------|
| EL-1 | `convo_svc.get_messages()` sync in async gen | `ai_gateway.py:611` | P1 | YES |
| EL-2 | `convo_svc.append_message()` sync (user msg) | `ai_gateway.py:1107` | P1 | YES |
| EL-3 | `convo_svc.append_message()` sync (assistant msg) | `ai_gateway.py:1183` | P1 | YES |
| EL-4 | `semantic_search()` sync (RAG queries) | `ai_gateway.py:518,526` | P2 | OPEN |
| EL-5 | `langfuse_client.flush()` sync HTTP call | `ai_gateway.py:1238` | P3 | OPEN (post-done) |

### 3.3 Schema ↔ DB Contract Mismatches (4 issues)

| ID | Field | Tool Description (`repe_tools.py`) | DB CHECK (`265_repe_object_model.sql`) | Impact |
|----|-------|-------------------------------------|----------------------------------------|--------|
| SC-1 | `CreateFundInput.fund_type` (line 83) | `"open-end, closed-end, co-invest, fund-of-funds"` | `IN ('closed_end', 'open_end', 'sma', 'co_invest')` | LLM sends "open-end" → DB rejects → tool error |
| SC-2 | `CreateFundInput.strategy` (line 84) | `"core, core-plus, value-add, opportunistic"` | `IN ('equity', 'debt')` | LLM sends "value-add" → DB rejects |
| SC-3 | `CreateDealInput.deal_type` (line 100) | `"equity, debt, preferred, mezzanine"` | `IN ('equity', 'debt')` | LLM sends "preferred" → DB rejects |
| SC-4 | `CreateDealInput.stage` (line 101) | `"screening, due-diligence, closed, exited"` | `IN ('sourcing', 'underwriting', 'ic', 'closing', 'operating', 'exited')` | LLM sends "screening" → DB rejects |

### 3.4 Frontend State Management (4 issues)

| ID | Issue | File:Line | Severity |
|----|-------|-----------|----------|
| FE-1 | Double-submit race: `setPlanning(true)` doesn't block sync before React re-render | `GlobalCommandBar.tsx:458` | P2 |
| FE-2 | No reconnection logic for dropped SSE streams | `assistantApi.ts:973` | P3 |
| FE-3 | Partial response lost if error occurs mid-stream (answer reset on catch) | `GlobalCommandBar.tsx:531-533` | P3 |
| FE-4 | `withTimeout` double-abort race: parent signal + timeout both call `controller.abort()` | `assistantApi.ts:218` | P3 |

### 3.5 Tool Execution Safety (4 issues)

| ID | Issue | File:Line | Severity |
|----|-------|-----------|----------|
| TE-1 | No `asyncio.wait_for` timeout on `run_in_executor` tool calls | `ai_gateway.py:~860` | P1 |
| TE-2 | No idempotency guard on write tools (create_fund, create_deal, create_asset) | `repe_tools.py:203+` | P2 |
| TE-3 | Audit failure crashes tool: if audit DB write fails after successful tool, raises RuntimeError | `audit.py:89-92` | P2 |
| TE-4 | `extra = "forbid"` on all input models — LLM sometimes sends unexpected keys → ValidationError | `repe_tools.py:8,78,96,110` | P2 |

### 3.6 Observability Gaps (2 issues)

| ID | Issue | File:Line | Severity |
|----|-------|-----------|----------|
| OB-1 | `audit_svc.record_event()` and `log_request()` still sync after `done` — block event loop for next request | `ai_gateway.py:1198,1243` | P3 |
| OB-2 | No structured alert on repeated tool failures (silent retry-exhaust pattern) | N/A | P3 |

---

## 4. Contract Mismatch Audit

### 4.1 The Layered Contract Problem

The Winston tool-calling stack has **5 contract layers**, and they must agree:

```
┌─────────────────────────────────────────────────────┐
│  1. System Prompt (_MUTATION_RULES_BLOCK)            │ ← tells LLM how to call tools
│  2. OpenAI Tool Schema (JSON Schema from Pydantic)   │ ← LLM sees field descriptions
│  3. Pydantic Input Model (repe_tools.py)             │ ← validates tool arguments
│  4. Tool Handler (repe_tools.py handlers)            │ ← builds SQL
│  5. Database CHECK constraints (265_*.sql)           │ ← final gate
└─────────────────────────────────────────────────────┘
```

**Current state of agreement:**

| Field | Layer 1 (Prompt) | Layer 2 (Schema desc) | Layer 3 (Pydantic) | Layer 4 (Handler) | Layer 5 (DB) |
|-------|------------------|-----------------------|--------------------|-------------------|--------------|
| `fund_type` | No enums | "open-end, closed-end, co-invest, fund-of-funds" | `str` (no validator) | pass-through | `closed_end, open_end, sma, co_invest` |
| `strategy` | No enums | "core, core-plus, value-add, opportunistic" | `str` (no validator) | pass-through | `equity, debt` |
| `deal_type` | No enums | "equity, debt, preferred, mezzanine" | `str` (no validator) | pass-through | `equity, debt` |
| `stage` | No enums | "screening, due-diligence, closed, exited" | `str` (no validator) | pass-through | `sourcing, underwriting, ic, closing, operating, exited` |
| `status` | No enums | "fundraising, investing, harvesting, closed" | `str` (no validator) | pass-through | `fundraising, investing, harvesting, closed` |
| `asset_type` | No enums | "property or cmbs" | `str` (no validator) | pass-through | (no CHECK) |

**SC-1 and SC-2 are 100% reproduction rate** — every fund creation attempt that uses "open-end" or any strategy value will fail at the DB layer with an opaque CHECK constraint error.

---

## 5. Request Lifecycle Timeline

```
User clicks Send
│
├─ GlobalCommandBar.onSend() [GlobalCommandBar.tsx:451]
│  ├─ setPlanning(true)           ← spinner starts
│  ├─ ensureContextSnapshot()     ← resolves business/env IDs
│  ├─ createConversation()        ← optional, if first message
│  └─ askAi()                     [assistantApi.ts:846]
│     ├─ withTimeout(90s)         ← creates AbortController
│     ├─ fetch("/api/ai/gateway/ask")  ← hits NextJS route
│     │
│     │  ┌─ NextJS route.ts POST() [route.ts:132]
│     │  ├─ parseSessionFromRequest()
│     │  ├─ buildFallbackContextEnvelope()
│     │  ├─ fetch(FASTAPI_BASE + "/api/ai/gateway/ask")
│     │  │   ├─ 10s connection timeout (clears on headers)
│     │  │   └─ NO body timeout (stream runs unbounded)     ← FIX 1
│     │  └─ Response(upstream.body)  ← passthrough SSE
│     │
│     │     ┌─ FastAPI gateway_ask() [routes/ai_gateway.py:57]
│     │     └─ StreamingResponse(event_stream())
│     │        └─ run_gateway_stream() [ai_gateway.py:~350]
│     │           ├─ _check_pending_workflow()  ← async via executor  ← FIX 4a
│     │           ├─ classify_message()          ← route to lane A/B/C/D
│     │           ├─ _override_route_for_workflow()  ← upgrade lane if pending
│     │           ├─ yield _sse("context", ...)
│     │           ├─ yield _sse("status", ...)
│     │           ├─ semantic_search()           ← STILL SYNC (EL-4)
│     │           ├─ convo_svc.get_messages()    ← async via executor  ← FIX 4b
│     │           ├─ build messages array + system prompt
│     │           │
│     │           ├─ for round in range(max_tool_rounds):
│     │           │   ├─ client.chat.completions.create(stream=True)
│     │           │   ├─ collect tokens → yield _sse("token", ...)
│     │           │   ├─ collect tool_calls
│     │           │   ├─ if no tool_calls: break
│     │           │   ├─ if max rounds: yield error, break    ← MISSING done (TM-4)
│     │           │   └─ for each tool_call:
│     │           │       ├─ _run_tool() via run_in_executor
│     │           │       │   └─ audit.execute_tool()          ← can crash (TE-3)
│     │           │       ├─ yield _sse("tool_call", ...)
│     │           │       ├─ yield _sse("tool_result", ...)
│     │           │       └─ append tool result to messages
│     │           │
│     │           ├─ yield _sse("done", {trace})               ← FIX 3 (before persist)
│     │           │
│     │           ├─ convo_svc.append_message(user)            ← async via executor
│     │           ├─ convo_svc.append_message(assistant)       ← async via executor
│     │           ├─ audit_svc.record_event()                  ← STILL SYNC (OB-1)
│     │           ├─ langfuse_client.flush()                   ← STILL SYNC (EL-5)
│     │           └─ log_request()                             ← STILL SYNC (OB-1)
│     │
│     ├─ reader.read() loop       ← processes SSE events
│     │  ├─ abort listener → reader.cancel()                   ← FIX 2
│     │  ├─ token → answer += text
│     │  ├─ tool_call → debug.toolCalls.push()
│     │  ├─ error → answer += "[Error: ...]"
│     │  └─ done → break
│     │
│     └─ return { answer, trace, debug }
│
├─ appendMessage("assistant", result.answer)
└─ setPlanning(false)             ← spinner stops
```

**Failure points in the timeline:**

| Point | What fails | Result |
|-------|-----------|--------|
| `fetch()` to proxy | Network error | Caught, friendly error shown |
| Proxy → FastAPI `fetch()` | Backend down | 10s timeout, falls back to direct OpenAI |
| `chat.completions.create()` | OpenAI error | Mapped error, fallback model tried |
| Tool handler | DB constraint violation | Error in tool_result, LLM retries |
| Tool handler | Audit DB down | RuntimeError crashes entire stream (TE-3) |
| `done` event | Was blocked by slow persist | **NOW FIXED** — emitted before persist |
| After `done` | DB persist fails | Silently caught, no user impact |

---

## 6. Hardening Plan

### Phase 1 — Critical (Do Now)

#### 6.1 Fix Schema/Prompt Mismatches (SC-1 through SC-4)

**File**: `backend/app/mcp/schemas/repe_tools.py`

```python
# CreateFundInput — line 83-84
fund_type: str = Field(description="Fund type: closed_end, open_end, sma, co_invest")
strategy: str = Field(description="Strategy: equity, debt")

# CreateDealInput — line 100-101
deal_type: str = Field(description="Deal type: equity, debt")
stage: str = Field(default="sourcing", description="Stage: sourcing, underwriting, ic, closing, operating, exited")
```

Add Pydantic `Literal` validators as a safety net (Layer 3):

```python
from typing import Literal

fund_type: Literal["closed_end", "open_end", "sma", "co_invest"] = Field(...)
strategy: Literal["equity", "debt"] = Field(...)
deal_type: Literal["equity", "debt"] = Field(...)
stage: Literal["sourcing", "underwriting", "ic", "closing", "operating", "exited"] = Field(default="sourcing", ...)
```

This gives clear errors at Pydantic validation instead of opaque DB constraint failures.

#### 6.2 Fix Error Paths Missing `done` (TM-4)

**File**: `backend/app/services/ai_gateway.py`

At lines 749 and 802, after yielding the error SSE, also emit a `done` event so the frontend terminates:

```python
# Line 749 (model error path):
yield _sse("error", {"message": mapped.user_message, "debug": mapped.debug_message})
# ADD:
yield _sse("done", {"session_id": session_id, "error": True, "trace": {"elapsed_ms": int((time.time() - start) * 1000)}})

# Line 802 (max rounds path):
yield _sse("error", {"message": f"Max tool rounds ({AI_MAX_TOOL_ROUNDS}) reached"})
# ADD:
yield _sse("done", {"session_id": session_id, "error": True, "trace": {"elapsed_ms": int((time.time() - start) * 1000)}})
```

#### 6.3 Add Tool Execution Timeout (TE-1)

```python
# In _run_tool call site (~line 860):
try:
    tool_result = await asyncio.wait_for(
        asyncio.get_event_loop().run_in_executor(None, lambda: execute_tool(tool, ctx, raw_args)),
        timeout=30.0,  # 30s per tool call
    )
except asyncio.TimeoutError:
    tool_result = {"error": f"Tool {tool_name} timed out after 30s"}
```

### Phase 2 — Important (This Sprint)

#### 6.4 Wrap `semantic_search()` in executor (EL-4)

```python
# Lines 518, 526:
rag_chunks_raw = await asyncio.get_event_loop().run_in_executor(
    None, lambda: semantic_search(query=message, **_search_kwargs)
)
```

#### 6.5 Double-Submit Guard (FE-1)

```typescript
// GlobalCommandBar.tsx, inside onSend():
const sendingRef = useRef(false);
const onSend = async (message?: string) => {
  if (sendingRef.current) return;  // guard
  sendingRef.current = true;
  // ... existing code ...
  finally {
    sendingRef.current = false;
    setPlanning(false);
  }
};
```

#### 6.6 Soften Audit Failure (TE-3)

```python
# audit.py line 89-92 — change from crash to log-and-continue:
except Exception as audit_err:
    import logging
    logging.getLogger(__name__).error(
        "Audit persistence failed for %s: %s", tool.name, audit_err
    )
    # Don't crash the tool execution — audit is important but not worth
    # destroying a successful user operation
```

#### 6.7 Relax `extra = "forbid"` on Write Models (TE-4)

```python
# Change to "ignore" so LLM-injected extra keys don't crash validation:
class CreateFundInput(BaseModel):
    model_config = {"extra": "ignore"}  # was "forbid"
```

### Phase 3 — Nice to Have (Next Sprint)

- **EL-5 / OB-1**: Wrap `langfuse_client.flush()`, `audit_svc.record_event()`, and `log_request()` in `run_in_executor`. They run after `done` so don't affect UX, but they block the event loop for the next concurrent request.
- **FE-2**: Add SSE reconnection with exponential backoff for dropped connections.
- **FE-3**: Preserve partial `answer` on error instead of replacing with error message.
- **TE-2**: Add idempotency keys to write tools (e.g., hash of `name + business_id + vintage_year` for funds).

---

## 7. Test Matrix

### 7.1 Regression Tests (Stall Fix)

| Test | Steps | Expected | Covers |
|------|-------|----------|--------|
| **Multi-turn fund creation** | "create fund My Fund" → provide missing fields → confirm | Spinner stops, fund created | TM-1,2,3 |
| **Backend slow DB** | Add 5s sleep before `convo_svc.append_message` | `done` arrives before sleep | TM-3, EL-1,2,3 |
| **Backend DB down** | Kill DB connection during persist | `done` still emitted, UI shows answer | TM-3 |
| **Backend unreachable** | Stop FastAPI, send message | Falls back to direct OpenAI within 10s | TM-1 |
| **90s timeout** | Add 95s sleep in tool handler | UI shows timeout error after 90s | TM-2 |

### 7.2 Schema Mismatch Tests

| Test | Tool Call Args | Expected (CURRENT) | Expected (FIXED) |
|------|---------------|---------------------|-------------------|
| Fund with `fund_type="open-end"` | `{fund_type: "open-end", ...}` | DB CHECK error | Pydantic validation error with allowed values |
| Fund with `strategy="value-add"` | `{strategy: "value-add", ...}` | DB CHECK error | Pydantic validation error: "equity" or "debt" |
| Deal with `deal_type="mezzanine"` | `{deal_type: "mezzanine", ...}` | DB CHECK error | Pydantic validation error |
| Deal with `stage="screening"` | `{stage: "screening", ...}` | DB CHECK error | Pydantic validation error |
| Fund with `fund_type="closed_end"` | `{fund_type: "closed_end", ...}` | Success | Success (unchanged) |

### 7.3 Error Path Tests

| Test | Trigger | Expected |
|------|---------|----------|
| Model API error | Invalid API key | Error SSE + done SSE, spinner stops |
| Max tool rounds | Force 6 tool calls | Error SSE + done SSE, spinner stops |
| Tool timeout | Tool handler sleeps 35s | Timeout error in tool_result, stream continues |
| Audit DB failure | Kill audit DB mid-tool | Tool result still returned (after TE-3 fix) |
| Double submit | Click send twice rapidly | Second click ignored |

---

## 8. Recommended Code Changes (Priority-Ordered)

### Change 1 — Fix Schema Descriptions (P0, 15 min)
- **File**: `backend/app/mcp/schemas/repe_tools.py`
- **Lines**: 83, 84, 100, 101
- **What**: Update Field descriptions to match DB CHECK constraints; add `Literal` types

### Change 2 — Emit `done` on Error Paths (P0, 10 min)
- **File**: `backend/app/services/ai_gateway.py`
- **Lines**: After 749, after 802
- **What**: Add `yield _sse("done", ...)` after error events

### Change 3 — Add Tool Timeout (P1, 15 min)
- **File**: `backend/app/services/ai_gateway.py`
- **Where**: `_run_tool` call site (~line 860)
- **What**: Wrap `run_in_executor` in `asyncio.wait_for(timeout=30)`

### Change 4 — Double-Submit Guard (P1, 5 min)
- **File**: `repo-b/src/components/commandbar/GlobalCommandBar.tsx`
- **Where**: `onSend()` at line 451
- **What**: Add `useRef` guard to prevent concurrent sends

### Change 5 — Soften Audit Crash (P2, 5 min)
- **File**: `backend/app/mcp/audit.py`
- **Lines**: 89-92
- **What**: Log instead of re-raise when audit fails after successful tool

### Change 6 — Async RAG Search (P2, 10 min)
- **File**: `backend/app/services/ai_gateway.py`
- **Lines**: 518, 526
- **What**: Wrap `semantic_search()` in `run_in_executor`

### Change 7 — Relax Extra Fields (P2, 5 min)
- **File**: `backend/app/mcp/schemas/repe_tools.py`
- **Lines**: 78, 96, 110
- **What**: Change `extra = "forbid"` to `extra = "ignore"` on write models

---

## 9. "Never Again" Guardrails

### 9.1 Schema Sync CI Check

Add a CI step that extracts `Field(description=...)` enum lists from Pydantic models and compares them against DB CHECK constraints. Fail the build if they diverge.

```yaml
# .github/workflows/schema-sync.yml
- name: Verify tool schemas match DB constraints
  run: python scripts/verify_tool_schema_db_sync.py
```

### 9.2 SSE `done` Event Invariant

Every code path in `run_gateway_stream()` must emit exactly one `done` event. Add an integration test:

```python
async def test_done_event_always_emitted():
    """Every stream must end with a done event, even on errors."""
    for scenario in [normal, model_error, max_rounds, tool_timeout, db_down]:
        events = [e async for e in run_gateway_stream(**scenario)]
        event_types = [parse_sse_type(e) for e in events]
        assert "done" in event_types, f"Missing done in {scenario.name}: {event_types}"
```

### 9.3 Frontend Stream Contract

The `askAi()` function should guarantee the spinner stops in ALL cases. Add a `finally` block in the reader loop:

```typescript
// Already handled by GlobalCommandBar's finally { setPlanning(false) }
// But add defensive logging:
if (!receivedDone) {
  console.warn(`[Winston] Stream ended without done event for ${requestId}`);
}
```

### 9.4 Pydantic Literal Types as Standard

All write tool schemas should use `Literal[...]` types (not bare `str`) for any field with a DB CHECK constraint. This makes the contract explicit and self-documenting at layer 3.

### 9.5 Tool Timeout as Default

Every tool execution should have a configurable timeout (default 30s). No tool call should be able to hang the entire stream indefinitely.

---

## 10. Final Verdict

### What was broken
The original stall was a **3-layer timeout cascade**: proxy killed stream at 60s, frontend couldn't cancel hung reader, and `done` was emitted after slow DB writes. All three had to fail together for the permanent stall.

### What is fixed
The 4 deployed fixes eliminate the stall entirely. The connection-only proxy timeout, reader abort safety net, done-before-persist pattern, and async DB calls each independently prevent the cascading failure.

### What remains open
**4 P0 schema mismatches** will cause 100% failure for any fund creation where the LLM follows the tool description and sends values like "open-end" or "core". These should be fixed immediately — they are the #1 remaining production risk.

**2 P1 issues** (error paths missing `done`, no tool timeout) are edge cases but can cause the same permanent stall symptom under specific conditions.

### Confidence level
After fixes 1-4: **High confidence** the stall bug is resolved for the normal case.
After fixing SC-1 through SC-4: **High confidence** that fund/deal creation will work end-to-end.
After fixing TM-4 and TE-1: **Full confidence** that no code path can permanently stall the UI.

---

---

## Addendum: Multi-Turn Slot-Fill Amnesia (2026-03-07)

### New Root Cause Identified

The schema/prompt mismatch audit (SC-1 through SC-4) was only part of the problem. A deeper investigation revealed that the multi-turn slot-fill flow was **architecturally broken** — the LLM could never make a partial tool call on the first turn because `vintage_year`, `fund_type`, and `strategy` were **required with no defaults** in the Pydantic schema. OpenAI function calling enforces required fields in the JSON schema, making partial calls physically impossible.

### Cascade of Failures

1. **Schema prevents partial calls**: Required fields with no defaults → OpenAI won't let the LLM call the tool with just `name`
2. **No tool call on turn 1**: LLM falls back to natural language response instead
3. **No structured annotation**: The enrichment logic only fires when `tool_calls_log` is non-empty → no `[SYSTEM NOTE]` persisted
4. **LLM amnesia on turn 2**: Without structured annotation, the LLM must parse natural language to reconstruct state → unreliably forgets the name

### Fix Applied

1. **Schema**: Made `vintage_year`, `fund_type`, `strategy` (and `deal_type`) optional with `None` defaults
2. **Handlers**: Updated `_create_fund`, `_create_deal`, `_create_asset` to detect ALL missing required fields and return `needs_input` with both `missing_fields` and `provided` params
3. **Prompt**: Updated system prompt example to use correct enum values

### Correct Flow After Fix

Turn 1: "create a fund named my sweet fund"
→ LLM calls `create_fund(name="my sweet fund", confirmed=false)` (schema allows partial call)
→ Handler returns `{needs_input: true, missing_fields: ["vintage_year", "fund_type", "strategy"], provided: {name: "my sweet fund"}}`
→ LLM asks for missing fields only
→ Enrichment annotation saved: `[SYSTEM NOTE: ... Known parameters: repe.create_fund(name="my sweet fund") ...]`

Turn 2: "2024, open_end, equity"
→ LLM sees annotation with known params, merges new values
→ Calls `create_fund(name="my sweet fund", vintage_year=2024, fund_type="open_end", strategy="equity", confirmed=false)`
→ Handler returns confirmation summary
→ LLM asks "Shall I proceed?"

Turn 3: "yes"
→ LLM calls `create_fund(... confirmed=true)`
→ Fund created

### Tests Added

File: `backend/tests/test_slot_fill_multi_turn.py` — 15 test cases covering:
- Partial schema acceptance (name-only, empty, all-fields)
- Invalid enum rejection (Literal validation)
- Extra field tolerance (`extra="ignore"`)
- Handler needs_input detection for all missing field combinations
- Provided field echo-back in needs_input responses
- Enrichment annotation logic for successful and failed tool calls
- Workflow detection for pending slot-fill conversations

*End of audit.*
