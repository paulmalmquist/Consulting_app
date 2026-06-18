# RS Telemetry — evidence checklist

One block per claim. Each: route/file/table → screenshot target → verification command → expected output → failure condition. Run the verification before presenting; promote the exhibit row to `prod_verified` only after the production click.

---

### Live stream + fail-closed reason
- **Source:** `backend/app/routes/telemetry.py` `/stream/health`, `/stream/live`; `telemetry_stream_ingest.py`.
- **Screenshot:** `/telemetry/stream` updating; `/stream/health` JSON.
- **Verify:** `curl -s $BOS_API_ORIGIN/api/telemetry/stream/health | jq`
- **Expect:** non-empty per-channel `freshness` with ingest lag p50/p95 — OR a specific `reason` (e.g. worker_disabled), never bare `no_stream_data`.
- **Fails if:** latency > 5s, missed threshold, or alert with no persisted event; bare reason.

### Medallion counts (bronze ≥ silver ≥ gold)
- **Source:** `repo-b/db/schema/10015_telemetry_streaming_slice.sql`; tables `tel_stream_readings_bronze`, `tel_stream_readings`, `tel_stream_minute_agg`.
- **Screenshot:** `/telemetry/monitoring`; Supabase query output.
- **Verify:** `echo "SELECT 'bronze' s,count(*) FROM tel_stream_readings_bronze UNION ALL SELECT 'silver',count(*) FROM tel_stream_readings UNION ALL SELECT 'gold',count(*) FROM tel_stream_minute_agg;" | supabase db query --linked`
- **Expect:** monotonic bronze ≥ silver ≥ gold; counts > 0 after a capture run.
- **Fails if:** any hop missing, or values diverge with no documented transform.

### Champion attribution
- **Source:** `telemetry_serving.score_window` (MAD_K=4.0); `tel_predictions`; `tel_model_runs`.
- **Screenshot:** `/telemetry/model-performance`; a `tel_predictions` row.
- **Verify:** `echo "SELECT model_version, verdict, anomaly_score, receipt_id FROM tel_predictions ORDER BY created_at DESC LIMIT 5;" | supabase db query --linked`
- **Expect:** non-null `model_version` and `receipt_id` per row; verdict in {GO,REVIEW,NO_GO}.
- **Fails if:** a score is not attributable to a model version.

### Model registry + promotion gate
- **Source:** `RegistryConsole`; `telemetry_registry.py`; `tel_model_runs.gate` JSONB; `tel_drift_metrics`.
- **Screenshot:** `/telemetry/registry` (champion alias + gate audit + PSI history).
- **Verify:** open `/telemetry/registry`; or `echo "SELECT model_name,model_alias,promotion_state FROM tel_model_runs;" | supabase db query --linked`
- **Expect:** champion alias present; promote/rollback disabled (display-only).
- **Fails if:** UI implies a live mutation path that doesn't exist.

### Audit receipt (redacted, valid decision_type)
- **Source:** `ai_decision_audit_log` (`407_*.sql`); `governance.record_decision()`.
- **Screenshot:** `/telemetry/governance` audit stats.
- **Verify:** `echo "SELECT decision_type, tool_name, success FROM ai_decision_audit_log ORDER BY created_at DESC LIMIT 5;" | supabase db query --linked`
- **Expect:** rows present; `decision_type` ∈ {tool_call,response,classification,fast_path}; sensitive inputs redacted.
- **Fails if:** a receipt is missing for an observed action, or raw secrets appear.

### Governance stats
- **Source:** `/api/telemetry/governance`; `compute_audit_stats()`.
- **Screenshot:** `/telemetry/governance`.
- **Verify:** `curl -s $BOS_API_ORIGIN/api/telemetry/governance | jq '{grounded,refusal,fallback,evals}'`
- **Expect:** counts reconcile with observed interactions; refusal rule count > 0.
- **Fails if:** quoted numbers can't be reproduced live.

### How This Works page (this PR)
- **Source:** `repo-b/src/app/lab/env/[envId]/telemetry/how-it-works/page.tsx`, `HowItWorks.tsx`, `howItWorksData.ts`, `telemetryNav.ts`.
- **Screenshot:** desktop + mobile of `/telemetry/how-it-works` (sidebar "Evidence & Architecture → How This Works").
- **Verify:** `npm run typecheck && npm run lint && npm run test:unit && npm run build` (all green); `npx playwright test tests/telemetry-how-it-works.spec.ts --config=playwright.config.ts --project=chromium`
- **Expect:** page renders; jump cards scroll; Built rows deep-link to real routes; Planned/Blocked show "Not available — reason"; no `prod_verified` row in v1.
- **Fails if:** a deep-link 404s, a Planned row shows a link, or any row claims prod verification before the live click.

---

## Planned/Blocked rows — honest "verification"
For governed metric registry, lineage drawer, cost guardrail, deployment-status page: the verification IS the statement of why it's not live for telemetry, plus the route that proves the pattern elsewhere (REPE AuditDrawer for lineage; `ai_gateway_logs.cost_*` for cost logging; `railway status` / `/version` for deploy). Never a fabricated screenshot.
