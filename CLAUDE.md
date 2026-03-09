# Winston Monorepo — Claude Orientation

> For deep deploy/smoke/gateway detail, see `tips.md`. This file covers what Claude needs automatically on every session.

## The single most important fact

This is NOT "a Next app with a Python backend." It has three separate runtimes and two different API patterns inside the frontend. Assuming there is one backend is the most common failure mode.

## Repo surfaces

| Surface | Directory | Stack | Port | Role |
|---|---|---|---|---|
| Frontend | `repo-b/` | Next.js 14 App Router + TS | 3001 | Main Winston UI |
| BOS backend | `backend/` | FastAPI + psycopg | 8000 | Business OS APIs, RE/PDS/AI gateway |
| Demo Lab backend | `repo-c/` | FastAPI + psycopg | 8001 | Demo environments, uploads, chat, Excel API |
| Excel add-in | `excel-addin/` | React + Webpack | — | Talks to `repo-c` APIs |
| SQL schema | `repo-b/db/schema/` | ordered `.sql` bundle | — | Canonical schema — no ORM |

## Two API patterns inside `repo-b`

**Pattern A — Frontend → BOS backend → Postgres**
- Client calls `bosFetch(...)` from `repo-b/src/lib/bos-api.ts`
- Proxied through `repo-b/src/app/bos/[...path]/route.ts`
- Hits FastAPI in `backend/`
- Examples: businesses, departments, documents, PDS, REPE context, AI gateway

**Pattern B — Frontend → Next route handler → Postgres directly**
- Client calls a fetch directly to `/api/re/v2/*` or `/api/bos/api/*`
- Next route handler calls `getPool()` from `repo-b/src/lib/server/db.ts`
- No FastAPI involved
- Examples: all of `repo-b/src/app/api/re/v2/*` — funds, assets, models, dashboards, scenarios

**Before touching any endpoint:** check whether it lives in `backend/app/routes/*` or `repo-b/src/app/api/*`. They are separate codebases.

**Pattern C — Frontend → Demo Lab backend**
- Client calls `apiFetch(...)` from `repo-b/src/lib/api.ts`
- Proxied through `repo-b/src/app/v1/[...path]/route.ts`
- Hits FastAPI in `repo-c/`
- Has a local fallback: `repo-b/src/lib/labV1Fallback.ts` — if Demo Lab "works" while `repo-c` is down, you're seeing fallback behavior

## Source of truth by concern

| Concern | Where |
|---|---|
| Frontend pages/components | `repo-b/src/app`, `repo-b/src/components` |
| RE v2 routes (Next direct-DB) | `repo-b/src/app/api/re/v2/*` |
| BOS API contracts | `backend/app/routes/*`, `backend/app/schemas/*`, `backend/app/services/*` |
| Demo Lab API | `repo-c/app/main.py` |
| SQL schema (canonical) | `repo-b/db/schema/*.sql` applied in numeric order |
| Schema apply/verify | `repo-b/db/schema/apply.js`, `repo-b/db/schema/verify.js` |
| Auth middleware | `repo-b/src/middleware.ts`, `repo-b/src/lib/server/sessionAuth.ts` |
| REPE context | `repo-b/src/lib/repe-context.ts`, `backend/app/routes/repe.py` |

## Environment and context requirements

Most RE/REPE flows require both `env_id` and `business_id`. If data looks empty or you see 404s, check env/business binding before changing UI logic.

Production seed IDs for smoke testing:
- Business (Meridian Capital Management): `a1b2c3d4-0001-0001-0001-000000000001`
- Environment: `a1b2c3d4-0001-0001-0003-000000000001`
- Fund (Institutional Growth Fund VII): `a1b2c3d4-0003-0030-0001-000000000001`
- Asset (Cascade Multifamily, Aurora CO): `11689c58-7993-400e-89c9-b3f33e431553`

## Test commands

```bash
make test-backend      # pytest with FakeCursor — no real DB required
make test-demo         # pytest for repo-c
make test-frontend     # Vitest unit tests
make test-e2e          # Playwright E2E
make test-repe         # REPE-specific full suite
make db:verify         # verify schema state
make db:migrate        # apply schema changes
```

**Important:** `make test-backend` uses `FakeCursor` — it mocks the DB entirely. It proves routes and schemas are correct, not that seeded data is present. After any deploy touching seed data or schema, run the live curl smoke pass in `tips.md` Section 13.

## Test file conventions

| What changed | Where to add tests |
|---|---|
| `backend/app/routes/*` or `backend/app/services/*` | `backend/tests/test_<domain>.py` using `FakeCursor` |
| `repo-b/src/app/api/re/v2/*` (Next route handler) | `repo-b/src/app/api/re/v2/...route.test.ts` (Vitest) |
| `repo-b/src/components/*` with logic | `repo-b/src/components/**/__tests__/*.test.ts` (Vitest) |
| Full user journey | `repo-b/tests/repe/*.spec.ts` using Playwright + `installRepeApiMocks` pattern |
| `repo-c/` changes | `repo-c/tests/test_*.py` |

**FakeCursor pattern:** all backend tests mock the DB layer — see `backend/tests/conftest.py` for the fixture. Don't try to connect to a real database in `make test-backend`.

**Playwright mock pattern:** see `repo-b/tests/repe/repe-workspace.spec.ts` for the `installRepeApiMocks` pattern — intercept `**/api/**` and return shaped mock state.

## Schema changes

No ORM. Schema is a numbered SQL bundle.

1. Add or update a file in `repo-b/db/schema/*.sql`
2. Run `make db:migrate`
3. Run `make db:verify`

Railway does NOT auto-migrate. If schema changed and production queries fail, `make db:migrate` was probably skipped.

## Common errors to prevent

1. Assuming all APIs are in `backend/` — RE v2 routes live in `repo-b/src/app/api/re/v2/*`
2. Sending Demo Lab changes to BOS backend or vice versa
3. Confusing document upload (`backend/app/routes/documents.py`) with RAG indexing (`rag_chunks` table)
4. Forgetting `env_id`/`business_id` binding — empty data is usually a context issue, not a UI bug
5. Targeting `app.document_chunks` when the task is about `rag_chunks` (the current canonical vector table)
6. Creating `"use client"` components without `import React from "react"` — Next.js injects it in production but Vitest/jsdom does NOT
7. Hardcoded `%` in SQL strings passed to psycopg3 `execute()` — must be `%%`
8. Running `ruff check` after pushing instead of before — CI catches it but wastes a deploy cycle
9. Declaring a deploy done before checking Railway `SUCCESS` + Vercel `READY` + `/health` 200
10. Mistaking Demo Lab fallback responses for real `repo-c` behavior

## Deploy topology (production)

- Frontend: **Vercel** (`https://www.paulmalmquist.com`)
- BOS backend: **Railway** (`https://authentic-sparkle-production-7f37.up.railway.app`)
- Railway does NOT auto-deploy from git — manual: `cd backend && railway up --service authentic-sparkle --detach`
- Vercel deploys from git pushes to `main`
- DB migrations: manual — `make db:migrate`

**Full-stack change test order:**
1. Local: `make test-backend && make test-frontend`
2. Commit + push
3. Wait: GitHub Actions CI → `completed/success`
4. Wait: Railway → `SUCCESS` + `GET /health` returns 200
5. Wait: Vercel → `READY` + commit SHA matches
6. If schema changed: `make db:migrate && make db:verify`
7. Curl smoke pass (see `tips.md` Section 13)

For detailed deploy polling, slot-fill debugging, AI gateway architecture, and Winston smoke tests — see `tips.md`.
