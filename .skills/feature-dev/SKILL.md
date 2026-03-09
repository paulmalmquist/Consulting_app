---
name: feature-dev
description: >
  Full-cycle feature delivery for the Winston monorepo. Use this skill whenever
  the user describes a new feature, endpoint, component, page, or data model
  change — even if they say "add", "build", "implement", "create", "fix", or
  "wire up". The skill scaffolds code in the right surface (repo-b, backend, or
  repo-c), generates matching tests following the repo's established patterns,
  ACTUALLY RUNS the local test suite and reports results, deploys immediately to
  production (Railway for backend, Vercel via git push for frontend), and then
  opens a browser to visually walk through paulmalmquist.com to confirm the
  feature is live and working as intended. This is a fast, autonomous, deploy-first
  workflow — no staging, no hand-holding. Trigger this skill any time the user
  wants to go from idea to confirmed-working in production.
---

# Feature Dev — Winston Monorepo

**This skill is autonomous and deploy-first.** The goal is confirmed, visually
verified working code on `paulmalmquist.com` — not a plan, not a proposal, not
proposed code. Execute every step. Don't describe what you would do; do it.

The workflow is: read context → scaffold → run tests → fix failures → deploy →
walk through the live site in a browser → report with screenshots.

---

## Step 0: Read CLAUDE.md NOW — before touching any file

```bash
cat CLAUDE.md
```

If `CLAUDE.md` is missing, read `tips.md` in full and write `CLAUDE.md` from
sections 1–12 (repo inventory, API patterns, env vars, common errors, deploy
procedure). Then `cat` the result before proceeding.

Do not skip this step. CLAUDE.md tells you which runtime owns your feature,
which test command to run, and the exact deploy commands. Getting this wrong
wastes the entire cycle.

---

## Step 1: Identify the surface — answer these before writing code

1. **Which runtime?**
   - UI-only → `repo-b/src/` (components, pages)
   - RE v2 data → `repo-b/src/app/api/re/v2/*` (Next route handler → Postgres, NO FastAPI)
   - Business OS API → `backend/app/routes/` + `backend/app/services/`
   - Demo Lab → `repo-c/app/`
   - Full-stack → identify both sides explicitly

2. **Which API path?**
   - `bosFetch()` → BOS FastAPI backend (port 8000)
   - Direct fetch `/api/re/v2/*` → Next route handler (no FastAPI)
   - `apiFetch()` → Demo Lab (port 8001)

3. **Schema change needed?** If yes, identify the `.sql` file first.

4. **Which IDs are in scope?** (`env_id`, `business_id`, `fund_id`, `asset_id`)
   — empty data is almost always a missing context issue, not a UI bug.

If scope is ambiguous after reading CLAUDE.md, ask one focused question. If it's
clear, proceed immediately.

---

## Step 2: Write the implementation

Write code in the correct location. Follow existing patterns in adjacent files.

### Backend (FastAPI in `backend/`)
- Route: `backend/app/routes/<domain>.py`
- Service: `backend/app/services/<domain>.py` — logic here, not in routes
- Schema: `backend/app/schemas/<domain>.py` — Pydantic request/response models
- Reference: look at an adjacent file in the same domain first

### Next route handler (RE v2)
- File: `repo-b/src/app/api/re/v2/<resource>/route.ts`
- Uses `getPool()` from `@/lib/server/db`, returns `Response.json(...)`
- Reference: `repo-b/src/app/api/re/v2/dashboards/route.ts`

### Frontend
- Page: `repo-b/src/app/lab/env/[envId]/<domain>/page.tsx`
- Component: `repo-b/src/components/repe/<domain>/`
- Always wire `env_id`/`business_id` — use `useReEnv()` hook
- `"use client"` components require `import React from "react"` (Vitest/jsdom doesn't auto-inject)
- Reference: `repo-b/src/app/lab/env/[envId]/re/dashboards/page.tsx`

### Schema change
- Add/modify the numbered `.sql` file in `repo-b/db/schema/`
- Never create migrations outside this directory

---

## Step 3: Write a test — as part of the feature, not after

Write the minimum test that would catch a regression in your specific change.

### Backend test
Add to `backend/tests/test_<domain>.py`. Use `FakeCursor` — no real DB:
```python
def test_<feature>(client, fake_cursor):
    fake_cursor.return_value = [{"id": "abc", "name": "test"}]
    resp = client.get("/api/<path>?env_id=x&business_id=y")
    assert resp.status_code == 200
    assert resp.json()[0]["name"] == "test"
```

### Next route handler test
Add `route.test.ts` alongside the route. Use Vitest + mocked `getPool`.
Reference: `repo-b/src/app/api/repe/funds/[fundId]/route.test.ts`

### Playwright E2E
Add to `repo-b/tests/repe/<feature>.spec.ts`. Use `installRepeApiMocks` pattern
from `repo-b/tests/repe/repe-workspace.spec.ts`. Assert on page renders, not
network calls.

---

## Step 4: EXECUTE the local test suite — report actual output

**This step requires running real commands and capturing real output.**
Do not skip, do not summarize what the output "would be."

```bash
# Backend change:
cd /path/to/repo && make test-backend 2>&1 | tail -30

# Next route handler / frontend change:
cd /path/to/repo && make test-frontend 2>&1 | tail -30

# REPE-specific:
make test-repe 2>&1 | tail -30

# Schema change:
make db:verify 2>&1

# Full-stack:
make test-backend 2>&1 | tail -20 && make test-frontend 2>&1 | tail -20
```

**If tests fail:** read the error, fix the code, re-run. Don't move to Step 5
until tests pass. Report the final passing output in your Step 7 summary.

Also run lint for the affected surface:
```bash
# Python:
source backend/.venv/bin/activate && ruff check backend/app/ 2>&1

# TypeScript:
cd repo-b && npx tsc --noEmit 2>&1 | head -20
```

---

## Step 5: Deploy — immediately, don't wait for permission

Tests pass → deploy. This app is on Vercel + Railway. No staging environment.

```bash
# Stage and commit:
git add <specific files — never `git add -A` blindly>
git commit -m "<type>(<scope>): <short description>"
git push
```

**Frontend changed → Vercel auto-deploys from git push.** Poll for READY:
```bash
gh run list --repo paulmalmquist/Consulting_app --limit 3
```
Wait for the top run to reach `completed / success`. Then verify the Vercel
deployment is READY and the commit SHA matches your push.

**Backend changed → Railway does NOT auto-deploy.** Run manually:
```bash
cd backend && railway up --service authentic-sparkle --detach
```
Poll until `SUCCESS`:
```bash
railway deployment list --service authentic-sparkle | head -5
curl -s https://authentic-sparkle-production-7f37.up.railway.app/health
```
Confirm the deployment timestamp is after your push before declaring it live.

**Schema changed → migrate manually** (Railway does NOT auto-migrate):
```bash
make db:migrate 2>&1
make db:verify 2>&1
```

---

## Step 6: Curl smoke — confirm the API is live

Run a curl against the deployed endpoint to verify the new code is actually
serving. Use production seed IDs from CLAUDE.md.

```bash
export RAIL="https://authentic-sparkle-production-7f37.up.railway.app"
export VERC="https://www.paulmalmquist.com"
export BIZ="a1b2c3d4-0001-0001-0001-000000000001"
export ENV="a1b2c3d4-0001-0001-0003-000000000001"

# Backend endpoint:
curl -s "$RAIL/api/<your-endpoint>?env_id=$ENV&business_id=$BIZ" \
  | python3 -m json.tool

# Next route handler (via Vercel):
curl -s "$VERC/api/re/v2/<your-route>?env_id=$ENV" \
  | python3 -m json.tool
```

A 404 or 500 means the deploy didn't take or there's a runtime error.
Read the response body, diagnose, fix, re-deploy. Don't proceed to Step 7
until you have a successful response shape.

---

## Step 7: Visual browser verification on paulmalmquist.com

**This step is required.** Open a browser and walk through the live site to
confirm the feature is visually working as intended — not just API-healthy.

Use the browser tools to:
1. Navigate to the relevant section of `https://www.paulmalmquist.com`
   (e.g. the RE dashboard page, the specific lab env, the fund view)
2. Trigger the feature the way a real user would
   (click the button, submit the form, open the panel)
3. Confirm the expected UI change is present and correct
4. Take a screenshot as evidence

If the UI doesn't reflect the change, check:
- Is the Vercel deployment READY with the correct commit SHA?
- Is the component pulling from the correct API path?
- Is `env_id`/`business_id` context populated? (open browser devtools → Network)
- Did the browser cache an old build? (hard refresh: Ctrl+Shift+R)

Don't declare done until a screenshot confirms the feature works visually.

---

## Step 8: Report — with evidence, not assertions

Report exactly:
1. **What was built** — file paths changed/created
2. **Test result** — the actual passing test output (last N lines of `make test-*`)
3. **Deploy status** — Railway `SUCCESS` timestamp or Vercel commit SHA
4. **Curl smoke result** — the actual JSON response from production
5. **Screenshot** — the live site showing the feature working

"It should work" is not a report. The actual output is the report.

---

## Quick reference

| Surface changed | Run locally | Deploy command |
|---|---|---|
| `backend/app/*` | `make test-backend` | `railway up --service authentic-sparkle --detach` |
| `repo-c/app/*` | `make test-demo` | (repo-c deploy — see tips.md) |
| `repo-b/src/app/api/*` | `make test-frontend` | `git push` → Vercel auto |
| `repo-b/src/components/*` | `make test-frontend` | `git push` → Vercel auto |
| REPE-specific | `make test-repe` | depends on surface |
| SQL schema | `make db:verify` | `make db:migrate` then `make db:verify` |
| Full-stack | `make test-backend && make test-frontend` | both of the above |

| URL | Purpose |
|---|---|
| `https://www.paulmalmquist.com` | Live frontend — visual verification target |
| `https://authentic-sparkle-production-7f37.up.railway.app` | BOS backend |
| `https://authentic-sparkle-production-7f37.up.railway.app/health` | Backend health |
