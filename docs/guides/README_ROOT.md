# Consulting App (Business Machine)

Monorepo containing **Business OS** (enterprise workflow engine) and **Demo Lab** (AI-powered demo environment with RAG + HITL).

## Architecture

| Component | Directory | Stack | Port | API Prefix |
|-----------|-----------|-------|------|------------|
| Business OS Backend | `backend/` | FastAPI | 8000 | `/api/*` |
| Demo Lab Backend | `repo-c/` | FastAPI | 8001 | `/v1/*` |
| Frontend (shared) | `repo-b/` | Next.js 14 + TS + Tailwind | 3001 | — |

The frontend serves two UIs:
- **Business OS** (`/app/*`, `/onboarding`, `/documents`) — talks to `backend/` via `NEXT_PUBLIC_BOS_API_BASE_URL`
- **Demo Lab** (`/lab/*`) — talks to `repo-c/` via `NEXT_PUBLIC_DEMO_API_BASE_URL`

Auth: invite-code login sets cookie `demo_lab_session`; middleware protects all routes.

## Prerequisites

- **Python 3.11+** (for both backends)
- **Node.js 18+** / npm (for frontend)
- **PostgreSQL** with pgvector extension (Supabase hosted or local Docker)
- Copy `.env.example` files and fill in real values:
  ```
  cp .env.example .env.local
  cp backend/.env.example backend/.env
  cp repo-b/.env.example repo-b/.env.local
  cp repo-c/.env.example repo-c/.env
  ```

## Quick Start

### Option 1: All services at once (Business OS + Demo Lab)

```bash
make dev
```

This starts `backend/` (port 8000), `repo-c/` (port 8001), and `repo-b/` (port 3001).

### Option 2: Business OS only

```bash
make dev-bos
```

Starts `backend/` + `repo-b/`.

### Option 3: Demo Lab only

```bash
make dev-demo
```

Starts `repo-c/` + `repo-b/`.

## Common Commands

```bash
make dev           # Start all services
make test          # Run all tests (backend + demo lab + frontend)
make test-backend  # Backend (Business OS) tests only
make test-demo     # Demo Lab tests only
make test-e2e      # Playwright E2E tests
make lint          # Lint all code
make fmt           # Format all code
make db:migrate    # Apply DB migrations
make db:seed       # Seed DB with sample data
```

## Database

### Schemas

- **Business OS backbone**: `repo-b/db/schema/` (numbered SQL files, applied via `apply.js`)
- **Business OS extension**: `repo-b/db/business_os_schema.sql`
- **Demo Lab**: per-environment schemas created dynamically by `repo-c/`

### Migrations

```bash
# Dry run (show SQL, don't execute)
make db:dry

# Apply migrations
make db:migrate

# Verify schema
make db:verify
```

## Environment Variables

| Variable | Used By | Description |
|----------|---------|-------------|
| `DATABASE_URL` | backend | Postgres connection string |
| `SUPABASE_DB_URL` | repo-c | Postgres connection (Demo Lab) |
| `SUPABASE_URL` | backend, repo-c | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | backend, repo-c | Supabase service role key |
| `NEXT_PUBLIC_BOS_API_BASE_URL` | repo-b | Business OS backend URL |
| `NEXT_PUBLIC_DEMO_API_BASE_URL` | repo-b | Demo Lab backend URL |
| `DEMO_INVITE_CODE` | repo-b | Auth invite code |

See each sub-project's `.env.example` for the full list.

## Deployment

### Vercel (Frontend — repo-b)
1. Set env vars: `NEXT_PUBLIC_BOS_API_BASE_URL`, `NEXT_PUBLIC_DEMO_API_BASE_URL`, `DEMO_INVITE_CODE`
2. Deploy `repo-b/` to Vercel
3. Add custom domain `app.<domain>`

### Fly.io (Demo Lab API — repo-c)
1. Set secrets per `repo-c/.env.example`
2. Ensure Supabase Postgres has pgvector enabled
3. Deploy using `repo-c/Dockerfile`
4. Add custom domain `api.<domain>`

### Backend (Business OS API)
1. Set secrets per `backend/.env.example`
2. Deploy as a standard Python ASGI app

## Documentation

- `docs/execution-engine-v1/` — canonical schema, capability contracts, bootstrap flow
- `docs/LOCAL_AI_SIDECAR.md` — local AI sidecar setup
- `ROADMAP.md` — feature roadmap and test plan
- `orchestration/README.md` — controlled parallel Codex orchestration (sessions, branch isolation, scope/risk controls, audit logs)

## Controlled Codex Orchestration

This repository includes a production orchestration layer for Codex execution:

- Runner: `scripts/codex_orchestrator.py`
- Contracts/policies: `orchestration/*.json` and `orchestration/*.md`
- Runtime state: `.orchestration/`
- Hooks installer: `scripts/install_orchestration_hooks.sh`

Quick start:

```bash
./scripts/install_orchestration_hooks.sh
python3 scripts/codex_orchestrator.py session create --session-id <uuid> --intent ui_refactor --model fast --reasoning-effort low --allowed-directories repo-b/src/app --allowed-tools read,edit,shell --max-files-per-execution 20
python3 scripts/codex_orchestrator.py run --session-id <uuid> --prompt \"Refactor hero CTA spacing\" --approval-text CONFIRM
python3 scripts/codex_orchestrator.py log verify-chain
```
