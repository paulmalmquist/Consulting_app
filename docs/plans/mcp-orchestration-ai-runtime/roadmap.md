# MCP / Orchestration / AI Runtime — Roadmap

**Last updated:** 2026-05-16

## Phase 0: Stabilize current behavior
- [ ] Verify AI gateway health endpoint returns healthy
- [ ] Verify model routing rules are current (Claude 4.x models)
- [ ] Confirm AI usage attribution records all gateway calls
- [ ] Verify MCP tool registry is complete and accurate

## Phase 1: Make the UI/operator flow coherent
- [ ] AI usage dashboard shows call counts by environment and model
- [ ] Prompt health dashboard shows pass/fail for key prompts
- [ ] Winston readiness endpoint returns current capability status

## Phase 2: Wire deeper data/API behavior
- [ ] Model routing rules updated for new model tiers (Haiku/Sonnet/Opus)
- [ ] Prompt policy proposals surfaced for admin review
- [ ] MCP context snapshots accurate for all active environments

## Phase 3: Testing, instrumentation, release gates
- [ ] AI test suite passes: `docs/ai-test-cases/`
- [ ] Gateway latency benchmarks established
- [ ] Model failover tested (primary model unavailable → fallback)

## Phase 4: Polish / demo readiness
- [ ] AI usage dashboard demo: show cost per environment
- [ ] Prompt health dashboard: live pass/fail for all Winston prompts
- [ ] MCP tool catalog: browsable list of all registered tools

## Reference
- `docs/MCP_SETUP.md`
- `docs/AI_ARCHITECTURE_AND_WORKFLOWS.md`
- `agents/mcp.md`
- `agents/ai-copilot.md`
