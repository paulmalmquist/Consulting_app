# Consulting_app Roadmap: Environments, Data, Reporting, Tests

Date: 2026-02-10

This document inventories the repo and lays out a forward plan (features + hardening + exhaustive tests) to fully support:
- creating many client "environments" (tenants/businesses/envs)
- interacting with them (switching context, running actions, HITL)
- inserting/ingesting data (structured + documents)
- reporting (auditability, metrics, exports)

---

## 1. Repository Inventory (Current State)

### 1.1 Top-Level Modules

- `repo-b/` (Next.js 14 / TS / Tailwind)
  - Contains two UIs:
    - Demo Lab UI under `/lab/*` (expects API paths under `/v1/*`)
    - Business OS UI under `/app/*`, `/onboarding`, `/documents` (expects API paths under `/api/*`)
  - Invite-code login sets cookie `demo_lab_session` and middleware protects `/lab`, `/app`, `/onboarding`, `/documents`.

- `backend/` (FastAPI: "Business OS Backend")
  - API prefix mostly `/api/*` + `/health`.
  - Supports: templates/catalog, business provisioning, documents (signed upload + versions + signed download), executions (currently stub), AI Gateway endpoints (`/api/ai/*`).
  - DB schema lives in `repo-b/db/schema.sql` (base) and `repo-b/db/business_os_schema.sql` (extension + seeds).

- `repo-c/` (FastAPI: "Demo Lab API")
  - API prefix `/v1/*` + `/health`.
  - Provides: environment management, uploads + pgvector indexing, RAG chat, HITL queue, audit log, metrics.
  - Uses per-environment schemas (schema name derived from env_id) plus shared `platform.*` tables.

- `docs/`
  - `execution-engine-v1/*`: canonical schema + capability contract + bootstrap flow and infra boundary notes.
  - `LOCAL_DEV_PORTS.md`: local service topology and ports.

- `scripts/`
  - `dev_all.sh` (existing): starts `backend` and `repo-b`.
  - `dev.sh` (added): root entrypoint to start backend+frontend together.

### 1.2 Key Endpoints (What Exists Today)

Business OS backend (`backend/`):
- `GET /health`
- `GET /api/templates`
- `POST /api/businesses`
- `POST /api/businesses/{business_id}/apply-template`
- `POST /api/businesses/{business_id}/apply-custom`
- `GET /api/businesses/{business_id}/departments`
- `GET /api/businesses/{business_id}/departments/{dept_key}/capabilities`
- `GET /api/departments`
- `GET /api/departments/{dept_key}/capabilities`
- Documents:
  - `POST /api/documents/init-upload` (creates document + version + signed upload URL)
  - `POST /api/documents/complete-upload` (finalizes a version)
  - `GET /api/documents?business_id=...&department_id=...`
  - `GET /api/documents/{document_id}/versions`
  - `GET /api/documents/{document_id}/versions/{version_id}/download-url`
- Executions:
  - `POST /api/executions/run` (stub: writes a completed execution row)
  - `GET /api/executions?business_id=...`
- Local AI (developer-only):
  - `GET /api/ai/health`
  - `POST /api/ai/ask`
  - `POST /api/ai/code_task` (dry_run only)

Demo Lab API (`repo-c/`):
- `GET /health`
- Environment lifecycle:
  - `GET /v1/environments`
  - `POST /v1/environments`
  - `POST /v1/environments/{env_id}/reset`
- Data and workflows:
  - `GET /v1/environments/{env_id}/documents`
  - `POST /v1/environments/{env_id}/upload` (extract text + chunk + embed + store vectors)
  - `POST /v1/chat` (vector retrieval + LLM + optional HITL enqueue)
  - `GET /v1/queue?env_id=...`
  - `POST /v1/queue/{queue_id}/decision`
  - `GET /v1/audit?env_id=...`
  - `GET /v1/metrics?env_id=...`

---

## 2. Primary Gaps / Risks (Fix Early)

### 2.1 Split Backend Confusion (Single API base URL)

`repo-b` currently assumes one `NEXT_PUBLIC_API_BASE_URL`, but:
- `/lab/*` expects `/v1/*` endpoints (Demo Lab API: `repo-c`)
- `/app/*` expects `/api/*` endpoints (Business OS backend: `backend`)

This prevents both feature sets from working simultaneously without:
- separate base URLs, or
- a proxy/rewrite layer, or
- merging the backends.

### 2.2 Upload Robustness (Business OS)

`backend/app/repos/supabase_storage_repo.py` falls back to a direct upload URL if signed upload fails.
The UI uploads with a plain PUT to the signed URL without auth headers. If fallback is used, uploads will fail.

### 2.3 Auth is Demo-Only

Invite-code cookie auth is fine for demos but not for multi-user / multi-tenant production.
Business OS SQL includes RLS primitives (`app.set_request_context`, policies), but the backend does not set request context.

### 2.4 GitHub Pages Workflow vs Next.js Runtime

`.github/workflows/deploy-pages.yml` expects a static export in `repo-b/out`, but `repo-b/next.config.js` is configured for a normal Next app (API routes/middleware).

---

## 3. Direction Choice (Pick One to Reduce Drag)

### Option A (Recommended Short-Term): Keep Both Backends, Split Frontend API Bases

Keep:
- Business OS backend: `backend` at `BOS_API_BASE_URL`
- Demo Lab API: `repo-c` at `DEMO_API_BASE_URL`

Change `repo-b` to use two environment variables:
- `NEXT_PUBLIC_BOS_API_BASE_URL` for `/api/*` calls (Business OS)
- `NEXT_PUBLIC_DEMO_API_BASE_URL` for `/v1/*` calls (Demo Lab)

Pros:
- minimal refactor, fastest to unblock both UIs
Cons:
- duplicated concepts (documents, environments, audit)

### Option B (Recommended Mid-Term): Converge on One Backend

Port Demo Lab capabilities (env schemas + RAG + HITL + audit + metrics) into `backend/`.

Pros:
- one API surface, one auth, one DB schema story
Cons:
- more refactor now

This roadmap assumes Option A first, then a convergence plan once features stabilize.

---

## 4. Roadmap (Phased)

### Phase 0: Hygiene + Dev Ergonomics (1-2 days)

- [ ] Add a single canonical "how to run locally" section to root `README.md` for:
  - Business OS only (backend + repo-b)
  - Demo Lab only (repo-c + repo-b)
  - Both (if Option A implemented)
- [ ] Ensure secrets are not tracked:
  - remove tracked `.env.local` from git history/state (rotate any leaked values)
  - verify token scratch files stay ignored
- [ ] Add `Makefile` or `justfile` commands:
  - `dev`, `test`, `lint`, `fmt`, `db:migrate`, `db:seed`
- [ ] Standardize env var naming:
  - Business OS currently uses `DATABASE_URL`
  - Demo Lab uses `SUPABASE_DB_URL`
  - choose a naming convention and document it

### Phase 1: Environment Model + API Wiring (2-5 days)

Goal: reliably create and switch among many environments, and ensure the UI talks to the right backend.

- [ ] Frontend API split (Option A):
  - introduce `NEXT_PUBLIC_BOS_API_BASE_URL` and `NEXT_PUBLIC_DEMO_API_BASE_URL`
  - update:
    - `repo-b/src/lib/bos-api.ts` -> use BOS base
    - `repo-b/src/lib/api.ts` and `/lab/*` -> use DEMO base
  - update `.env.example` accordingly

- [ ] Add first-class environment selector for Business OS:
  - today: Business OS stores a single `bos_business_id` in localStorage
  - implement:
    - list businesses for a tenant (needs auth)
    - switch active business (and show it in UI top bar)

- [ ] Environment lifecycle completeness (Demo Lab):
  - add endpoints:
    - `POST /v1/environments/{env_id}/archive` (set is_active=false, block writes)
    - `DELETE /v1/environments/{env_id}` (optional; likely dangerous)
    - `POST /v1/environments/{env_id}/clone` (new env seeded from old)
  - schema versioning:
    - store `schema_version` in `platform.environments`
    - migrate env schemas forward with idempotent DDL

### Phase 2: Data Insertion, Ingestion, and Retrieval (1-3 weeks)

Goal: insert structured data, ingest documents, and query/report reliably.

Business OS (`backend`):
- [ ] Make uploads robust:
  - always return a real signed URL that supports unauthenticated PUT, OR
  - proxy uploads through the backend, OR
  - include required auth headers in the UI PUT (prefer not to ship service role to browser)
- [ ] Implement ingestion pipeline (aligning with `repo-b/db/schema.sql` tables):
  - extract text into `app.document_text`
  - chunk into `app.document_chunks`
  - enqueue in `app.document_ingest_queue`
  - add pgvector embedding column/table as needed
- [ ] Add search/RAG endpoints:
  - `POST /api/search` (top-k chunks + citations)
  - `POST /api/chat` (business-scoped chat; gate by certification where applicable)

Demo Lab (`repo-c`):
- [ ] Add CRUD endpoints for structured records:
  - tickets: create/update/list
  - crm_notes: create/list
  - consistent audit log coverage for all mutations
- [ ] Make upload scalable:
  - file size limits, streaming, background indexing job
  - idempotency keys for retries

### Phase 3: Execution Engine v1 (2-6 weeks)

Goal: replace the stub execution with an auditable, replayable engine that matches `docs/execution-engine-v1/*`.

- [ ] Replace `POST /api/executions/run` stub with:
  - queued job creation (status transitions queued -> running -> completed/failed)
  - deterministic run envelopes and lineage fields
  - invariant checks (machine-checkable)
  - output materialization + linking to documents
- [ ] Store capability manifests and enforce contracts:
  - adopt a machine-readable contract file format (YAML/JSON)
  - validate required lineage fields on every write
- [ ] Add HITL and certification gates:
  - approvals for high-risk steps
  - certification workflow (candidate -> certified) with audit trail

### Phase 4: Reporting, Metrics, and Exports (1-3 weeks)

Goal: "tell me what happened" across environments and prove it.

- [ ] Business OS reporting endpoints:
  - per-business metrics (documents, executions, approvals, errors)
  - audit log table (append-only events) + UI view
  - exports (CSV/JSON) for documents/runs/audit
- [ ] Cross-environment reporting (admin-only):
  - compare environments (prod vs uat) and show drift
  - throughput and SLA dashboards

---

## 5. Exhaustive Test Plan (What to Build Next)

### 5.1 Testing Stack (Recommended)

- Python:
  - `pytest` for unit/integration
  - `respx` to mock `httpx` calls (Supabase REST, OpenAI/Anthropic)
  - Postgres test DB:
    - either `testcontainers` for ephemeral Postgres+pgvector, or
    - `docker-compose` service for local + CI
- Frontend:
  - `playwright` for E2E (multi-page flows; file uploads)
  - optional `vitest` + React Testing Library for components

### 5.2 Test Data / Fixtures (Create Once, Reuse Everywhere)

- `fixtures/docs/`:
  - small `.txt`, `.md`, and 1-2 `.pdf` with known content
- `fixtures/db/`:
  - seed SQL or Python fixtures for:
    - at least 2 environments (demo)
    - at least 2 businesses with different enabled depts/caps (bos)

### 5.3 Backend (Business OS) Test Suites

Create `backend/tests/` and cover:

Config / bootstrap:
- [ ] fails fast when `DATABASE_URL` missing (already in `TEST_PLAN.md`)
- [ ] parses `ALLOWED_ORIGINS` correctly
- [ ] CORS preflight covers allowed origins

Business provisioning:
- [ ] `POST /api/businesses` creates tenant + business
- [ ] template apply enables correct departments/capabilities
- [ ] custom apply enables only selected
- [ ] departments/capabilities listing matches enabled flags
- [ ] negative cases:
  - unknown template key -> 400
  - business not found -> 404

Documents:
- [ ] `init-upload` creates `documents` + `document_versions` rows
- [ ] storage key format is stable and includes tenant/business/department/doc/version
- [ ] `complete-upload` transitions version to available and stores size/hash
- [ ] list documents filters by business and optional department
- [ ] versions list order is descending by version_number
- [ ] download-url returns a signed URL (mock Supabase REST)
- [ ] failure modes:
  - missing business -> 404
  - complete-upload unknown version -> 404

Executions (today, stub):
- [ ] `POST /api/executions/run` writes an execution row and returns completed outputs
- [ ] list executions filters by business and optional dept/cap

Local AI:
- [ ] retrieval never reads `.env*` or denied paths (`backend/app/ai/retrieval.py`)
- [ ] `/api/ai/health` returns the legacy gateway redirect payload
- [ ] `/api/ai/ask` returns a gateway redirect for legacy callers
- [ ] prompt size limit returns 413

### 5.4 Demo Lab API (repo-c) Test Suites

Expand `repo-c/tests/` to cover:

Environment lifecycle:
- [ ] create environment:
  - creates platform tables if missing
  - creates env schema and seeds records
  - audit log contains create event
- [ ] list environments returns newest-first and includes schema_name/is_active
- [ ] reset environment drops and recreates schema, reseeds, logs audit
- [ ] negative: reset/list on missing env -> 404

Upload and indexing:
- [ ] upload `.txt` and `.pdf`:
  - creates document row
  - creates chunks and vector embeddings
  - chunk_count matches expectations
- [ ] upload rejects unsupported types
- [ ] "no text extracted" yields 400

Chat + citations:
- [ ] chat returns `answer`, `citations`, `suggested_actions`
- [ ] citations reference existing stored chunks
- [ ] retrieval uses pgvector distance ordering (at least sanity checks)
- [ ] LLM calls:
  - mocked OpenAI/Anthropic success
  - fallback response when keys missing

HITL queue + actions:
- [ ] medium/high risk messages enqueue queue item
- [ ] approve executes action and writes audit
- [ ] deny writes audit and does not execute
- [ ] queue list returns pending only

Metrics:
- [ ] counts:
  - uploads_count increments with upload
  - tickets_count increments when action creates ticket
  - pending_approvals changes after enqueue/decision
- [ ] approval_rate/override_rate and avg_time_to_decision_sec calculations are correct

### 5.5 Frontend (repo-b) E2E Tests (Playwright)

Auth and routing:
- [ ] visiting protected routes without cookie redirects to `/login`
- [ ] login with wrong invite code shows error
- [ ] login with correct code sets cookie and allows access

Business OS flows:
- [ ] onboarding creates business and lands in first department
- [ ] sidebar lists enabled capabilities
- [ ] execute an action capability:
  - fill inputs
  - if file input: upload doc and run execution
  - verify run result UI renders outputs
- [ ] documents page:
  - upload a doc
  - open doc detail
  - verify versions and download link behavior

Demo Lab flows:
- [ ] create environment and auto-select it
- [ ] upload & index a document and see it listed
- [ ] chat returns an answer and citations
- [ ] enqueue an action (trigger medium/high risk), approve in queue, verify audit entry exists
- [ ] metrics page changes after actions/uploads

### 5.6 CI Gates (Automation)

- [ ] Python unit + integration tests for `backend/` and `repo-c/` on every PR
- [ ] Playwright E2E against locally started servers in CI (dockerized DB as needed)
- [ ] OpenAPI snapshot/contract check (optional but useful)
- [ ] Lint/format checks:
  - Python (ruff/black) and TS (eslint/prettier) if adopted

---

## 6. Definition of Done (For "Environments" Feature Complete)

An "environment" is feature-complete when:
- it can be created, listed, selected, and archived
- it supports ingestion of documents and insertion of structured data
- all mutations write audit events
- reporting endpoints produce correct metrics and exportable datasets
- a full E2E run (UI) can:
  - create an environment/business
  - ingest documents
  - run an action
  - review audit + metrics
  - repeat in a second environment and compare results
