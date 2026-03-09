---
name: feature-dev
description: >
  Full-cycle feature delivery for the Winston monorepo. Use this skill whenever
  the user describes a new feature, endpoint, component, page, or data model
  change — even if they say "add", "build", "implement", "create", "fix", or
  "wire up". The skill scaffolds code in the right surface (repo-b, backend, or
  repo-c), generates matching tests following the repo's established patterns,
  runs the local test suite, deploys to production, and runs a live smoke pass
  against paulmalmquist.com to confirm the feature actually works end-to-end.
  Trigger this skill any time the user wants to go from idea to confirmed-working
  in production — not just for greenfield features but also for bug fixes,
  schema changes, and test coverage gaps.
---

# Feature Dev — Winston Monorepo

This skill takes a feature from description to confirmed-working in production.
It covers the full cycle: understand → scaffold → test locally → deploy → smoke
prod. The goal is to never leave a feature half-done — either it works against
`paulmalmquist.com` or you surface the failure clearly.

---

## Step 0: Bootstrap CLAUDE.md if missing

Before anything else, check whether `CLAUDE.md` exists at the repo root:

```bash
ls /path/to/repo/CLAUDE.md
```

If it's missing, generate it from `tips.md` — that file is the source of truth for
repo topology, API patterns, test conventions, and deploy procedure. Read `tips.md`
in full, then write `CLAUDE.md` following the structure in `tips.md`'s own sections
1–12 (repo inventory, data flows, env vars, common errors, deploy steps). This
bootstraps the shared memory that the rest of the workflow depends on.

If `CLAUDE.md` already exists, read it now. It contains the repo map, test
conventions, and deploy procedure you'll need for every step below.

---

## Step 1: Clarify scope before writing a line of code

The most expensive mistake is building in the wrong surface. Before touching any
file, establish:

1. **Which runtime owns this feature?**
   - UI-only change → `repo-b/src/` (components, pages)
   - RE v2 data access → `repo-b/src/app/api/re/v2/*` (Next route handler, direct Postgres)
   - Business OS API → `backend/app/routes/`, `backend/app/services/`
   - Demo Lab → `repo-c/app/`
   - Full-stack → identify both sides

2. **What API path does data flow through?**
   - `bosFetch()` → BOS backend (FastAPI)
   - Direct fetch to `/api/re/v2/*` → Next route handler (no FastAPI)
   - `apiFetch()` → Demo Lab backend
   - Check `CLAUDE.md` "Two API patterns" section if unsure

3. **Does this require a schema change?**
   - If yes, identify the table in `repo-b/db/schema/*.sql`
   - Plan the migration before writing service code

4. **What IDs are in scope?** (`env_id`, `business_id`, `fund_id`, `asset_id`, etc.)
   - Most RE flows require both `env_id` and `business_id`
   - Empty-data bugs are almost always a missing context issue

If anything is ambiguous, ask one focused question rather than assuming.

---

## Step 2: Scaffold the implementation

Write code in the correct location based on scope from Step 1. Follow existing
patterns — don't invent new ones.

### Backend (FastAPI in `backend/`)
- Route: `backend/app/routes/<domain>.py` — add a new endpoint function
- Service: `backend/app/services/<domain>.py` — put business logic here, not in routes
- Schema: `backend/app/schemas/<domain>.py` — Pydantic model for request/response
- Pattern: look at an adjacent route/service in the same domain file as your model

### Next route handler (RE v2 style)
- File: `repo-b/src/app/api/re/v2/<resource>/route.ts`
- Use `getPool()` from `@/lib/server/db`
- Return `Response.json(...)` — no FastAPI involved
- Pattern: look at `repo-b/src/app/api/re/v2/dashboards/route.ts` as a reference

### Frontend component/page
- Page: `repo-b/src/app/lab/env/[envId]/<domain>/page.tsx`
- Component: `repo-b/src/components/repe/<domain>/`
- Always check if `env_id`/`business_id` context is needed — use `useReEnv()` hook
- Pattern: look at `repo-b/src/app/lab/env/[envId]/re/dashboards/page.tsx`

### Schema change
- Add or modify the appropriate numbered `.sql` file in `repo-b/db/schema/`
- Never create ad hoc migrations outside this directory

---

## Step 3: Write tests — before verifying manually

Tests should be written as part of the feature, not after. The goal is to make
the test suite tell you whether the feature works, rather than relying on visual
inspection.

### Backend test (always required for backend changes)
Add to `backend/tests/test_<domain>.py`. Use the `FakeCursor` fixture — no real
DB needed. The test should:
- Call the route with a shaped mock response
- Assert the response schema matches the Pydantic model
- Assert edge cases (missing fields, empty arrays, auth failures)

Example pattern from the codebase:
```python
def test_<feature>(client, fake_cursor):
    fake_cursor.return_value = [{"id": "abc", "name": "test"}]
    resp = client.get("/api/<path>?env_id=x&business_id=y")
    assert resp.status_code == 200
    assert resp.json()[0]["name"] == "test"
```

### Next route handler test (for `repo-b/src/app/api/*` changes)
Add a `route.test.ts` alongside the route file. Use Vitest + mocked `getPool`.
Pattern: `repo-b/src/app/api/repe/funds/[fundId]/route.test.ts`

### Playwright E2E test (for user-journey changes)
Add to `repo-b/tests/repe/<feature>.spec.ts`. Use the `installRepeApiMocks`
pattern from `repo-b/tests/repe/repe-workspace.spec.ts`:
- Intercept `**/api/**` with `context.route(...)`
- Build a `MockState` object that evolves as the user interacts
- Assert on what the page renders, not on network calls

### Unit test (for isolated logic)
Add `*.test.ts` alongside the component or lib file if it contains pure logic.
Pattern: `repo-b/src/lib/commandbar/schemas.test.ts`

---

## Step 4: Run the local test suite

Run only the suites affected by your change. Don't run the full suite if you
only changed the backend.

```bash
# Backend change:
make test-backend

# Next route handler change:
make test-frontend

# REPE-specific:
make test-repe

# Schema change — always run this:
make db:verify

# Full-stack:
make test-backend && make test-frontend
```

If any test fails, fix it before proceeding. Don't push and hope CI catches it.

Also run lint/typecheck for the affected surface:

```bash
# Python (backend or repo-c):
source backend/.venv/bin/activate && ruff check backend/app/

# TypeScript (repo-b):
cd repo-b && npx tsc --noEmit
```

---

## Step 5: Commit and deploy

```bash
git add <specific files — never git add -A blindly>
git commit -m "<type>(<scope>): <description>"
git push
```

Then deploy the affected runtime(s):

**Backend changed** → Railway (does not auto-deploy):
```bash
cd backend && railway up --service authentic-sparkle --detach
```
Poll until `SUCCESS`:
```bash
railway deployment list --service authentic-sparkle
curl -s https://authentic-sparkle-production-7f37.up.railway.app/health
```

**Frontend changed** → Vercel deploys automatically from `git push`.
Monitor with:
```bash
gh run list --repo paulmalmquist/Consulting_app --limit 1
```

**Schema changed** → run migrations manually (Railway does NOT auto-migrate):
```bash
make db:migrate
make db:verify
```

Wait for all affected surfaces to be healthy before running smoke tests. A healthy
`/health` endpoint alone doesn't prove new code is live — verify Railway deployment
lineage (`SUCCESS`, timestamped after your push) and Vercel commit SHA match.

---

## Step 6: Production smoke test

Run the smallest possible smoke pass that would catch a regression in your feature.

**For backend API changes** — curl the endpoint directly:
```bash
export BASE="https://authentic-sparkle-production-7f37.up.railway.app"
export BIZ_ID="a1b2c3d4-0001-0001-0001-000000000001"
export ENV_ID="a1b2c3d4-0001-0001-0003-000000000001"

curl -s "$BASE/api/<your-endpoint>?env_id=$ENV_ID&business_id=$BIZ_ID" | python3 -c "
import sys, json; d = json.load(sys.stdin); print(json.dumps(d, indent=2))
"
```

**For Next route handler changes** — curl via the Vercel frontend:
```bash
curl -s "https://www.paulmalmquist.com/api/re/v2/<your-route>" | python3 -c "
import sys, json; d = json.load(sys.stdin); print(json.dumps(d, indent=2))
"
```

**For AI gateway changes**:
```bash
curl -sL -X POST "https://www.paulmalmquist.com/api/ai/gateway/ask" \
  -H "Content-Type: application/json" \
  -H "Cookie: bos_session=..." \
  -d '{"message": "<test question related to your feature>"}' \
  --max-time 30
```

Assert that the response shape matches what the frontend expects. Any 404, 500,
or empty response is a failure — surface the error and diagnose before declaring done.

**For Winston AI responses** — check gateway logs for correct lane routing:
```bash
curl -s "$BASE/api/ai/gateway/logs?limit=5" | python3 -c "
import sys, json
for r in json.load(sys.stdin):
    print(r['route_lane'], r['tool_call_count'], r['message_preview'][:60])
"
```

---

## Step 7: Report

Don't just say "done." Report:
1. What was built and in which file(s)
2. What tests were added and that they pass
3. Which surfaces were deployed and their health status
4. The actual production response from the smoke curl — not "looks good," but the
   real JSON or SSE output

If anything failed in the smoke pass, report the error and your diagnosis. Don't
declare done until production confirms.

---

## Quick reference: which make target to run

| Changed surface | Local test command |
|---|---|
| `backend/app/*` | `make test-backend` |
| `repo-c/app/*` | `make test-demo` |
| `repo-b/src/app/api/*` or components | `make test-frontend` |
| REPE-specific (`re_*.py`, `re/v2/*`) | `make test-repe` |
| Playwright journey | `make test-e2e` |
| SQL schema | `make db:verify` |
| Everything | `make test-backend && make test-frontend && make db:verify` |

## Quick reference: production URLs

| Surface | URL |
|---|---|
| Frontend | `https://www.paulmalmquist.com` |
| BOS backend | `https://authentic-sparkle-production-7f37.up.railway.app` |
| Health check | `https://authentic-sparkle-production-7f37.up.railway.app/health` |
