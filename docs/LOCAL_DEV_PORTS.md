# Local Development Ports

This monorepo runs **two backends** and a **frontend**. All three must be running
for full functionality.

## Service Map

| Service | Directory | Framework | Default Port | Health Check |
|---------|-----------|-----------|-------------|--------------|
| Business OS Backend | `backend/` | FastAPI + Uvicorn | **8000** | `GET /health` |
| Demo Lab Backend | `repo-c/` | FastAPI + Uvicorn | **8001** | `GET /health` |
| Frontend | `repo-b/` | Next.js 14 | **3001** | `GET /` |

## Quick Start

```bash
# Start everything (recommended)
./dev.sh

# Or via Makefile
make dev

# Start only Business OS backend + frontend
make dev-bos

# Start only Demo Lab backend + frontend
make dev-demo
```

## Custom Ports

Override via environment variables:

```bash
BACKEND_PORT=9000 DEMO_LAB_PORT=9001 FRONTEND_PORT=3002 ./dev.sh
```

## How the Frontend Talks to Each Backend

The Next.js frontend uses **environment variables** to route API calls:

| Variable | Purpose | Default |
|----------|---------|---------|
| `NEXT_PUBLIC_BOS_API_BASE_URL` | Business OS backend | `http://127.0.0.1:8000` |
| `NEXT_PUBLIC_DEMO_API_BASE_URL` | Demo Lab backend | `http://127.0.0.1:8001` |
| `NEXT_PUBLIC_API_BASE_URL` | Legacy single-backend (deprecated) | `http://127.0.0.1:8000` |

### Proxy Architecture

The frontend proxies all backend calls through Next.js route handlers to avoid
CORS issues:

```
Browser
  ├─ /v1/*            → Next.js catch-all → Demo Lab backend (repo-c :8001)
  ├─ /api/v1/*        → Next.js route handler → Demo Lab (with fallback)
  ├─ /api/businesses  → Next.js route handler → Business OS (backend :8000)
  └─ /api/tasks/*     → Next.js route handler → Business OS (backend :8000)
```

Fallback: if the Demo Lab backend is unreachable, several `/api/v1/*` routes
fall back to a local Postgres implementation (`src/lib/labV1Fallback.ts`).

## API Client Files

| File | Talks to | Import |
|------|----------|--------|
| `repo-b/src/lib/api.ts` | Demo Lab (`/v1/*`) | `apiFetch<T>(path, options)` |
| `repo-b/src/lib/bos-api.ts` | Business OS (`/api/*`) | `bosFetch<T>(path, options)` |
| `repo-b/src/lib/pipeline-api.ts` | Demo Lab pipeline | Uses `apiFetch` |

## Control CLI

Use `scripts/bmctl` for programmatic access:

```bash
./scripts/bmctl health              # Check all services
./scripts/bmctl lab env list        # List Demo Lab environments
./scripts/bmctl bos dept list       # List Business OS departments
```

See `scripts/bmctl help` for full usage.

## Troubleshooting

**Port already in use**: `dev.sh` checks ports before starting. Kill the
occupying process or set a different port:
```bash
lsof -nP -iTCP:8000 -sTCP:LISTEN
kill <PID>
```

**Frontend can't reach backend**: Check that the `NEXT_PUBLIC_*` env vars
in `repo-b/.env.local` match the actual backend ports.

**Demo Lab not responding**: Make sure repo-c is started — it runs separately
from the Business OS backend. Check with `curl http://127.0.0.1:8001/health`.
