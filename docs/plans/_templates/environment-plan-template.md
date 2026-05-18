# [Environment Name] Plan

## Purpose
What this environment/product area does and who it serves.

## User-facing outcome
What the user should be able to see and do on screen when the environment is working correctly.

## Current implementation map

### Frontend
- Routes: `repo-b/src/app/...`
- Key components: `repo-b/src/components/...`
- API clients: `repo-b/src/lib/...`

### Backend
- Routes: `backend/app/routes/...`
- Services: `backend/app/services/...`
- Schemas: `backend/app/schemas/...`

### Data
- SQL migrations: `repo-b/db/schema/NNN_*.sql`
- Supabase tables: (list tables)
- Key views or functions: (list)

### AI / MCP / Runtime
- MCP tools: `backend/app/mcp/tools/...`
- Assistant runtime: `backend/app/assistant_runtime/...`
- Relevant prompts: `prompts/...`

### Tests
- Unit tests: `backend/tests/...`
- Integration tests: `tests/...`
- Playwright: `repo-b/tests/...`
- Smoke scripts: `scripts/...`

## Known issues
- [ ] (list current bugs, broken flows, missing data, suspicious behavior, test gaps)

## Target state
What "fully functional" means for this environment. Be specific about what a user can do and what the system returns.

## Non-goals
What should not be built in this environment yet.

## Data model and API dependencies
- Tables: (list)
- External APIs: (list)
- Feature flags: (list)
- Environment variables: (list key vars, not values)

## UX / screen success criteria
Specific visible outcomes that prove the environment works:
- [ ] Page loads without 500 or console errors
- [ ] (add environment-specific criteria)

## Testing strategy
- **Unit:** (what to unit test)
- **Integration:** (what to integration test)
- **Playwright:** (key flows to automate)
- **Smoke:** `python scripts/smoke_test.py` or equivalent
- **Seed data:** (what seed data is needed)
- **Migration:** (what migration checks are needed)
- **API health:** (endpoint to curl)
- **Regression:** (what must not break)

## Release gates
- [ ] All unit tests pass
- [ ] No console errors on page load
- [ ] API returns expected shape
- [ ] (add environment-specific gates)

## Risks and pitfalls
- (list likely failure modes, tricky dependencies, performance concerns)

## Open questions
- [ ] (list items requiring confirmation or repo verification)

## Useful future prompts
```
# Next session prompt for [Environment]
You are working on [Environment] in the Novendor / BusinessMachine platform.
Read: docs/plans/[folder]/architecture.md, backlog.md, next-session.md
Objective: [specific goal]
Files to inspect: [list]
Acceptance criteria: [list]
Tests to run: [list]
Update docs/plans/[folder]/next-session.md before finishing.
```
