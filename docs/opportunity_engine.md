# Opportunity Engine

Opportunity Engine is the environment-scoped ranking and market-signal workspace at `/lab/env/[envId]/opportunity-engine`.

## What it does

- Stores deterministic model runs in `model_runs`
- Persists ranked opportunity scores in `opportunity_scores`
- Stores operator-facing actions in `project_recommendations`
- Canonicalizes Kalshi and Polymarket inputs into `market_signals`
- Records forecast-style snapshots in `forecast_snapshots`
- Stores driver-level audit rows in `signal_explanations`

## Runtime shape

1. Frontend calls the BOS backend at `/api/opportunity-engine/v1/*`
2. FastAPI resolves `env_id` / `business_id` through `env_context`
3. `backend/app/services/opportunity_engine.py` runs:
   - market-signal ingestion with live fetch attempt + fixture fallback
   - consulting ranking
   - PDS intervention ranking
   - RE investment screening
   - market-intel research recommendations
4. Outputs write back to the main app database with a shared `run_id`

## Local run

Apply schema:

```bash
make db:migrate
make db:verify
```

Run the backend:

```bash
cd backend
uvicorn app.main:app --reload --port 8000
```

Run a manual batch:

```bash
cd backend
python3.11 scripts/opportunity_engine_run.py \
  --env-id <env_uuid> \
  --business-id <business_uuid> \
  --mode fixture
```

## Google Colab / Compute Engine handoff

- Colab entrypoint: `backend/notebooks/opportunity_engine/colab_bootstrap.py`
- Scheduled batch entrypoint: `backend/scripts/opportunity_engine_run.py`
- Initial production posture: read-only public market ingestion, no trading, deterministic persistence into the main database

## Verification

Backend:

```bash
python3.11 -m pytest \
  backend/tests/test_opportunity_engine_api.py \
  backend/tests/test_opportunity_engine_service.py \
  backend/tests/test_opportunity_connectors.py
```

Frontend:

```bash
cd repo-b
npm run test:unit -- src/app/lab/env/[envId]/opportunity-engine/page.test.tsx
```
