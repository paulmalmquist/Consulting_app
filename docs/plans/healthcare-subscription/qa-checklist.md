# QA checklist — Healthcare Subscription Analytics

## HHA-1 (Exec Overview)

### Data / schema
- [x] `hha_` registered in `ARCHITECTURE.md` before any `hha_` table created.
- [x] Migration numbered 10013 (10012 was taken by telemetry on origin/main; renumbered before commit, DDL unchanged).
- [x] 5 tables, each with `env_id`/`business_id`, RLS enabled, tenant-isolation policy, `COMMENT ON TABLE`, `(env_id,…)` index. (asserted in `test_hha.py`)
- [x] No PHI columns anywhere. (asserted: schema scan + seed-SQL scan)
- [x] Seed deterministic + idempotent (`ON CONFLICT DO NOTHING`, fixed as-of date, uuid5 keys).
- [x] At least one cohort with size <11 flagged `is_suppressed`. (asserted)

### API
- [x] `GET /api/hha/v1/overview` returns typed KPI payload; money as decimal dollars at the edge. (asserted)
- [x] `GET /api/hha/v1/health` returns row counts + freshness; `ok` true when overview rows exist.
- [x] No medical/write endpoints introduced.
- [ ] Live check against the provisioned env (see release-readiness.md).

### UI
- [x] Standalone design — NO app shell wrapper. (page renders `<OverviewClient>` directly)
- [x] Non-dismissible synthetic-only / NO-PHI banner.
- [x] Metric-definition drawer (formula/grain/owner/source) on KPI click.
- [x] Freshness + provenance footer ("seeded" labeled honestly).
- [x] `npm run typecheck` clean (exit 0).

### Tests
- [x] `pytest --noconftest backend/tests/test_hha.py` — 6 passing.

### Regression
- [x] Telemetry untouched (`tel_*`, telemetry routes/pages unchanged).
- [x] Backend router list only adds `hha_routes`.

## Manual smoke (after provisioning)
- [ ] Log in, open `/lab/env/{env_id}/healthcare-subscription`, confirm KPI strip renders.
- [ ] NO-PHI banner visible; drawer opens; footer shows as-of + provenance.
- [ ] Confirm no patient identifiers anywhere on screen or in network responses.
