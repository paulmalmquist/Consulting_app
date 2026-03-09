# Coding Assistant    

This file is a repo inventory plus a pre-flight checklist for giving instructions to coding assistants in this monorepo.

The main repeat failure pattern here is simple: assistants assume there is one app, one backend, one API surface, and one database path. That is false in this repo.

## 1. Repo Inventory

### Primary surfaces

| Surface | Directory | Stack | Default port | Main role |
|---|---|---|---:|---|
| Frontend | `repo-b/` | Next.js 14 App Router + TS | `3001` | Main Winston / Business OS UI |
| BOS backend | `backend/` | FastAPI + psycopg | `8000` | Business OS APIs, documents, AI gateway, RE/PDS/etc. |
| Demo Lab backend | `repo-c/` | FastAPI + psycopg | `8001` | Demo lab environments, uploads, chat, pipeline, Excel API |
| Excel add-in | `excel-addin/` | React + Webpack | n/a | Talks to `repo-c` APIs |
| SQL schema source | `repo-b/db/schema/` | ordered `.sql` bundle | n/a | Canonical schema/migrations |

### Important conclusion

Do not describe this repo as "a Next app with a Python backend" without clarifying which backend and which API surface.

It is:

1. `repo-b` frontend
2. `backend` Business OS backend
3. `repo-c` Demo Lab backend
4. Shared Postgres / Supabase-backed data model
5. Mixed direct-DB and proxied API patterns inside `repo-b`

## 2. Source Of Truth By Concern

| Concern | Source of truth |
|---|---|
| Frontend pages/components | `repo-b/src/app`, `repo-b/src/components` |
| Frontend direct DB route handlers | `repo-b/src/app/api/re/v2/*`, selected `repo-b/src/app/bos/api/*` |
| Business OS API contracts | `backend/app/routes/*`, `backend/app/schemas/*`, `backend/app/services/*` |
| Demo Lab API contracts | `repo-c/app/main.py` |
| Canonical SQL schema | `repo-b/db/schema/*.sql` applied in numeric order |
| DB apply/verify scripts | `repo-b/db/schema/apply.js`, `repo-b/db/schema/verify.js` |
| Local dev topology | `docs/LOCAL_DEV_PORTS.md`, `Makefile` |
| AI sidecar notes | `docs/LOCAL_AI_SIDECAR.md` |

### Important conclusion

There is no Prisma/ORM canonical model here. This repo is SQL-first.

If a change affects persistence, check SQL files first, then route/service code.

## 3. Runtime Data Flows

### A. Frontend -> BOS backend -> SQL / storage

Used by `repo-b/src/lib/bos-api.ts`.

Flow:

1. Browser UI in `repo-b`
2. `bosFetch(...)`
3. Same-origin Next proxy at `/bos/*` in `repo-b/src/app/bos/[...path]/route.ts`
4. FastAPI in `backend/`
5. Postgres via `backend/app/db.py`
6. Optional Supabase Storage via `backend/app/repos/supabase_storage_repo.py`

Typical examples:

- businesses
- departments/capabilities
- documents
- executions
- PDS APIs
- REPE context bootstrap
- AI gateway

### B. Frontend -> Next route handler -> SQL directly

Used heavily in `repo-b/src/app/api/re/v2/*` and some `repo-b/src/app/bos/api/*`.

Flow:

1. Browser UI in `repo-b`
2. Next route handler
3. `getPool()` from `repo-b/src/lib/server/db.ts`
4. Postgres directly from Node via `pg`

Typical examples:

- `repo-b/src/app/api/re/v2/funds/[fundId]/metrics/[quarter]/route.ts`
- `repo-b/src/app/api/re/v2/funds/[fundId]/quarter-close/route.ts`
- many asset/fund/model/scenario routes

### Important conclusion

Not all `/api/*` traffic goes through `backend/`.

Before instructing an assistant to "update the backend endpoint", verify whether the endpoint actually lives in:

- `backend/app/routes/*`, or
- `repo-b/src/app/api/*`

### C. Frontend -> Demo Lab backend

Used by `repo-b/src/lib/api.ts`.

Flow:

1. Browser UI in `repo-b`
2. `apiFetch(...)`
3. Same-origin Next proxy at `/v1/*` in `repo-b/src/app/v1/[...path]/route.ts`
4. FastAPI in `repo-c/`
5. Postgres / Supabase-backed tables used by Demo Lab

Typical examples:

- environments
- uploads
- demo chat
- pipeline
- Excel API support

### Demo Lab fallback wrinkle

Some Demo Lab flows in `repo-b` can fall back to local in-process state when the upstream Demo Lab backend is unavailable.

Relevant file:

- `repo-b/src/lib/labV1Fallback.ts`

### Important conclusion

If a Demo Lab page "works" while `repo-c` is down, verify whether you are seeing fallback behavior before concluding that the real backend path is correct.

### D. Document upload -> SQL metadata + Supabase Storage

Canonical upload path:

1. Frontend calls `initUpload()` / `completeUpload()` from `repo-b/src/lib/bos-api.ts`
2. BOS backend routes in `backend/app/routes/documents.py`
3. Document metadata stored in `app.documents`, `app.document_versions`, `app.document_entity_links`
4. Binary stored in Supabase Storage

### Important conclusion

Uploading a document is not the same thing as indexing it for RAG.

### E. Document indexing -> vector store

Canonical current RAG path:

1. Document exists in `app.documents` + `app.document_versions`
2. Frontend or caller hits `/api/ai/gateway/index`
3. Next proxy forwards to `backend/app/routes/ai_gateway.py`
4. Backend downloads file from Supabase Storage
5. `backend/app/services/text_extractor.py` extracts text
6. `backend/app/services/rag_indexer.py` chunks + embeds + stores in `rag_chunks`

Canonical vector table:

- `rag_chunks`

Schema file:

- `repo-b/db/schema/316_rag_vector_chunks.sql`

### Legacy/demo document-vector path

There is also older/demo KB code using:

- `app.document_chunks`
- `kb_*` tables
- `repo-b/db/schema/291_winston_demo_kb.sql`
- `backend/app/services/winston_demo.py`

### Important conclusion

If the task is about the current AI Gateway / RAG system, prefer `rag_chunks`.

Do not default to `app.document_chunks` unless the task is explicitly about Winston demo/legacy KB flows.

## 4. Environment Variables And Ports To Check First

### Frontend (`repo-b`)

- `NEXT_PUBLIC_BOS_API_BASE_URL`
- `BOS_API_ORIGIN`
- `NEXT_PUBLIC_DEMO_API_BASE_URL`
- `NEXT_PUBLIC_API_BASE_URL` only for legacy fallback assumptions
- `DATABASE_URL` or `PG_POOLER_URL` if Next route handlers hit Postgres directly
- `ADMIN_INVITE_CODE`
- `ENV_INVITE_CODE`

### BOS backend (`backend`)

- `DATABASE_URL`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `STORAGE_BUCKET`
- `ALLOWED_ORIGINS`
- `OPENAI_API_KEY` for AI Gateway

### Demo Lab backend (`repo-c`)

- `SUPABASE_DB_URL`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ALLOWED_ORIGINS`
- `EXCEL_API_KEY` if Excel flows matter

### Default local ports

- frontend: `3001`
- BOS backend: `8000`
- Demo Lab backend: `8001`
- optional AI sidecar: `7337`

## 5. Authentication / Context Assumptions

### Session model in `repo-b`

Auth is mostly cookie-based, not a full external auth stack.

Primary cookie:

- `bos_session`

Key middleware:

- `repo-b/src/middleware.ts`
- `repo-b/src/lib/server/sessionAuth.ts`

Protected areas include:

- `/lab/*`
- `/app/*`
- `/documents/*`
- `/tasks/*`
- `/api/commands/*`
- `/api/mcp/*`
- `/api/ai/gateway/*`

### Environment/business context

Many RE/REPE flows depend on both:

- `env_id`
- `business_id`

Important files:

- `repo-b/src/lib/repe-context.ts`
- `repo-b/src/app/api/lab/env-context/[envId]/route.ts`
- `backend/app/routes/repe.py` and related context services

### Important conclusion

If a bug smells like "empty data", "404", "not bound", or "context missing", check env/business binding before changing UI logic.

## 6. SQL / Schema Reality

### Canonical migration model

The schema is a numbered SQL bundle in:

- `repo-b/db/schema/*.sql`

Applied by:

- `node repo-b/db/schema/apply.js`

Verified by:

- `node repo-b/db/schema/verify.js`

### Important conclusion

Do not invent ad hoc migrations in random places.

If a feature needs schema changes, update the proper numbered SQL file or add a new numbered SQL file in `repo-b/db/schema/`.

### Useful commands

```bash
make db:migrate
make db:verify
cd repo-b && npm run db:dry
```

## 7. Common Repeat Errors To Prevent

1. Assuming all APIs are in `backend/`
2. Assuming all frontend APIs are thin proxies rather than direct SQL handlers
3. Sending Demo Lab changes to BOS backend or BOS changes to `repo-c`
4. Forgetting that RE v2 is largely implemented inside `repo-b/src/app/api/re/v2/*`
5. Forgetting env/business binding requirements
6. Confusing document upload with RAG indexing
7. Targeting `app.document_chunks` when the task is really about `rag_chunks`
8. Forgetting Supabase Storage is part of the document path
9. Assuming production uses localhost-based API origins
10. Changing UI without checking matching tests in `repo-b/tests` and `repo-b/src/components/**/*.test*`
11. Changing backend contracts without checking frontend callers in `bos-api.ts` or `api.ts`
12. Forgetting that `repo-b` can fail because DB env vars are missing even if `backend` is healthy
13. Mistaking Demo Lab fallback responses for real `repo-c` behavior
14. Creating new `"use client"` React components without `import React from "react"` — Next.js auto-injects it for production builds but the vitest/jsdom test environment does NOT, causing `ReferenceError: React is not defined` in CI
15. Pushing Python changes without running `ruff check` locally first — CI will catch it but it wastes a deploy cycle
16. Hardcoded `%` in SQL strings passed to psycopg3 `execute()` — must be `%%` to avoid format-string errors (e.g. `LIKE '%%broker%%'`)

## 8. Pre-Flight Checklist Before Prompting A Coding Assistant

Ask the assistant to confirm all of these before making changes:

1. Which app is in scope: `repo-b`, `backend`, `repo-c`, or `excel-addin`?
2. Is the user flow using `bosFetch`, `apiFetch`, or a direct browser fetch to a Next route?
3. Is the endpoint implemented in `backend/app/routes/*` or `repo-b/src/app/api/*`?
4. Does the route talk to Postgres directly, or proxy to FastAPI?
5. Which IDs are required: `env_id`, `business_id`, `fund_id`, `asset_id`, `document_id`, etc.?
6. Does the feature require auth/session cookies?
7. Does the DB schema already contain the required tables/columns?
8. If documents are involved, is the task about storage metadata, extracted text, or vector retrieval?
9. If AI/RAG is involved, is the canonical table `rag_chunks` or a demo KB table?
10. Which test suite must pass: `backend` pytest, `repo-c` pytest, `repo-b` vitest, Playwright, or DB verify?

## 9. Recommended Prompt Addendum For Assistants

Use language like this when assigning work:

```md
Before changing code, identify:
- the exact app and file path that owns this flow
- whether the request path is frontend-direct-to-DB, frontend-to-BOS-backend, or frontend-to-Demo-Lab-backend
- the exact SQL tables involved
- whether env_id/business_id context is required
- whether document upload and RAG indexing are separate steps here
- the smallest relevant test command to run after the change
```

## 10. Fast Sanity Commands

```bash
make db:verify
make test-backend
make test-demo
make test-frontend
make smoke
```

For quick architecture checks:

```bash
rg "getPool\\(" repo-b/src/app
rg "bosFetch\\(" repo-b/src
rg "apiFetch\\(" repo-b/src
rg "rag_chunks|document_chunks" backend repo-b/db/schema repo-b/src
```

## 11. One-Sentence Mental Model

This repo is a multi-surface monorepo where `repo-b` is the UI, `backend` is the Business OS API, `repo-c` is a separate Demo Lab API, `repo-b` also owns many direct-to-Postgres route handlers, and the current canonical vector store is `rag_chunks`, not the older demo KB chunk tables.

---

## 12. Deploy -> Test Readiness

### The core rule

There are five separate post-change steps in this repo, and assistants should not compress them into one generic deploy:

1. GitHub push / merge
2. GitHub Actions CI
3. Vercel frontend deploy for `repo-b`
4. Railway backend deploy for `backend`
5. Manual DB migration if schema changed

GitHub Actions CI is not the deploy mechanism here. The current CI workflow runs lint, typecheck, and unit checks. It does not deploy Vercel or Railway.

Vercel and Railway are independent. One does not trigger the other.

| Action | How to trigger | When live |
|---|---|---|
| GitHub CI | Push to `main` / PR update | When workflow jobs finish |
| Frontend deploy | Vercel deploy for `repo-b` | After Vercel build + rollout completes |
| Backend deploy | Railway deploy/redeploy for `backend` | After Railway build + `/health` passes |
| DB schema changes | `make db:migrate` run manually | Immediately after the command completes |

**Do not start production testing until every relevant step for the changed surface has completed.**

---

### Actual production routing

Current production wiring:

- Frontend: Vercel
- BOS backend: Railway
- Frontend proxy: Vercel `BOS_API_ORIGIN` -> Railway backend URL

The BOS request path in production is:

1. Browser -> Vercel frontend
2. Vercel `/bos/*` proxy
3. Railway backend

It is not `GitHub -> Vercel -> Railway`.

---

### Railway deploy timing in detail

The BOS backend runs as a Docker container on Railway using `backend/Dockerfile`. Railway only serves the new backend after the deployment reaches `SUCCESS` and `/health` returns 200.

Typical timings:

- `requirements.txt` unchanged -> often ~1-2 min
- `requirements.txt` changed -> often ~3-5 min
- simple `railway redeploy --yes` with warm cache -> often ~1-3 min

Most reliable checks:

```bash
cd backend && railway service status
cd backend && railway deployment list --json
curl -sS https://authentic-sparkle-production-7f37.up.railway.app/health
```

Observed in this repo:

- A newer GitHub commit does not guarantee Railway has already deployed it.
- Running `railway redeploy --yes` in `backend/` created a new deployment and progressed `BUILDING -> DEPLOYING -> SUCCESS`.
- After `SUCCESS`, `GET /health` returned `{"ok": true}` from the live Railway backend.

If backend code changed and Railway does not appear to be picking it up, the smallest corrective action is:

```bash
cd backend && railway redeploy --yes
```

There is also a helper script that encodes this polling-based deploy loop:

- `repo-b/scripts/production-loop.mjs`

That script detects changed files, redeploys Railway for backend changes, waits for Railway health, and can also deploy Vercel for frontend changes.

---

### Vercel deploy timing in detail

`repo-b` is deployed to Vercel, not Railway.

Typical timing:

- Next.js build + rollout is often ~2-5 min depending on cache warmth and page count

For frontend-affecting changes, a healthy Railway backend is not enough. UI code, Next route handlers in `repo-b/src/app/api/*`, and proxy behavior in `repo-b/src/app/bos/[...path]/route.ts` depend on the Vercel deployment being current.

---

### SQL / schema changes - the most common missed step

Railway does not run migrations automatically. There is no startup hook in `backend/Dockerfile` that applies the SQL bundle.

If your change involved any of the following, you must run `make db:migrate` separately before testing:

- Adding a new table or column
- Adding or changing an index
- Seeding new rows via a `.sql` file
- Enabling the `vector` extension (`CREATE EXTENSION IF NOT EXISTS vector`)
- Any change to a file in `repo-b/db/schema/*.sql`

```bash
make db:migrate
make db:verify
```

If you skip this step, the backend may deploy cleanly while production queries still fail or return empty results.

---

### pgvector specifically

The `rag_chunks` table has a `vector(1536)` column and an HNSW index. Both require the `pgvector` extension to be enabled on the Postgres instance.

The schema SQL (`316_rag_vector_chunks.sql`) conditionally enables the extension. If `vector` is unavailable on the server, semantic search silently degrades toward full-text behavior. If RAG search feels like keyword search, check the extension first.

---

### Testing readiness checklist

Before running manual or automated production tests:

1. GitHub CI has finished if you are waiting on lint/typecheck/unit confirmation.
2. Railway shows `SUCCESS` for `backend/` changes.
3. Vercel deploy is complete for `repo-b/` changes.
4. `GET /health` on the Railway backend returns 200.
5. `GET /bos/health` through the production frontend returns 200 if the flow uses the Vercel proxy.
6. `make db:migrate` has been run if any `.sql` file changed.
7. `make db:verify` passes if schema changed.
8. pgvector is active if the change touches `rag_chunks`, embeddings, or AI gateway indexing.
9. Hard refresh the browser before UI verification because stale JS bundles can mask a fresh deploy.
10. Check platform env vars if the feature worked locally but fails in production.

Most common production env culprits:

- Railway backend: `OPENAI_API_KEY`, `DATABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ALLOWED_ORIGINS`
- Vercel frontend: `BOS_API_ORIGIN`, `NEXT_PUBLIC_BOS_API_BASE_URL`, `NEXT_PUBLIC_DEMO_API_BASE_URL`

---

### Change type -> required waits

| Change type | Wait for GitHub CI | Wait for Vercel deploy | Wait for Railway deploy | Run `db:migrate` |
|---|:---:|:---:|:---:|:---:|
| UI-only (`repo-b` component/style/layout) | Recommended | ✅ | — | — |
| Next route handler in `repo-b/src/app/api/*` | Recommended | ✅ | — | Maybe |
| Backend route/service in `backend/app/*` | Recommended | — | ✅ | Maybe |
| SQL schema in `repo-b/db/schema/*.sql` | Recommended | — | — | ✅ |
| Seed data in SQL bundle | Recommended | — | — | ✅ |
| RAG/indexing/backend AI change | Recommended | — | ✅ | Maybe / often |
| RAG schema/index change | Recommended | — | ✅ | ✅ |
| Vercel env var change | — | ✅ | — | — |
| Railway env var change | — | — | ✅ | — |
| Full-stack feature touching `repo-b` + `backend` | Recommended | ✅ | ✅ | Maybe |

---

### Recommended test order

Use this order unless there is a strong reason not to:

1. Run the smallest local test(s) for the changed surface.
2. If schema changed, run `make db:migrate` then `make db:verify`.
3. Deploy the changed runtime(s): Vercel for `repo-b`, Railway for `backend`.
4. Poll health/status endpoints instead of waiting blind.
5. Run production smoke checks only after health is confirmed.

Useful local commands:

```bash
make test-backend
make test-demo
make test-frontend
make db:verify
```

Useful production checks:

```bash
cd backend && railway service status
cd backend && railway deployment list --json
curl -sS https://authentic-sparkle-production-7f37.up.railway.app/health
curl -sS https://www.paulmalmquist.com/bos/health
```

---

### Important conclusion

The most common reasons a prod fix appears not live are:

1. GitHub CI is running, but no deploy has happened yet.
2. Railway backend has not redeployed yet and needs `railway redeploy --yes`.
3. Vercel frontend is still serving the previous build.
4. Schema changed but `make db:migrate` was not run.
5. The wrong runtime was checked: the issue may be in `repo-b` when the assistant only looked at `backend`, or vice versa.

---

## 13. Backend API Smoke Tests — Mirroring the Frontend UX Journey

### Two test modes in `backend/tests/`

All tests in `backend/tests/` run with a `FakeCursor` — they mock the database layer entirely and do **not** require Postgres. They prove that routes parse correctly and return the right shape, not that the actual seeded data is present and correct.

| Mode | How to run | What it proves |
|---|---|---|
| Unit tests (default) | `make test-backend` or `cd backend && pytest` | Routes, schemas, service logic — no real DB |
| Live endpoint smoke | `pytest backend/tests/ -m smoke -k "live"` or `httpx` against running backend | Real data is present, seed values are correct |

There is no `integration/` directory yet. If you want to add live smoke tests, create `backend/tests/test_ux_smoke.py` and skip the `FakeCursor` fixture — use `requests` or `httpx` against the live backend URL.

---

### Key endpoint groups that mirror the frontend walkthrough

These are the API calls the frontend actually makes during a standard RE/REPE session. Run them in this order to confirm the full stack is healthy after a deploy.

### Production seed IDs — use these, not test UUIDs

All smoke tests should use the real Meridian Capital Management seed data. Do not substitute placeholder or test UUIDs.

| Name | ID |
|---|---|
| Business (Meridian Capital Management) | `a1b2c3d4-0001-0001-0001-000000000001` |
| Environment | `a1b2c3d4-0001-0001-0003-000000000001` |
| Fund (Institutional Growth Fund VII) | `a1b2c3d4-0003-0030-0001-000000000001` |
| Asset (Cascade Multifamily, Aurora CO) | `11689c58-7993-400e-89c9-b3f33e431553` |

---

#### 1. REPE Context bootstrap (required by nearly every page)

```
GET /api/repe/context?env_id={env_id}&business_id={business_id}
```

This is the very first call `repo-b` makes. If it returns empty or 404, every downstream page will show blank data. Check `backend/app/routes/repe.py → /context`.

Note: the context endpoint returns a binding diagnostic, not the full fund/asset list. A `binding_found: false` is normal if env/business aren't explicitly linked — downstream pages still work as long as `business_found: true`.

#### 2. Fund list / portfolio overview

```
GET /api/repe/businesses/{business_id}/funds
```

Route: `backend/app/routes/repe.py`.

Expected: returns at least one fund with `name` = `"Institutional Growth Fund VII"`, `fund_type` = `"closed_end"`, `vintage_year` = `2024`.

#### 3. Fund detail

```
GET /api/repe/funds/{fund_id}
```

Route: `backend/app/routes/repe.py`.

Expected: `"name"` = `"Institutional Growth Fund VII"`, `"target_size"` = `"500000000..."`, `"status"` = `"investing"`.

#### 4. Fund investments list (Investments tab)

```
GET /api/re/v2/funds/{fund_id}/investments
```

Route: `backend/app/routes/re_v2.py`.

Expected: returns at least one investment row with `"name"` containing `"Cascade"`.

#### 5. Asset cockpit data

```
GET /api/repe/assets/{asset_id}           ← identity card (name, address, type, units)
```

Expected for Cascade Multifamily:
```
name        = "Cascade Multifamily"
address     = "14200 E Alameda Ave, Aurora, CO"
units       = 280
asset_type  = "property" / property_type = "multifamily"
occupancy   ≈ 0.9243   (92.4%)
noi         > 0
```

#### 6. Fund investments / JVs (Fund → Investments tab)

```
GET /api/re/v2/funds/{fund_id}/investments
GET /api/re/v2/investments/{investment_id}/jvs
GET /api/re/v2/jvs/{jv_id}/assets?quarter=2026Q1
```

These power the investment rollup table. If JVs return empty, the Investments tab will show no rows even if assets exist.

#### 7. Models list (Models page)

```
GET /api/re/v2/funds/{fund_id}/models
GET /api/re/v2/models
```

Route: `backend/app/routes/re_v2.py`.

Expected: at least one model row seeded — if blank, the Models page is empty.

---

### How to run a live smoke pass manually

Use the real production seed IDs — no placeholders, no test UUIDs.

```bash
export BASE="https://authentic-sparkle-production-7f37.up.railway.app"
export BIZ_ID="a1b2c3d4-0001-0001-0001-000000000001"
export ENV_ID="a1b2c3d4-0001-0001-0003-000000000001"
export FUND_ID="a1b2c3d4-0003-0030-0001-000000000001"
export ASSET_ID="11689c58-7993-400e-89c9-b3f33e431553"

# 1. Context binding check
curl -s "$BASE/api/repe/context?env_id=$ENV_ID&business_id=$BIZ_ID" | python3 -c "import sys,json; d=json.load(sys.stdin); print('business_found:', d['diagnostics']['business_found'])"

# 2. Fund list
curl -s "$BASE/api/repe/businesses/$BIZ_ID/funds" | python3 -c "import sys,json; d=json.load(sys.stdin); print([f['name'] for f in d])"

# 3. Fund detail
curl -s "$BASE/api/repe/funds/$FUND_ID" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['fund']['name'], d['fund']['status'])"

# 4. Asset identity
curl -s "$BASE/api/repe/assets/$ASSET_ID" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['asset']['name'], '| units:', d['details']['units'], '| occ:', d['details']['occupancy'])"

# 5. Fund investments
curl -s "$BASE/api/re/v2/funds/$FUND_ID/investments" | python3 -c "import sys,json; d=json.load(sys.stdin); print('investments:', len(d) if isinstance(d, list) else d)"
```

All of these should return non-null values with no 404 or 500 before you declare a deploy healthy.

---

### Important conclusion

The `make test-backend` suite does not catch missing seed data or wrong prod env vars — it runs entirely against mocked DB responses. After any deploy that touches seed data, SQL schema, or env vars, run the curl smoke pass above (or a pytest integration suite against the live URL) before calling the deploy done.

---

## 14. Autonomous Deploy-and-Test Workflow

### The contract

When you give a large task, the assistant must complete the **full cycle** without prompting:

1. Make all code and schema changes
2. Run **all** local checks before committing — every single one, no exceptions:
   - `cd repo-b && npx vitest run` — unit tests (catches missing React imports, stale test expectations)
   - `cd repo-b && npx tsc --noEmit` — TypeScript (catches null coalesce, type mismatches)
   - `source backend/.venv/bin/activate && ruff check backend/` — Python lint (catches unused imports, unused variables)
   - If any check fails, fix it before committing. Do not push and hope CI catches it.
3. Commit and push to `main` (triggers Railway backend redeploy + Vercel frontend redeploy automatically)
4. Poll all three deployment targets until each one reaches a healthy state — **never declare done until all services confirm healthy**
5. Run live smoke tests against production endpoints (not localhost, not demo cookies, not mock data)
6. Report the actual production answer or confirm test pass

You should not need to ask for permission between steps or wait for human confirmation mid-task. The only time to pause is if a deploy fails or a smoke test returns an unexpected error — surface that immediately with the actual error and a diagnosis.

---

### No demo/mock anything in the test phase

All connections during testing must be live and real:

- **Auth:** use `bos_session` cookie with a real session, not `demo_lab_session=active` (which is a legacy fallback that bypasses real auth). If the prod endpoint requires a real session, test via a URL that doesn't require it or set up a proper session token.
- **Data:** test against seeded production data, not hardcoded fixture values
- **Backend:** always test against `https://authentic-sparkle-production-7f37.up.railway.app` (BOS backend) and `https://www.paulmalmquist.com` (frontend/Next API routes) — never `localhost` unless the task was explicitly local-only
- **DB:** if schema changed, `make db:migrate` must have run and `make db:verify` must pass before any smoke test

---

### Deployment polling procedure

#### Railway (backend)
```bash
# Poll every 30s until SUCCESS
/opt/homebrew/bin/railway service status --all
```
State sequence: `BUILDING → DEPLOYING → SUCCESS`. Do not proceed until `SUCCESS`.

Confirm the new code is live (not a cached old container):
```bash
curl -s https://authentic-sparkle-production-7f37.up.railway.app/health
```
If the gateway route is involved:
```bash
curl -s https://authentic-sparkle-production-7f37.up.railway.app/api/ai/gateway/health
```

**Confirming Railway deployment lineage (new code, not old container):**

A healthy `/health` response alone does NOT prove the new code is running — the old container also returned 200 before the new one came up. Confirm lineage explicitly:

```bash
# List deployments — the most recent one must show SUCCESS, not REMOVED/BUILDING
railway deployment list --service authentic-sparkle
```

The top entry must be:
- `SUCCESS` — the new build is live
- Timestamped at or after your `railway up` invocation
- The previous entry must show `REMOVED` (replaced by new)

If the top entry is still `BUILDING` or `DEPLOYING`, wait and re-poll. If it shows `FAILED`, check build logs via the URL printed by `railway up --detach`.

#### Vercel (frontend)
Use `mcp__claude_ai_Vercel__get_deployment` with the deployment ID from the latest push. State must be `READY` before testing any Next.js routes or pages.

The production domain aliases:
- `https://www.paulmalmquist.com` (canonical)
- `https://paulmalmquist.com` (redirects to www)

**Confirming Vercel deployment lineage (new code, not previous build):**

A `READY` state alone does not prove it is the new build. Confirm lineage by checking the `meta.githubCommitSha` in the deployment response matches your commit SHA:

```bash
# Get the deployment and verify the commit SHA
# mcp__claude_ai_Vercel__get_deployment idOrUrl=<deployment_id>
# Check: deployment.meta.githubCommitSha == git rev-parse HEAD
# Check: deployment.alias includes "www.paulmalmquist.com" (proves it is production)
```

Both conditions must be true:
1. `meta.githubCommitSha` == the SHA of the commit you pushed
2. `alias` array includes `www.paulmalmquist.com` (confirms it was promoted to production, not just a preview)

#### GitHub Actions CI
```bash
gh run list --repo paulmalmquist/Consulting_app --limit 1
gh run view <run_id>
```
CI must show `completed / success` before treating a merge as stable. If CI fails, fix before deploying.

---

### Env var checklist — things that silently break prod

Before testing, confirm these are set on the right service:

| Var | Service | Required for |
|-----|---------|-------------|
| `OPENAI_API_KEY` | Railway backend + Vercel | AI gateway, Winston answers |
| `DATABASE_URL` / `PG_POOLER_URL` | Railway backend + Vercel | Any DB query |
| `SUPABASE_SERVICE_ROLE_KEY` | Railway backend | Document storage, RAG indexing |
| `SUPABASE_URL` | Railway backend | Supabase Storage |
| `ALLOWED_ORIGINS` | Railway backend | CORS — must include `https://www.paulmalmquist.com` |
| `BOS_API_ORIGIN` | Vercel | Next.js proxy to BOS backend |

Set on Railway: `railway variables set KEY=VALUE --service authentic-sparkle`
Set on Vercel: `echo "value" | npx vercel env add KEY production` then redeploy

### Production credentials

| Credential | Value | Used for |
|---|---|---|
| `ADMIN_INVITE_CODE` | `SWvxEtVPMK_YanlB` | Login to `/admin` on paulmalmquist.com |

---

### Correct test order for a full-stack change

```
1. local unit tests pass (make test-backend, make test-frontend)
2. git commit + push
3. wait: GitHub Actions CI → completed/success
4. wait: Railway backend → SUCCESS + /health 200
5. wait: Vercel → READY
6. if schema changed: make db:migrate && make db:verify
7. curl smoke pass against live backend URL (Section 13 above)
8. curl smoke pass against Vercel Next.js API routes if those changed
9. if AI gateway changed: test Winston question → confirm real answer, not 503/501
10. declare done, report results
```

Steps 3–5 can be polled in parallel. Steps 6–9 must come after all deploys are healthy.

---

### Winston AI gateway smoke test

After any change touching the AI gateway, run this against production:

```bash
curl -sL -X POST "https://www.paulmalmquist.com/api/ai/gateway/ask" \
  -H "Content-Type: application/json" \
  -H "Cookie: bos_session=..." \
  -d '{"message":"How much capital is committed across all funds?"}' \
  --max-time 30
```

Expected: streaming SSE response with non-empty `content` tokens. A 503 means `OPENAI_API_KEY` is missing. A 501 means the backend gateway is disabled. A 404 means the route is missing or the backend hasn't redeployed yet.

---

## 15. Winston Conversation Log Review Protocol

### After every test session, pull and analyze the gateway logs

After testing Winston, fetch the most recent gateway logs and analyze whether the conversations routed and behaved correctly.

```bash
# Pull last 20 requests (replace with your business_id)
curl -s "https://authentic-sparkle-production-7f37.up.railway.app/api/ai/gateway/logs?limit=20" | jq .

# Filter by conversation
curl -s "https://authentic-sparkle-production-7f37.up.railway.app/api/ai/gateway/logs?conversation_id=<uuid>" | jq .

# Or query Supabase directly (use pooler URL — direct host is IPv6 only and unreachable from most local setups)
python3 -c "
import psycopg, json
conn = psycopg.connect('postgresql://postgres.ozboonlsplroialdwuxj:ripsalesforce8084@aws-1-us-east-1.pooler.supabase.com:6543/postgres')
cur = conn.cursor(row_factory=psycopg.rows.dict_row)
cur.execute('SELECT route_lane, route_model, message_preview, tool_call_count, workflow_override, cost_total, elapsed_ms, created_at FROM ai_gateway_logs ORDER BY created_at DESC LIMIT 20')
for r in cur.fetchall(): print(json.dumps(dict(r), default=str))
conn.close()
"
```

### Ask the assistant to analyze the logs for these signals

After pulling the logs, paste them and ask:

> "Analyze these gateway logs. For each request: was the routing lane correct for the message? Did the workflow override fire when it should (or shouldn't) have? Were the right tools called? Were there any fallbacks or errors? What should have happened differently?"

### What to look for per request

| Field | What to check |
|---|---|
| `route_lane` | A = no tools/RAG, B = RAG only, C = tools (write), D = deep reasoning. Does the lane match the question type? |
| `workflow_override` | Should be `true` on slot-fill follow-ups (e.g., "2024 open-end core" after "create a fund called X") |
| `tool_call_count` | Should be > 0 for any create/update/lookup request. 0 on a write request = routing failure |
| `tools_skipped` | `true` means Lane A — verify this was intentional (simple greeting, identity query) |
| `rag_chunks_used` | Should be > 0 for document/property questions. 0 = possible miss |
| `fallback_used` | `true` = primary model failed. Investigate if frequent |
| `cost_total` | Sanity check — a $0.01+ cost on a simple greeting means wrong lane |
| `elapsed_ms` | > 10s on a simple lookup = probable tool loop or slow model |
| `message_preview` | Confirms what was actually sent (useful to catch frontend truncation) |

### Key routing expectations to verify

| Message type | Expected lane | Expected tools | Expected RAG |
|---|---|---|---|
| "hi", "thanks", "who are you" | A | none | none |
| "how many funds do we have" | A or B | none | optional |
| "what is the cap rate for Ashford" | B | optional lookup | yes |
| "create a fund called X" | C | `repe.create_fund` | no |
| "2024 open-end core" (after fund creation) | C (workflow override) | `repe.create_fund` | no |
| "yes" / "go ahead" (confirming action) | C (workflow override) | same tool + confirmed=true | no |
| "analyze our portfolio performance in detail" | D | multiple | yes |

---

## 16. Winston Slot-Fill Amnesia — Debugging Checklist

### Symptom
Winston asks for a parameter that the user already provided in a previous turn. Example: turn 1 provides fund name, turn 2 provides vintage/type/strategy, and Winston says "I need the fund name to proceed."

### Root causes

| Cause | Symptom in logs | Fix |
|---|---|---|
| Tool call failed validation (missing fields) → no PENDING CONFIRMATION annotation written | `wf_override=false` on turn 2; turn 1 tool call shows `success: false` + `"required"` in error | Treat validation-failed tool calls as pending slot-fill in both annotation logic and `_check_pending_workflow()` |
| Workflow detection only checks `success=true AND confirmed=false` | Same as above | Also check `success=false AND "required" in error` |
| Message on turn 2 doesn't match `_WRITE_RE` regex | Turn 2 routed to Lane A/B, `skip_tools=true`, workflow override not applied | Fix workflow detection so it fires regardless of regex match |

### What to check in gateway logs after a slot-fill failure

```bash
# Check the two consecutive turns
curl -s "https://authentic-sparkle-production-7f37.up.railway.app/api/ai/gateway/logs?limit=5" | jq '[.[] | {lane: .route_lane, wf_override: .workflow_override, msg: .message_preview, tools: .tool_calls_json}]'
```

Look for:
1. Turn 1: `route_lane=C`, tool call present with `success: false` and error containing "required" — this is the slot-fill trigger
2. Turn 2: `workflow_override` — must be `true`. If `false`, the pending workflow detection missed the failed call
3. Turn 2: tool args — must include ALL params from turn 1 plus the new ones from turn 2

### Annotation that gets written to conversation history (turn 1)

When a tool call fails due to missing required fields, this annotation is appended to the assistant message:

```
[SYSTEM NOTE: Tool calls this turn: - repe.create_fund(confirmed=N/A) → error: ...
PENDING CONFIRMATION for: repe.create_fund.
Known parameters: repe.create_fund(name="winston real estate I").
The tool call FAILED due to missing required fields. When the user provides the missing values,
you MUST call the tool again with ALL known parameters PLUS the new values.
NEVER re-ask for parameters already listed above.]
```

If this annotation is missing from the stored assistant message, the workflow override on turn 2 will not fire.

### Key files
- `backend/app/services/ai_gateway.py` — `_check_pending_workflow()` (detection) and annotation logic (~line 1024)
- Workflow override fires at ~line 422

---

## 17. Winston AI Gateway Architecture

### Payload contract

Frontend sends to `/api/ai/gateway/ask`:
```json
{"message": "...", "business_id": "uuid-or-null", "env_id": "uuid-or-null", "session_id": "..."}
```

Next.js proxy (`repo-b/src/app/api/ai/gateway/ask/route.ts`) forwards to FastAPI backend with the same shape matching `GatewayAskRequest`. If FastAPI is unreachable, falls back to direct OpenAI (no tools, no RAG).

### SSE event types (FastAPI backend)

| Event | Data shape | Purpose |
|---|---|---|
| `token` | `{"text": "..."}` | Streamed text content |
| `citation` | `{"chunk_id", "doc_id", "score", "snippet"}` | RAG document references |
| `tool_call` | `{"tool_name", "args", "result_preview"}` | MCP tool execution |
| `done` | `{"session_id", "prompt_tokens", "completion_tokens", "tool_calls", "elapsed_ms"}` | Stream complete |
| `error` | `{"message": "..."}` | Error during processing |

### Tool registration

`_register_all_tools()` in `backend/app/mcp/server.py` MUST be called from `backend/app/main.py` at startup. Without this, `_build_openai_tools()` returns an empty list and Winston has zero tools.

### REPE data tools

| Tool | Input | Purpose |
|---|---|---|
| `repe.list_funds` | `business_id` | List all funds for the business |
| `repe.get_fund` | `fund_id` | Fund details + terms |
| `repe.list_deals` | `fund_id` | Deals/investments in a fund |
| `repe.list_assets` | `deal_id` | Assets under a deal |
| `repe.get_asset` | `asset_id` | Asset details (NOI, occupancy, cap rate) |

### System prompt

Portfolio snapshot (fund list with IDs) is injected into the system prompt dynamically when `business_id` is provided. RAG context from `semantic_search()` is also appended. The prompt includes a "NEVER ask for data you can look up" directive.

### Railway deployment

Railway does NOT auto-deploy from git pushes for this project. Deploy manually:
```bash
cd backend && railway up --service authentic-sparkle --detach
```
Must run from `backend/` directory (where Dockerfile lives), not repo root.

### Winston production smoke

When smoke-testing `https://www.paulmalmquist.com/api/ai/gateway/ask`, send a valid `context_envelope` that matches `GatewayAskRequest` exactly:

- `conversation_id` must be a UUID if present
- `ui.visible_data.*` records must use `entity_type` / `entity_id` fields, not ad-hoc keys like `id`
- `ui.selected_entities` must match `AssistantSelectedEntity` and may not include extra keys such as `status`

If the backend rejects the payload with `422`, the Next.js route will fall back to direct OpenAI and the result will look like a generic chatbot response instead of Winston's SSE `context` / `tool_call` / `done` events.

### Workspace templates

When an environment needs a domain-specific operating system, add an explicit `workspace_template_key` instead of overloading `industry_type`. Resolution should follow:

- explicit `workspace_template_key` wins
- otherwise map legacy industry aliases like `pds_command` -> `pds_enterprise`
- use the same resolver in backend services, Next.js environment APIs, fallback environment storage, and frontend open-path routing

This avoids generic shells leaking back into mature environments just because provisioning metadata is old.

### Snapshot-first domain homepages

Executive homepages for real operating systems should read from snapshot-style management payloads, not ad hoc live aggregates or generic activity widgets.

- use fast read-model endpoints like `/api/<domain>/v2/command-center`
- keep homepage panels aligned to management questions, not CRUD modules
- feed AI briefing surfaces from the same snapshots that drive metrics, risk panels, forecast tables, and closeout queues

This keeps the homepage fast, coherent, and domain-specific.
