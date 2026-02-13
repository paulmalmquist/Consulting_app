# Demo Lab UI (Repo B)

Next.js app for the Demo Lab UI deployed to Vercel.

## Features
- Shared invite-code login
- Environment dashboard + creation wizard
- Uploads, chat, HITL queue, audit log, metrics

## Setup
```bash
npm install
cp .env.example .env.local
```

## Development
```bash
npm run dev
```

## Local Codex Command Bar Setup
The Command panel in `/lab` expects a local HTTP sidecar that wraps the `codex` CLI.

1. Install/login Codex CLI on your machine:
```bash
codex login
```
2. Set local AI env vars in `repo-b/.env.local`:
```bash
AI_MODE=local
NEXT_PUBLIC_AI_MODE=local
AI_SIDECAR_URL=http://127.0.0.1:7337
AI_SIDECAR_PORT=7337
AI_SIDECAR_TOKEN=change-me-strong-token
```
3. Start the sidecar in one terminal:
```bash
npm run ai:sidecar
```
4. Start Next.js in another terminal:
```bash
npm run dev
```

Notes:
- This is local-only by default. Vercel serverless functions cannot reach your laptop's `127.0.0.1`.
- For hosted AI commands, deploy a reachable sidecar service and point `AI_SIDECAR_URL` to it.
- Deployment guide: `docs/SIDECAR_DEPLOY.md`.

## Environment Variables
- `DEMO_INVITE_CODE` - Shared invite code for `/login` (server-side only).
- `DATABASE_URL` - Required for real `app.environments` DB reads/writes in `/api/v1/environments`.
- `DEMO_API_ORIGIN` - Optional upstream origin for `/api/v1/*` proxy-first behavior. If unset or upstream returns 404/501, local fallback handlers respond.
- `DEMO_API_BASE_URL` - Optional alternative server-side upstream origin.
- `NEXT_PUBLIC_DEMO_API_BASE_URL` / `NEXT_PUBLIC_API_BASE_URL` - Optional browser API base overrides. Default is same-origin (`/v1/*` rewrite to `/api/v1/*`).
- `AI_MODE` / `NEXT_PUBLIC_AI_MODE` - Set both to `local` to enable local Codex command routes.
- `AI_SIDECAR_URL` - URL for sidecar API (`/health`, `/ask`), default `http://127.0.0.1:7337`.
- `AI_SIDECAR_TOKEN` - Optional bearer token used by app and sidecar; strongly recommended for non-local deployments.

## Deployment Checklist (Vercel)
1. Set Production env vars: `DEMO_INVITE_CODE`, `DATABASE_URL` (plus optional `DEMO_API_ORIGIN`).
2. Set the same vars for Preview (`DATABASE_URL` is often missed and causes runtime failures).
3. Point `app.<domain>` to Vercel.
4. (If using upstream DEMO API) Ensure backend CORS allows the app domain.

## DNS
- `app.<domain>` → Vercel project
- `api.<domain>` → Fly.io app
