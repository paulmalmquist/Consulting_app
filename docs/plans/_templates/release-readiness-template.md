# Release Readiness — [Environment]

**Last updated:** YYYY-MM-DD  
**Current verdict:** NOT READY / READY / CONDITIONAL

## Functional readiness
- [ ] Core user flows work end-to-end
- [ ] Data renders correctly for at least one real or seed environment
- [ ] AI/Winston features respond correctly (if applicable)
- [ ] Error states are handled gracefully
- [ ] Loading states are visible and correct

## Data readiness
- [ ] Schema migrations applied cleanly
- [ ] RLS policies enforce tenant isolation
- [ ] Seed data or real data available for demo
- [ ] No known data integrity issues

## Test readiness
- [ ] Unit tests pass: `python -m pytest ...`
- [ ] No Playwright test failures on core flows
- [ ] Smoke test passes: `python scripts/smoke_test.py` (or equivalent)
- [ ] No regressions in other environments

## UX readiness
- [ ] No broken layout at 1280×800
- [ ] No broken layout on mobile (if applicable)
- [ ] No console errors on happy path
- [ ] Copy and labels are accurate

## Security / auth readiness
- [ ] Unauthenticated access blocked
- [ ] Cross-tenant data leakage impossible (RLS verified)
- [ ] No secrets in client-side code

## Observability readiness
- [ ] Key API calls are logged
- [ ] Errors surface in Railway / Vercel logs
- [ ] AI usage is attributed correctly (if applicable)

## Known blockers
- [ ] (list anything that must be resolved before release)

## Release verdict

**Status:** NOT READY  
**Blocking items:** (list)  
**Non-blocking items:** (list)  
**Estimated time to ready:** (estimate)
