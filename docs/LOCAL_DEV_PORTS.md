# Local Development Ports

This monorepo now runs a **single canonical backend** and a **frontend**. Demo Lab `/v1/*` routes are served by `backend/`; `repo-c/` is no longer a live local service.

## Service Map

| Service | Directory | Framework | Default Port | Health Check |
|---------|-----------|-----------|-------------|--------------|
| Canonical Backend | `backend/` | FastAPI + Uvicorn | **8000** | `GET /health` |
| Frontend | `repo-b/` | Next.js 14 | **3001** | `GET /` |

## Quick Start

```bash
./dev.sh
make dev
```

Both commands start `backend/` on port `8000` and `repo-b/` on port `3001`.

## Custom Ports

Override via environment variables:

```bash
BACKEND_PORT=9000 FRONTEND_PORT=3002 ./dev.sh
```

## Frontend Routing

The frontend uses one canonical backend origin. `NEXT_PUBLIC_DEMO_API_BASE_URL` remains as a temporary alias, but it must resolve to the same origin as `NEXT_PUBLIC_BOS_API_BASE_URL` / `BOS_API_ORIGIN`.

| Variable | Purpose | Default |
|----------|---------|---------|
| `BOS_API_ORIGIN` | Server-side canonical backend origin | `http://127.0.0.1:8000` |
| `NEXT_PUBLIC_BOS_API_BASE_URL` | Browser-facing canonical backend base | `http://127.0.0.1:8000` |
| `NEXT_PUBLIC_DEMO_API_BASE_URL` | Temporary `/v1/*` compatibility alias | `http://127.0.0.1:8000` |
| `NEXT_PUBLIC_API_BASE_URL` | Legacy browser alias | `http://127.0.0.1:8000` |

### Proxy Architecture

```
Browser
  ├─ /v1/*   → Next.js route handler → backend :8000
  ├─ /api/*  → Next.js route handlers / BFFs → backend :8000
  └─ /bos/*  → Next.js catch-all proxy → backend :8000
```

## Control CLI

Use `scripts/bmctl` for programmatic access:

```bash
./scripts/bmctl health
./scripts/bmctl lab env list
./scripts/bmctl bos dept list
```

## Troubleshooting

**Port already in use**: kill the existing process or choose a new port.

```bash
lsof -nP -iTCP:8000 -sTCP:LISTEN
kill <PID>
```

**Frontend can't reach backend**: check that `BOS_API_ORIGIN`, `NEXT_PUBLIC_BOS_API_BASE_URL`, and any `NEXT_PUBLIC_DEMO_API_BASE_URL` alias all resolve to the same backend host.
