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
- `NEXT_PUBLIC_API_BASE_URL` - Base URL for the API (e.g. `https://api.yourdomain.com`)
- `DEMO_INVITE_CODE` - Shared invite code (server-side only)

## Deployment Checklist (Vercel)
1. Set `NEXT_PUBLIC_API_BASE_URL` and `DEMO_INVITE_CODE` in Vercel project env vars.
2. Point `app.<domain>` to Vercel.
3. Ensure the FastAPI backend allows `https://app.<domain>` in CORS.

## DNS
- `app.<domain>` → Vercel project
- `api.<domain>` → Fly.io app
