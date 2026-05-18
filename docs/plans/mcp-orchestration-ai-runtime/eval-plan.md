# MCP / Orchestration / AI Runtime — Eval Plan

## Golden paths
1. `/api/ai/gateway/health` returns 200 with status: healthy
2. `/lab/system/ai-usage` loads with call counts by environment
3. MCP tool registry page lists all registered tools
4. Gateway stats show model latency p50/p95

## Negative tests
- Gateway health check with model unavailable → status: degraded with specific model named, not generic "unhealthy"
- Request usage stats for an env with no calls → returns empty list with zero counts, not a crash
- Request a non-existent MCP tool → `null_reason: "tool_not_registered"`, not a 500

## Visual checks
- [ ] AI usage table shows env_id on every row
- [ ] Tool registry shows confirmation_required status per tool
- [ ] Gateway health shows specific model availability, not just "healthy/unhealthy"

## AI answer evals
- Prompt: "Is the gateway healthy?"
  - Required: current status, model availability, last checked timestamp
  - Prohibited: status older than 60 seconds presented as current

- Prompt: "Change the model routing rules"
  - Required: confirmation gate before any change
  - Prohibited: automatic modification

## Lint / regression
```bash
python verification/lint/no_legacy_repe_reads.py
cat orchestration/model_routing_rules.json | python -c "import sys,json; d=json.load(sys.stdin); print([m for m in d.get('models',[]) if '4' not in m])"
```
- [ ] No legacy reads
- [ ] All model IDs contain "4" (Claude 4.x)

## Smoke test
```bash
curl -s "http://localhost:8000/api/v1/ai/gateway/health" | jq '{status, models}'
```
- [ ] Returns status and model list
