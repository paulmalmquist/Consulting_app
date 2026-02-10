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

## Environment Variables
- `NEXT_PUBLIC_DEMO_API_BASE_URL` - (Optional) Direct Demo Lab API base URL (e.g. `https://demo-api.yourdomain.com`). If omitted, the UI calls same-origin `/v1/*` and proxies server-side.
- `DEMO_API_ORIGIN` - (Recommended) Server-only upstream origin for the `/v1/*` proxy (e.g. Railway/Fly URL or `https://api.yourdomain.com`).
- `DEMO_INVITE_CODE` - Shared invite code (server-side only).

## Deployment Checklist (Vercel)
1. Set `DEMO_API_ORIGIN` and `DEMO_INVITE_CODE` in Vercel project env vars.
2. Point `app.<domain>` to Vercel.
3. (If calling backend directly from browser) Ensure the FastAPI backend allows `https://app.<domain>` in CORS.

## DNS
- `app.<domain>` → Vercel project
- `api.<domain>` → Fly.io app
