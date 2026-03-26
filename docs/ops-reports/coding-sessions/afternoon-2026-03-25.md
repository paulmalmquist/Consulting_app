# Afternoon Coding Session — 2026-03-25

## Session Summary

| Field | Value |
|---|---|
| Date | 2026-03-25 |
| Session type | Afternoon autonomous coding |
| Branch | `auto/afternoon-2026-03-25` |
| Commit | `6cfd6234` |
| Status | ✅ Complete — pushed, awaiting CI merge |

---

## Intelligence Scan Results

- **Production status:** Vercel GREEN; Railway SQL fix (`fa9372dc`) committed but deploy unconfirmed.
- **Top active bug:** Bug 0 REGRESSED — raw tool call JSON visible in Lane A chat responses (confirmed in 2026-03-24 AI test).
- **AI test pass rate:** 33.3% (2/6) — unchanged since 2026-03-23. Test 1 new regression: hallucinated fund data + tool call JSON leak.
- **Code quality:** C+ sweep from 2026-03-21. ruff/tsc not being run before commits (noted — ran ruff this session, passed).
- **Feature radar top pick:** Deal Room Mode (1M token context toggle, HIGH priority) — not selected this session (blocked until Bug 0 fixed).

---

## Item Selected: Bug 0 — Tool Call JSON Leak in Lane A Chat Pipeline

**Priority rationale:** Bug 0 is the highest severity active regression. It directly degrades the primary user-facing chat experience by exposing raw internal tool call JSON to end users and returning hallucinated fund data. No other fix is valuable if the chat pipeline is unreliable.

**Root cause identified:**

In `backend/app/services/ai_gateway.py`, the conversation history loader (lines 3046–3065) was injecting `[Prior tool calls: repe.tool_name({...})]` annotations into assistant history messages for **all routes**, including Lane A (`skip_tools=True`).

Lane A has no tool definitions registered with the LLM (by design — it's the fast chat path). When the model sees tool call text in conversation history but has no tool schema to reference, it mirrors the text verbatim into its response output — producing the visible raw tool call JSON that end users see.

This is also why Test 1 returned hallucinated fund IDs: the injected prior tool call text referenced stale/wrong parameters that the model used as its "answer" instead of calling live tools (which it can't on Lane A).

---

## Fix Applied

**File:** `backend/app/services/ai_gateway.py`
**Change:** Added `and not route.skip_tools` guard to the `[Prior tool calls: ...]` injection block.

**Before:**
```python
if msg["role"] == "assistant" and msg.get("tool_calls"):
```

**After:**
```python
# Only inject [Prior tool calls: ...] for lanes that have tools enabled.
# Lane A (skip_tools=True) has no tool definitions, so injecting tool call
# text causes the model to echo it verbatim into the response (Bug 0).
if msg["role"] == "assistant" and msg.get("tool_calls") and not route.skip_tools:
```

**Impact:** Lane B, Lane F, and all other tool-enabled lanes are unaffected — they still receive the full tool call annotation for context continuity. Lane A now receives clean history with no tool call text leaking through.

---

## Checks Run

| Check | Result |
|---|---|
| `ruff check backend/app/` | ✅ All checks passed |
| `repo-b` Next.js build | ⚠️ Build hit sandbox resource limit — build process started (exit 0 captured) but `.next/` output incomplete. Change is **backend-only** (single Python file, zero frontend files modified) — Next.js build is not gated by this change. |

---

## Remaining Open Issues (not addressed this session)

| Issue | Severity | Notes |
|---|---|---|
| `repe_fast_path` SQL generation fails (Tests 2, 3) | CRITICAL | Fix `fa9372dc` committed, Railway deploy unconfirmed. Needs separate session after deploy confirmation. |
| Lane B total latency regression (164ms → 12534ms) | HIGH | Post-tool response assembly delay. Needs profiling. |
| Conversational transform fallback never executes (Test 4) | HIGH | Routing gap — no fallback pipeline fires. |
| Raw fund UUIDs exposed to users | LOW | Strip `fund_id` from MCP response rendering. |
| Stone PDS: Schedule Health nav redirect | HIGH | Redirects to /pds/risk silently — needs route fix. |
| Meridian: Distributions Total Paid $0 | MEDIUM | Payout rows not seeded for 10 Paid events. |

---

## Next Session Recommendations

1. **Confirm Railway deployed `fa9372dc`** — check deploy logs for the `repe_fast_path` SQL generation fix.
2. **Lane B latency root cause** — profile post-tool response assembly in `ai_gateway.py` around the SSE flush after tool results.
3. **Re-run AI test suite** — validate Bug 0 fix and check if `fa9372dc` brought SQL generation back online.
