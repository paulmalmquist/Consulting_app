# Demo Lab (Repo B + Repo C)

This workspace includes:
- `repo-b`: Demo Lab UI (Next.js, deploy to Vercel)
- `repo-c`: Demo Lab API (FastAPI, deploy to Fly.io)

## Deploy Checklist

### Vercel (Repo B)
1. Set environment variables:
   - `NEXT_PUBLIC_API_BASE_URL=https://api.<domain>`
   - `DEMO_INVITE_CODE=<shared_code>`
2. Deploy `repo-b` to Vercel.
3. Add custom domain `app.<domain>`.

### Fly.io (Repo C)
1. Set secrets for all variables in `repo-c/.env.example`.
2. Ensure Supabase Postgres has pgvector enabled.
3. Deploy `repo-c` using the Dockerfile.
4. Add custom domain `api.<domain>`.

## DNS Instructions
- `app.<domain>` → Vercel project
- `api.<domain>` → Fly.io app
