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
- `POST /api/executions/run` — Run an execution (`RE_UNDERWRITE_RUN` supported)
- `GET /api/executions?business_id=...` — List executions

### Underwriting
- `GET /api/underwriting/contracts/research` — Strict ingest contract JSON schema
- `POST /api/underwriting/runs` — Create deterministic underwriting run (`run_id` = UUIDv5 hash identity)
- `GET /api/underwriting/runs?business_id=...` — List underwriting runs
- `GET /api/underwriting/runs/{run_id}` — Get run status/details
- `POST /api/underwriting/runs/{run_id}/ingest-research` — Ingest structured research payload with citation validation
- `POST /api/underwriting/runs/{run_id}/scenarios/run` — Run Base/Upside/Downside + custom scenarios
- `GET /api/underwriting/runs/{run_id}/reports` — Retrieve report artifacts (IC memo, appraisal narrative, outputs, sources ledger)

### Real Estate (Special Servicing)
- `GET /api/real-estate/trusts?business_id=...` — List trusts
- `POST /api/real-estate/trusts` — Create trust
- `GET /api/real-estate/loans?business_id=...&trust_id=...` — List loans
- `POST /api/real-estate/loans` — Create loan
- `GET /api/real-estate/loans/{loan_id}` — Loan detail with borrower/property/latest surveillance
- `GET /api/real-estate/loans/{loan_id}/surveillance` — List surveillance snapshots
- `POST /api/real-estate/loans/{loan_id}/surveillance` — Create surveillance snapshot
- `GET /api/real-estate/loans/{loan_id}/underwrite-runs` — List runs
- `POST /api/real-estate/loans/{loan_id}/underwrite-runs` — Queue + execute deterministic re-underwrite
- `GET /api/real-estate/loans/{loan_id}/workout-cases` — List workout cases (+actions)
- `POST /api/real-estate/loans/{loan_id}/workout-cases` — Create workout case
- `POST /api/real-estate/workout-cases/{case_id}/actions` — Create workout action
- `GET /api/real-estate/loans/{loan_id}/events` — List events
- `POST /api/real-estate/loans/{loan_id}/events` — Create event
- `POST /api/real-estate/dev/seed?business_id=...` — Seed demo trust/loans/surveillance

### Real Estate Private Equity (Fund Engine)
- `POST /api/re/valuation/run-quarter`
- `POST /api/re/waterfall/run-shadow`
- `POST /api/re/fund/compute-summary`
- `POST /api/re/refinance/simulate`
- `POST /api/re/stress/run`
- `POST /api/re/surveillance/compute`
- `POST /api/re/montecarlo/run`
- `GET /api/re/asset/{asset_id}/quarter/{quarter}`
- `GET /api/re/fund/{fund_id}/summary/{quarter}`
- `GET /api/re/investor/{investor_id}/statement/{fund_id}/{quarter}`

Demo flow script:
- `python -m scripts.seed_re_demo`
- `python -m scripts.seed_re_demo --fund-id <uuid> --asset-id <uuid> --quarter 2026Q1`

## Local CLI Flow (Underwriting)

From repo root:

```bash
scripts/underwriting_run.sh \
  --business-id <business_uuid> \
  --property-file backend/tests/fixtures/underwriting/sample_property_multifamily.json \
  --research-file backend/tests/fixtures/underwriting/sample_research_payload.json
```
