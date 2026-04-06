# Winston Verified Remediation Plan

Generated: 2026-04-06
Source: Deep Research Report verification against actual repo code

## Verification Matrix

| # | Report Claim | Verified | Actual Finding |
| --- | --- | --- | --- |
| 1 | Pending action confirm doesn't execute | **TRUE** | `request_lifecycle.py:559-627` returns early with `tools=[]` after marking confirmed. `ai_gateway.py:2917-2971` has augmentation logic that's never reached. |
| 2 | Missing durable slot-filling | **FALSE** | `pending_query.py` + `continuation_detector.py` + `thread_entity_state` in `ai_conversations.py:265-388` — comprehensive and working. |
| 3 | env_id/business_id tool contract mismatch | **TRUE (partial)** | `_strip_schema()` removes env_id/business_id from OpenAI schemas. `_attach_scope()` only injects `resolved_scope` — legacy CRM tools with direct `business_id` fields fail validation. |
| 4 | RE loan schema drift in views | **FALSE** | View `361_re_summary_views.sql:249-255` references `loan.rate` and `loan.id` which match `278_re_financial_intelligence.sql:217-231`. Report compared against old migration. |
| 5 | pgvector CI bootstrap broken | **FALSE (already fixed)** | CI workflow already installs pgvector and runs `CREATE EXTENSION IF NOT EXISTS vector`. |
| 6 | Frontend confirmation masks failures | **TRUE** | `ConfirmationBlock.tsx:53-56` — `setResolved("confirmed")` fires immediately. Fire-and-forget with no error recovery. |
| 7 | Context envelope / launch surface drift | **FALSE** | Backend and frontend contracts are identical JSON files. Frontend imports directly from contract. |
| 8 | Semantic catalog/normalizer/templates linkage | **TRUE (working)** | Fully integrated and functional. |
| 9 | Resume relies on RAG more than structured | **TRUE** | Appropriate for read-oriented use. |
| 10 | Capability graph is scaffolding not runtime | **TRUE (by design)** | Explicitly advisory. Auth enforced by MCP guardrails separately. |

## Top Blockers

### 1. P0: Pending Action Execution After Confirmation

**Root cause:** `request_lifecycle.py:559-627` — confirmation detected, acknowledgment emitted, early return. Tool never executed.

**Files:**
- `backend/app/assistant_runtime/request_lifecycle.py` (lines 559-627)
- `backend/app/services/pending_action_manager.py`
- `backend/app/assistant_runtime/turn_receipts.py`

**Fix:** After marking confirmed, execute stored tool via MCP registry, advance status to executed/failed, emit result in SSE.

### 2. P0: Frontend Confirmation Block Truthfulness

**Root cause:** `ConfirmationBlock.tsx:53-56` optimistic update with no rollback.

**Files:**
- `repo-b/src/components/winston/blocks/ConfirmationBlock.tsx`
- `repo-b/src/components/winston-companion/WinstonCompanionProvider.tsx`
- `repo-b/src/components/copilot/ResponseBlockRenderer.tsx`

**Fix:** Tri-state (null -> pending -> confirmed/failed), driven by backend SSE result.

### 3. P1: Tool Contract Normalization

**Root cause:** `_strip_schema()` removes env_id/business_id but `_attach_scope()` only injects `resolved_scope`.

**File:** `backend/app/assistant_runtime/execution_engine.py` (lines 41-63)

**Fix:** Enhance `_attach_scope()` to re-inject `env_id`/`business_id` for tools that declare them.

### 4. P1: Minimum Response Contract

**Root cause:** Empty/generic responses on tool or LLM failure.

**Fix:** Intent-specific fallback chains per skill_id.

### 5. P0: Continuation Precedence

**Status:** Infrastructure exists and works. Verify runtime check order is correct.

## Implementation Order

```
Phase 1A: Pending Action Execution  [MUST BE FIRST]
   |
   +-- Phase 1B: Frontend Confirmation Truthfulness [depends on 1A]
   +-- Phase 1C: Tool Contract Normalization [independent]
   +-- Phase 1D: Minimum Response Contract [independent]
   +-- Phase 1E: Verify Continuation Precedence [independent]
```
