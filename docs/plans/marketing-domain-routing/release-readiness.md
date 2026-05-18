# Marketing / Domain Routing — Release Readiness

**Last updated:** 2026-05-16  
**Current verdict:** CONDITIONAL

## Functional readiness
- [x] Site is live at novendor.ai (production)
- [ ] what-we-do page pending change resolved: PENDING
- [ ] AI concierge backend verified: UNVERIFIED
- [ ] Lead capture writes to CRM: UNVERIFIED

## Data readiness
- [ ] Lead capture table confirmed: UNVERIFIED

## Test readiness
- [ ] Login flow Playwright test: MISSING
- [ ] AI concierge smoke test: MISSING
- [ ] Industry page load tests: MISSING

## UX readiness
- [ ] Homepage positioning reviewed against latest site audit: UNVERIFIED
- [ ] No 500 errors on any marketing page: UNVERIFIED

## Security / auth readiness
- [x] Supabase auth configured
- [ ] Lead capture form has spam protection: UNVERIFIED

## Observability readiness
- [ ] Analytics tracking confirmed: UNVERIFIED

## Known blockers
- [ ] what-we-do page pending change (git status shows M)

## Release verdict

**Status:** CONDITIONAL  
**Blocking:** what-we-do pending change must be resolved. AI concierge and lead capture need verification.  
**Already live:** Site is in production but has unverified components.
