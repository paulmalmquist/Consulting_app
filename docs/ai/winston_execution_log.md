# Winston Remediation Execution Log

## Session: 2026-04-06

### Phase 0: Verification — COMPLETE
- Read deep research report (10 major claims)
- Launched 3 parallel exploration agents to verify claims against actual code
- Found 3 claims FALSE: slot-filling exists, no context drift, RE loan schema correct
- Found 4 claims TRUE: pending action execution, frontend masking, tool contract, capability graph advisory
- Wrote verified remediation plan at `docs/ai/winston_verified_remediation_plan.md`

### Phase 1A: Pending Action Execution — COMPLETE
Files changed:
- `backend/app/assistant_runtime/turn_receipts.py` — Added EXECUTED/FAILED to PendingActionStatus enum
- `backend/app/services/pending_action_manager.py` — Added tool_name column, `_ensure_tool_name_column()`, `execute_confirmed_action()` with atomic claim + audit receipt logging
- `backend/app/assistant_runtime/request_lifecycle.py` — Replaced confirm early-return (lines 559-627) with execution flow that calls `execute_confirmed_action()` and emits `pending_action_result` in done SSE
- `backend/app/services/ai_gateway.py` — Added `tool_name=tool_name` to `create_pending_action()` call

### Phase 1B: Frontend Confirmation Block Truthfulness — COMPLETE
Files changed:
- `repo-b/src/components/winston/blocks/ConfirmationBlock.tsx` — Tri-state (idle → pending → executed/failed/cancelled) with spinner, retry on failure, backend-driven resolution
- `repo-b/src/components/copilot/ResponseBlockRenderer.tsx` — Added `executionResult` prop, threads to ConfirmationBlock
- `repo-b/src/components/winston-companion/WinstonCompanionProvider.tsx` — Added `pendingActionResult` to LaneState, extracted from done SSE `pending_action_result`
- `repo-b/src/components/winston-companion/WinstonCompanionSurface.tsx` — Passes `activeState.pendingActionResult` to ResponseBlockRenderer

### Phase 1C: Tool Contract Normalization — COMPLETE
Files changed:
- `backend/app/assistant_runtime/execution_engine.py` — Enhanced `_attach_scope()` to re-inject `env_id` and `business_id` for legacy tools (maps `environment_id` → `env_id`)

### Phase 1D: Minimum Response Contract — COMPLETE
Files changed:
- `backend/app/assistant_runtime/turn_receipts.py` — Added NO_RESPONSE to DegradedReason enum
- `backend/app/assistant_runtime/degraded_responses.py` — Added `_SKILL_FALLBACKS` dict with intent-specific messages, `empty_response_fallback()` function, NO_RESPONSE handling in `_build_context_message()`
- `backend/app/assistant_runtime/request_lifecycle.py` — Added minimum response safety net: if LLM returns empty content and no response blocks, emit intent-specific fallback

### Phase 1E: Continuation Precedence — COMPLETE
Files changed:
- `backend/app/assistant_runtime/request_lifecycle.py` — Enhanced continuation bypass to use `is_continuation()` from `continuation_detector.py` for value-type replies (quarters, metrics, numbers), not just confirmation patterns

### Test Results
- `test_assistant_runtime.py`: 28/28 passed
- `test_continuation.py`: 20/20 passed
- TypeScript: Clean compilation, no errors

---

## Files Changed Summary

| File | Changes |
| --- | --- |
| `backend/app/assistant_runtime/request_lifecycle.py` | Confirm execution flow, continuation precedence, minimum response contract |
| `backend/app/services/pending_action_manager.py` | tool_name column, execute_confirmed_action(), audit receipts |
| `backend/app/assistant_runtime/turn_receipts.py` | EXECUTED, FAILED, NO_RESPONSE enum values |
| `backend/app/assistant_runtime/execution_engine.py` | _attach_scope() env_id/business_id injection |
| `backend/app/assistant_runtime/degraded_responses.py` | Intent-specific fallbacks, empty_response_fallback() |
| `backend/app/services/ai_gateway.py` | tool_name param in create_pending_action call |
| `repo-b/src/components/winston/blocks/ConfirmationBlock.tsx` | Tri-state UI with backend-driven resolution |
| `repo-b/src/components/copilot/ResponseBlockRenderer.tsx` | executionResult prop threading |
| `repo-b/src/components/winston-companion/WinstonCompanionProvider.tsx` | pendingActionResult in LaneState |
| `repo-b/src/components/winston-companion/WinstonCompanionSurface.tsx` | Pass executionResult to renderer |
| `docs/ai/winston_verified_remediation_plan.md` | Verification matrix + plan |
| `docs/ai/winston_golden_paths.md` | Golden path test specifications |

## Remaining Known Gaps

1. **CRM tool confirmation pattern** — CRM write tools (create_account, etc.) don't use pending action flow; they have `confirm` fields but bypass the lifecycle
2. **Resume outreach draft/send** — New feature not yet built (Phase 3 in plan)
3. **PDS write tools** — Not yet implemented
4. **Schema drift detection automation** — No CI guard for column/view drift
5. **Docker cache pruning in deploy** — Not addressed (operational)
6. **Capability graph fed into UI prompts** — Advisory only, not surfaced to users

## Commands to Verify

```bash
# Backend syntax
python -c "import ast; ast.parse(open('backend/app/assistant_runtime/request_lifecycle.py').read())"
python -c "import ast; ast.parse(open('backend/app/services/pending_action_manager.py').read())"

# Backend tests
python -m pytest backend/tests/test_assistant_runtime.py -x -q
python -m pytest backend/tests/test_continuation.py -x -q

# Frontend types
cd repo-b && npx tsc --noEmit
```

## Highest-Risk Unresolved Issues

1. **execute_confirmed_action() untested in integration** — No DB + MCP registry available in unit tests; needs a live test with real pending action row
2. **Legacy pending actions without tool_name** — Will fail gracefully ("tool not found") but won't execute; manual resolution needed for any pre-existing confirmed actions
3. **env_id naming mismatch** — ResolvedAssistantScope uses `environment_id` (str), CRM tools use `env_id` (str); mapping is in place but not integration-tested

---

## Phase 2/3: Behavior Correctness + Data Grounding (2026-04-06, continued)

### Live Behavior Audit Results

| # | Query | Before Fix | After Fix | Root Cause |
| --- | --- | --- | --- | --- |
| 1 | fund summary | LLM-dependent routing | **Deterministic** → lookup_entity + retrieval | Missing guardrail |
| 2 | fund metrics for X | LLM-dependent routing | **Deterministic** → explain_metric + retrieval | Missing guardrail |
| 3 | best performing assets | Already deterministic | **OK** (rank_metric) | N/A |
| 4 | NOI for Riverfront Apts | Already deterministic | **OK** (explain_metric) — entity resolution improved | Entity name extraction |
| 5 | compare actual vs budget | Already deterministic | **OK** (explain_metric_variance) — honest degradation if no data | N/A |
| 6 | when did Paul start at JLL | LLM-dependent | **Deterministic** → run_analysis + retrieval (RAG) | Missing resume guardrail |
| 7 | summarize Paul's Kayne exp | LLM-dependent | **Deterministic** → run_analysis + retrieval (RAG) | Missing resume guardrail |
| 8 | what does this timeline show | Deterministic (identity) | **OK** (lookup_entity) — needs page context | N/A |
| 9 | who should I follow up with | LLM-dependent | **Deterministic** → lookup_entity + retrieval | Missing CRM guardrail |
| 10 | create a new opportunity | Already deterministic | **OK** (create_entity) — now covers CRM entities | Pattern was too narrow |

### Fixes Applied

**1. Deterministic Dispatch Guardrails** (`dispatch_engine.py`)
- Added `_FUND_SUMMARY_RE` — matches "summary of funds", "list funds", "portfolio overview", etc.
- Added `_FUND_METRICS_RE` — matches "fund metrics for X", "get metrics for X"
- Added `_RESUME_QUERY_RE` — matches "when did Paul", "Paul's experience", "Kayne Anderson", "JLL", etc.
- Added `_CRM_ACTIVITY_RE` — matches "follow up", "pipeline summary", "list accounts/leads"
- Expanded `_CREATE_ENTITY_RE` — now includes opportunity, account, lead, activity, contact, engagement, proposal

**2. Entity Name Extraction** (`assistant_scope.py`)
- Added `_extract_entity_candidates()` — extracts entity names from natural language using "for X", "of X", "at X", "in X" patterns
- `_match_db_entity()` now tries extracted candidates before full message, improving fuzzy match scores

**3. Skill-Specific Fallbacks** (`degraded_responses.py`)
- Added fallbacks for: rank_metric, explain_metric, explain_metric_variance, run_analysis, lookup_entity
- Each fallback gives specific guidance instead of generic apology

### Files Changed (Phase 2/3)

| File | Changes |
| --- | --- |
| `backend/app/assistant_runtime/dispatch_engine.py` | 4 new deterministic guardrails, expanded create_entity pattern |
| `backend/app/services/assistant_scope.py` | Entity name extraction + multi-candidate search |
| `backend/app/assistant_runtime/degraded_responses.py` | 5 new skill-specific fallbacks |
| `backend/tests/test_golden_paths_v2.py` | 44 golden path tests (NEW) |

### Test Results (Phase 2/3)
- `test_assistant_runtime.py`: 28/28 passed
- `test_continuation.py`: 20/20 passed
- `test_golden_paths_v2.py`: 44/44 passed
- **Total: 92/92 passed**

### Before vs After

| Metric | Before | After |
| --- | --- | --- |
| Deterministic routing coverage | 4/10 queries | **9/10 queries** |
| Entity name extraction | Full message only | Extracted candidates + full message fallback |
| Skill-specific fallbacks | 8 skills | **12 skills** |
| Golden path test coverage | 0 tests | **44 tests** |

## Recommendation for Next Session

1. Deploy and test the pending action execution flow end-to-end with a real "create fund" flow
2. Add integration tests for the full confirm → execute → UI update cycle
3. Begin Phase 2 (CRM tool confirmation patterns) if Phase 1 is verified working
4. Consider Phase 3 (resume outreach) based on user priority
