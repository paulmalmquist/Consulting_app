# Meridian / REPE — Release Readiness

**Last updated:** 2026-05-16  
**Current verdict:** NOT READY

## Functional readiness
- [ ] Fund list loads with correct data
- [ ] Authoritative state reads work for all released periods
- [ ] Waterfall calculations verified against known outputs
- [ ] Period close workflow is complete
- [ ] IRR outliers resolved (IGF VII, MCOF I)

## Data readiness
- [ ] Fund/asset table schema confirmed
- [ ] Released snapshot count verified
- [ ] No implausible IRR values in released snapshots

## Test readiness
- [ ] `verification/lint/no_legacy_repe_reads.py` passes: UNVERIFIED
- [ ] `backend/tests/test_state_lock_invariants.py` passes: UNVERIFIED
- [ ] Playwright tests for fund flow: MISSING

## UX readiness
- [ ] Fund list renders correctly: UNVERIFIED
- [ ] Audit mode renders AuditDrawer: UNVERIFIED
- [ ] Waterfall page shows real values: UNVERIFIED

## Security / auth readiness
- [ ] RLS on fund/asset tables: UNVERIFIED
- [ ] Cross-tenant isolation: UNVERIFIED

## Observability readiness
- [ ] Financial reads attributed to AI usage service: UNVERIFIED

## Known blockers
- [ ] IRR outliers unresolved
- [ ] Architecture unverified
- [ ] Lint status unknown

## Release verdict

**Status:** NOT READY  
**Blocking:** IRR outliers, unverified authoritative state lint, no Playwright tests.
