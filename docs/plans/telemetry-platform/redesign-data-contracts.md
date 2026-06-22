# Telemetry Redesign — Data Contracts (Phase 2)

**Last updated:** 2026-06-22
**Purpose:** Phase 2 of the Telemetry Experience Redesign (ADO Epic #497 → Feature #691). The design follows
the data. This documents the **real** data behind each of the 8 planned surfaces before any page is built, so
data-backed skeletons render real values where they exist and explicit null states where they don't — never
fake numbers.

Companion: [data-source-matrix.md](data-source-matrix.md) (per-surface data *mode* + fail-closed behavior) and
the established provenance convention (Spike Inspector "Data Source Audit" panel + `provenance` object — reuse
its shape). Demo tenant: `env_id=telemetry-demo`, `business_id=7e1eb000-0000-4000-a000-000000000001`
(frontend constants `TELEMETRY_DEMO_ENV_ID` / `TELEMETRY_DEMO_BUSINESS_ID` in `repo-b/src/lib/telemetry/api.ts`).

## Headline

**7 of 8 surfaces have real data available now. Only Program Control Tower has no source — it needs a new
backend endpoint + schema.** Every existing endpoint fails closed with a `null_reason`, exposes freshness
explicitly, and never fabricates values. The metadata graph already exposes **full lineage** — the trust spine
is buildable today.

## Per-surface data contracts

### 1. Mission Summary — **real now** ✓
- **Endpoints:** `/summary`, `/model-performance`, `/monitoring`, `/copilot/governance`, `/ncr`
- **Tables:** `tel_predictions`, `tel_model_runs`, `tel_test_runs`, `tel_drift_metrics`, `tel_anomaly_events`, `tel_ncr_*`
- **Fields:** `inventory{tel_* row counts}`, `kpi{test_runs, predictions, promoted_models, anomaly_f1, rul_rmse, last_scored_at}`, `verdicts{GO/REVIEW/NO_GO}`, `verdict_pct`, `rolling_anomaly_rate` (measured), model metrics `{f1, precision, recall, rmse, phm}` + `{model_name, model_version, model_alias, mlflow_run_id}`
- **Freshness:** `kpi.last_scored_at` (max `tel_predictions.created_at`). No watermark in summary payload.
- **Lineage:** none inside summary (aggregates) — but each KPI's source endpoint is known, so the lineage drawer can resolve it via the metadata graph.
- **Measured/modeled:** all **measured**. **No Mission Readiness composite exists** — it is a *proposed derived field* (see inventory below); blocked until its formula is defined.
- **Null states:** `null_reason="model_not_promoted"` / `"data_not_ingested"`; fields default to 0/null, never hardcoded.

### 2. System Health — **real now** ✓ (streaming optional)
- **Endpoints:** `/monitoring` (stream block), `/stream/health`, `/findings`
- **Tables:** `tel_stream_readings`, `tel_pipeline_status`, `tel_dq_assertions`, `tel_etl_watermarks`, `tel_predictions`
- **Fields:** `stream{status: fresh|stale|failed, as_of_ts, last_frame_at, rows_per_min, failing_assertions, ingest_lag_p50_s, ingest_lag_p95_s}`; per-channel `{last_ts, age_s}`; watermark ages; findings `by_severity` + `provenance.rows_evaluated`
- **Freshness:** `stream.as_of_ts`, watermark ages computed vs now — **explicit**.
- **Null states:** `null_reason="stream_unavailable"` / `"etl_watermark_stalled"`; `findings=[]` on analyzer failure (never aborts).

### 3. Trust Center — **real now** ✓ (usefulness "not measured" until Track B)
- **Endpoints:** `/copilot/governance`, `/copilot/evals`, `/copilot/usefulness`, `/control-tower/decisions`
- **Tables:** `tel_copilot_interactions`, `tel_copilot_reports`, Postgres RLS inspection
- **Fields:** governance `{total_interactions, refusal_rate, grounded_rate, live_llm_rate, fallback_rate, postvalidator_block_count, answer_source_mix, recent_interactions[], recent_refusals[], security_posture}`; evals `{available, summary{passed,total}, cases[]}`; usefulness `{arms{assisted/unassisted}, delta, status: measured|not_measured}`
- **Null states:** `usefulness.status="not_measured"` (fields null) until Track B dispositions exist; `evals.available=false` if artifact absent.

### 4. Metric Lineage Explorer — **real now** ✓ (FULL lineage)
- **Endpoint:** `/metadata/graph`
- **Source:** `metadata_catalog.json` (committed) + enrichment SQL UNION over `tel_test_runs, tel_predictions, tel_model_runs, tel_drift_metrics, tel_fused_state_vectors, tel_feature_manifest, tel_copilot_*, tel_stream_*, tel_pipeline_status, tel_dq_assertions, tel_ncr_*`
- **Fields:** `nodes[]{id, label, kind, layer(source|bronze|silver|gold|metric|consumer), schema_name, object_name, description, status, confidence, metadata}`, `edges[]{source, target, relationship}` (relationships: `ingests_to, cleans_to, aggregates_to, defines_metric, feeds_dashboard, feeds_model, used_by_ai, streamed_from, batch_loaded_from, quality_checked_by, quarantines_to, exports_to, references`), `stats{*_count, unavailable_count}`
- **Freshness:** `generated_at` + per-table `last_updated_at` from enrichment.
- **Lineage:** **complete** — edges expose all relationships; `node.metadata` may carry owner/formula (catalog-dependent). Frontend already has `getMetadataGraph` + `getUpstreamTrace` in `repo-b/src/lib/telemetry/metadata.ts`.
- **Null states:** `status:"partial"` when some enrichments fail; node `status:"missing"|"quarantined"`; `MetadataCatalogError→500`. Render "No lineage yet" where a node has no upstream edge.

### 5. Replay Timeline — **real now** ✓
- **Endpoints:** `/replay`, `/control-tower/score-and-gate`, `/copilot/explain-verdict`
- **Source:** `replay_fixture.json` (precomputed, deterministic) + `tel_predictions, tel_model_runs, tel_anomaly_events`
- **Fields:** feed `{t, value, rmean, score, model_pred, is_anomaly}`, `provenance{champion_model, champion_mlflow_run_id}`; scoring `{verdict, anomaly_score, threshold, model_name, model_version, mlflow_run_id}`
- **Gap:** **no stage boundaries** (T-60…Orbit) exist in the feed. Render a flat timeline with "stages not available" until a stage field/mapping is added. Everything else is real.
- **Null states:** replay `null_reason="data_not_ingested"` (fixture missing); scoring `verdict="NOT_AVAILABLE"` (model not promoted).

### 6. Agent Control Tower — **real now** ✓ (execution backend exists)
- **Endpoints:** `/control-tower/decisions`, `/control-tower/gemma-tier`, `/control-tower/receipts/{id}/verify`, `/control-tower/score-and-gate`
- **Tables:** `tel_ct_decision`, `tel_ct_signed_receipts`, Vertex AI API (gemma state)
- **Fields:** decisions `{verdict, anomaly_score, threshold, status, human_decision, resolved_at, signed_receipt_id, dispatch_provider, routing_reason, triage_cost_usd}`; gemma `{status: cold|warming|live|failed, deployed_model_count, est_active_cost_usd, last_warmed_at, last_probe_at}`; verify `{valid, hash_valid, signature_valid, key_matches, chain_intact, chain_seq}`
- **Note:** the *mission→plan→execute* agent experience is net-new (Phase 5), but the receipt/gating/signing substrate is real today.
- **Null states:** `gemma.status="unavailable"` (Vertex unreachable); `verify.valid=false` + reason on signature failure.

### 7. Automated Data Engineering — **real now** ✓ (read-only)
- **Endpoints:** `/api/ade/analyze/telemetry`, `/api/ade/ops/skills` (+ stream/live, stream/health)
- **Fields:** analyze `{findings[], null_reasons[], by_severity, provenance{source, rows_evaluated, last_refresh}}`; skills `{name, description, permission, risk_tier, executable}`
- **Null states:** `null_reason="telemetry_findings_unavailable"`; `findings=[]` never aborts.

### 8. Program Control Tower — **NO SOURCE — needs backend** ✗
- **Endpoint:** **none exists.** No program-level orchestration, multi-step approval chains, or batch dispatch.
- **Needs:** `tel_ct_program` table (env_id, business_id, program_name, status, created_at, resolved_at, signed_receipt_id) + `POST/GET /api/telemetry/control-tower/programs[/{id}][/approve][/receipts]`.
- **Also:** the *Debt Paydown → Launch Impact* numbers require the **governed metric registry + causal edges** (Phase 3.7) — they do not exist anywhere yet.
- **Render until built:** "Requires backend endpoint" / "Requires metric registry" with `null_reason`. **This is the Phase 2 pause-gate surface.**

## Mission Summary data inventory (gates the first Mission Summary build)

**Available today (measured, real):** promoted-model count, anomaly F1, RUL RMSE, predictions count, test-runs
count, GO/REVIEW/NO_GO verdict distribution + %, rolling anomaly rate, champion model name/version/alias/
mlflow_run_id, `last_scored_at`, drift PSI + conformal budget, stream status + freshness (when streaming
seeded), copilot governance rates, NCR open/rising/backlog.

**Unavailable today:** a single **Mission Readiness** composite; **month-over-month delta** (no historical
snapshot store); per-KPI **owner/certification** (catalog-dependent, may be null); any **debt→launch**
projection; **stage boundaries** for replay.

**Proposed derived fields + safe-to-compute-now:**
| Derived field | Formula (inputs) | Safe now? | If not |
|---|---|---|---|
| Operations sub-index | stream.status fresh + rows_per_min>0 + ingest_lag_p95<SLA + failing_assertions==0 | partial | streaming may be unseeded → that input shows "Stale input" |
| Quality sub-index | promoted_models>0 + anomaly_f1≥gate + rul_rmse≤gate + rolling_anomaly_rate<SLA | **yes** | — |
| Models sub-index | worst drift PSI < 0.25 + conformal status "within" | **yes** | — |
| AI sub-index | production_smoke pass + copilot refusal_rate<SLA | **yes** | — |
| **Mission Readiness** (hero) | weighted sum of the above − freshness penalty | **NO** (formula/weights not ratified; one input partial) | render **"Readiness not available"** + show the available sub-indices |
| MoM delta | this snapshot − stored prior snapshot | **NO** (no snapshot store) | omit the "↑x% MTD" until a snapshot table exists |

**What must fail closed:** the Mission Readiness hero (until formula ratified + all inputs present), MoM delta,
Operational Leverage projections, any owner/certification field that returns null.

## Verdict roll-up

| Surface | Verdict | First-build gating |
|---|---|---|
| Metric Lineage Explorer | real now ✓ | none — build first |
| Mission Summary | real now ✓ (readiness hero gated) | readiness composite blocked until formula ratified |
| System Health | real now ✓ | streaming inputs may show "Stale input" |
| Trust Center | real now ✓ | usefulness "not measured" until Track B |
| Replay Timeline | real now ✓ | stages "not available" until feed adds them |
| Agent Control Tower | substrate real ✓ | mission→plan UX is net-new (Phase 5) |
| Automated Data Engineering | real now ✓ | — |
| Program Control Tower | **NO source ✗** | needs `tel_ct_program` endpoint + metric registry |

## Recommended first data-backed page

**Metric Lineage Explorer** — `/metadata/graph` exposes full lineage today, the frontend already has
`getMetadataGraph` + `getUpstreamTrace`, and it is the trust spine the other surfaces' "trace source"
affordances depend on. Build the reusable `LineageDrawer` here, then Mission Summary can invoke it.
