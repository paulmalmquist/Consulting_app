# Novendor CRM / Accounting — Release Readiness

**Last updated:** 2026-05-16  
**Current verdict:** NOT READY (unverified)

## Functional readiness
- [ ] CRM contact CRUD works
- [ ] Receipt ingestion works end-to-end
- [ ] Accounting queue renders real data
- [ ] ECC approval flow works

## Data readiness
- [ ] CRM table schema confirmed with RLS
- [ ] Accounting entries table confirmed with RLS
- [ ] No orphaned records from failed ingestion

## Test readiness
- [ ] Unit tests for accounting queue: MISSING
- [ ] Integration tests for receipt intake: MISSING
- [ ] Playwright tests for ECC flows: MISSING

## UX readiness
- [ ] ECC brief page loads without errors: UNVERIFIED
- [ ] ECC approval queue is usable: UNVERIFIED

## Security / auth readiness
- [ ] Cross-tenant CRM isolation: UNVERIFIED
- [ ] Unauthenticated access blocked: UNVERIFIED

## Observability readiness
- [ ] Receipt ingestion events logged: UNVERIFIED
- [ ] Accounting queue operations logged: UNVERIFIED

## Known blockers
- [ ] Architecture not verified against actual Supabase schema
- [ ] No tests exist for core accounting flows

## Release verdict

**Status:** NOT READY  
**Reason:** Architecture unverified. No tests. ECC UI render status unknown.
