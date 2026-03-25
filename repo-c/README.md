# Demo Lab API (Repo C)

FastAPI backend for the Demo Lab demo. Provides environment management, uploads, RAG chat, HITL queue, audit log, and metrics.

## Migrations
Run SQL migrations in `migrations/` against the same database used by the API.
`001_pipeline_and_industry_type.sql` adds `industry_type` and pipeline tables.

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
- `EXCEL_API_KEY` (optional, if set, required for `/v1/excel/*`)
- `EXCEL_DEFAULT_USER`
- `EXCEL_DEFAULT_EMAIL`
- `EXCEL_DEFAULT_ORG`

## Scripts
```bash
python scripts/create_env.py --client "Acme Health" --industry healthcare
python scripts/reset_env.py --env-id <env_id>
python scripts/ingest_doc.py --env-id <env_id> --file ./docs/policy.txt
python scripts/excel_smoke.py --base-url http://localhost:8000 --env-id <env_id>
```

## Curl Examples
Create environment:
```bash
curl -X POST https://api.yourdomain.com/v1/environments \
  -H "Content-Type: application/json" \
  -d '{"client_name":"Acme Health","industry":"healthcare","industry_type":"healthcare","notes":"demo"}'
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

Get pipeline:
```bash
curl "https://api.yourdomain.com/v1/pipeline?env_id=<env_id>"
```

Excel schema discovery:
```bash
curl -X GET "https://api.yourdomain.com/v1/excel/schema?env_id=<env_id>" \
  -H "Authorization: Bearer <excel_api_key>"
```

Excel query:
```bash
curl -X POST "https://api.yourdomain.com/v1/excel/query" \
  -H "Authorization: Bearer <excel_api_key>" \
  -H "Content-Type: application/json" \
  -d '{"env_id":"<env_id>","entity":"pipeline_items","select":["title","value_cents"],"limit":100}'
```

Excel upsert:
```bash
curl -X POST "https://api.yourdomain.com/v1/excel/upsert" \
  -H "Authorization: Bearer <excel_api_key>" \
  -H "Content-Type: application/json" \
  -d '{"env_id":"<env_id>","entity":"pipeline_items","key_fields":["card_id"],"rows":[{"card_id":"<uuid>","title":"Deal A"}]}'
```

## Deploy Checklist (Fly.io)
1. Create a Fly app and set secrets for all required env vars.
2. Ensure the Supabase database has pgvector enabled.
3. Deploy using the Dockerfile: `fly deploy`.
4. Add the custom domain `api.<domain>` and update DNS.

## DNS
- `api.<domain>` → Fly.io app
