# Next Session — Excel Add-in

**Last updated:** 2026-05-16

## Copy-paste prompt for next Claude Code session

```
You are working on the Excel Add-in in the Novendor / BusinessMachine platform.

Read first:
- docs/plans/excel-addin/architecture.md
- docs/plans/excel-addin/backlog.md
- excel-addin/src/custom-functions/functions.ts
- excel-addin/src/shared/auth.ts
- excel-addin/src/shared/apiClient.ts

Objective:
1. List all custom functions defined in functions.ts and document what API they call.
2. Trace the auth flow to understand how the add-in authenticates.
3. Identify what the write queue writes to and which Supabase tables are involved.
4. Check the API base URL in constants.ts to confirm it points to the correct endpoint.
5. Document findings in docs/plans/excel-addin/architecture.md.

Files to inspect:
- excel-addin/src/custom-functions/functions.ts
- excel-addin/src/shared/auth.ts
- excel-addin/src/shared/apiClient.ts
- excel-addin/src/shared/constants.ts
- excel-addin/src/shared/writeQueue.ts
- backend/app/services/lab_excel.py
- backend/app/schemas/lab_excel.py

Acceptance criteria:
- [ ] Custom function list documented in architecture.md
- [ ] Auth flow documented
- [ ] Write queue targets identified
- [ ] API base URL confirmed correct for production

Tests to run:
cd excel-addin && npm test (if test suite exists)
cd backend && python -m pytest tests/ -k "excel" -v

Update docs/plans/excel-addin/next-session.md and backlog.md before finishing.
```
