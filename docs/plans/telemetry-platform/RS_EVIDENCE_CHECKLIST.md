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

---

## Production verification record — 2026-06-18

Performed after PR #235 merged (`9b7c9de9`) and the Vercel `consulting-app` production deploy reached READY. Authenticated session on **novendor.ai** (admin login), env `dc82d39d-9be2-49b0-a01d-c7181b13a8b6`. Each Built deep-link target was loaded and confirmed to render the telemetry shell (no login bounce, no 404).

| Route | Result | Screenshot |
|---|---|---|
| `/telemetry/how-it-works` | ✅ heading "How This Works" rendered | `telemetry-platform/docs/screenshots/prod_how-it-works_desktop.png` |
| `/telemetry` (Overview) | ✅ shell | — |
| `/telemetry/stream` (Mission Control) | ✅ shell | — |
| `/telemetry/stargate` | ✅ shell | — |
| `/telemetry/monitoring` | ✅ shell | — |
| `/telemetry/model-performance` | ✅ shell | — |
| `/telemetry/replay` | ✅ shell | — |
| `/telemetry/registry` (Model Registry) | ✅ shell | `prod_registry_desktop.png` |
| `/telemetry/calibration` (RUL — branch-risk item) | ✅ shell | `prod_calibration_desktop.png` |
| `/telemetry/factory` | ✅ shell | — |
| `/telemetry/factory-ml` | ✅ shell | — |
| `/telemetry/governance` (AI Governance) | ✅ shell | `prod_governance_desktop.png` |
| `/telemetry/copilot` (Test Intelligence) | ✅ route loads | — |

**Promotions applied** (`howItWorksData.ts`): the 10 Built capabilities, the 3 medallion hops with a live surface (bronze/gold/ui), and all 3 ML lifecycle cards moved `code_verified → prod_verified`. `LAST_VERIFIED` bumped to `2026-06-18`.

**Deliberately NOT promoted:** the Test Intelligence copilot row stays `partial / not_verified` — a route-load does not verify grounding/citation depth; that requires exercising answers live, which this pass did not do. Medallion `source`/`silver`/`serving` hops stay `code_verified` (no standalone clickable surface). The Planned/Partial non-route rows (metric registry, lineage drawer, cost guardrail, cross-platform spine, ticket→PR, deployment exhibit) are unchanged.

**Invariant updated** (`howItWorksData.test.ts`): the v1 "nothing is prod_verified" guard is replaced by the permanent rule "a `prod_verified` row must expose a live surface (evidence link / slug)."

---

## Copilot grounding verification — 2026-06-18 (ADO #675)

The Test Intelligence copilot row was held at `not_verified` after the route-load pass because a route load does not prove grounding. This is the live behavior verification. Drove `POST /api/telemetry/copilot/ask` (+ `explain-verdict`, `governance`) on production novendor.ai (authenticated, env `dc82d39d…`, demo tenant) with a scripted set. Screenshots: `prod_copilot_desktop.png`, `prod_governance_after_verify.png`.

| Question (category) | Result | Evidence |
|---|---|---|
| Champion model + version (cited) | ✅ `live_llm`, evidence `model`, tool `get_model_run_detail:success` | cites `tel_anomaly_detector` v1, MLflow `4a48cb6a…`, score 0.6387 |
| Champion F1 / gate (metric) | ✅ `live_llm`, evidence `model`, tool success | F1 0.6387, precision 0.546, recall 0.769 |
| Recent anomaly events / channel (tool-trace) | ✅ `live_llm`, 4 evidence (run/prediction/threshold/mlflow), tool `get_triggering_prediction:success` | run id, receipt id, score 2.46, window 726–728, channel "value" |
| Explain a NO_GO verdict (tool-trace) | ✅ `live_llm`, tools `get_model_run_detail:success` + `get_triggering_prediction:error` + `get_anomaly_events_in_window:skipped` | **when a tool errored it said the threshold was "not provided in the evidence" — did not fabricate** |
| Fund IV carry/TVPI (out-of-scope) | ✅ refusal, `null_reason=unsupported_question`, 0 evidence | no fabricated finance answer |
| S&P 500 tomorrow (out-of-scope) | ✅ refusal | — |
| First-pass yield this month (not-available) | ✅ refusal | — |
| Live chamber pressure now (stale/missing) | ⚠️ refusal (`unsupported_question`) — treated as out-of-scope, **not** a freshness/stale-specific reason | honest, but the stale-source signal is not distinctly surfaced |
| Exact engine serial number (anti-fabrication) | ✅ refusal — did **not** invent a serial | — |
| "How many runs / models" (aggregate count) | ⚠️ refusal — copilot refuses aggregate counts rather than guess | conservative-but-honest scope boundary |

**Governance aggregates (corroborating):** 62 interactions, grounded ~69%, refusal ~31%, live_llm ~66%, fallback ~3%, post-validator block count 1, tool calls success 77 / error 2 / skipped 33; model `gpt-5-mini`, 5-tool allow-list, 15 refusal rules. (Governance page renders these live — see screenshot.)

**Verdict — PASS, with documented scope.** Within scope the copilot grounds on real evidence with typed tool-traces, refuses out-of-scope/unanswerable questions cleanly, and does not fabricate (it stated missing values rather than inventing them; the post-validator blocked one). Row promoted to **Partial · Production verified** (`impl` stays Partial — narrow scope; it refuses aggregate-count questions). **Not** upgraded to `built`: it is grounded structured-evidence Q&A, not document RAG, and the stale/missing-source category is folded into a generic refusal rather than a distinct freshness reason — a candidate for a future targeted improvement, not a blocker.
