# Local AI Sidecar (Codex) — Developer/Operator Only

This repo supports a **local-only** AI sidecar that shells out to the installed
`codex` CLI using your **local ChatGPT-managed login**. It is not intended for
production or multi-user use.

## What You Get
- Next.js UI (repo-b) calls Business OS FastAPI backend (backend) only
- Backend calls a localhost sidecar (`scripts/ai_sidecar.py`)
- Sidecar runs `codex exec` with a read-only sandbox and strict timeouts
- Global Command Bar (repo-b) can call local Codex bridge endpoints at `/api/ai/codex/*`

## Install / Auth
1. Ensure `codex` is installed and on PATH:
   - `codex --version`
2. Log in once (interactive):
   - `codex login`

No credentials are stored in this repo.

## Configure
Backend environment variables (for local dev):
- `AI_MODE=local`
- `AI_SIDECAR_URL=http://127.0.0.1:7337`

Frontend:
- `NEXT_PUBLIC_AI_MODE=local`

## Start
From repo root:
```bash
chmod +x scripts/ai_start_sidecar.sh scripts/ai_check_sidecar.sh
./scripts/ai_start_sidecar.sh
```

`ai_start_sidecar.sh` will create a local venv at `.venv_ai_sidecar/` if needed.

In another terminal:
```bash
AI_SIDECAR_URL=http://127.0.0.1:7337 ./scripts/ai_check_sidecar.sh
```

## Verify Backend Health
With backend running:
- `GET /api/ai/health` should return `{ enabled: true, sidecar_ok: true, ... }`

With repo-b running:
- `GET /api/ai/codex/health` should return `{ ok: true, mode: "local", ... }`
- Global command bar toggle should appear on every page.

## Production Safety
- Vercel should keep `AI_MODE` unset or `off`.
- In production, `/api/ai/codex/run` and `/api/ai/codex/stream` return `403`.
- The command bar remains visible but shows `Local-only` state and disables command execution.

## Troubleshooting
- Port in use: set `AI_SIDECAR_PORT=7338` (and update `AI_SIDECAR_URL`)
- Auth expired: re-run `codex login`
- Sidecar times out: increase `AI_TIMEOUT_MS` in backend env (local only)
