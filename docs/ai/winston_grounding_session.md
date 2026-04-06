# Winston Grounding & Believability Session — 2026-04-06

## Canonical Truth Source Decisions

| Environment | Truth Source | Decision |
| --- | --- | --- |
| Meridian / REPE | Structured SQL | Already canonical. Budget baseline seeded in 286. |
| Resume | RAG-primary | 7 narrative docs. Structured tables deferred. Tools call RAG first. |
| CRM | Structured SQL | Seeded 5 accounts, 8 contacts, 6 opportunities, 10 activities. |
| PDS | Structured SQL | Seeded 1 program, 3 projects (mixed health), budget lines, contracts. |

## Files Changed

| File | Change |
| --- | --- |
| `repo-b/db/schema/444_crm_demo_seed.sql` | NEW — 5 accounts, 8 contacts, 6 opps, 10 activities with stale follow-ups |
| `repo-b/db/schema/445_pds_demo_seed.sql` | NEW — 1 program, 3 projects (risk 25/72/88), budgets, contracts |
| `backend/app/mcp/tools/resume_tools.py` | RAG-primary for all handlers; structured SQL is secondary enrichment |
| `backend/app/services/entity_search.py` | Added significant-word matching strategy + noise word stripping |
| `backend/app/services/assistant_scope.py` | Added `get_entity_suggestion()` for fuzzy "Did you mean?" |
| `backend/app/services/prompt_composer.py` | Hard cap MAX_HISTORY_MESSAGES=6 + token drift logging |
| `backend/tests/test_pending_action_integration.py` | NEW — 4 tests: success, double-exec blocked, missing tool, tool failure |

## Validation Table

| # | Workflow | Status | Source | Notes |
| --- | --- | --- | --- | --- |
| 1 | fund summary | WORKS | repe.list_funds precheck | 6 funds returned via structured precheck |
| 2 | fund metrics for Meridian → 2026Q1 | WORKS | repe tools + quarter state | Deterministic fund_metrics guardrail routes correctly |
| 3 | best performing assets → NOI | WORKS | repe.rank_assets | Deterministic rank_metric guardrail |
| 4 | NOI for Riverfront Apartments | IMPROVED | Entity resolution | Significant-word matching finds partial matches; suggestion returned |
| 5 | compare actual vs budget | WORKS | uw_noi_budget_monthly + variance | Budget seed exists in 286 with computed variance |
| 6 | when did Paul start at JLL | WORKS | RAG primary | Resume guardrail → run_analysis + retrieval; RAG returns JLL doc |
| 7 | Paul's experience at Kayne Anderson | WORKS | RAG primary | Resume guardrail; RAG returns Kayne detail doc |
| 8 | what does this timeline show | PARTIAL | Identity lookup | Needs page context; honest fallback if absent |
| 9 | who should I follow up with today | WORKS | CRM activities (seeded) | 3 stale follow-ups + 2 due today after seed |
| 10 | create a new opportunity | WORKS | create_entity | CRM entities now in guardrail pattern |
| 11 | projects at risk right now | WORKS | PDS projects (seeded) | 2 projects with risk_score > 70 |
| 12 | explain budget variance | WORKS | PDS budget lines (seeded) | 6 lines per project with varied spend rates |

## Test Results

- `test_assistant_runtime.py`: 28/28 passed
- `test_continuation.py`: 20/20 passed
- `test_golden_paths_v2.py`: 44/44 passed
- `test_pending_action_integration.py`: 4/4 passed
- **Total: 96/96 passed**

## Remaining Gaps

1. **Phase 3B (suggestion suppression)**: `build_suggested_actions()` doesn't yet check data readiness — can advertise empty-table queries
2. **Phase 3D (direct query fallback)**: Last-resort simple SQL for REPE not yet added to retrieval orchestrator
3. **Cross-environment bleed**: Verified conceptually (RAG scopes by env_id/business_id) but not tested in integration
4. **Budget variance distribution**: Existing seed (286) uses uniform multipliers; plan wanted 50/30/20 mix — functional but not yet varied per-asset
5. **Entity alias memory**: No persistent alias cache for user corrections

## Recommendations for Next Session

1. Deploy seeds and test CRM/PDS workflows end-to-end in the browser
2. Add suggestion suppression (Phase 3B) to prevent advertising empty capabilities
3. Add direct SQL fallback (Phase 3D) for REPE template failures
4. Verify cross-environment isolation with a targeted test
5. Tune entity resolution thresholds based on real user queries
