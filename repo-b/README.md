# Demo Lab UI (Repo B)

Canonical `/v1/*` behavior now lives in `backend/`. `repo-b/` is the UI plus same-origin proxy/BFF layer.

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
- `BOS_API_ORIGIN` - Canonical server-side backend origin used by `/bos/*` and `/v1/*` route handlers.
- `NEXT_PUBLIC_BOS_API_BASE_URL` - Optional browser-facing backend base override.
- `DEMO_API_ORIGIN` / `DEMO_API_BASE_URL` / `NEXT_PUBLIC_DEMO_API_BASE_URL` - Temporary compatibility aliases. If set alongside BOS vars, they must resolve to the same origin.
- `NEXT_PUBLIC_API_BASE_URL` - Legacy browser alias for the canonical backend origin.
- `OPENAI_API_KEY` - Required on the backend for `/api/ai/gateway/*`.

## Deployment Checklist (Vercel)
1. Set Production env vars: `DEMO_INVITE_CODE`, `DATABASE_URL`, and `BOS_API_ORIGIN`.
2. Set the same vars for Preview (`DATABASE_URL` is often missed and causes runtime failures).
3. Point `app.<domain>` to Vercel.
4. Keep any DEMO alias vars equal to `BOS_API_ORIGIN` until they are fully removed.

## DNS
- `app.<domain>` → Vercel project
- `api.<domain>` → Fly.io app
