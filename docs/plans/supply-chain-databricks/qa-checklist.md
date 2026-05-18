# Supply Chain / Databricks — QA Checklist

**Last verified:** Never  
**Verified by:** —

## Manual browser checks
- [ ] `/lab/env/[envId]/supply-chain` root loads without errors
- [ ] `/lab/env/[envId]/supply-chain/medallion` renders architecture diagram
- [ ] `/lab/env/[envId]/supply-chain/data-products` shows catalog entries
- [ ] `/lab/env/[envId]/supply-chain/forecasting` shows forecast chart
- [ ] `/lab/env/[envId]/supply-chain/genie` accepts a natural language query

## API checks
```bash
# Verify lab environment loads (replace with actual supply chain endpoint after verification)
curl -s http://localhost:8000/api/v1/lab/environments -H "Authorization: Bearer $TOKEN" | jq .
```
- [ ] Backend returns supply chain environment data

## Database checks
- Needs verification: determine if supply chain data is in Supabase or Databricks only

## Console / log checks
- [ ] No 500 errors on any supply chain sub-page
- [ ] No broken API calls in DevTools

## Regression checks
- [ ] Other lab environments unaffected

## Fail-closed checks
- [ ] Genie returns a helpful error if Databricks is unavailable, not a crash
