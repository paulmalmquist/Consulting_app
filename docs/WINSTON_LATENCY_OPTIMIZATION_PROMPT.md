---
id: winston-latency-optimization
kind: prompt
status: active
source_of_truth: true
topic: latency-optimization
owners:
  - docs
  - backend
  - repo-b
intent_tags:
  - docs
  - build
  - research
triggers:
  - latency optimization
  - latency prompt
  - snappy copilot
entrypoint: true
handoff_to:
  - feature-dev
when_to_use: "Use when the user explicitly asks for the latency optimization prompt or the Winston copilot latency brief."
when_not_to_use: "Do not use as the general router for repo work; CLAUDE.md should already have selected a prompt or workflow."
surface_paths:
  - docs/
  - backend/
  - repo-b/
---

# Winston Latency Optimization — Engineering Prompt

> **Purpose:** Hand this prompt to an AI coding agent (or use it as your own implementation brief) to systematically reduce Winston's response latency. Every reference points to a real file in this monorepo.

---

## Role

You are a senior performance engineer and AI systems architect working inside this monorepo. Winston is a functioning in-app copilot, but latency is too high and the interaction does not feel snappy enough for production use. Your task is to improve both actual latency and perceived latency across the entire Winston stack without breaking existing functionality.

---

## System Architecture (Current State)

### Request Flow

```
Frontend (Next.js)                     Backend (FastAPI)
─────────────────                      ─────────────────
GlobalCommandBar                       POST /api/ai/gateway/ask
  → buildAssistantContextEnvelope()      → ensure_context_envelope()
  → askAi() via SSE POST                → resolve_assistant_scope()
  → parse SSE events                     → semantic_search() [RAG]
  → render tokens + tool results         → resolve_visible_context_policy()
  → populate AdvancedDrawer              → build_context_block()
                                         → build system prompt + messages
                                         → for round in range(MAX_TOOL_ROUNDS):
                                              stream OpenAI completion
                                              execute tool calls (serial)
                                         → yield done + trace
```

### Key Files

| Layer | File | Role |
|-------|------|------|
| **Frontend gateway proxy** | `repo-b/src/app/api/ai/gateway/ask/route.ts` | Next.js API route; proxies to FastAPI, falls back to direct OpenAI |
| **Frontend API client** | `repo-b/src/lib/commandbar/assistantApi.ts` | `askAi()` — sends POST, parses SSE stream, collects debug data |
| **Context envelope builder** | `repo-b/src/lib/commandbar/contextEnvelope.ts` | `buildAssistantContextEnvelope()` — collects route, env, page entity, visible data from UI and app context bridge |
| **App context bridge** | `repo-b/src/lib/commandbar/appContextBridge.ts` | `window.__APP_CONTEXT__` — page components publish context here |
| **Debug/trace UI** | `repo-b/src/components/commandbar/AdvancedDrawer.tsx` | Tabs: overview, context, trace, data, runtime, raw |
| **Backend gateway service** | `backend/app/services/ai_gateway.py` | `run_gateway_stream()` — the core orchestration loop |
| **Scope resolution** | `backend/app/services/assistant_scope.py` | `resolve_assistant_scope()`, `build_context_block()`, `resolve_visible_context_policy()` |
| **RAG indexer/retriever** | `backend/app/services/rag_indexer.py` | `semantic_search()` — pgvector cosine similarity with parent-child chunk expansion |
| **Tool registry** | `backend/app/mcp/registry.py` | `ToolRegistry` singleton; `ToolDef` dataclass |
| **REPE tools** | `backend/app/mcp/tools/repe_tools.py` | `list_funds`, `get_fund`, `list_deals`, `list_assets`, `get_asset`, `get_environment_snapshot` |
| **Tool audit wrapper** | `backend/app/mcp/audit.py` | `execute_tool()` — wraps each tool call with logging and permission checks |
| **Config** | `backend/app/config.py` | `OPENAI_CHAT_MODEL` (default: gpt-4o-mini), `AI_MAX_TOOL_ROUNDS` (5), `RAG_TOP_K` (5), `RAG_CHUNK_TOKENS` (400) |

---

## Diagnosed Latency Bottlenecks

These are the specific problems found in the current implementation. Each one references the exact code location.

### 1. All tool calls execute serially

**File:** `backend/app/services/ai_gateway.py`, lines 365–487

The tool execution loop iterates over `collected_tool_calls.values()` sequentially. If the model requests `repe.get_environment_snapshot` and `repe.list_funds` in the same round, the second tool blocks on the first completing. Each tool call involves a DB query; these are independent and should run concurrently.

```python
# CURRENT (serial) — line 365
for tool_call in collected_tool_calls.values():
    tool_start = time.time()
    # ... execute_tool() blocks here ...
    tool_duration_ms = int((time.time() - tool_start) * 1000)
```

### 2. RAG search runs unconditionally before the model

**File:** `backend/app/services/ai_gateway.py`, lines 188–229

`semantic_search()` is called on every request where `rag_business_id` exists, even for questions like "what environment am I in" where RAG is irrelevant. The embedding API call alone adds latency.

```python
# CURRENT — line 193
if rag_business_id:
    rag_chunks = semantic_search(query=message, ...)
```

### 3. No model routing — single model for all requests

**File:** `backend/app/config.py`, line 67; `backend/app/services/ai_gateway.py`, line 294

Every request uses `OPENAI_CHAT_MODEL` (currently `gpt-4o-mini`). There is no fast path for trivial questions and no heavier model for complex analytical tasks. The same token budget and temperature apply to "what environment is this" and "build a dashboard comparing all fund IRRs."

### 4. Visible-context shortcut is too narrow

**File:** `backend/app/services/assistant_scope.py`, lines 421–452

`resolve_visible_context_policy()` only disables tools for two very specific patterns: (a) list-query about funds when funds are visible, and (b) strategy metadata for an explicit fund. Many other answerable-from-UI questions still trigger full model + tool execution.

```python
# CURRENT — only these two conditions disable tools
if visible_data and visible_data.funds and _LIST_QUERY_RE.search(...) and "fund" in ...:
    disable_tools = True
if explicit_entity ... and "strategy" in ...:
    disable_tools = True
```

### 5. Full context envelope JSON dumped into every prompt

**File:** `backend/app/services/assistant_scope.py`, lines 380–392, 417

`build_context_block()` serializes the entire context envelope (session, UI, thread, resolved scope, all visible records) as a JSON string appended to the system prompt. For environments with many entities, this inflates the prompt significantly.

```python
# CURRENT — line 417
lines.append(f"Context envelope JSON: {envelope_json}")
```

### 6. No environment/session caching

**File:** `backend/app/services/assistant_scope.py`, lines 166–211

`_context_base()` calls `resolve_env_business_context()` on every request to look up env metadata (schema_name, industry). This hits the database each time. Environment metadata is stable within a session.

### 7. Debug trace blocks the done event

**File:** `backend/app/services/ai_gateway.py`, lines 536–593

The trace object (execution_path, token counts, tool_timeline, data_sources, citations, elapsed_ms, resolved_scope, repe metadata) is assembled synchronously and emitted as part of the `done` SSE event. The frontend cannot finalize the response until this event arrives.

### 8. Conversation history loaded without limits

**File:** `backend/app/services/ai_gateway.py`, lines 244–253

All messages for a conversation are loaded and appended to the prompt. Long conversations inflate prompt tokens and latency.

```python
# CURRENT — line 248
history = convo_svc.get_messages(conversation_id=conversation_id)
for msg in history:
    if msg["role"] in ("user", "assistant"):
        messages.append(...)
```

### 9. Frontend does not prefetch context

**File:** `repo-b/src/lib/commandbar/contextEnvelope.ts`

The context envelope is built at request time when the user submits a message. There is no warm-up on Winston panel open. The `window.__APP_CONTEXT__` bridge is read synchronously, but backend context resolution (env metadata lookup, RAG embedding) only starts after the user presses send.

### 10. No per-step instrumentation exposed

**File:** `backend/app/services/ai_gateway.py`

Only `elapsed_ms` (total) and `tool_duration_ms` (per tool) are tracked. There are no timings for: context resolution, RAG search, prompt construction, model TTFT (time to first token), or trace assembly. Without these, you cannot identify which step dominates latency.

---

## Primary Goals

1. Reduce response latency for simple in-app questions to sub-2 seconds
2. Reduce unnecessary LLM and RAG usage
3. Avoid blocking the main answer on debug/trace generation
4. Parallelize independent work (tool calls, RAG, context resolution)
5. Improve perceived responsiveness with streaming and progressive hydration
6. Introduce clear routing between fast-path and heavy-path requests

---

## Performance Principles

- Prefer deterministic app logic over model reasoning when the UI already knows the answer
- Resolve scope in code, not in the model, whenever possible
- Use the smallest sufficient model or execution path for the request
- Parallelize non-dependent tool calls
- Cache stable environment/session metadata with short TTL
- Send compact prompts — avoid dumping full JSON blobs
- Defer debug metadata and non-essential formatting
- Stream the answer as early as possible

---

## Latency Lanes

Implement explicit routing into one of four lanes before any LLM call.

### Lane A — UI-known answer (target: < 1 second)

Use when the page already has enough visible/contextual data to answer the question. No LLM call needed, or only a tiny formatting pass with a fast model.

Examples: "which funds do we have", "what environment is this", "what asset am I viewing", "how many investments are in this fund" (when visible_data contains the count).

**Current gap:** `resolve_visible_context_policy()` in `assistant_scope.py` only handles two narrow patterns. Expand it to cover all questions answerable from `context_envelope.ui.visible_data` and `context_envelope.ui.selected_entities`.

### Lane B — Quick tool-backed answer (target: 2–4 seconds)

Use for one or two simple backend lookups.

Examples: `repe.get_environment_snapshot`, `repe.list_funds`, `repe.get_fund`, recent documents, workspace health.

**Current gap:** These go through the full model + multi-round loop even when the intent is obvious.

### Lane C — Analytical answer (target: 4–8 seconds, with progress UI)

Use for SQL generation, chart creation, hybrid RAG retrieval, multi-tool orchestration.

### Lane D — Deep reasoning (target: 8–20 seconds, with progress UI)

Use only for: dashboard composition, vague/ambiguous questions, multi-step synthesis, root cause analysis, complex SQL planning.

**Current gap:** Most questions are pushed into Lane C/D because there is no routing logic.

---

## Required Improvements

### 1. Expand page-context-first execution

**File to modify:** `backend/app/services/assistant_scope.py` — `resolve_visible_context_policy()`

Expand the detection logic to cover more UI-answerable patterns:

- List queries for any entity type (assets, investments, models, pipeline items), not just funds
- Count queries ("how many funds/assets/deals")
- Identity queries ("what environment", "which entity", "what page am I on")
- Metadata queries when the visible record contains the relevant field
- Simple lookups against `selected_entities`

When `disable_tools=True` is set, consider also selecting a smaller/faster model or skipping the LLM entirely for deterministic answers.

### 2. Implement request routing

**File to create:** `backend/app/services/request_router.py`

Before entering `run_gateway_stream()`, classify the request into a lane. Use a combination of:

- Regex/keyword patterns on the user message
- Scope resolution confidence from `resolve_assistant_scope()`
- Visible data availability from `resolve_visible_context_policy()`
- Message length and complexity heuristics

The router should return: `{ lane: "A"|"B"|"C"|"D", model: str, max_tokens: int, skip_rag: bool, skip_tools: bool, max_tool_rounds: int }`

**File to modify:** `backend/app/services/ai_gateway.py` — `run_gateway_stream()`

Use the router output to:

- Skip RAG for Lane A/B when `skip_rag=True`
- Limit tool rounds (`max_tool_rounds=0` for Lane A, `1` for Lane B)
- Adjust `temperature` and `max_tokens`
- Select model override if desired

### 3. Parallelize tool calls within a round

**File to modify:** `backend/app/services/ai_gateway.py`, lines 365–487

Replace the serial `for tool_call in collected_tool_calls.values()` loop with `asyncio.gather()` or `asyncio.TaskGroup()` for independent tool calls within the same round.

```python
# PROPOSED PATTERN
import asyncio

async def _execute_tool_async(tool_def, ctx, raw_args):
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, execute_tool, tool_def, ctx, raw_args)

# In the tool execution section:
tasks = [
    _execute_tool_async(tool_def, ctx, raw_args)
    for tool_call in collected_tool_calls.values()
    # ... (lookup tool_def, prepare raw_args for each)
]
results = await asyncio.gather(*tasks, return_exceptions=True)
```

Emit `tool_call` and `tool_result` SSE events as each completes, not after all finish.

### 4. Make RAG conditional

**File to modify:** `backend/app/services/ai_gateway.py`, lines 188–229

Only run `semantic_search()` when the router says the question likely needs document context. For Lane A and most Lane B requests, skip RAG entirely.

When RAG is needed, run it concurrently with context block construction and conversation history loading.

### 5. Cache environment context

**File to modify:** `backend/app/services/assistant_scope.py` — `_context_base()`

Add an in-memory cache (e.g., `functools.lru_cache` or a TTL dict) for `resolve_env_business_context()` results, keyed by `(env_id, business_id)` with a 5-minute TTL.

Similarly, cache the tool registry's `_build_openai_tools()` output in `ai_gateway.py` (line 257) since it only changes on server restart.

### 6. Compact the system prompt

**File to modify:** `backend/app/services/assistant_scope.py` — `build_context_block()`

- Remove the full `Context envelope JSON: {envelope_json}` dump (line 417). The structured fields above it already contain the same information in a more compact format.
- Limit `_prompt_visible_data()` to only include entity names and IDs, not full metadata dumps, unless the router indicates Lane C/D.
- Cap visible records per category (currently 12; reduce to 6 for Lane A/B).

### 7. Limit conversation history in prompts

**File to modify:** `backend/app/services/ai_gateway.py`, lines 244–253

Add a sliding window: only include the last N messages (e.g., 10) or the last M tokens (e.g., 4000). For Lane A/B, include fewer turns.

### 8. Defer debug trace assembly

**File to modify:** `backend/app/services/ai_gateway.py`, lines 536–593

Split the `done` event into two events:

- `done` — emitted immediately after the last token, containing only: `session_id`, `elapsed_ms`, `execution_path`
- `trace` — emitted after `done`, containing the full trace object

This lets the frontend render the completed answer before the trace is assembled. The `AdvancedDrawer` can show a loading state for the trace tab.

**File to modify:** `repo-b/src/lib/commandbar/assistantApi.ts`

Update SSE parsing to handle the new `trace` event type separately from `done`.

### 9. Add frontend prefetching

**File to modify:** `repo-b/src/lib/commandbar/contextEnvelope.ts` (or a new `prefetch.ts`)

When the Winston panel opens (before the user types anything), fire a lightweight prefetch request that:

- Resolves the current environment context
- Warms the RAG embedding model (optional)
- Pre-builds the context envelope
- Caches the result in memory for the first actual question

**File to modify:** `repo-b/src/components/commandbar/GlobalCommandBar.tsx` (or equivalent)

Trigger prefetch on panel open, not on message submit.

### 10. Stream acknowledgment immediately

**File to modify:** `backend/app/services/ai_gateway.py`

Emit a `status` SSE event immediately after context resolution completes (before RAG, before model call):

```python
yield _sse("status", {
    "message": "Using page context: Meridian Capital Management",
    "lane": router_result.lane,
    "scope": resolved_scope.entity_name or resolved_scope.environment_id,
})
```

The frontend should render this as a subtle status indicator so the user knows processing has started.

### 11. Async chart/dashboard hydration

When Winston generates chart data or dashboard layouts:

- Stream the narrative answer text first
- Emit chart data as a separate SSE event (`chart_data`)
- Let the frontend render chart components asynchronously after the answer is visible

Do not hold the entire response hostage to the slowest widget.

### 12. Add per-step instrumentation

**File to modify:** `backend/app/services/ai_gateway.py`

Add timing measurements for each phase and include them in the trace:

```python
timings = {}
t0 = time.time()

# Context resolution
timings["context_resolution_ms"] = int((time.time() - t0) * 1000)

t1 = time.time()
# RAG search
timings["rag_search_ms"] = int((time.time() - t1) * 1000)

t2 = time.time()
# Prompt construction
timings["prompt_construction_ms"] = int((time.time() - t2) * 1000)

# Model TTFT (time to first token) — track in the streaming loop
# Tool execution — already tracked per tool, add aggregate
# Trace assembly — time the trace construction itself

timings["total_ms"] = int((time.time() - t0) * 1000)
```

Expose these timings in the `trace` SSE event and render them in `AdvancedDrawer.tsx`.

---

## Implementation Priority

Ordered by expected latency impact per engineering effort:

| Priority | Improvement | Expected Impact | Effort |
|----------|-------------|-----------------|--------|
| **P0** | Expand visible-context shortcut (Lane A) | Eliminates LLM call for 30–40% of questions | Small |
| **P0** | Parallelize tool calls | Cuts multi-tool rounds from serial sum to parallel max | Small |
| **P1** | Make RAG conditional | Removes embedding + pgvector query for simple questions | Small |
| **P1** | Request router (lane classification) | Orchestrates all other optimizations | Medium |
| **P1** | Stream status event immediately | Perceived latency drops significantly | Small |
| **P2** | Cache environment context | Removes DB round-trip per request | Small |
| **P2** | Cache tool registry build | Removes repeated schema serialization | Trivial |
| **P2** | Compact system prompt | Reduces prompt tokens by 30–50% | Small |
| **P2** | Limit conversation history | Prevents token bloat in long sessions | Small |
| **P3** | Defer trace assembly | Unblocks answer rendering | Small |
| **P3** | Frontend prefetch on panel open | Warms context for first question | Medium |
| **P3** | Per-step instrumentation | Enables future optimization targeting | Medium |
| **P4** | Async chart hydration | Unblocks answer for dashboard questions | Medium |

---

## Latency Targets

| Lane | Description | Target | Current Estimate |
|------|-------------|--------|------------------|
| A | UI-known answer | < 1 second | 3–5 seconds |
| B | Quick tool-backed | 2–4 seconds | 5–8 seconds |
| C | Analytical (SQL/RAG) | 4–8 seconds | 8–15 seconds |
| D | Deep reasoning / dashboard | 8–20 seconds with progress | 15–30 seconds |

---

## Success Criteria

- Simple page-aware questions (Lane A) feel nearly instant — no spinner, no tool calls visible
- Basic tool-backed answers (Lane B) return in 2–4 seconds consistently
- Heavy analytical requests (Lane C/D) show a status indicator within 500ms and stream tokens within 2 seconds
- Debug mode does not slow the main answer path at all
- The `AdvancedDrawer` trace tab shows per-step timings for every request
- Prompt token count decreases by at least 30% for Lane A/B requests
- Winston feels like an active copilot, not a slow batch processor

---

## Constraints

- Do not break existing tool execution, RAG retrieval, or conversation persistence
- Do not change the SSE event contract in a backward-incompatible way (add new events, don't remove existing ones)
- Do not change database schema without a migration
- Keep the OpenAI fallback path in `route.ts` functional
- All changes must be testable without production data (mock/test fixtures exist)
- Do not make random micro-optimizations — focus on architectural, high-ROI improvements
