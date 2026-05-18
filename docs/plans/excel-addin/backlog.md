# Excel Add-in — Backlog

**Last updated:** 2026-05-16

## Bugs
- [ ] **Add-in load verification** — Verify the add-in loads in Excel Desktop or Excel Online without errors. Check manifest configuration.
- [ ] **Auth flow** — `excel-addin/src/shared/auth.ts` — Verify auth works against the production platform. Determine token storage mechanism.

## UX improvements
- [ ] **Task pane environment selector** — Verify the task pane allows users to select which Novendor environment to query against.

## Backend / API
- [ ] **Custom functions inventory** — `excel-addin/src/custom-functions/functions.ts` — List all custom functions and their API calls.
- [ ] **Write queue targets** — `excel-addin/src/shared/writeQueue.ts` — Identify which tables/endpoints the write queue writes to.

## Data / migrations
- [ ] **Write targets** — Determine which Supabase tables are written to by the write queue.

## Tests
- [ ] **No known unit tests for custom functions** — `excel-addin/src/custom-functions/functions.ts` needs tests.
- [ ] **Write queue integration test** — Verify writes persist correctly.

## Documentation
- [ ] **Custom function reference** — Document available functions, parameters, and return shapes.

## Nice-to-have
- [ ] Formula autocomplete with custom function suggestions
- [ ] In-cell error messages with platform error details

## Completed
_(none yet)_
