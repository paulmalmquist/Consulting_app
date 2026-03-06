# Coding Assistant Tips

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

## 12. Deploy → Test Readiness

### The core rule

There are three independent deployment actions in this repo. Each has its own timing and none of them triggers the others automatically.

| Action | How to trigger | When it's live |
|---|---|---|
| Frontend deploy | Push to Railway (or Vercel) | ~2–4 min after push (Next build) |
| Backend deploy | Push to Railway | ~2–4 min after push (Docker build + healthcheck) |
| DB schema changes | `make db:migrate` run manually | Immediately after the command completes |

**Do not start testing until all three relevant actions for your change have completed.**

---

### Railway deploy timing in detail

The backend runs as a Docker container on Railway using the `Dockerfile` in `backend/`. Railway detects a git push, builds the image, waits for `GET /health` to return 200, then cuts traffic over.

Typical timings:

- **`requirements.txt` unchanged** — Docker layer cache hits, pip step skipped. Build + startup ≈ 1–2 min.
- **`requirements.txt` changed** — Full pip install. Build ≈ 3–5 min.
- **Frontend (`repo-b`) Next.js build** — Similar range, 2–5 min depending on page count and whether the build cache is warm.

Railway switches traffic **all at once** when the health check passes — there is no gradual rollout. The moment `/health` returns 200, the new container is live.

**How to confirm the backend is on the new code:** hit `https://<your-backend-url>/health` and check the `version` or `deployed_at` field if one is present, or watch Railway's deploy log for the "Deploy succeeded" event.

---

### SQL / schema changes — the most common missed step

Railway does **not** run migrations automatically. There is no `CMD` or entrypoint hook in `backend/Dockerfile` that calls `apply.js`.

If your change involved any of the following, you must run `make db:migrate` separately before testing:

- Adding a new table or column
- Adding or changing an index
- Seeding new rows via a `.sql` file
- Enabling the `vector` extension (`CREATE EXTENSION IF NOT EXISTS vector`)
- Any change to a file in `repo-b/db/schema/*.sql`

```bash
make db:migrate        # applies all numbered .sql files in repo-b/db/schema/
make db:verify         # confirms schema matches expected state
```

If you skip this step, the backend will deploy cleanly but queries against the new schema will 500 or return empty results, and the cause will not be obvious from the UI.

---

### pgvector specifically

The `rag_chunks` table has a `vector(1536)` column and an HNSW index. Both require the `pgvector` extension to be enabled on the Postgres instance.

The schema SQL (`316_rag_vector_chunks.sql`) does a conditional enable:

```sql
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'vector') THEN
    CREATE EXTENSION IF NOT EXISTS vector;
  END IF;
END;
$$;
```

If pgvector is not installed on the server, this silently skips it and the system falls back to full-text search (`tsvector`) — **with no error or warning**. If RAG semantic search is behaving like keyword search, this is the first thing to check.

**Verify in Supabase:** Dashboard → Database → Extensions → search "vector" → confirm it shows as enabled.

---

### Testing readiness checklist

Before running any manual or automated tests after a deploy:

1. **Railway deploy log shows "Deploy succeeded"** for every service you changed (frontend and/or backend).
2. **`GET /health` on the backend returns 200** with no cached/stale timestamp from a previous deploy.
3. **`make db:migrate` has been run** if any `.sql` file was changed or added.
4. **`make db:verify` passes** — confirms the live schema matches the expected state.
5. **pgvector extension is active** if the change touches anything in `rag_chunks`, embeddings, or AI gateway indexing.
6. **Hard refresh the browser** (`Cmd+Shift+R`) before testing UI changes — Next.js caches aggressively and a soft refresh may serve stale JS bundles.
7. **Check Railway env vars** if a feature was working locally but fails in production — the most common culprits are `OPENAI_API_KEY`, `DATABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `ALLOWED_ORIGINS`.

---

### Change type → what to wait for

| Change type | Wait for frontend deploy | Wait for backend deploy | Run `db:migrate` |
|---|:---:|:---:|:---:|
| UI-only (component, styling, layout) | ✅ | — | — |
| New Next.js API route (`repo-b/src/app/api/*`) | ✅ | — | Maybe |
| Backend route/service (`backend/app/routes/*`) | — | ✅ | Maybe |
| SQL schema (new table, column, index) | — | — | ✅ |
| Seed data (new `.sql` seed file) | — | — | ✅ |
| RAG / vector changes | — | ✅ | ✅ (+ verify pgvector) |
| Env var change on Railway | — | ✅ (redeploy to pick up) | — |
| Both UI and backend changed | ✅ | ✅ | Maybe |

---

### Important conclusion

The most common reason a fix "isn't working in prod" is one of three things:

1. The Railway deploy hasn't finished yet (check the deploy log, not just the push timestamp).
2. `make db:migrate` was not run after a schema change.
3. An env var is missing or wrong on the Railway service that has the change.

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

#### 1. REPE Context bootstrap (required by nearly every page)

```
GET /bos/repe/context?env_id={env_id}&business_id={business_id}
```

This is the very first call `repo-b` makes. If it returns empty or 404, every downstream page will show blank data. Check `backend/app/routes/repe.py → /context`.

Expected shape:
```json
{
  "business": { "business_id": "...", "name": "Redwood Capital" },
  "funds": [ { "fund_id": "...", "name": "Institutional Growth Fund VII" } ],
  "assets": [ { "asset_id": "...", "name": "Cascade Multifamily" } ]
}
```

#### 2. Fund list / portfolio overview

```
GET /bos/repe/funds?business_id={business_id}
```

Route: `backend/app/routes/repe.py → /funds`.

Expected: returns at least one fund with `name` = `"Institutional Growth Fund VII"`, `fund_type` = `"value_add"` or equivalent, `vintage` = `2022`.

#### 3. Fund detail

```
GET /bos/repe/funds/{fund_id}
```

Route: `backend/app/routes/repe.py → /funds/{fund_id}`.

Expected: `"name"` field present, `"committed_capital"` in the hundreds of millions range matching seed.

#### 4. Fund quarter metrics (drives the Performance KPI strip)

```
GET /bos/api/re/v2/funds/{fund_id}/metrics/{quarter}
```

Quarter format: `"2026Q1"`. Route: `backend/app/routes/re_v2.py → /funds/{fund_id}/metrics/{quarter}`.

Expected for Institutional Growth Fund VII, 2026Q1:
```
gross_irr ≈ 0.124    (12.4%)
net_irr   ≈ 0.099    (9.9%)
gross_tvpi ≈ 1.08
net_tvpi   ≈ 1.02
dpi        ≈ 0.08
rvpi       ≈ 1.00
```

#### 5. Fund investments list (Investments tab)

```
GET /bos/api/re/v2/funds/{fund_id}/investments
```

Route: `backend/app/routes/re_v2.py → /funds/{fund_id}/investments`.

Expected: returns at least one investment row with `"name"` containing `"Cascade"`.

#### 6. Asset cockpit data

The asset cockpit (`/app/re/assets/{asset_id}`) calls several endpoints simultaneously. The critical ones:

```
GET /bos/repe/assets/{asset_id}           ← identity card (name, address, type, units)
GET /bos/api/re/v2/assets/{asset_id}/quarter-state/{quarter}   ← KPI snapshot
```

Expected for Cascade Multifamily:
```
name        = "Cascade Multifamily"
location    = "Aurora, CO" (or similar)
units       = 240
asset_type  = "multifamily"

# quarter-state 2026Q1:
occupancy_rate ≈ 0.918   (91.8%)
cap_rate       ≈ 0.065   (6.5%)
noi            > 0
```

#### 7. Fund investments / JVs (Fund → Investments tab)

```
GET /bos/api/re/v2/funds/{fund_id}/investments
GET /bos/api/re/v2/investments/{investment_id}/jvs
GET /bos/api/re/v2/jvs/{jv_id}/assets?quarter=2026Q1
```

These power the investment rollup table. If JVs return empty, the Investments tab will show no rows even if assets exist.

#### 8. Models list (Models page)

```
GET /bos/api/re/v2/funds/{fund_id}/models
GET /bos/api/re/v2/models
```

Route: `backend/app/routes/re_v2.py → /funds/{fund_id}/models` and `/models`.

Expected: at least one model row seeded — if blank, the Models page is empty.

---

### How to run a live smoke pass manually

If you have the backend running locally on port 8000, export your env_id/business_id and run:

```bash
export BASE="http://localhost:8000"
export ENV_ID="<your env_id from seed>"
export BIZ_ID="<your business_id from seed>"
export FUND_ID="<fund_id for Institutional Growth Fund VII>"
export ASSET_ID="<asset_id for Cascade Multifamily>"

# 1. Context
curl -s "$BASE/bos/repe/context?env_id=$ENV_ID&business_id=$BIZ_ID" | jq '.funds | length'

# 2. Fund list
curl -s "$BASE/bos/repe/funds?business_id=$BIZ_ID" | jq '.[0].name'

# 3. Fund metrics
curl -s "$BASE/bos/api/re/v2/funds/$FUND_ID/metrics/2026Q1" | jq '{gross_irr, net_irr, gross_tvpi, net_tvpi}'

# 4. Asset identity
curl -s "$BASE/bos/repe/assets/$ASSET_ID" | jq '{name, units, asset_type}'

# 5. Asset quarter-state
curl -s "$BASE/bos/api/re/v2/assets/$ASSET_ID/quarter-state/2026Q1" | jq '{occupancy_rate, cap_rate, noi}'
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
2. Run relevant unit/lint checks locally before committing
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

#### Vercel (frontend)
Use `mcp__claude_ai_Vercel__get_deployment` with the deployment ID from the latest push. State must be `READY` before testing any Next.js routes or pages.

The production domain aliases:
- `https://www.paulmalmquist.com` (canonical)
- `https://paulmalmquist.com` (redirects to www)

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
