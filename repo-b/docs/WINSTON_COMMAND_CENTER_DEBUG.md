# Winston Command Center Debug Guide

## Local ports
- Frontend (Next.js): `http://127.0.0.1:3001`
- Business backend (FastAPI): `http://127.0.0.1:8000`
- Demo backend (FastAPI): `http://127.0.0.1:8001`
- Codex sidecar: `http://127.0.0.1:7337`

## Required env vars
- `AI_MODE=local` to enable local codex routes.
- `AI_SIDECAR_URL=http://127.0.0.1:7337`
- `USE_CODEX_SERVER=true|false`
- `USE_MOCKS=true|false`
- `NEXT_PUBLIC_USE_CODEX_SERVER=true|false`
- `NEXT_PUBLIC_USE_MOCKS=true|false`

## Correlation IDs
- Client sends `x-request-id` on every assistant call.
- Server echoes `x-request-id` response header.
- Run creation returns `run_id`.
- Server logs include both IDs on:
  - `/api/mcp/plan`
  - `/api/commands/confirm`
  - `/api/commands/execute`
  - `/api/commands/runs/[runId]`
  - `/api/ai/codex/health`

## Diagnostics button checks
1. Codex bridge health (`/api/ai/codex/health`)
2. Bridge mode/version summary
3. Permissions (`/api/mcp/context-snapshot`)
4. Sample dry-run plan (`/api/mcp/plan`, read-only prompt)

Each check records latency and status badge.

## Common failure signatures
- `401 Authentication required`:
  - Missing `demo_lab_session`/`bos_session` cookie.
  - Middleware blocked private API call.
- `403 Local Codex routes are disabled`:
  - `AI_MODE` is not `local`.
- `Response validation failed for /api/mcp/plan`:
  - Planner payload shape changed or malformed.
  - Open Advanced drawer and inspect `raw.plan`.
- `Planner timeout` / `Request failed (504)`:
  - Upstream planner route is timing out.
  - Retry using mock mode (`USE_MOCKS=true`) to isolate UI.

## Reproduction sequence
1. `npm run dev` in `repo-b`.
2. Confirm sidecar health: `curl -H 'Cookie: demo_lab_session=active' http://127.0.0.1:3001/api/ai/codex/health`.
3. Open Winston Command Center from any page.
4. Run `Quick Action -> List Environments`.
5. Confirm and execute.
6. Open Advanced drawer and run Diagnostics.
