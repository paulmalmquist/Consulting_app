# Winston Monorepo — Architecture Map

> Deep detail (deploy, smoke, AI gateway): see `tips.md`

This monorepo has **3 runtimes** and **2 API patterns** inside the frontend.
Assuming there is one backend is the most common failure mode.

## Services

| Service | Directory | Stack | Port | Test | Deploy |
|---|---|---|---|---|---|
| Frontend | `repo-b/` | Next.js 14 App Router | 3001 | `make test-frontend` | `git push` → Vercel |
| BOS backend | `backend/` | FastAPI + psycopg | 8000 | `make test-backend` | `railway up --service authentic-sparkle` |
| Demo Lab | `repo-c/` | FastAPI + psycopg | 8001 | `make test-demo` | see tips.md |

## Service Boundaries — ONLY modify the owning service

- Frontend code lives ONLY in `repo-b/`
- BOS backend code lives ONLY in `backend/`
- Demo Lab code lives ONLY in `repo-c/`

## API Patterns inside repo-b

- **Pattern A** — `bosFetch()` → `/bos/[...path]` proxy → FastAPI `backend/`
- **Pattern B** — direct fetch `/api/re/v2/*` → Next route handler → Postgres (NO FastAPI)
- **Pattern C** — `apiFetch()` → `/v1/[...path]` proxy → FastAPI `repo-c/`

Before touching any endpoint: confirm whether it lives in `backend/app/routes/` or `repo-b/src/app/api/`.

## Execution Rules

- ALWAYS run tests after changes: the relevant `make test-*` command
- ALWAYS include actual terminal output in your response
- NEVER say "tests should pass" — RUN THEM
- NEVER use `git add -A` — stage specific files only

## Production seed IDs

- Business (Meridian Capital): `a1b2c3d4-0001-0001-0001-000000000001`
- Environment: `a1b2c3d4-0001-0001-0003-000000000001`
- Fund: `a1b2c3d4-0003-0030-0001-000000000001`
- Asset (Cascade Multifamily): `11689c58-7993-400e-89c9-b3f33e431553`

## Production URLs

- Frontend: `https://www.paulmalmquist.com`
- BOS backend: `https://authentic-sparkle-production-7f37.up.railway.app`
- Health: `https://authentic-sparkle-production-7f37.up.railway.app/health`

## Common errors

1. Putting RE v2 routes in `backend/` — they live in `repo-b/src/app/api/re/v2/`
2. Forgetting `env_id`/`business_id` — empty data is context, not a UI bug
3. `"use client"` without `import React from "react"` — breaks Vitest
4. `%` in psycopg3 SQL strings — must be `%%`
5. Declaring deploy done before Railway shows `SUCCESS` + `/health` 200
