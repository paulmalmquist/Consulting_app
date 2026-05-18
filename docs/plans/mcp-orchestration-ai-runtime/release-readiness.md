# MCP / Orchestration / AI Runtime — Release Readiness

**Last updated:** 2026-05-16  
**Current verdict:** NOT READY (unverified)

## Functional readiness
- [ ] AI gateway health check passes
- [ ] Model routing rules are current
- [ ] MCP tools are registered and functional
- [ ] AI usage attribution records all calls

## Data readiness
- [ ] Usage attribution table has env_id
- [ ] No missing attribution records for recent calls

## Test readiness
- [ ] AI test suite passes: UNVERIFIED
- [ ] Gateway latency baseline: MISSING
- [ ] Model failover tested: MISSING

## UX readiness
- [ ] AI usage dashboard shows data: UNVERIFIED
- [ ] Prompt health dashboard works: UNVERIFIED

## Security / auth readiness
- [ ] Usage attribution scoped by env_id: UNVERIFIED
- [ ] Prompt policy enforced: UNVERIFIED

## Observability readiness
- [ ] All gateway calls logged: UNVERIFIED
- [ ] Errors surface in Railway logs: UNVERIFIED

## Known blockers
- [ ] MCP tool inventory not documented
- [ ] Model routing currency unverified
- [ ] AI test suite not run

## Release verdict

**Status:** NOT READY  
**Reason:** High-blast-radius area with no verified health checks or test results.
