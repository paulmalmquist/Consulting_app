# Next Session — Control Tower

**Last updated:** 2026-05-16  
**Priority:** High — this is the meta-surface that all other environments depend on

## Copy-paste prompt for next Claude Code session

```
You are working on Control Tower / Environment Provisioning in the Novendor / BusinessMachine platform.

Read first:
- docs/plans/control-tower/architecture.md
- docs/plans/control-tower/backlog.md
- docs/ENVIRONMENT_BLUEPRINT.md (if it exists)
- backend/app/services/environment_pipeline_v2.py
- backend/app/services/environment_templates_v2.py
- backend/app/services/environment_seed_packs_v2/ (list files)

Objective:
Verify that environment creation works end-to-end. Specifically:
1. Identify the exact Supabase tables used for environment records.
2. Confirm RLS is enabled on those tables.
3. Trace the environment creation flow from the frontend form to the backend service to the database insert.
4. Identify any broken steps in the flow.
5. Document findings in docs/plans/control-tower/architecture.md.

Files to inspect:
- repo-b/src/app/lab/system/control-tower/ (frontend)
- repo-b/src/app/lab/environments/ (frontend)
- backend/app/routes/lab.py
- backend/app/routes/lab_v2.py
- backend/app/services/assistant_environment.py
- backend/app/services/environment_pipeline_v2.py

Acceptance criteria:
- [ ] Environment table name(s) confirmed and documented in architecture.md
- [ ] RLS status confirmed
- [ ] Environment creation flow traced and any broken steps documented in backlog.md
- [ ] Seed pack coverage confirmed (which environment types have seed packs)

Tests to run:
cd backend && python -m pytest tests/ -k "lab or environment" -v

Update docs/plans/control-tower/next-session.md and backlog.md before finishing.
```

## Context notes
- `docs/ENVIRONMENT_BLUEPRINT.md` likely describes the intended model — read it before tracing the implementation
- The seed packs v2 directory currently only shows `legal_ops_starter.py` — determine if others exist
- env_id is the universal tenant isolation key across the entire platform
