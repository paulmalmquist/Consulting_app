# Meridian / REPE — QA Checklist

**Last verified:** 2026-05-18  
**Verified by:** T1–T6 implementation session

## Manual browser checks
- [ ] `/lab/env/[envId]/re/funds` loads and shows fund list
- [ ] Fund detail page shows KPIs (AUM, IRR, TVPI)
- [ ] Asset list shows properties with correct count
- [ ] Waterfall page shows LP/GP split (not empty)
- [ ] Period close page is accessible and shows status
- [ ] `?audit_mode=1` appended to a fund page renders AuditDrawer
- [ ] Winston AI responds on `/lab/env/[envId]/re/winston`

## API checks
```bash
# Fund list
curl -s http://localhost:8000/api/v1/re/funds -H "Authorization: Bearer $TOKEN" | jq .

# Authoritative state for a known fund/quarter
curl -s "http://localhost:8000/api/v2/re/authoritative?fund_id=XXX&quarter=2024Q4" \
  -H "Authorization: Bearer $TOKEN" | jq .
```
- [ ] Fund list returns expected fund count
- [ ] Authoritative state returns with trust_status field
- [ ] IRR values are in a plausible range (< 100% for mature funds)

## Database checks
```sql
-- After table names confirmed
SELECT fund_id, fund_name FROM [funds_table] LIMIT 10;
SELECT COUNT(*) FROM [snapshots_table] WHERE trust_status = 'released';
```
- [ ] No gross_irr > 100% for mature funds in released snapshots
- [ ] RLS policies enforced on fund/asset tables

## Console / log checks
- [ ] No legacy read violations in backend logs
- [x] `verification/lint/no_legacy_repe_reads.py` passes — 0 violations (verified 2026-05-18)

## Regression checks
- [x] `backend/tests/test_state_lock_invariants.py` passes (verified 2026-05-18)
- [x] `backend/tests/test_irr_engine_sparse.py` passes — 8 tests (new, T6, 2026-05-18)
- [x] `repo-b/src/components/repe/fund/__tests__/FundFootprintMap.test.tsx` passes — 15 source-level dark-mode and T5 regression guards (new, T6, 2026-05-18)
- [x] `repo-b/src/components/repe/portfolio/__tests__/AssetContributionTable.test.tsx` passes — 10 tests including UnavailableCell IRR null behavior (2026-05-18)
- [ ] Authoritative state reads not bypassed by any route

## Fail-closed checks
- [x] IRR < 4 cash flows renders UnavailableTile "insufficient history", not a raw extreme value (T2, 2026-05-18)
- [x] IRR > 200% renders UnavailableTile "early-period outlier", not 456% bare (T2, 2026-05-18)
- [ ] Waterfall-dependent metrics return null + null_reason for unreleased periods
- [ ] No approximation served for carry/promote/gp_share
