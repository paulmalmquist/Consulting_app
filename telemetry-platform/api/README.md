# Pointer — the serving API does not live here

The telemetry serving API is a FastAPI surface inside the monorepo backend, not a standalone app in
this folder. This keeps it on the existing route/service conventions, deploy path, and test harness.

Real locations (built in Phase 3):

- Routes: `backend/app/routes/telemetry.py` — `GET /health`, `POST /score`, `GET /runs`,
  `GET /run/{id}`, `GET /monitoring`
- Services: `backend/app/services/telemetry_scoring.py`, `telemetry_runs.py`, `telemetry_monitoring.py`
- Schemas: `backend/app/schemas/telemetry.py`
- Tests: `backend/tests/test_telemetry_*.py`

Do not build a second API implementation in this folder.
