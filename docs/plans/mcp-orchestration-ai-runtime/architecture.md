# MCP / Orchestration / AI Runtime — Architecture

**Last updated:** 2026-05-16  
**Status:** Partially verified

## Frontend map

### Routes
| Route | File | Purpose |
|---|---|---|
| `/lab/system/ai-usage` | `repo-b/src/app/lab/system/ai-usage/` | AI usage dashboard |
| `/api/admin/ai/*` | `repo-b/src/app/api/admin/ai/` | AI admin (prompt health, policy proposals, receipts) |
| `/api/ai/gateway/*` | `repo-b/src/app/api/ai/gateway/` | AI gateway (ask, conversations, health, index, winston-readiness) |
| `/api/ai/operator/*` | `repo-b/src/app/api/ai/operator/` | Operator AI |
| `/api/mcp/*` | `repo-b/src/app/api/mcp/` | MCP context snapshot, plan |

### Components
- `repo-b/src/components/copilot/` — Copilot UI components
- `repo-b/src/components/winston/` — Winston UI components

## Backend map

### Routes
| File | Purpose |
|---|---|
| `backend/app/routes/ai.py` | Core AI routes |
| `backend/app/routes/ai_gateway.py` | AI gateway |
| `backend/app/routes/ai_usage.py` | Usage tracking |
| `backend/app/routes/operator.py` | Operator surface |
| `backend/app/routes/operator_agent.py` | Agent-driven operator |

### Services
| File | Purpose |
|---|---|
| `backend/app/services/ai_client.py` | AI API client |
| `backend/app/services/ai_gateway.py` | Gateway logic |
| `backend/app/services/ai_gateway_logger.py` | Gateway logging |
| `backend/app/services/ai_gateway_stats.py` | Gateway statistics |
| `backend/app/services/ai_conversations.py` | Conversation management |
| `backend/app/services/ai_usage_rules.py` | Usage policy rules |
| `backend/app/services/ai_audit.py` | AI audit |
| `backend/app/services/operator.py` | Operator service |
| `backend/app/services/operator_agent_gateway.py` | Agent routing |
| `backend/app/services/operator_confirm_registry.py` | Confirm step registry |

### Assistant runtime
| File/Dir | Purpose |
|---|---|
| `backend/app/assistant_runtime/` | Core assistant runtime |
| Execution engine | Request routing and execution |
| Context resolver | Per-request context assembly |
| Continuation detector | Multi-turn conversation handling |
| Skill registry | Skill lookup and dispatch |
| Skill router | Route intent to skill |
| Retrieval orchestrator | RAG coordination |

### MCP
| File/Dir | Purpose |
|---|---|
| `backend/app/mcp/tools/` | MCP tool implementations |
| `backend/app/mcp/schemas/` | MCP tool schemas |
| `mcp-servers/outlook-mcp/` | Outlook MCP server |

## Orchestration engine

| File/Dir | Purpose |
|---|---|
| `orchestration/engine/` | Execution engine |
| `orchestration/openclaw/` | OpenClaw orchestration |
| `orchestration/intent_taxonomy.json` | Intent taxonomy |
| `orchestration/model_routing_rules.json` | Model routing rules |
| `orchestration/log_schema.json` | Log schema |
| `orchestration/session_schema.json` | Session schema |
| `orchestration/scope_enforcement.md` | Scope enforcement policy |
| `orchestration/risk_controls.md` | Risk controls |

## Schemas
| File | Purpose |
|---|---|
| `backend/app/schemas/ai_gateway.py` | Gateway schemas |
| `backend/app/schemas/audit.py` | Audit schemas |

## Test map

- `docs/ai-testing/` — latest AI feature test reports
- `docs/ai-test-cases/` — structured test fixtures
- Needs repo verification for `backend/tests/` AI gateway test files

## Needs verification

- [ ] Which MCP tools are registered and active
- [ ] Model routing rules — which models are used for which intent types
- [ ] How the prompt policy is enforced (is there a policy file?)
- [ ] Whether `orchestration/openclaw/` is active or experimental
- [ ] AI usage attribution: how calls are attributed to environments/users
