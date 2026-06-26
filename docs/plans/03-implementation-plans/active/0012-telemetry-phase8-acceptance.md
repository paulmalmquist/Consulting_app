# Phase 8 — Telemetry Presentation Readiness: Final Acceptance (8I)

Companion to [`0012-telemetry-presentation-readiness.md`](./0012-telemetry-presentation-readiness.md).
Acceptance pass run on the `docs/8i-acceptance` branch off `origin/main`. **No product scope added** —
verification + this note only.

Browser automation was **not available** in this environment, so the visual checks below are **route notes**
(route file present on disk → the Next.js route resolves; render proven by the component test suite), not
fabricated screenshots.

## Production version verified

- `https://novendor.ai/api/version` → **`e28f2c73`** (the 8D-3 backend deploy; current).
- `scripts/streaming/stargate/verify_lineage.py --base https://novendor.ai` → **6 PASS / 1 WARN / 0 FAIL**
  ("OK with warnings: routes answer fail-closed; serving slice may be empty" — the honest, expected posture
  with the live stream consumer cold).

## PRs included in Phase 8

| Step | PRs |
|---|---|
| 8A framework + XLSX deploy | #402, deploy receipt #404 |
| 8B Overview | #405 |
| Scope-gap re-sequence (plan) | #407 |
| 8C streaming controls / anomaly + DLQ export | #408 |
| 8D Model Perf / Registry / anomaly_events XLSX (+deploy) | #410, #412, #414 |
| 8E RUL Calibration | #416 |
| 8F Factory NCR + Flight Readiness | #418, #419 |
| 8G Test Runs (Run Autopsy/Review assessed) | #421 |
| 8H Rationalization (inventory, rail cleanup, orphan delete) | #423, #424, #425 |
| Docs follow-ups | #415, #417, #420, #422, #426 + this 8I |

## Visible nav (14 items, 6 sections)

- **Overview** — Overview (`/`)
- **Operations** — Mission Control (`/stream`), Replay (`/replay`), Stargate Live (`/stargate`),
  Test Runs (`/runs`), System Health (`/system-health`)
- **Models & Intelligence** — Model Performance (`/model-performance`), RUL Calibration (`/calibration`),
  Model Registry (`/registry`)
- **Factory & Quality** — Factory · NCR (`/factory`), Flight Readiness (`/factory-ml`)
- **Evidence & Lineage** — Metric Lineage (`/metric-lineage`), Metadata Explorer (`/metadata`)
- **Agent Operations** — Agent Control Tower (`/control-tower`) *(kept visible per owner, 8H)*

The ADE "Platform" cross-link was removed from the rail (8H-2); `/automated-data-engineering` still resolves
directly.

## Hidden-but-resolving routes (confirmed present on disk → resolve)

`copilot`, `governance` (Trust Center), `how-it-works`, `evidence` (Resume Evidence), `monitoring`,
`spike-inspector`, `data-engineering`, `data-engineering/grain`, `data-engineering/relationships`,
`data-engineering/pipelines`, `data-engineering/autopsy`. **Not re-promoted to nav.**
`data-engineering/workflows` was deleted (8H-3, orphaned). `data-engineering/{workbench,sources}` remain
hidden-but-resolving (quarantine candidates — wired into the DE landing).

## Drill / export receipt matrix

| Route | Source kind | Drill | Export | Phase |
|---|---|---|---|---|
| Overview | fixture (cadence/anchors/cost), Timeline = honest no-rows | Big-Number `MetricInspectorDrawer` + `SourceRowsTable` | Big-Number CSV | 8B |
| Mission Control | live-rows `tel_anomaly_events` | anomaly inspection | anomaly **CSV + XLSX** (server `anomaly_events`) | 8C/8D-3 |
| Stargate Live | real SSE rows over recorded-capture replay | `AnomalyInspectionDrawer` | anomalies + DLQ CSV | 8C |
| Replay | computed-artifact/fixture | `ReplayForensicsDrawer` (5-tab autopsy, lineage links, `NaRow` nulls) | — (forensics inspector) | pre-8 / 8G assessed |
| Test Runs | live-rows `tel_test_runs` | per-run `MetricInspectorDrawer` (run-link fields fail-closed + null_reason, copyable run_key) | CSV | 8G-1 |
| Evidence (per-page) | mixed, labeled per card | `EvidenceContract` cards | — | pre-8 |
| Model Performance | live-rows `tel_model_runs` | per-model `DatabricksRunLink` + `ModelArtifactLink` | **CSV + XLSX** (`model_runs`) | 8A/8D-1 |
| RUL Calibration | computed-artifact (FD001 scalars/bands) + fixture (replay trajectory) | unit-level `MetricInspectorDrawer` + `SourceRowsTable` | unit-level CSV (server XLSX honestly disabled — artifact, no `tel_*` table) | 8E |
| Model Registry | live-rows `tel_model_runs` | run/artifact links + metadata null_reasons | Models **CSV + XLSX** (`model_runs`) + Drift CSV | 8D-2 |
| Factory · NCR | computed-artifact (databricks batch) / fixture (local) | per-exemplar `MetricInspectorDrawer` (record-level fields fail-closed) + severity filter | clusters CSV + filter-aware exemplars CSV | 8F-1 |
| Flight Readiness | fixture | vehicle `FactoryEvidenceDrawer` + heatmap row detail | readiness CSV + heatmap-cells CSV | 8A/8F-2 |
| Metric Lineage | live + provenance | `LineageDrawer` / Databricks lake pointers | — | pre-8 |

## XLSX route verification (live prod, through the proxy)

- `/api/telemetry/export/datasets` → `model_runs` + `anomaly_events`, both `source_kind: live-rows`.
- `model_runs.xlsx` → **HTTP 200**, valid openpyxl workbook, **6 rows**, correct content-type + attachment.
- `anomaly_events.xlsx` → **HTTP 200**, valid **header-only** workbook (0 rows — live consumer cold, honest)
  + `X-Telemetry-Null-Reason`.
- `bogus.xlsx` (unknown) → **HTTP 404**, `null_reason: export_dataset_not_allowed`, `allowed: [anomaly_events, model_runs]` (fail-closed, no silent fallback).
- Binary integrity preserved through the Next.js proxy's `arrayBuffer` branch (no `.text()` corruption).

## Source-kind examples (honesty, no fixture-looks-live)

- **live-rows:** Model Performance/Registry `tel_model_runs`, Mission Control `tel_anomaly_events`, Test Runs
  `tel_test_runs`, Factory NCR (databricks batch → labeled **computed-artifact**, not live-serving).
- **computed-artifact:** RUL Calibration FD001 conformal scalars + bands.
- **fixture:** Flight Readiness `public/labs/factory-ml/*.json`, RUL replay trajectory, Overview cadence/anchors.
- **unavailable + null_reason:** Test Runs run-link/model fields, Factory NCR detected_at/disposition, RUL
  server-XLSX, registry training_window/validation_method, anomaly_events empty window.

## Links

- Real `DatabricksRunLink` / `ModelArtifactLink` on Model Performance + Registry (per `mlflow_run_id`); the
  Replay autopsy carries MLflow run/experiment + Delta-table links.
- Where only an id exists (Test Runs, seed-name artifacts), the id is rendered copyable and the link is
  disabled/unavailable with a null_reason — **no fabricated URLs**.
- Metric Lineage + `LineageDrawer` provide source→artifact provenance.

## Preserved evidence values + caveats (frozen-evidence 8/8 green)

Spin 1 90% FP reduction / η² 1.0→0 · Spin 2 93% redundant at failure, leads 9/14/11, ~11-cycle lag ·
Spin 3 PICP 0.86, 15/100 flips (Evidence `RulConformalCard`) · Spin 5 FD001 98.9% in / FD004 90.5% out ·
Spin 6 +8% lift, 9% overlap · degenerate autoencoder = judgment artifact (not champion) · honest metrics
primary (pointwise F1 0.313, not point-adjusted 0.645). RUL Calibration FD001 (PICP 0.778/0.903, RMSE 17.33)
and Flight Readiness (VEH-TR-003 0.58, pr_auc 0.84) unchanged. No claim strengthened beyond measured values.

## Tests run / results

- Frontend typecheck: **clean**.
- Full telemetry suite: **225 passed** (51 files).
- Nav + sidebar smoke: **10 passed**.
- Backend frozen-evidence: **8 passed**. Backend export route: **11 passed**.
- Lint: green (8I adds no code; last enforced on 8H CI).
- Route files: 12 visible + 10 hidden-but-resolving present; deleted `workflows` confirmed gone.

## Remaining backlog (non-blocking)

- Optional `MetricInspectorDrawer` drill enhancements on a few secondary metrics.
- Cosmetic `databricks_path=""` on some seed-name artifact links (renders disabled-with-reason, not broken).
- Future quarantine candidates: `data-engineering/workbench` + `data-engineering/sources` after the DE-landing
  surgery (remove their `DataEngineeringOverview` link cards + test), then delete with approval.
- Detector "spotless" gate only after areas converge (report-only for now).
- Live anomaly_events XLSX is header-only until the stream consumer is warm (honest; not a bug).

## Deploy

**None required** — 8I is verification + docs. Prod backend remains at `e28f2c73`; the frontend auto-deploys
from main. Phase 8 is demo-ready.
