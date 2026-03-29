# Consulting App (Business Machine)

Monorepo containing the canonical Business Machine backend, the shared Next.js frontend, SQL-first schema ownership, and the Excel add-in. Demo Lab `/v1/*` compatibility now lives in `backend/`; `repo-c/` is no longer a runtime service.

## Architecture

| Component | Directory | Stack | Port | API Prefix |
|-----------|-----------|-------|------|------------|
| Canonical Backend | `backend/` | FastAPI | 8000 | `/api/*`, `/v1/*` |
| Frontend | `repo-b/` | Next.js 14 + TS + Tailwind | 3001 | `/bos/*`, `/v1/*` proxies |
| Excel Add-in | `excel-addin/` | React + Webpack | n/a | calls `/v1/*` on backend |

Auth: `bos_session` is the canonical cookie. Legacy `demo_lab_session` reads may remain temporarily for compatibility, but new code and docs should use `bos_session`.

## Prerequisites

- Python 3.11+
- Node.js 18+ / npm
- PostgreSQL with pgvector
- Copy env files and fill real values:

```bash
cp .env.example .env.local
cp backend/.env.example backend/.env
cp repo-b/.env.example repo-b/.env.local
```

## Quick Start

```bash
make dev
```

This starts `backend/` on port `8000` and `repo-b/` on port `3001`.

Legacy aliases still exist:

```bash
make dev-bos
make dev-demo
```

Both now start the same canonical backend + frontend topology.

## Common Commands

```bash
make dev
make test
make test-backend
make test-frontend
make test-e2e
make lint
make fmt
make db:migrate
make db:seed
```

## Database

- Canonical SQL schema: `repo-b/db/schema/`
- Apply/verify scripts: `repo-b/db/schema/apply.js`, `repo-b/db/schema/verify.js`
- Demo Lab compatibility schema now lives under the same canonical SQL ownership; do not add new runtime DDL outside `repo-b/db/schema/`.

## Environment Variables

| Variable | Used By | Description |
|----------|---------|-------------|
| `DATABASE_URL` | backend | Postgres connection string |
| `SUPABASE_URL` | backend | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | backend | Supabase service role key |
| `BOS_API_ORIGIN` | repo-b | Canonical backend origin for server-side proxying |
| `NEXT_PUBLIC_BOS_API_BASE_URL` | repo-b | Browser-facing canonical backend URL |
| `NEXT_PUBLIC_DEMO_API_BASE_URL` | repo-b | Temporary `/v1/*` alias; must match BOS origin |
| `DEMO_INVITE_CODE` | repo-b | Auth invite code |

## Deployment

### Vercel (Frontend — repo-b)
1. Set `BOS_API_ORIGIN`, `NEXT_PUBLIC_BOS_API_BASE_URL`, `DEMO_INVITE_CODE`, and any temporary DEMO alias vars to the same backend origin.
2. Deploy `repo-b/` to Vercel.
3. Point `app.<domain>` to Vercel.

### Backend (Business OS API)
1. Set secrets per `backend/.env.example`.
2. Deploy as a standard Python ASGI app.
3. Treat it as the sole runtime owner for `/api/*` and `/v1/*`.
