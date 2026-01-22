# Demo Lab API (Repo C)

FastAPI backend for the Demo Lab demo. Provides environment management, uploads, RAG chat, HITL queue, audit log, and metrics.

## Setup
```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

## Run locally
```bash
uvicorn app.main:app --reload
```

## Environment Variables
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_DB_URL`
- `SUPABASE_STORAGE_BUCKET`
- `ALLOWED_ORIGINS`
- `LLM_PROVIDER` (`openai` or `anthropic`)
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `DEFAULT_EMBEDDING_MODEL`
- `DEFAULT_CHAT_MODEL`

## Scripts
```bash
python scripts/create_env.py --client "Acme Health" --industry healthcare
python scripts/reset_env.py --env-id <env_id>
python scripts/ingest_doc.py --env-id <env_id> --file ./docs/policy.txt
```

## Curl Examples
Create environment:
```bash
curl -X POST https://api.yourdomain.com/v1/environments \
  -H "Content-Type: application/json" \
  -d '{"client_name":"Acme Health","industry":"healthcare","notes":"demo"}'
```

Upload document:
```bash
curl -X POST https://api.yourdomain.com/v1/environments/<env_id>/upload \
  -F "file=@./docs/policy.pdf"
```

Chat:
```bash
curl -X POST https://api.yourdomain.com/v1/chat \
  -H "Content-Type: application/json" \
  -d '{"env_id":"<env_id>","message":"Summarize the latest policy"}'
```

Approve queue item:
```bash
curl -X POST https://api.yourdomain.com/v1/queue/<queue_id>/decision \
  -H "Content-Type: application/json" \
  -d '{"decision":"approve","reason":"Reviewed by Demo Approver"}'
```

## Deploy Checklist (Fly.io)
1. Create a Fly app and set secrets for all required env vars.
2. Ensure the Supabase database has pgvector enabled.
3. Deploy using the Dockerfile: `fly deploy`.
4. Add the custom domain `api.<domain>` and update DNS.

## DNS
- `api.<domain>` → Fly.io app
