---
id: meta-prompt-lane-a-data-rendering
kind: prompt
status: active
source_of_truth: false
topic: lane-a-narration-regression
owners:
  - backend
  - repo-b
intent_tags:
  - fix
  - ai-chat
  - lane-a
  - data-rendering
triggers: []
entrypoint: false
handoff_to:
  - winston-chat-workspace
when_to_use: "Fix directive for the Lane A narration-only regression. The AI model generates 1,400+ tokens but the UI only renders a narration promise ('I'll fetch the funds. One moment.') with no data. This is the #1 blocker for demo readiness across all REPE environments."
when_not_to_use: "Do not use for Lane B latency issues, Lane F SQL generation, or unrelated chat workspace builds. Those have their own directives."
surface_paths:
  - backend/app/services/ai_gateway.py
  - backend/app/services/request_router.py
  - backend/app/services/assistant_blocks.py
  - repo-b/src/components/copilot/ConversationViewport.tsx
  - repo-b/src/lib/commandbar/assistantApi.ts
notes:
  - Created 2026-03-26 from demo readiness analysis
  - Companion to META_PROMPT_CHAT_WORKSPACE.md (Bug 0)
  - Must be resolved before any REPE demo can be scheduled
---

# Meta Prompt — Fix Lane A Narration-Only Regression

## For a coding agent. Read this in full before touching any file.

> **The problem in one sentence:** When a user asks "What funds do we have in this environment?" the AI generates ~1,400 tokens but the UI only shows "I'll fetch the environment snapshot to list the funds. One moment." and stops. No data is ever rendered. This blocks every REPE demo.

---

## Repository Rules (inherited)

| Rule | Detail |
|---|---|
| 3 runtimes | `repo-b/` (Next.js 14 App Router), `backend/` (FastAPI + psycopg), `repo-c/` (Demo Lab) |
| Pattern A | `bosFetch()` → `/bos/[...path]` proxy → FastAPI `backend/` |
| Chat gateway | POST `/bos/api/ai/gateway/ask` → `backend/app/routes/ai_gateway.py` |
| Tests after every change | `make test-frontend` and `make test-backend` |
| Never `git add -A` | Stage specific files only |
| `%%` not `%` in psycopg3 | All raw SQL strings |
| All Pydantic models | `extra = "ignore"`, never `extra = "forbid"` |

---

## The Regression Timeline

| Date | Test 1 behavior | Root cause |
|---|---|---|
| 2026-03-23 | Narration only — "I'll look up the active environment's funds now." No data rendered. 1,444 tokens generated. | Lane A (skip_tools=True) generates text but it doesn't render fully |
| 2026-03-24 | Data renders BUT hallucinated fund IDs + raw tool call JSON visible to user (Bug 0). 1,632 tokens. | Tool call annotations injected into Lane A history; model echoes them as content |
| 2026-03-25 | Narration only again — "I'll fetch the environment snapshot to list the funds. One moment." 1,439 tokens. Bug 0 tool spam gone. | Commit `6cfd6234` correctly suppressed tool call injection for Lane A, but exposed the original rendering failure |
| 2026-03-26 | Commit `326d8de8` rerouted simple list queries from Lane A → Lane B as a workaround. Not confirmed deployed. | Workaround, not a fix — adds latency, doesn't fix Lane A itself |

**Key insight:** The Bug 0 fix (commit `6cfd6234`) is correct and should NOT be reverted. The tool call annotation guard (`and not route.skip_tools` at line 3064) prevents real noise from leaking into the UI. The issue is that Lane A has a separate, deeper rendering failure that was always there — Bug 0 just masked it by injecting enough content to make something show up.

---

## What You Must Understand Before Writing Code

### Lane A Architecture

Lane A is the fast-path for simple queries where the answer is already visible in the UI context:

```
Request Router → RouteDecision(lane="A", skip_tools=True, max_tool_rounds=0)
  → ai_gateway.run_gateway_stream()
    → openai_tools = []  (line 3175 in ai_gateway.py)
    → LLM call: gpt-4o-mini, max_tokens=512, temp=0.1
    → Token streaming loop (lines 3266-3310)
    → response_blocks = []  (empty — no tools ran)
    → "done" SSE event emitted with empty blocks
```

Lane A is supposed to work by passing visible UI context (fund names, asset counts, key metrics from the current page) into the system prompt, so the LLM can restate that information without needing tool calls. The idea is: the user sees "3 funds, $2.0B commitments" on the dashboard, asks "What funds do we have?", and Lane A restates the visible data in natural language.

### The Token Mystery

The model generates ~1,400 tokens but only ~25 tokens of narration are visible. Where do the other 1,375 tokens go?

**Investigate these hypotheses IN ORDER (do not skip):**

1. **Hypothesis A: The LLM is generating a "waiting for tools" response followed by data, but the frontend treats the first paragraph as the complete message.**
   - The model may be generating: "I'll fetch the funds. One moment.\n\n[After retrieving data...]\n\nBased on the environment:\n- Fund 1: ...\n- Fund 2: ..."
   - If the frontend has ANY logic that treats an SSE pause, a "done" event with empty blocks, or a "stop" signal as "message complete," it could be truncating after the narration.
   - CHECK: `repo-b/src/lib/commandbar/assistantApi.ts` — how does `streamAi()` handle the token stream? Does it wait for all tokens before rendering, or does it flush and potentially cut off?
   - CHECK: `repo-b/src/components/copilot/ConversationViewport.tsx` — does it have a "message complete" trigger that fires before all tokens arrive?

2. **Hypothesis B: The backend token loop breaks early for Lane A.**
   - At line 3310 in `ai_gateway.py`: `if not collected_tool_calls: break` — this exits the tool-retry loop.
   - But is there also a streaming termination condition that fires when `skip_tools=True` and truncates the token stream?
   - CHECK: The full token loop (lines 3216-3310). Is there a condition where tokens stop being yielded to the SSE stream?
   - CHECK: Is `max_tokens=512` too low? 512 tokens ≈ 380 words. If the model is trying to generate a detailed fund list, it might hit the ceiling and the truncation point happens mid-sentence.

3. **Hypothesis C: The LLM is generating tool call syntax despite having no tools available.**
   - Some models generate `<tool_call>` or function-call-like syntax even when no tools are defined, if the system prompt mentions tool capabilities.
   - The Lane A system prompt may still reference "I can look up funds" or "I have access to tools" — causing the model to hallucinate a tool call attempt, which the backend interprets as a stop condition.
   - CHECK: The system prompt for Lane A (constructed around line 3167). Does it mention tools or capabilities the model might try to invoke?
   - CHECK: Does the OpenAI API response include `finish_reason: "tool_calls"` even though no tools were defined? Some models do this.

4. **Hypothesis D: The visible context is not being passed to Lane A.**
   - If the visible context (fund names, metrics from the page) is empty or not injected into the Lane A prompt, the model has no data to restate. It falls back to: "I'll look it up for you" because it genuinely doesn't know the answer.
   - CHECK: The `visible_context` or `page_context` construction (around line 2759-2767). Is it populated for this query? Log it.
   - CHECK: Does the request classifier actually check for visible context before routing to Lane A, or does it route based on query pattern alone?

5. **Hypothesis E: SSE event ordering — "done" fires before all tokens are flushed.**
   - The backend may be emitting the `done` SSE event before the final token chunks are flushed to the HTTP response.
   - The frontend sees `done`, closes the stream, and any remaining buffered tokens are lost.
   - CHECK: The order of events after the token loop exits. Is there a `yield _sse("done", ...)` that fires before all `yield _sse("token", ...)` calls have been consumed by the client?

---

## Diagnostic Steps (Do These First — Before Writing Any Fix)

### Step 1: Add Temporary Logging to Lane A

**File: `backend/app/services/ai_gateway.py`**

At the entry to the Lane A path (around line 3167 where `if route.skip_tools:` is checked), add:

```python
import logging
logger = logging.getLogger("winston.lane_a_debug")

if route.skip_tools:
    logger.info("=== LANE A DEBUG ===")
    logger.info(f"Query: {user_message[:200]}")
    logger.info(f"Visible context length: {len(visible_context or '')}")
    logger.info(f"System prompt length: {len(system_prompt)}")
    logger.info(f"Max tokens: {max_tokens}")
```

After the token loop completes, add:

```python
    logger.info(f"Total tokens streamed: {token_count}")
    logger.info(f"Collected content length: {len(collected_content)}")
    logger.info(f"Collected content preview: {collected_content[:500]}")
    logger.info(f"Finish reason: {finish_reason}")
    logger.info(f"Response blocks count: {len(response_blocks)}")
```

This tells you exactly:
- Whether visible context is populated
- How many tokens the model actually generated
- What the full response text looks like (is data there but not rendering? or is the model just generating narration?)
- Whether the finish reason is normal (`stop`) or unexpected (`tool_calls`, `length`)

### Step 2: Test Locally

Run the backend locally. Send a test query to the gateway:

```bash
curl -N -X POST http://localhost:8000/api/ai/gateway/ask \
  -H "Content-Type: application/json" \
  -d '{"message": "What funds do we have in this environment?", "environment_id": "<meridian_env_id>", "conversation_id": null}' \
  2>&1 | head -100
```

Watch the SSE stream. Count the `data: {"type":"token",...}` events. If you see 50+ token events followed by a `data: {"type":"done",...}`, the backend is streaming correctly and the issue is frontend. If you see only 5-10 token events, the backend is truncating.

### Step 3: Check the Frontend Token Handler

**File: `repo-b/src/lib/commandbar/assistantApi.ts`**

Find the `streamAi()` function. Trace how it handles `type: "token"` events:
- Does it append to a buffer?
- Does it render incrementally?
- Is there a debounce or batching mechanism that could lose tokens?
- Does it stop processing on `type: "done"` even if token events are still in the buffer?

**File: `repo-b/src/components/copilot/ConversationViewport.tsx`**

Find how messages are assembled from the token stream:
- Is there a `useEffect` that fires on "message complete" and truncates?
- Is there a max-length check?
- Does it wait for `response_blocks` before showing text?

---

## Fix Strategy (After Diagnosis)

Based on the diagnostic findings, apply ONE of these fixes:

### Fix A: If the model is only generating narration (no data in collected_content)

**Root cause:** Lane A's system prompt doesn't contain the visible context, OR the model can't see it, OR max_tokens is too low.

**Fix:**
1. Verify visible context injection. If `visible_context` is empty, trace why. It should contain the fund names, commitments, NAV, etc. from the current page.
2. If visible context is present but the model still narrates, the system prompt instruction is wrong. It likely says something like "You can look up data using your tools" — but Lane A has no tools. Change the Lane A system prompt to explicitly instruct: "Answer the user's question using ONLY the data provided below. Do not promise to look anything up. Do not say 'one moment.' Just answer directly with the data you have."
3. If `max_tokens=512` is causing truncation (`finish_reason: "length"`), increase to 1024 for Lane A.

**System prompt patch for Lane A (insert at line ~3170):**
```python
if route.skip_tools:
    lane_a_instruction = (
        "Answer the user's question directly using the environment data below. "
        "Do NOT say you will 'look up' or 'fetch' anything. "
        "Do NOT promise to retrieve data. "
        "Do NOT say 'one moment' or 'let me check.' "
        "Just answer with the information provided. "
        "If the data below does not contain the answer, say so plainly."
    )
    system_prompt = f"{lane_a_instruction}\n\n{system_prompt}"
```

This is likely the primary fix. The model says "I'll fetch the funds" because its system prompt implies it has tool access. Lane A does NOT have tools. The prompt must tell it to answer from context only.

### Fix B: If the backend is streaming all tokens but the frontend drops them

**Root cause:** Frontend closes the EventSource or stops appending tokens after seeing `done` or after a pause.

**Fix:**
1. In `assistantApi.ts`, ensure token events are processed BEFORE the done handler fires.
2. If using `EventSource`, the `done` event should trigger a "finalize" step that captures the full accumulated text, not a "close and render what you have."
3. Add a small flush delay: after `done`, wait 100ms for any remaining buffered tokens before marking the message complete.

### Fix C: If the model generates tool call syntax despite no tools (finish_reason: "tool_calls")

**Root cause:** Model hallucinating tool calls. The token loop may be treating this as "tool round complete, break."

**Fix:**
1. In the token loop, if `route.skip_tools` and `finish_reason == "tool_calls"`, ignore the tool calls and treat the response as text-only.
2. Extract any text content generated before the hallucinated tool call and emit it as the response.

### Fix D: If none of the above — reroute to Lane B as permanent solution

Commit `326d8de8` already did this for simple list queries. If Lane A is fundamentally broken for data queries (model can't answer from context alone), the pragmatic fix is:

1. Expand the Lane B reroute to cover ALL queries that request specific data (fund lists, asset counts, metric lookups).
2. Reserve Lane A only for true non-data queries: greetings, clarification questions, and meta-conversation.
3. Accept the latency tradeoff (~2-5s Lane B vs <1s Lane A) in exchange for correct data rendering.

This is the FALLBACK if Fixes A-C don't resolve the issue. It is not the preferred solution because it increases latency for every simple query.

---

## The Commit `326d8de8` Workaround Status

Commit `326d8de8` moved simple list queries (`_SIMPLE_LIST_RE` pattern) from Lane A to Lane B. This is deployed to the codebase but Railway deploy status is UNCONFIRMED as of 2026-03-26.

**If this is confirmed deployed and working:** It solves the immediate demo-blocking issue for "What funds do we have?" by routing it to Lane B where tools can fetch real data. However, it does not fix Lane A itself. Any query that still routes to Lane A will exhibit the same narration-only behavior.

**Action:** Confirm Railway deploy status. Then proceed with the diagnostic steps above to fix Lane A proper.

---

## Lane B Latency Issue (Related but Separate)

Lane B latency is worsening: 164ms → 12,534ms → 22,695ms over 3 days. This is likely caused by:

1. **"New Chat" not clearing conversation state** — context window grows with every message in a session, bloating prompt tokens and response time.
2. **Post-tool processing overhead** — tool calls complete in ~100ms but the remaining time is spent on response assembly.

**Do NOT fix this in the same PR as the Lane A fix.** Note it as a follow-up. The Lane A fix is the priority because it blocks demos. Lane B latency is a degradation but Lane B still returns data.

---

## Files to Read Before Starting

Read these files in this order:

1. `backend/app/services/ai_gateway.py` — lines 3060-3100 (Bug 0 fix area), lines 3160-3200 (Lane A setup), lines 3260-3320 (token loop), lines 3690-3760 (response finalization)
2. `backend/app/services/request_router.py` — lines 40-60 (patterns), lines 150-190 (classification logic), lines 320-340 (Lane A routing, recently changed by `326d8de8`)
3. `repo-b/src/lib/commandbar/assistantApi.ts` — find `streamAi()` function, trace token event handling
4. `repo-b/src/components/copilot/ConversationViewport.tsx` — message assembly and rendering
5. `docs/ai-testing/2026-03-25.md` — latest test results showing the regression

---

## Acceptance Criteria

The fix is done when ALL of these pass:

1. **Test 1:** "What funds do we have in this environment?" → Response includes fund names, commitment amounts, NAV, and asset counts. Not just narration.
2. **Test 2:** "Show me a summary of IGF-VII" → Response includes fund metrics (IRR, TVPI, committed, called, NAV). Not narration only.
3. **No Bug 0 regression:** Raw tool call names, validation errors, and internal identifiers NEVER appear in the UI response.
4. **Latency acceptable:** Response begins streaming within 2 seconds for Lane A queries (if Lane A is fixed) or within 5 seconds for Lane B queries (if Lane B workaround is used).
5. **No new regressions in other lanes:** Lane B tool-calling queries still work. Lane F SQL generation is not affected.

### How to Test

```bash
# Backend unit tests
make test-backend

# Frontend tests
make test-frontend

# Manual smoke test (local)
# 1. Start backend: cd backend && uvicorn app.main:app --reload
# 2. Start frontend: cd repo-b && npm run dev
# 3. Navigate to Meridian Capital environment
# 4. Open AI chat
# 5. Type: "What funds do we have in this environment?"
# 6. Verify: fund data appears in the response, not just narration
# 7. Type: "Show me top 5 assets by NOI"
# 8. Verify: asset data appears (may route through Lane F — that's ok)
```

---

## Do NOT Do These Things

1. **Do NOT revert commit `6cfd6234` (Bug 0 fix).** The tool call annotation guard is correct. Reverting it brings back raw tool spam in the UI.
2. **Do NOT increase Lane A complexity** by adding tools to it. Lane A is intentionally tool-free for speed. If it can't answer from context, reroute to Lane B.
3. **Do NOT modify the RunNarrator spec** in META_PROMPT_CHAT_WORKSPACE.md. That's a separate build for Bug 0's full solution. This fix is about Lane A data rendering.
4. **Do NOT chase Lane B latency in this PR.** Separate concern, separate fix.
5. **Do NOT deploy to production without confirming Railway status of existing commits first.** There are 2 pending commits (`fa9372dc` + `6cfd6234`) with unknown deploy status.
