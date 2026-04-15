---
name: ncf-grant-friction
description: NCF Grant Processing Friction / Delay Risk Model — Databricks training + MLflow + Postgres sync. Produces per-grant risk scores consumed by Winston's NCF Executive view.
when_to_use: Building, retraining, or deploying the NCF grant friction model; wiring new features; reviewing the Winston integration contract
source_of_truth: true
handoff_to:
  - skills/historyrhymes/SKILL.md  # stack conventions and MLflow pattern
  - agents/data.md                  # migrations and backfill coordination
---

# NCF Grant Friction Model

Predict whether a newly recommended grant will experience friction, delay, or
exception handling before distribution. Governed operational signal, not a
decision gate.

## Overview

- **Target (v1):** binary `had_friction = required_manual_exception OR sla_miss OR review_cycles > 1`
- **Horizon:** scored at `recommended_at`; label known at terminal state (paid / cancelled / returned)
- **Model:** XGBoost (ship) + calibrated logistic regression (baseline), isotonic calibration on held-out walk-forward fold
- **Explainability:** SHAP-derived top drivers per prediction, surfaced in Winston UI

## Stack

- **Catalog / schema:** `novendor_1.ncf_ml.*` (follows HistoryRhymes `novendor_1.historyrhymes.*` pattern)
- **MLflow experiment:** `/Users/paulmalmquist@gmail.com/NCFGrantFriction`
- **Compute:** Databricks Serverless Starter (Small, 15-min auto-stop)
- **Auth:** `DATABRICKS_PAT` env var — never hardcoded

## Data flow

```
Postgres ncf_grant / ncf_donor / ncf_office / ncf_fund / ncf_contribution
         │
         ▼
novendor_1.ncf_ml.bronze_*            (nightly JDBC mirror)
         │
         ▼
novendor_1.ncf_ml.silver_grant_labeled       ← terminal-state target
novendor_1.ncf_ml.silver_feature_store       ← point-in-time features
         │
         ▼
novendor_1.ncf_ml.gold_grant_friction_train  ← training table (features + label)
         │
         ▼  (weekly train, daily score)
MLflow model registry  →  novendor_1.ncf_ml.gold_grant_friction_preds
         │
         ▼  (nightly sync)
Supabase ncf_grant_friction_prediction  →  Winston /api/v1/ncf/grant-friction
```

## Notebooks

Run order for training:

1. `01_bronze_ingest.py` — JDBC pull from Postgres, partition by `recommended_at`
2. `02_silver_label.py` — terminal-state grants + target construction
3. `03_silver_features.py` — point-in-time rolling features (PySpark)
4. `04_gold_train_table.py` — join features + label, as-of-safe
5. `05_train_grant_friction.py` — LR baseline + XGBoost + MLflow logging

Run order for inference:

1. `01_bronze_ingest.py` (open grants only)
2. `03_silver_features.py`
3. `06_batch_score.py`
4. `07_sync_to_postgres.py`

## Point-in-time correctness

Every rolling feature is computed with `window.end = grant.recommended_at - 1 day`.
No same-day leakage. See `03_silver_features.py` for the canonical pattern.

## Contract back to Winston

Output rows land in `ncf_grant_friction_prediction` (schema 518). The Python
service `backend/app/services/ncf_grant_friction_service.py` reads this table
and returns a `GrantFrictionScore` dataclass. The FastAPI route is
`GET /api/v1/ncf/grant-friction/{grant_id}`.

Fail-closed: a missing row returns `null_reason='model_not_available'`, never
a fabricated score. This mirrors the authoritative-state lockdown philosophy.

## What this model is not

- Not a compliance engine
- Not a go/no-go gate
- Not a replacement for human review
- Not an authoritative-state read (does not go through `re_authoritative_snapshots`)

## Pointers

- Walk-forward pattern: [skills/historyrhymes/templates/regime_classifier.py](../historyrhymes/templates/regime_classifier.py)
- Service shape: [backend/app/services/history_rhymes_service.py](../../backend/app/services/history_rhymes_service.py)
- Plan: [plans/sequential-doodling-sparkle.md](~/.claude/plans/sequential-doodling-sparkle.md)
