# Winston Legal — QA Checklist

**Last verified:** Never  
**Verified by:** —

## Manual browser checks
- [ ] `/lab/env/[envId]/legal/contracts` shows contract list (not empty)
- [ ] `/lab/env/[envId]/legal/matters` shows matter list with status
- [ ] `/lab/env/[envId]/legal/outside-counsel` shows spend data
- [ ] AI briefing at `/lab/env/[envId]/legal/ai-briefing` generates a response
- [ ] Knowledge base search returns relevant results

## API checks
```bash
curl -s http://localhost:8000/api/v1/legal/matters -H "Authorization: Bearer $TOKEN" | jq .
curl -s http://localhost:8000/api/v1/legal/contracts -H "Authorization: Bearer $TOKEN" | jq .
```
- [ ] Matters returns list with status field
- [ ] Contracts returns list with at least key_terms or title field

## Database checks
```sql
-- After table names confirmed
SELECT COUNT(*) FROM legal_matters WHERE env_id = '[test-env-id]';
SELECT COUNT(*) FROM legal_contracts WHERE env_id = '[test-env-id]';
```
- [ ] RLS enforced on legal tables

## Console / log checks
- [ ] No errors on contracts page load
- [ ] No errors on AI briefing generation

## Regression checks
- [ ] Seed pack applies without error on fresh environment
- [ ] Other environments unaffected

## Fail-closed checks
- [ ] AI briefing returns graceful error if no documents in knowledge base
- [ ] Unauthenticated access blocked
