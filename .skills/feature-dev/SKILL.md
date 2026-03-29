---
id: feature-dev
kind: skill
status: active
source_of_truth: true
topic: feature-delivery
owners:
  - backend
  - repo-b
  - repo-c
  - scripts
  - orchestration
intent_tags:
  - build
  - bugfix
triggers:
  - implement
  - fix
  - build
  - add
  - wire up
entrypoint: true
handoff_to:
  - builder-winston
when_to_use: "Use when the user wants code written or behavior changed in a Winston repo surface."
when_not_to_use: "Do not use for deploy-only, sync-only, research-only, or QA-only requests after CLAUDE.md has already selected a narrower workflow."
surface_paths:
  - backend/
  - repo-b/
  - repo-c/
  - scripts/
  - orchestration/
name: feature-dev
description: "Full-cycle feature delivery for the Winston monorepo. Use this skill whenever the user describes a new feature, endpoint, component, page, bug fix, or data model change, including add, build, implement, create, fix, or wire up requests."
---

# Feature Dev — Winston Monorepo

Selection and owning-surface routing live in `CLAUDE.md`. This skill starts after the primary repo surface has already been chosen.

## BANNED PATTERNS — violations mean the task is INCOMPLETE

```
- Writing a code block without executing it when you have shell access
- Saying "the tests should pass" without running them
- Describing a deployment without running the deploy command
- Using "would", "could", or "should" in completion statements
- Showing terminal commands without executing them
- Saying "done" without a smoke test HTTP status code
```

Replace "this would work" with "I ran this and the output was..."

---

## Workflow States — MANDATORY, follow in order

You CANNOT reach COMPLETE without passing through every state.
A response without terminal output from the TESTING state is INCOMPLETE.

## Database Rules — mandatory for any schema-affecting task

Read [`ARCHITECTURE.md`](/Users/paulmalmquist/VSCodeProjects/BusinessMachine/Consulting_app/ARCHITECTURE.md) before editing [`repo-b/db/schema/`](/Users/paulmalmquist/VSCodeProjects/BusinessMachine/Consulting_app/repo-b/db/schema).

1. Every `CREATE TABLE` must be paired with `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` and a tenant-isolation policy.
2. Every new user-facing table must include `env_id TEXT NOT NULL` and `business_id UUID NOT NULL` unless `ARCHITECTURE.md` exempts it.
3. Before creating a table, confirm an equivalent table does not already exist.
4. Migration names must follow `NNN_module_description.sql`.
5. Only approved prefixes from `ARCHITECTURE.md` may be used.
6. New indexes require a specific query-path justification.
7. Add `COMMENT ON TABLE` for every new table.

### STATE: orienting
- Read CLAUDE.md: `cat CLAUDE.md`
- If schema may change, read ARCHITECTURE.md: `cat ARCHITECTURE.md`
- Identify which runtime owns this feature (repo-b, backend, repo-c)
- Confirm: "I will modify files ONLY in `<service>/`"
- Run baseline tests to confirm they pass BEFORE you write anything:
  - backend change → `make test-backend 2>&1 | tail -5`
  - frontend change → `make test-frontend 2>&1 | tail -5`
- If baseline is red: STOP. Report. Do not proceed.
- Valid transition → **implementing**

### STATE: implementing
- Write minimal code changes to actual files
- Follow existing patterns in adjacent files — don't invent new ones
- REQUIRES: code written to actual files (not just displayed)
- Valid transition → **testing**

### STATE: testing
- Run `make test-{service}` — paste the FULL last 30 lines of output
- If tests fail → read error → fix → return to **implementing**
- REQUIRES: `make test-backend` exit code 0 OR `make test-frontend` exit code 0
- REQUIRES: actual terminal output pasted, not described
- Valid transition → **deploying**

### STATE: deploying
- `git add <specific files>` — never `git add -A`
- `git commit -m "<type>(<scope>): <description>"`
- `git push`
- Frontend → Vercel auto-deploys. Poll: `gh run list --limit 3`
- Backend → `cd backend && railway up --service authentic-sparkle --detach`
  Poll: `railway deployment list --service authentic-sparkle | head -5`
- Schema changed → `make db:migrate && make db:verify`
- REQUIRES: deploy command executed with output captured
- Valid transition → **verifying**

### STATE: verifying
- Curl the deployed endpoint — paste the actual response:

```bash
export RAIL="https://authentic-sparkle-production-7f37.up.railway.app"
export VERC="https://www.paulmalmquist.com"
export BIZ="a1b2c3d4-0001-0001-0001-000000000001"
export ENV="a1b2c3d4-0001-0001-0003-000000000001"

# Next route handler:
curl -s "$VERC/api/re/v2/<your-route>?env_id=$ENV" | python3 -m json.tool

# BOS backend:
curl -s "$RAIL/api/<your-route>?env_id=$ENV&business_id=$BIZ" | python3 -m json.tool
```

- Open browser → navigate to paulmalmquist.com → trigger the feature as a real user
- Take a screenshot confirming the UI reflects the change
- REQUIRES: HTTP 200 from deployed endpoint
- REQUIRES: screenshot of live site
- Valid transition → **complete**

---

## Completion Criteria — ALL must be true before declaring done

```
[ ] Code written to correct service directory
[ ] `make test-{service}` passes — output included
[ ] Deploy command executed — output included
[ ] Smoke test returns expected HTTP status — output included
[ ] Browser screenshot confirms feature visible on paulmalmquist.com
```

Produce this block at the end of every response:

```
## Execution Evidence
- **Command run:** `<exact command>`
- **Exit code:** <0 or error code>
- **Output (last 30 lines):** <paste actual output>
- **Tests passing:** <YES/NO with count>
- **Smoke test:** <PASS/FAIL — endpoint + HTTP status code>
- **Browser verification:** <screenshot or description of what was visible>
```

---

## Surface routing — decide this first

| Feature type | Service | Test command | Deploy |
|---|---|---|---|
| UI page/component | `repo-b/src/` | `make test-frontend` | `git push` → Vercel |
| RE v2 data endpoint | `repo-b/src/app/api/re/v2/*` | `make test-frontend` | `git push` → Vercel |
| Business OS API | `backend/app/routes/` + `backend/app/services/` | `make test-backend` | `railway up` |
| Demo Lab | `repo-c/app/` | `make test-demo` | see tips.md |
| Schema change | `repo-b/db/schema/*.sql` | `make db:verify` | `make db:migrate` |

**API pattern check:**
- `bosFetch()` → BOS FastAPI backend (port 8000, Pattern A)
- Direct fetch `/api/re/v2/*` → Next route handler, NO FastAPI (Pattern B)
- `apiFetch()` → Demo Lab (port 8001, Pattern C)

**Critical IDs** (most RE flows need both):
- Business: `a1b2c3d4-0001-0001-0001-000000000001`
- Env: `a1b2c3d4-0001-0001-0003-000000000001`
- Empty data = missing context, not a UI bug.

---

## Test patterns

**Backend (FakeCursor — no real DB needed):**
```python
def test_<feature>(client, fake_cursor):
    fake_cursor.return_value = [{"id": "abc", "name": "test"}]
    resp = client.get("/api/<path>?env_id=x&business_id=y")
    assert resp.status_code == 200
    assert resp.json()[0]["name"] == "test"
```

**Next route handler (Vitest + mocked getPool):**
```typescript
vi.mock('@/lib/server/db', () => ({ getPool: vi.fn() }))
// Reference: repo-b/src/app/api/repe/funds/[fundId]/route.test.ts
```

**`"use client"` components** require `import React from "react"` — Vitest/jsdom does NOT auto-inject it.

---

## Anti-loop rules

- Never "keep going" after reaching **complete**
- Never refactor to "make it cleaner" — only what the task requires
- Never fix unrelated warnings or failures
- If baseline tests are red: STOP and report. Do not implement.
- Work on one deliverable at a time. After each: STOP. Verify. Proceed.
