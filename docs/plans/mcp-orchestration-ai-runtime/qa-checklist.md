# MCP / Orchestration / AI Runtime — QA Checklist

**Last verified:** Never  
**Verified by:** —

## Manual browser checks
- [ ] `/api/ai/gateway/health` returns healthy status
- [ ] `/lab/system/ai-usage` shows call counts (not empty)
- [ ] Winston responds to a test query in any environment

## API checks
```bash
# Gateway health
curl -s http://localhost:8000/api/v1/ai/gateway/health | jq .

# Winston readiness
curl -s http://localhost:8000/api/v1/ai/gateway/winston-readiness \
  -H "Authorization: Bearer $TOKEN" | jq .
```
- [ ] Health returns {"status": "healthy"} or equivalent
- [ ] Winston readiness returns capability status

## Model routing checks
```bash
# Check model routing rules
cat orchestration/model_routing_rules.json | jq .
```
- [ ] All model IDs are current Claude 4.x IDs
- [ ] No references to deprecated model names

## Console / log checks
- [ ] No unhandled errors in gateway logs
- [ ] AI calls attributed to correct env_id in usage records

## AI test suite
```bash
# Run structured test fixtures
# (verify actual command in docs/ai-test-cases/)
```
- [ ] AI test suite passes

## Regression checks
- [ ] Gateway change does not break any environment's AI features
- [ ] Model routing change does not increase latency unexpectedly

## Fail-closed checks
- [ ] Gateway returns 503 (not 500) when model is unavailable
- [ ] Usage attribution writes even on gateway error
