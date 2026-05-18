# Senior Housing — QA Checklist

**Last verified:** Never  
**Verified by:** —

## Manual browser checks
- [ ] Senior Housing environment can be created from Control Tower
- [ ] Portfolio overview shows occupancy rate and NOI
- [ ] Asset list shows senior housing properties
- [ ] Operator diagnostics page is accessible

## API checks
```bash
# After identifying the correct endpoints
curl -s http://localhost:8000/api/v1/re/funds -H "Authorization: Bearer $TOKEN" | jq .
```
- [ ] Returns senior housing fund/portfolio data

## Database checks
```sql
-- After confirming data model
SELECT property_type, COUNT(*) FROM re_assets WHERE env_id = '[test-env-id]' GROUP BY property_type;
```
- [ ] Senior housing property type represented in asset table

## Console / log checks
- [ ] No errors on portfolio page load
- [ ] HUD connector calls succeed (or fail gracefully)

## Regression checks
- [ ] REPE environments unaffected by senior housing changes

## Fail-closed checks
- [ ] Missing HUD data returns empty/null, not a crash
