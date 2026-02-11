# Consulting App Feature Inventory

## Product Overview
- Monorepo hosting two experiences that share a UI but talk to distinct backends:
  - **Business OS (enterprise workflow engine)** served by `backend/` (FastAPI, port 8000, `/api/*`).
  - **Demo Lab (AI-powered, ground-truth + RAG testing ground)** served by `repo-c/` (FastAPI, port 8001, `/v1/*`).
- Shared Next.js 14 + TypeScript + Tailwind frontend in `repo-b/` exposes both experiences:
  - Business OS UI under `/app/*`, `/onboarding`, `/documents` (talks to `NEXT_PUBLIC_BOS_API_BASE_URL`).
  - Demo Lab UI under `/lab/*` (talks to `NEXT_PUBLIC_DEMO_API_BASE_URL`).
- Invite-code cookie auth gates both UIs (`demo_lab_session`) and middleware protects authenticated routes.

## Business OS Features (backend + UI)
- **Template / catalog management**: `/api/templates` plus business provisioning endpoints let you apply templates or custom setups to new businesses.
- **Business provisioning**: create businesses (`POST /api/businesses`), list departments, and enumerate department capabilities for contextual workflows.
- **Document lifecycle**: signed upload initialization (`POST /api/documents/init-upload`), completion (`/complete-upload`), version listing, and download URLs keep assets versioned and secure.
- **Execution scaffolding**: stubbed execution runner (`POST /api/executions/run`, `GET /api/executions`) records workflow results (ready for richer engine integration).
- **Developer AI tooling**: local sidecar endpoints (`/api/ai/health`, `/api/ai/ask`, `/api/ai/code_task`) support dry-run Copilot-style interactions during development.
- **Frontend interactions**: Business OS UI surfaces onboarding, document galleries, and capability browsing while speaking to the Business OS backend via `bos-api.ts`.

## Demo Lab Features (AI experimentation)
- **Multi-environment support**: CRUD + lifecycle endpoints (`GET /v1/environments`, `POST /v1/environments`, reset/clone requests, draft archive/delete plans) provision isolated environments per tenant.
- **Document ingestion + indexing**: upload endpoint (`POST /v1/environments/{env_id}/upload`) extracts text, chunks it, embeds with pgvector, and stores vectors per environment schema.
- **RAG chat with HITL**: `/v1/chat` pipelines vector retrieval plus LLM responses and optionally enqueues ambiguous cases into a manual HITL queue (`/v1/queue`).
- **HITL decisioning**: queue listing, decision submissions, and environment auditing capture human review of uncertain responses.
- **Audit + metrics**: `/v1/audit` and `/v1/metrics` expose usage trails and telemetry for each environment.
- **Supabase-backed isolation**: per-environment Postgres schemas (schema name derived from env ID plus shared `platform.*` tables) keep data separable.
- **Demo Lab UI**: `/lab/*` path allows operators to interact with environments, view vectors, and trigger HITL flows through the shared frontend.

## Shared Capabilities & Infrastructure
- **Architecture**: FastAPI backends (`backend/`, `repo-c/`) with Next.js frontend ensures API-first flows plus in-browser UI for both products.
- **Datastore**: PostgreSQL with `pgvector` extension used by both backends; Business OS schema files live under `repo-b/db/` while Demo Lab schemas are generated per env.
- **Authentication**: invite-code login (configured via `DEMO_INVITE_CODE`) issues `demo_lab_session` cookie; middleware enforces route protection.
- **Environment variables**: `DATABASE_URL`, `SUPABASE_DB_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_BOS_API_BASE_URL`, `NEXT_PUBLIC_DEMO_API_BASE_URL`, and `DEMO_INVITE_CODE` configure connections and base URLs for each service.
- **Local tooling**: helper scripts in `scripts/`, `dev.sh`, and Makefile targets (`dev`, `test`, `lint`, `fmt`, `db:migrate`, `db:seed`, etc.) streamline development and migrations.

## Operations & Deployment Highlights
- **Quick start**:
  1. `make dev` → launches backend, Demo Lab API, and frontend.
  2. `make dev-bos` → runs Business OS backend + frontend.
  3. `make dev-demo` → runs Demo Lab API + frontend.
- **Testing & maintenance**: dedicated `make` targets for backend/demo/e2e tests along with linting and formatting commands keep quality consistent.
- **Database workflow**: `make db:dry`, `make db:migrate`, `make db:verify` show/apply migrations and confirm schema state.
- **Deployments**:
  - Frontend (`repo-b/`) ships via Vercel with separate env vars per backend.
  - Demo Lab API (`repo-c/`) deploys to Fly.io with Supabase pgvector-enabled Postgres.
  - Business OS API (`backend/`) can deploy as a standalone Python ASGI app with secrets from `.env.example`.

## Documentation & Next-phase Focus
- **Docs**: `docs/execution-engine-v1/` captures schema contracts and bootstrap flows; `docs/LOCAL_AI_SIDECAR.md` documents local AI sidecar setup.
- **Roadmap focus (Feb 2026)**:
  1. Split frontend API bases so `/app`/ `/lab` each talk to their designated backend.
  2. Improve Business OS environment selector, multi-business context, and template wiring.
  3. Harden uploads, add ingestion pipelines, and expand Demo Lab lifecycle (archive/clone) plus schema versioning.
  4. Expand auditability, metrics, and HITL tooling while documenting conventions.

