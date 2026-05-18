# Next Session — MCP / Orchestration / AI Runtime

**Last updated:** 2026-05-16

## Copy-paste prompt for next Claude Code session

```
You are working on MCP / Orchestration / AI Runtime in the Novendor / BusinessMachine platform.
WARNING: This is a high-blast-radius area. Changes affect all environments simultaneously. Do not modify production routing or model configs without verifying the change first.

Read first:
- docs/plans/mcp-orchestration-ai-runtime/architecture.md
- docs/plans/mcp-orchestration-ai-runtime/backlog.md
- docs/AI_ARCHITECTURE_AND_WORKFLOWS.md
- docs/MCP_SETUP.md
- orchestration/model_routing_rules.json

Objective:
1. Verify AI gateway health endpoint returns healthy.
2. Check model routing rules for currency (all Claude 4.x model IDs).
3. List all registered MCP tools in backend/app/mcp/tools/.
4. Verify AI usage attribution records calls with env_id.
5. Run the AI test suite and report pass/fail.

Files to inspect:
- backend/app/routes/ai_gateway.py
- backend/app/services/ai_gateway.py
- orchestration/model_routing_rules.json
- backend/app/mcp/tools/ (list all files)
- backend/app/mcp/schemas/ (list all files)

Acceptance criteria:
- [ ] Gateway health confirmed
- [ ] Model routing rules verified current
- [ ] MCP tool inventory documented in architecture.md
- [ ] AI test suite pass/fail reported

Tests to run:
cd backend && python -m pytest tests/ -k "ai or gateway or mcp" -v

Update docs/plans/mcp-orchestration-ai-runtime/next-session.md and backlog.md before finishing.
```

## Context notes
- Current model IDs: claude-sonnet-4-6, claude-haiku-4-5-20251001, claude-opus-4-7
- `docs/ai-testing/` has the latest automated test results — read before touching AI code
- Model routing changes affect all environments — test in staging first
