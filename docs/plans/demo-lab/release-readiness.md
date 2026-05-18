# Demo Lab — Release Readiness

**Last updated:** 2026-05-16  
**Current verdict:** NOT READY (unverified)

## Functional readiness
- [ ] Document upload → RAG query works end-to-end
- [ ] SQL agent returns results without security violations
- [ ] Audit log captures AI interactions
- [ ] HITL review flow is functional

## Data readiness
- [ ] Lab table schema confirmed with RLS
- [ ] Vector index exists and is queryable
- [ ] Pipeline job table tracks status correctly

## Test readiness
- [ ] AI test suite passes: UNVERIFIED
- [ ] Upload → query Playwright tests: MISSING
- [ ] SQL agent security tests: MISSING

## UX readiness
- [ ] Upload page shows ingestion status: UNVERIFIED
- [ ] Chat returns cited responses: UNVERIFIED

## Security / auth readiness
- [ ] SQL agent cannot run destructive queries: UNVERIFIED
- [ ] Cross-env document access impossible: UNVERIFIED
- [ ] RLS on all lab tables: UNVERIFIED

## Observability readiness
- [ ] AI interactions logged to audit: UNVERIFIED

## Known blockers
- [ ] RAG pipeline not end-to-end verified
- [ ] repo-c structure undocumented
- [ ] SQL agent permissions not verified

## Release verdict

**Status:** NOT READY  
**Reason:** Critical security (SQL agent) and pipeline (RAG) verification missing.
