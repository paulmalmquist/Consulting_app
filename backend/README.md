# Business OS Backend

Python FastAPI backend for Business OS orchestration.

## Setup

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Environment

Copy `.env.example` to `.env` and fill in your Supabase credentials:

```bash
cp .env.example .env
```

Required variables:
- `DATABASE_URL` — Supabase Postgres connection string
- `SUPABASE_URL` — Supabase project URL (for Storage API)
- `SUPABASE_SERVICE_ROLE_KEY` — Service role key (for signed URLs)
- `STORAGE_BUCKET` — Storage bucket name (default: `documents`)
- `ALLOWED_ORIGINS` — Comma-separated CORS origins

## Database Migration

Apply the canonical schema bundle from `repo-b/db/schema`:

```bash
# From repo root
make db:migrate
make db:verify
```

## Run

```bash
source .venv/bin/activate
uvicorn app.main:app --reload --port 8000
```

## API Endpoints

### Health
- `GET /health`

### Business
- `GET /api/templates` — List provisioning templates
- `POST /api/businesses` — Create a business
- `POST /api/businesses/{id}/apply-template` — Apply a template
- `POST /api/businesses/{id}/apply-custom` — Apply custom config
- `GET /api/businesses/{id}/departments` — Enabled departments
- `GET /api/businesses/{id}/departments/{key}/capabilities` — Enabled capabilities
- `GET /api/departments` — All departments (catalog)
- `GET /api/departments/{key}/capabilities` — All capabilities for dept

### Documents
- `POST /api/documents/init-upload` — Start signed upload
- `POST /api/documents/complete-upload` — Finalize upload
- `GET /api/documents?business_id=...` — List documents
- `GET /api/documents/{id}/versions` — Document versions
- `GET /api/documents/{id}/versions/{vid}/download-url` — Signed download

### Executions
- `POST /api/executions/run` — Run an execution (stub)
- `GET /api/executions?business_id=...` — List executions

### Underwriting
- `GET /api/underwriting/contracts/research` — Strict ingest contract JSON schema
- `POST /api/underwriting/runs` — Create deterministic underwriting run (`run_id` = UUIDv5 hash identity)
- `GET /api/underwriting/runs?business_id=...` — List underwriting runs
- `GET /api/underwriting/runs/{run_id}` — Get run status/details
- `POST /api/underwriting/runs/{run_id}/ingest-research` — Ingest structured research payload with citation validation
- `POST /api/underwriting/runs/{run_id}/scenarios/run` — Run Base/Upside/Downside + custom scenarios
- `GET /api/underwriting/runs/{run_id}/reports` — Retrieve report artifacts (IC memo, appraisal narrative, outputs, sources ledger)

## Local CLI Flow (Underwriting)

From repo root:

```bash
scripts/underwriting_run.sh \
  --business-id <business_uuid> \
  --property-file backend/tests/fixtures/underwriting/sample_property_multifamily.json \
  --research-file backend/tests/fixtures/underwriting/sample_research_payload.json
```
