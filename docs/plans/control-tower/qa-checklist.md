# Control Tower — QA Checklist

**Last verified:** Never  
**Verified by:** —

## Manual browser checks
- [ ] `/lab/system/control-tower` loads without 500 errors
- [ ] Environment list renders with at least one environment
- [ ] Create environment flow completes without error
- [ ] New environment appears in list after creation
- [ ] Switching to new environment updates the env_id in subsequent API calls
- [ ] `/lab/environments` shows correct environment count

## API checks
```bash
# Health
curl -s http://localhost:8000/api/v1/health | jq .

# List environments (requires auth token)
curl -s http://localhost:8000/api/v1/lab/environments -H "Authorization: Bearer $TOKEN" | jq .
```
- [ ] Returns 200 with environment list
- [ ] Returns 401 without auth

## Database checks
```sql
-- Confirm environment count (replace table name after verification)
SELECT COUNT(*) FROM environments;
SELECT env_id, name, created_at FROM environments ORDER BY created_at DESC LIMIT 10;
```
- [ ] RLS policy exists on environment table
- [ ] env_id is present on all environment rows

## Console / log checks
- [ ] No unhandled errors in browser console on Control Tower load
- [ ] Backend logs show no stack traces for environment list request

## Regression checks
- [ ] Existing environments are still accessible after Control Tower changes
- [ ] Auth flow unaffected

## Fail-closed checks
- [ ] Requesting a non-existent env_id returns 404, not 500 and not another tenant's data
