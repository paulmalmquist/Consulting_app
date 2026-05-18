# Next Session — Winston Legal

**Last updated:** 2026-05-16

## Copy-paste prompt for next Claude Code session

```
You are working on Winston Legal in the Novendor / BusinessMachine platform.

Read first:
- docs/plans/winston-legal/architecture.md
- docs/plans/winston-legal/backlog.md
- backend/app/services/environment_seed_packs_v2/legal_ops_starter.py
- backend/app/routes/winston_contract_admin.py
- backend/app/routes/legal_ops.py

Objective:
1. Apply the legal ops seed pack on a test environment and verify it creates usable demo data.
2. Identify the Supabase tables for legal matters, contracts, and documents.
3. Confirm RLS is enabled on those tables.
4. Determine what AI capabilities are available in winston_contract_admin.py.
5. Document findings in docs/plans/winston-legal/architecture.md.

Files to inspect:
- backend/app/services/environment_seed_packs_v2/legal_ops_starter.py
- backend/app/routes/legal_ops.py
- backend/app/routes/winston_contract_admin.py
- backend/app/schemas/legal_ops.py
- repo-b/src/app/lab/env/[envId]/legal/ (list subdirectories)

Acceptance criteria:
- [ ] Legal table names confirmed in architecture.md
- [ ] RLS status confirmed
- [ ] Seed pack verified (creates matters and contracts)
- [ ] Winston contract admin AI capabilities documented

Tests to run:
cd backend && python -m pytest tests/ -k "legal or winston" -v

Update docs/plans/winston-legal/next-session.md and backlog.md before finishing.
```
