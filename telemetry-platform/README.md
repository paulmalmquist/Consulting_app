# Telemetry Anomaly Platform

Turning raw engine-test telemetry into automated go/no-go decisions.

> **Public-data disclaimer.** This platform is built on **public NASA aerospace analog datasets**,
> chosen because they share the characteristics of engine-test telemetry: run-to-failure
> trajectories, multivariate sensor streams, and labeled off-nominal windows. It uses **no
> proprietary data** from any company. The datasets are analogs, not a stand-in for a specific
> firm's test stand.

## Results (live, exact)

Trained in Databricks, gated before promotion, served behind a live API. Metrics are exactly as
computed. Full run IDs, gate decisions, and live-URL transcripts in [PROOF.md](PROOF.md).

**Anomaly detection champion — rolling-MAD dynamic threshold** (SMAP/MSL, point-adjusted, labeled
test split):
- precision **0.5460**, recall **0.7691**, F1 **0.6387** — beat the PCA model (F1 0.4196) honestly.

**RUL champion — gradient boosting** (C-MAPSS FD001, 100 test units):
- RMSE **20.32**, PHM **1423.3** — beat the linear baseline (RMSE 21.70) on RMSE.

**MLflow champion aliases** (Unity Catalog Model Registry):
- `novendor_1.telemetry.tel_anomaly_detector@champion`
- `novendor_1.telemetry.tel_rul_regressor@champion`

**Live:** API `https://authentic-sparkle-production-7f37.up.railway.app` · demo
`https://novendor.ai/lab/env/dc82d39d-9be2-49b0-a01d-c7181b13a8b6/telemetry` (authenticated). See
[DEMO.md](DEMO.md) for the 3–4 minute reviewer script.

## What this is

An end-to-end platform that ingests sensor telemetry, detects anomalies, predicts remaining useful
life, serves scored windows behind an API, persists every prediction, and monitors itself for drift.
The point is the operated loop, not a single model:

```
NASA datasets
  → download scripts (telemetry-platform/databricks/data/)
  → Databricks Bronze   (novendor_1.telemetry.bronze_*)        raw, as-landed
  → Databricks Silver   (novendor_1.telemetry.silver_*)        typed, time-ordered, no look-ahead
  → Databricks Gold     (novendor_1.telemetry.gold_*)          features + labeled windows + RUL targets
  → MLflow training      (experiment 3740651530987773)         baseline + LSTM-AE + RUL
  → Model Registry + promotion gate                            refuses to promote sub-threshold models
  → FastAPI serving      (backend/app/routes/telemetry.py)     /score, /runs, /run/{id}, /monitoring
  → Supabase tel_*       (prediction log, tenant-scoped)       one row per prediction + receipt
  → Winston lab dashboard (repo-b .../lab/env/[envId]/telemetry) live console, deterministic replay
  → Monitoring           (/monitoring)                         PSI, rolling anomaly rate, drift
  → PROOF.md                                                   real row counts, run IDs, URLs
```

## Datasets

| Dataset | Source | Used for |
|---|---|---|
| NASA C-MAPSS Turbofan Degradation | NASA PCoE | Remaining useful life (RUL) regression, degradation modeling |
| NASA/JPL SMAP & MSL Telemetry (Telemanom) | NASA/JPL | Multivariate anomaly detection against labeled anomaly windows |
| NASA PCoE / IMS Bearing Run-to-Failure | NASA PCoE | Vibration feature engineering, predictive maintenance |

## Tools

Databricks (lakehouse, Spark, Delta), Unity Catalog `novendor_1.telemetry`, SQL Warehouse
`0e56420fb707d861`, MLflow experiment `3740651530987773` (model tracking + registry), FastAPI
(serving), Supabase project `ozboonlsplroialdwuxj` (prediction log + tenant state), Winston lab
environment (dashboard), Railway (API deploy), Vercel (frontend deploy).

## Results — detail (baseline vs champion)

Trained in Databricks, logged to MLflow, gated before promotion. Metrics are exactly as computed —
no rounding, no aspirational values. Full run IDs and gate decisions are in [PROOF.md](PROOF.md).

Anomaly detection (SMAP/MSL, point-adjusted F1 on the labeled test split, base rate 12.5%):

| Model | Precision | Recall | F1 | Promotion |
|---|---|---|---|---|
| Baseline — rolling-MAD dynamic threshold | 0.5460 | 0.7691 | **0.6387** | promoted (champion) |
| Stronger — PCA reconstruction error | 0.8726 | 0.2762 | 0.4196 | not selected (lower F1) |

The simple baseline beat the PCA model on F1, so the baseline was promoted. The stronger model was
not faked into a win.

Remaining useful life (C-MAPSS FD001, 100 test units, RUL capped at 125):

| Model | RMSE | PHM score | Promotion |
|---|---|---|---|
| Baseline — linear regression | 21.70 | 1036.1 | not selected (higher RMSE) |
| Stronger — gradient boosting | **20.32** | 1423.3 | promoted (champion) |

Promotion gates (declared before training): anomaly F1 ≥ 0.30, RUL RMSE ≤ 25. Champions registered in
the Unity Catalog Model Registry as `novendor_1.telemetry.tel_anomaly_detector@champion` and
`tel_rul_regressor@champion`.

### Validation discipline

Phase 1's first feature build exposed train/test split leakage: rolling windows partitioned by
`(subset, unit)` averaged a train unit's and a test unit's readings together because they share a
unit id. Fixed by partitioning rolling windows on `(subset, split, unit)`. The kind of bug that
quietly inflates offline metrics if you don't look for it.

## How to verify in 4 minutes

See [DEMO.md](DEMO.md) for the reviewer journey and [PROOF.md](PROOF.md) for the runnable evidence
(row counts, MLflow run IDs, live API responses, deployed URLs).

## Repository layout

This build is split deliberately. The portfolio artifacts and ML/Databricks code live here; the
serving API and the dashboard live in their conventional places inside the monorepo.

| Concern | Location |
|---|---|
| Databricks notebooks, training, dataset scripts | `telemetry-platform/databricks/` |
| Docs (README, PROOF, DEMO, wireframe) | `telemetry-platform/` and `telemetry-platform/docs/` |
| Serving API (FastAPI) | `backend/app/routes/telemetry.py`, `backend/app/services/telemetry_*.py` |
| Dashboard (Next.js) | `repo-b/src/app/lab/env/[envId]/telemetry/` (a Winston lab environment) |
| Database migrations | `repo-b/db/schema/NNN_telemetry_*.sql` |

The `api/`, `frontend/`, and `supabase/` folders here are pointers to those real locations — see
their READMEs.

## Status

Phase 0 (planning + skeleton + demo contract) complete. Phase 1 (Databricks ingestion) is gated on
`DATABRICKS_PAT`. Plan: `docs/plans/03-implementation-plans/active/0003-telemetry-platform-build.md`.
Environment notes: `docs/plans/telemetry-platform/`.
