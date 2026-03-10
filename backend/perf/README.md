# Backend Query Performance Harness (AI + Metrics)

`/api/ai/ask` in this harness is a legacy path retained only as a redirect stub after the local sidecar removal. Migrate perf coverage to `/api/ai/gateway/*` before treating AI numbers here as representative.

This harness validates latency/error budgets for:
- `POST /api/ai/ask`
- `POST /api/metrics/query`

across subject context, data volume tier, action type, and concurrency profile.

## Structure
- `config.json`: perf contract (tiers, profiles, thresholds)
- `fixtures/prompts/*.json`: AI prompt corpus (`repe`, `underwriting`, `legalops`, `mixed`)
- `fixtures/metrics_queries/{s,m,l}.json`: metrics query matrix + seeded business IDs
- `scenarios/ai_ask.js`: k6 script for AI ask
- `scenarios/metrics_query.js`: k6 script for metrics query
- `scripts/run_local.sh`: local smoke + failure checks
- `scripts/run_nightly.sh`: full matrix + soak + optional baseline compare
- `scripts/summarize.py`: run summarization, baseline median build, regression compare
- `scripts/mock_sidecar.py`: deterministic sidecar for CI/local perf runs

## Prerequisites
1. Backend running at `http://127.0.0.1:8000`
2. `k6` installed
3. Python env with backend dependencies installed
4. For gateway-backed AI perf work, set `OPENAI_API_KEY` in the backend environment.

## Multi-Session Layout
1. Session A (backend):
```bash
cd backend
.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
```
2. Session B (seed + load):
```bash
python3 backend/scripts/seed_perf_metrics.py --tier S --dataset-version perf_v1
python3 backend/scripts/seed_perf_metrics.py --tier M --dataset-version perf_v1
python3 backend/scripts/seed_perf_metrics.py --tier L --dataset-version perf_v1
./backend/perf/scripts/run_local.sh
```
3. Session C (analysis):
```bash
python3 backend/perf/scripts/summarize.py summarize --help
python3 backend/perf/scripts/summarize.py baseline-build --help
python3 backend/perf/scripts/summarize.py compare --help
```

## Commands
Local smoke:
```bash
make perf:smoke
```

Create/update baseline from three report files:
```bash
python3 backend/perf/scripts/summarize.py baseline-build \
  --scenario ai_S_steady_5_mixed_lookup_none \
  --inputs artifacts/perf/<r1>/report.json artifacts/perf/<r2>/report.json artifacts/perf/<r3>/report.json \
  --output backend/perf/baselines/ai_S_steady_5_mixed_lookup_none.json
```

Nightly full matrix:
```bash
make perf:nightly
```

## Notes
- `x-run-id` is attached on all perf requests and validated via `X-Run-Id` response header.
- AI citation quality guard is enforced for non-trivial prompts (`citation_missing < 1%`).
- Failure-mode suite includes:
  - invalid business ID
  - empty metric keys
  - oversized prompt
  - legacy AI route unavailable (optional if `BASE_URL_SIDECAR_DOWN` is provided)
