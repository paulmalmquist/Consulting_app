# META PROMPT: Git Lock Resolution + Winston Chat Pipeline Fix

**Date:** 2026-03-26
**Priority:** CRITICAL
**Branch:** Create `fix/chat-pipeline-2026-03-26` from `main`

---

## PHASE 1: Git Lock Resolution

The repo has stale `.git/index.lock` and `.git/HEAD.lock` files that cannot be removed via `rm` (Operation not permitted). There is also a `.git/index.lock.bak` and `.git/index2` from failed workarounds. An alternate-index commit (128e7b9c) was created but HEAD was never updated to it, so it is a dangling object and harmless.

**Steps:**

1. Kill any running git processes: `pkill -9 git 2>/dev/null; pkill -9 git-remote-https 2>/dev/null`
2. Remove lock files. Try in order until one works:
   - `rm -f .git/index.lock .git/HEAD.lock .git/index.lock.bak .git/index2 .git/objects/maintenance.lock`
   - If permission denied, try: `sudo rm -f .git/index.lock .git/HEAD.lock .git/index.lock.bak .git/index2`
   - If still denied, check immutable attribute: `lsattr .git/index.lock` and clear it: `sudo chattr -i .git/index.lock .git/HEAD.lock`
   - Last resort: `mv .git .git-broken && git clone <remote> . --no-checkout && mv .git-broken/refs .git/ && mv .git-broken/objects .git/ && git checkout main`
3. Clean up stale tmp objects: `find .git/objects -name 'tmp_obj_*' -delete 2>/dev/null`
4. Verify git works: `git status && git log --oneline -3`
5. Confirm HEAD is on the right branch and commit:
   - If on `auto/afternoon-2026-03-25`, switch to main: `git stash && git checkout main && git pull origin main`
   - If main is clean, proceed to Phase 2

**After git is healthy, batch-commit overnight docs:**
```bash
git checkout main && git pull origin main
git add docs/
git diff --cached --stat
git commit -m "docs: daily batch — 2026-03-26"
git push origin main
```

---

## PHASE 2: Merge Auto Branches

Two auto branches have fixes that need to reach production:

```bash
git merge origin/auto/meridian-2026-03-25 --no-edit
git merge origin/auto/afternoon-2026-03-25 --no-edit
git push origin main
```

These bring in:
- `d660aa63` — SQL gen error handling + distribution KPI fix
- `6cfd6234` — Bug 0 fix (suppress tool call injection in Lane A history)

---

## PHASE 3: Fix Lane A Narration-Only Regression

### Problem
"What funds do we have in this environment?" routes to Lane A (`skip_tools=True`) because `request_router.py` line 314-336 matches "fund" in the message against `visible_data.funds`. Lane A has no tools, so the model generates narration text like "I'll fetch the environment snapshot..." but can never actually call `repe.get_environment_snapshot`. The Bug 0 fix (6cfd6234) correctly stopped tool call spam, but the real problem is that fund-listing queries should not be on Lane A when they need tool calls to fetch live data.

### Root Cause
`backend/app/services/request_router.py` lines 314-336: The `_SIMPLE_LIST_RE` + visible_data check sends "What funds do we have" to Lane A because the UI already has fund names in `visible_data.funds`. But the user is asking the AI to describe the funds, which requires calling `repe.get_environment_snapshot` for richer data than what the visible_data summary contains.

### Fix

**File: `backend/app/services/request_router.py`**

The Lane A shortcut for simple list queries (lines 314-336) is too aggressive. It assumes visible_data is sufficient, but users expect Winston to pull live enriched data. Change this block so that fund/asset list queries route to Lane B instead of Lane A:

```python
# Simple list with visible data — route to Lane B (tool-backed) instead of
# Lane A, because users expect enriched responses from live data, not just
# a restatement of what's already on screen.
if _SIMPLE_LIST_RE.search(message) and visible_data:
    for entity_word, records in [
        ("fund", visible_data.funds),
        ("asset", visible_data.assets),
        ("investment", visible_data.investments),
        ("deal", visible_data.investments),
        ("model", visible_data.models),
        ("pipeline", visible_data.pipeline_items),
    ]:
        if records and entity_word in message.lower():
            return RouteDecision(
                lane="B",
                skip_rag=True,
                skip_tools=False,
                max_tool_rounds=2,
                max_tokens=1024,
                temperature=0.2,
                model=OPENAI_CHAT_MODEL_FAST,
                rag_top_k=0,
                rag_max_tokens=0,
                history_max_tokens=1500,
            )
```

Key changes: `lane="A"` -> `lane="B"`, `skip_tools=True` -> `skip_tools=False`, `max_tool_rounds=0` -> `max_tool_rounds=2`, `max_tokens=512` -> `max_tokens=1024`, `history_max_tokens=800` -> `history_max_tokens=1500`.

This means "What funds do we have?" will now call `repe.get_environment_snapshot` via Lane B and return real data.

---

## PHASE 4: Fix "New Chat" Not Clearing Backend Conversation State

### Problem
The frontend `startNewConversation()` in `WinstonChatWorkspace.tsx` (line 141-154) correctly clears React state and sets `conversationId` to `null`. When the next message is sent, `handleSend` (line 208-221) auto-creates a new conversation via `createConversation()`. This SHOULD work.

However, the AI test report says messages were appended to the previous conversation thread. Investigate:

### Diagnosis Steps
1. Check if `createConversation` is failing silently (it's in a try/catch that swallows errors at line 218).
2. Check if the backend `POST /api/ai/gateway/ask` ignores the `conversation_id: null` case and falls back to a session-level conversation lookup.
3. Check if `persistHistoryState` is saving to localStorage correctly.

### Fix

**File: `repo-b/src/components/winston/WinstonChatWorkspace.tsx`**

Add logging and ensure the conversation ID is truly null when sent:

At line 141, add a more thorough cleanup:
```typescript
const startNewConversation = useCallback(() => {
    setMessages([]);
    setWaterfallRuns([]);
    persistHistoryState(contextKey, { messages: [], waterfallRuns: [] });
    setPrompt("");
    setConversationId(null);
    setBusy(false);
    setThinkingStatus(undefined);
    setContextPanel({ tools: [], citations: [] });
    // Clear the context snapshot so the next message fetches fresh context
    setContextSnapshot(null);
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    // Reset token buffer to prevent stale tokens from previous conversation
    tokenBufferRef.current = "";
    if (tokenFlushTimerRef.current) {
      clearTimeout(tokenFlushTimerRef.current);
      tokenFlushTimerRef.current = null;
    }
}, [contextKey]);
```

**File: `backend/app/services/ai_gateway.py`**

Check the conversation history loading path. Around the history loading section (lines 3030-3073), verify: if `conversation_id` is `None` or empty, the history loading block should be completely skipped (producing `history = []`). If there is a fallback that uses `session_id` or `business_id` to find a recent conversation, that is the bug. The backend must respect `conversation_id = null` as "no history."

Search for any code path that resolves a conversation from something other than the explicit `conversation_id` parameter. Likely culprits:
- `ai_conversations.py` `get_messages()` — does it have a session-level fallback?
- `ai_gateway.py` around line 3030 — is there a `get_or_create_conversation` pattern?

---

## PHASE 5: Investigate Lane B Latency Regression

### Problem
Lane B latency has worsened over 3 days: Test 5 went from 164ms to 12,534ms to 22,695ms. Test 6 went from 7,140ms to 17,702ms. The actual tool execution is fast (116ms for Test 5), so the delay is in post-tool LLM response generation.

### Likely Cause
Context window bloat. If "New Chat" doesn't properly clear conversation state (Phase 4), each test run appends messages to a growing conversation. The model takes longer to process larger context.

### Diagnosis
1. After fixing "New Chat" (Phase 4), the latency issue may resolve itself.
2. Check the history token budget enforcement. In `ai_gateway.py` line 3040: `max_history = 6 if route.lane in ("A", "B") else 10`. This limits to 6 messages for Lane B, which should be fine.
3. Check the context window guard at lines 3140-3149: is it actually trimming when needed?
4. Check if the RAG search or context resolution is adding latency. Look at `timings` dict values in the `done` SSE event.
5. Add timing logs around the OpenAI streaming call to separate LLM latency from post-processing latency.

### Quick Win
Add a hard timeout warning at 10s for Lane B responses:
```python
# In the streaming loop, after first_token_time is set:
if first_token_time and (time.time() - first_token_time) > 10 and route.lane == "B":
    emit_log(level="warning", service="backend", action="ai.gateway.lane_b_slow",
             message=f"Lane B response exceeding 10s target",
             context={"elapsed": time.time() - model_start, "tokens": total_completion_tokens})
```

---

## PHASE 6: Verify repe_fast_path SQL Generation

### Problem
All asset-level queries ("Show me top 5 assets by NOI") route to `repe_fast_path` (Lane F) and fail with "I couldn't generate a SQL query" after 12-14s. Returns 0 tokens, 0 tools.

### Root Cause
`backend/app/sql_agent/combined_agent.py` line 145-205: `generate_sql()` makes a single LLM call to convert natural language to SQL. It is either:
1. Not receiving proper schema/catalog context
2. The LLM is returning malformed SQL that gets caught and discarded
3. The function is raising an exception that gets swallowed

### Diagnosis
In `ai_gateway.py` around line 1343-1346 where `generate_sql` is called:

```python
from app.sql_agent.combined_agent import generate_sql
# ...
generated = await generate_sql(...)
```

1. Add a try/except with explicit logging around this call to see what `generate_sql` returns or throws.
2. Check what `catalog` value is being passed. If the catalog (schema context) is empty or wrong, the LLM can't generate SQL.
3. Log the raw LLM response from `generate_sql` before any parsing.
4. Check if the Railway deployment actually has the latest `combined_agent.py` with the `generate_sql` function (commit `fa9372dc` added it but deploy was never confirmed).

### Fix Template
In `combined_agent.py`, add robust error handling and logging:

```python
async def generate_sql(message, *, catalog, business_id, quarter):
    import logging
    logger = logging.getLogger("sql_agent")
    logger.info(f"generate_sql called: message={message[:100]}, catalog_len={len(catalog) if catalog else 0}")

    if not catalog:
        logger.error("generate_sql: empty catalog — cannot generate SQL without schema context")
        return {"sql": None, "error": "No schema catalog provided"}

    # ... existing LLM call ...

    logger.info(f"generate_sql result: {result}")
    return result
```

---

## PHASE 7: Verify and Test

After all fixes:

1. Run `ruff check backend/` and fix any linting issues
2. Run `npx tsc --noEmit` in `repo-b/` to verify TypeScript
3. Test locally if possible:
   - Send "What funds do we have?" — should route to Lane B, call tools, return real data
   - Click "New Chat" — verify conversation_id is null on next request
   - Send "Show me top 5 assets by NOI" — check if SQL generation succeeds with proper catalog
4. Commit to `fix/chat-pipeline-2026-03-26` and push
5. Create PR to main with summary of all fixes

### Expected Test Improvements
- Test 1 (fund query): FAIL -> PASS (Lane A -> Lane B routing fix)
- Test 5 (error recovery): latency should decrease if conversation state properly clears
- Test 6 (greeting): latency should decrease if conversation state properly clears
- Tests 2-3 (SQL gen): depends on whether `generate_sql` catalog issue is found and fixed
- Test 4 (transform): no change expected (separate issue, not addressed here)

---

## File Reference

| File | What to change |
|---|---|
| `.git/index.lock`, `.git/HEAD.lock` | Remove (Phase 1) |
| `backend/app/services/request_router.py` lines 314-336 | Lane A -> Lane B for simple list queries (Phase 3) |
| `repo-b/src/components/winston/WinstonChatWorkspace.tsx` lines 141-154 | Thorough cleanup in startNewConversation (Phase 4) |
| `backend/app/services/ai_gateway.py` lines 3030-3073 | Verify conversation_id=null skips history (Phase 4) |
| `backend/app/services/ai_gateway.py` lines 1343-1346 | Add error logging around generate_sql (Phase 6) |
| `backend/app/sql_agent/combined_agent.py` lines 145-205 | Add catalog validation + logging (Phase 6) |
