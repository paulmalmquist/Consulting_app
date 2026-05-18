# Novendor CRM / Accounting — QA Checklist

**Last verified:** Never  
**Verified by:** —

## Manual browser checks
- [ ] `/novendor` loads without errors
- [ ] `/lab/env/[envId]/ecc` loads without errors
- [ ] ECC brief shows accounting summary (not empty)
- [ ] ECC approval queue shows pending items
- [ ] Receipt intake accepts a new receipt
- [ ] CRM contact list renders with contacts

## API checks
```bash
# Receipt intake
curl -s -X POST http://localhost:8000/api/v1/nv/receipts/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"amount": 100, "vendor": "Test Vendor"}' | jq .

# CRM contacts
curl -s http://localhost:8000/api/v1/crm/contacts -H "Authorization: Bearer $TOKEN" | jq .
```
- [ ] Receipt intake returns 200 or 201
- [ ] CRM contacts return list shape

## Database checks
```sql
-- After repo verification, replace with actual table names
SELECT COUNT(*) FROM contacts WHERE env_id = '[test-env-id]';
SELECT COUNT(*) FROM receipts WHERE env_id = '[test-env-id]';
```
- [ ] RLS policies enforce tenant isolation on CRM tables
- [ ] RLS policies enforce tenant isolation on accounting tables

## Console / log checks
- [ ] No errors in browser console on ECC load
- [ ] Backend logs show receipt intake events

## Regression checks
- [ ] Other lab environments unaffected by CRM changes

## Fail-closed checks
- [ ] Unauthenticated access to `/api/v1/crm/` returns 401
- [ ] Cross-tenant CRM data not accessible
