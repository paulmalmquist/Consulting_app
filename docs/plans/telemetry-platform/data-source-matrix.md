# Telemetry Data-Source Matrix

**Last updated:** 2026-06-19
**Purpose:** Audit every telemetry surface's data mode and prove provenance. Goal state: maximize
`real_backend`, drive `static_demo_labeled` toward zero, make `unavailable_fail_closed` explicit, and
keep `bookmark_for_local_seed` a small actionable list (see `local-seed-backlog.md`).

Data modes: `real_backend` · `seeded_backend` · `unavailable_fail_closed` · `static_demo_labeled` ·
`bookmark_for_local_seed`.

The seeded demo tenant is `env_id=telemetry-demo`, `business_id=7e1eb000-0000-4000-a000-000000000001`
(Phase 6 backfill: 46 runs / 2000+ predictions / anomaly events / drift rows — all real NASA-derived,
`is_backfilled=true`).

| Surface | Component | Mode | Backend route → table/source | Fail-closed behavior | Notes / bookmark |
|---|---|---|---|---|---|
| overview | `TelemetryOverview` | real_backend | `/summary`,`/monitoring`,`/runs`,`/model-performance`,`/fused-vector-info` → tel_* | Loading/ErrorState + null_reason | fused-vectors block `available:false` (Phase 7A unseeded) |
| runs | `RunsExplorer` | real_backend | `/runs` → tel_test_runs | Loading/ErrorState | — |
| replay | `ReplayConsole` | real_backend | `/replay` → committed real-champion fixture `replay_fixture.json` | null_reason data_not_ingested | deterministic replay, labeled |
| monitoring | `Monitoring` | real_backend | `/monitoring`,`/summary` → tel_predictions/model_runs/drift | EmptyState + null_reason | stream block null if streaming unseeded |
| model-performance | `ModelPerformance` | real_backend | `/model-performance` → tel_model_runs | null_reason model_not_promoted | — |
| registry | `RegistryConsole` | real_backend | `/registry` → tel_model_runs/drift | null_reason model_not_promoted | — |
| factory (NCR) | `FactoryNcrIntelligence` | real_backend (endpoint) / unavailable_fail_closed (data) | `/ncr` → tel_ncr_* | null_reason data_not_ingested | **bookmark:** NCR Databricks mirror seed |
| factory-ml | `factory-ml/FactoryMlConsole` | static_demo_labeled | committed `/labs/factory-ml/*.json` + MLflow provenance footer | EmptyState per missing export | **bookmark:** medallion export refresh |
| calibration | `RulCalibration` | static_demo_labeled | `calibrationEvidence.ts` (committed Databricks evidence) | labeled "Replay / evidence artifact — not live data" | **bookmark:** `/api/telemetry/calibration` live endpoint |
| copilot | `Copilot` | real_backend | `/copilot/*` (LLM over tel_* tool reads) | refusal/fallback + null_reason | OPENAI key → deterministic fallback if absent |
| governance | `GovernanceDashboard` | real_backend | `/copilot/governance|evals|usefulness` | GovMetric "Not available" | evals from committed artifact; usefulness null until real sessions |
| control-tower | `ControlTower` | real_backend | `/control-tower/*` → tel_ct_decision/receipt/gemma | TruthLabel + EmptyState | Gemma cold/fail-closed without Vertex |
| stream | `MissionControlStream` | real_backend / unavailable_fail_closed | `/stream/live|health` → tel_stream_*/pipeline_status | STALE/FAILED/NOT AVAILABLE + null_reason | **bookmark:** live stream worker enablement |
| stargate | `StargateConsole` | real_backend / unavailable_fail_closed | SSE bridge `NEXT_PUBLIC_STARGATE_BRIDGE_URL` | EmptyState "not configured" | **bookmark:** stargate bridge process |
| how-it-works | `HowItWorks` | static_demo_labeled | static constants (documentation exhibit) | "Demo mode" strip; "Not available" for missing links | documentation, not data |
| **spike-inspector** | `SpikeInspector` | **real_backend** (converted 2026-06-19) | **`/api/telemetry/findings`** → `telemetry_analyzer.analyze` over tel_predictions/drift/model_runs | per-source null_reasons listed; "No active telemetry findings." empty; `telemetry_findings_unavailable` on analyzer error | Data Source Audit panel; static `DEMO_SPIKES` deleted |

## Rollup
- **real_backend:** overview, runs, replay, monitoring, model-performance, registry, copilot,
  governance, control-tower, factory(endpoint), stream(endpoint), stargate(endpoint), **spike-inspector** — 13.
- **static_demo_labeled:** factory-ml, calibration, how-it-works — 3 (all visibly labeled with
  provenance; real sources need Databricks/local artifacts — see backlog).
- **unavailable_fail_closed (data-dependent):** factory/NCR, stream, stargate fail closed when their
  workers/mirrors aren't present — explicit, never faked.
- **bookmark_for_local_seed:** see `local-seed-backlog.md` (NCR mirror, fused vectors, stream worker,
  stargate bridge, calibration endpoint, post-change watcher source, Gemma/Vertex).

## Provenance convention
Every converted surface should expose an auditable provenance block. The Spike Inspector renders a
**Data Source Audit** panel (surface · mode · source · tenant · rows evaluated · last refresh ·
fallback used: NO), and the `/api/telemetry/findings` response carries the same `provenance` object.
Reuse this shape when converting future surfaces so regressions back to static data are obvious.
