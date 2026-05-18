# Next Session — Stone PDS

**Last updated:** 2026-05-16

## Copy-paste prompt for next Claude Code session

```
You are working on Stone PDS / Professional Services Analytics in the Novendor / BusinessMachine platform.

Read first:
- docs/plans/stone-pds/architecture.md
- docs/plans/stone-pds/backlog.md
- docs/plans/PDS_DEEP_RESEARCH_PLAN.md
- backend/app/routes/pds_utilization.py
- backend/app/services/pds_utilization.py

Objective:
1. Verify the PDS utilization dashboard renders real data for at least one environment.
2. Identify the Supabase tables for PDS projects, timecards, and utilization.
3. Confirm RLS is enabled on those tables.
4. Check whether pds.py or pds_v2.py is the active API surface and document it.

Files to inspect:
- backend/app/routes/pds.py
- backend/app/routes/pds_v2.py
- backend/app/routes/pds_utilization.py
- backend/app/services/pds_utilization.py
- backend/app/services/pds_revenue.py
- repo-b/src/app/lab/env/[envId]/pds/ (list subdirectories)

Acceptance criteria:
- [ ] PDS table names confirmed in architecture.md
- [ ] Utilization API returns numeric data (verified via curl or test)
- [ ] Active API version (v1 vs v2) documented in architecture.md
- [ ] Any broken flows documented in backlog.md

Tests to run:
cd backend && python -m pytest tests/ -k "pds" -v

Update docs/plans/stone-pds/next-session.md and backlog.md before finishing.
```
