# Winston Assistant Harness Layer

## Architecture

The harness layer wraps the existing assistant runtime with structured observability and quality enforcement. It lives in `backend/app/assistant_runtime/harness/` and extends the canonical runtime without replacing it.

```
Request → Context Resolution → [PRE_DISPATCH checkpoint]
       → Dispatch Engine → [POST_DISPATCH checkpoint + quality gates]
       → Retrieval → [PRE_TOOL checkpoint]
       → Tool Execution → [POST_TOOL checkpoint]
       → LLM Response → [PRE_RESPONSE checkpoint + final quality gates]
       → TurnReceipt (includes quality_gates field)
```

## Modules

| Module | Purpose |
|---|---|
| `harness_types.py` | LoopPattern, HarnessMode, HarnessConfig, QualityGateResult, LifecycleCheckpoint |
| `quality_gate.py` | 6 deterministic gate checks (no LLM calls) |
| `lifecycle.py` | LifecycleManager records phase checkpoints |
| `loop_controller.py` | Bounded iteration with max_iterations and timeout |
| `audit_logger.py` | Structured logging with correlation IDs |

## Quality Gates

Gates are pure functions that check structural consistency. They run after dispatch and before response assembly.

| Gate | What it checks |
|---|---|
| `context_resolution_sanity` | Skill requiring grounding shouldn't fire with MISSING_CONTEXT |
| `dispatch_consistency` | Lane/skill pairing must be valid |
| `grounding_sufficiency` | Grounding-required skill with empty retrieval and no visible data |
| `write_confirmation_present` | Write intent must produce pending action |
| `response_honesty` | Generic degraded phrases on pages with visible context |
| `lost_followup_context` | Thread entity state exists but context fell to AMBIGUOUS |

Failed gates are logged and included in `TurnReceipt.quality_gates`. Gates are currently log-only (do not alter control flow).

## Thread Entity State

Resolved entities are persisted to `ai_conversations.thread_entity_state` (JSONB). On follow-up turns, the context resolver checks thread state before falling to `AMBIGUOUS_CONTEXT`. This fixes the regression where clarified entity selections were lost between turns.

Flow:
1. User clarifies entity → Winston resolves it
2. Resolved entity persisted to thread state
3. Next turn: context resolver finds entity in thread state
4. Receipt shows `inherited_entity_id` and `inherited_entity_source`

## Harness Modes

| Mode | Gate strictness | Tool use |
|---|---|---|
| `safe` | All gates mandatory | Conservative |
| `standard` | All gates, log-only | Normal |
| `fast` | Lightweight | Read-only preferred |

## Loop Patterns

| Pattern | Max iterations | Use case |
|---|---|---|
| `investigate` | 5 | Entity lookups, metric explanations |
| `analyze` | 3 | Comparative analysis, grounded answers |
| `execute` | 2 | Write operations with confirmation |
| `deploy_verify` | 3 | Post-deploy verification |
| `site_test` | 5 | Live-site eval |

## Validation

```bash
node scripts/validate_harness_runtime.mjs
node scripts/validate_assistant_runtime.mjs
```

## Adding a New Gate

1. Add a function `gate_your_check(**kwargs) -> QualityGateResult` in `quality_gate.py`
2. Add it to `_GATE_FUNCTIONS` list
3. Add to `validate_harness_runtime.mjs` if it should be enforced
