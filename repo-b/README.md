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

## AI Gateway Setup
The app now uses the Business OS AI Gateway instead of the removed local Codex sidecar.

1. Set `OPENAI_API_KEY` in `backend/.env`.
2. Start the backend from `backend/`.
3. Start Next.js from `repo-b/`.

The frontend routes AI requests through `/api/ai/gateway/*`.

## Environment Variables
- `DEMO_INVITE_CODE` - Shared invite code for `/login` (server-side only).
- `DATABASE_URL` - Required for real `app.environments` DB reads/writes in `/api/v1/environments`.
- `DEMO_API_ORIGIN` - Optional upstream origin for `/api/v1/*` proxy-first behavior. If unset or upstream returns 404/501, local fallback handlers respond.
- `DEMO_API_BASE_URL` - Optional alternative server-side upstream origin.
- `NEXT_PUBLIC_DEMO_API_BASE_URL` / `NEXT_PUBLIC_API_BASE_URL` - Optional browser API base overrides. Default is same-origin (`/v1/*` rewrite to `/api/v1/*`).
- `BOS_API_ORIGIN` - Optional server-side override for the Business OS backend origin used by Next route handlers.
- `OPENAI_API_KEY` - Required on the backend for `/api/ai/gateway/*`.

## Deployment Checklist (Vercel)
1. Set Production env vars: `DEMO_INVITE_CODE`, `DATABASE_URL` (plus optional `DEMO_API_ORIGIN`).
2. Set the same vars for Preview (`DATABASE_URL` is often missed and causes runtime failures).
3. Point `app.<domain>` to Vercel.
4. (If using upstream DEMO API) Ensure backend CORS allows the app domain.

## DNS
- `app.<domain>` → Vercel project
- `api.<domain>` → Fly.io app
