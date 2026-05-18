# QA Checklist — [Environment]

**Last verified:** YYYY-MM-DD  
**Verified by:** [Claude Code / manual / Playwright]

## Manual browser checks
- [ ] Page loads at expected URL without 500 errors
- [ ] No red console errors on load
- [ ] No broken network requests in DevTools
- [ ] Main data table or KPI cards render with data (not empty or spinner)
- [ ] Filters and interactions work
- [ ] AI/Winston panel responds (if applicable)
- [ ] Auth gate enforced — unauthenticated users redirected

## API checks
```bash
# Replace with actual endpoints
curl -s http://localhost:8000/api/v1/health | jq .
curl -s http://localhost:8000/api/v1/[endpoint] -H "Authorization: Bearer $TOKEN" | jq .
```
- [ ] Returns 200 with expected shape
- [ ] Returns 401 without auth
- [ ] Returns 404 for unknown resource (not 500)

## Database checks
```sql
-- Replace with actual queries
SELECT COUNT(*) FROM [table] WHERE env_id = '[test-env-id]';
```
- [ ] RLS policies enforce tenant isolation
- [ ] Expected seed data exists
- [ ] No orphaned rows from failed transactions

## Console / log checks
- [ ] No unhandled promise rejections
- [ ] No React hydration warnings
- [ ] Backend logs show no stack traces for happy path

## Regression checks
- [ ] Existing environments still load (Control Tower)
- [ ] Auth flow still works
- [ ] Other environments not broken by this change

## Fail-closed checks
- [ ] Missing data returns null/empty, not an error
- [ ] AI responses fail gracefully if model unavailable
- [ ] Unauthorized access returns 401/403, not data
