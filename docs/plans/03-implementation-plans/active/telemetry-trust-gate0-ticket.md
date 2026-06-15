# Gate 0 Ticket — Telemetry Trust Layer Falsification

**Created:** 2026-06-13
**Status:** RECONCILED 2026-06-13 against the live Databricks workspace — ready to file via
`azure-devops-intake` then run. See **Data Reconciliation** below: the original "reuse existing fused
vector + existing RUL predictions" premise was corrected after inspecting `novendor_1.telemetry`.
**Type:** Read-only / inference-only analysis spike (falsification gate).
**Parent assessment:** `docs/plans/03-implementation-plans/active/factory-pattern-intelligence.md`
(kept stable — do **not** rename until this gate validates or kills the idea).

## Data Reconciliation (verified 2026-06-13, live workspace)

Inspected `novendor_1.telemetry` (warehouse `0e56420fb707d861`, PAT auth). Ground truth:

- **C-MAPSS RUL lane is real but has no embedding and no stored predictions.**
  `gold_cmapss_features` (FD001: 20,631 train / 13,096 test rows, 100 units each) carries
  `subset, split, unit, cycle, max_cycle, rul_target` + 7 base sensors and their `_rmean5/_rstd5/_rmin5/_rmax5/_roc` rolling features (~47 numeric columns). It contains **ground-truth `rul_target` only — no `predicted_rul` column** anywhere in the schema.
- **The existing fused embedding is the ANOMALY lane, not turbofans.** `gold_fused_state_vectors`
  (128 train / 128 test rows) is built on **SMAP/MSL spacecraft channels** (`source_channels` = `A-1, D-4, E-12, M-3, …`), with `feature_vector array<double>`, `recon_error_ae/pca`, anomaly labels. It does **not** join to C-MAPSS `unit`/`cycle` and is **not** a turbofan degradation embedding. (`tel_fused_state_vectors` referenced in the assessment is the Postgres mirror of this same anomaly-lane vector — same caveat.)
- **No stored C-MAPSS RUL predictions exist.** Schema search for `*pred*`/`*rul*` columns returns
  only ground-truth (`rul_target`, `rul`) and the SMAP/MSL `gold_replay_feed_scored.model_pred`
  (anomaly, not RUL).
- **The RUL champion is registered and loadable.** `novendor_1.telemetry.tel_rul_regressor` exists in
  Unity Catalog (alongside `tel_anomaly_detector`). It can be loaded for **inference** to produce
  `predicted_rul` — no retraining.

**Consequence:** the literal "reuse existing predictions + existing fused vector on C-MAPSS" is not
possible. The minimal honest path that preserves "no training" is below (Scope, revised).

## Title

Gate 0 — Validate whether telemetry embedding distance predicts RUL error

## Parent / Context

This work follows:

`docs/plans/03-implementation-plans/active/factory-pattern-intelligence.md`

The architecture review determined that the original Factory Pattern Intelligence concept should be trimmed into a **Telemetry Trust Layer** capability on top of the existing telemetry platform.

This ticket is a falsification gate. It must run before any infrastructure, schema, UI, SupCon training, API endpoint, or environment work.

## Goal

Determine whether existing telemetry embedding distance carries useful trust information beyond the point RUL prediction.

Specifically:

> Among engines/windows with similar predicted RUL, are farther embedding neighbors associated with larger absolute prediction error?

If yes, the Trust Layer thesis has evidence.

If no, the project should stop before more work is built.

## Scope

Create one Databricks notebook over existing telemetry data in `novendor_1.telemetry`.

The notebook should:

1. Use existing C-MAPSS gold data: `novendor_1.telemetry.gold_cmapss_features`, subset FD001
   (`unit, cycle, rul_target` + ~47 sensor/rolling feature columns).
2. **Predictions:** load the registered `novendor_1.telemetry.tel_rul_regressor` champion and run
   **inference** (no retraining) to produce `predicted_rul` for FD001 test windows. `absolute_error =
   |predicted_rul − rul_target|`.
3. **Embedding (cheap, derived in-notebook):** the existing fused vector is the SMAP/MSL anomaly lane
   and does **not** apply to C-MAPSS (see Data Reconciliation). Build a cheap C-MAPSS embedding from
   `gold_cmapss_features` columns: standardize the ~47 numeric features (z-score on train stats),
   optionally PCA-reduce to k≈16–32. This is a feature-scaling/PCA **fit on existing features**, not
   model training. Document the exact construction. Apply RUL cap = 125 (the build convention) when
   forming `rul_target` for error.
4. Compute kNN distance from each held-out window to the training fleet in the embedding space.
5. Group windows into predicted-RUL bands.
6. Within each predicted-RUL band, compute the relationship between embedding distance and absolute RUL prediction error.
7. Identify possible A/B demo pairs:

   * similar predicted RUL
   * materially different kNN distance
   * materially different actual error
8. Emit a persisted evidence artifact.

## Non-Goals

Do not:

* Train SupCon.
* Train a new RUL model (gradient/fit of any predictor). **Allowed and not "training":** loading the
  registered `tel_rul_regressor` for frozen inference, and fitting a `StandardScaler`/`PCA` on existing
  C-MAPSS feature columns to form the cheap embedding. These are data transforms over existing features,
  not new predictive models.
* Add schema.
* Add API routes.
* Add UI.
* Add Kafka, Dataflow, BigQuery, Vertex, or new GCP infrastructure.
* Create a new telemetry environment.
* Rename files or routes.
* Claim the model is literature-competitive.

## Method

### Inputs

Use existing telemetry platform data only.

Source: `novendor_1.telemetry.gold_cmapss_features` (subset FD001) + the registered
`tel_rul_regressor` champion. Fields used / derived:

* `unit` (unit_id), `cycle`, `split` (train/test) — from gold table
* `rul_target` (true RUL, capped at 125) — from gold table
* `predicted_rul` — **derived** via `tel_rul_regressor` inference (not stored; not retrained)
* `absolute_error` = |predicted_rul − rul_target| — derived
* embedding vector — **derived** in-notebook (z-scored ~47 features, optional PCA); NOT the existing
  SMAP/MSL `gold_fused_state_vectors`
* model source = `novendor_1.telemetry.tel_rul_regressor` (record its model version)

### Distance Calculation

For each held-out/test window:

* compute nearest-neighbor distance to training windows
* use cosine or L2 distance consistently
* document the selected metric
* exclude same-unit leakage if applicable

### Predicted-RUL Bands

Bucket test windows by predicted RUL, for example:

* 0–25
* 25–50
* 50–75
* 75–100
* 100+

Adjust bands if data density requires it, but document final bins.

### Statistics

For each band, compute:

* count
* Spearman rho between kNN distance and absolute error
* p-value or bootstrap confidence interval
* median absolute error by distance quantile
* optional monotonic trend plot

Also compute an overall summary, but do not rely on the overall result alone. The within-band result is the gate.

### A/B Pair Discovery

Find candidate pairs where:

* predicted RUL is similar
* true RUL error differs materially
* embedding distance differs materially
* one engine/window has close analogs and one does not

Output top 10 candidate A/B pairs.

For each pair include:

* unit_id / cycle for A and B
* predicted_rul
* true_rul
* absolute_error
* kNN distance
* nearest analog unit/cycle if available
* short interpretation

## Evidence Artifact

Persist a machine-readable and human-readable artifact.

Suggested paths:

`docs/plans/03-implementation-plans/evidence/telemetry-trust-gate0.json`

and/or

`docs/plans/03-implementation-plans/evidence/telemetry-trust-gate0.md`

The artifact must include:

* run timestamp
* notebook path
* data source tables
* model/prediction source
* embedding source
* distance metric
* band definitions
* per-band statistics
* bootstrap confidence intervals or p-values
* top 10 A/B pairs
* continue / train SupCon next / kill recommendation
* caveats

## Decision Rule

Use a three-way decision:

### Continue

If within-band Spearman rho is meaningfully positive in multiple bands, with visible monotonic error increase by distance quantile, and at least one credible A/B pair exists.

### Train SupCon next

If the signal is weak but directionally real, suggesting the existing PCA/fused vector is not strong enough but the thesis may still hold.

### Kill

If within-band rho is near zero or negative, no monotonic relationship appears, and no credible A/B pair exists.

Do not continue to UI or infrastructure work unless this gate returns Continue or Train SupCon next.

## Acceptance Criteria

### Notebook

* [ ] Notebook runs end-to-end in Databricks against existing telemetry data.
* [ ] No new training is performed.
* [ ] No new infrastructure is introduced.

### Metrics

* [ ] kNN distance is computed from test windows to training windows.
* [ ] Predicted-RUL bands are defined and documented.
* [ ] Spearman rho is computed per band.
* [ ] p-values or bootstrap confidence intervals are emitted.
* [ ] Median absolute error by distance quantile is shown.

### Evidence

* [ ] Evidence artifact is persisted to the repo.
* [ ] Artifact includes top 10 A/B candidate pairs.
* [ ] Artifact includes a clear continue / SupCon next / kill recommendation.
* [ ] Artifact states caveats and data limitations.

### Guardrails

* [ ] No schema changes.
* [ ] No UI changes.
* [ ] No API changes.
* [ ] No SupCon training.
* [ ] No Vertex/Dataflow/BigQuery additions.
* [ ] No claim that the existing RUL model is literature-competitive.

## Risk Level

Medium.

The work is technically low-risk because it is read-only analysis over existing telemetry data. The project risk is high because this ticket can invalidate the Trust Layer thesis.

## Expected Files

Likely:

* `telemetry-platform/databricks/notebooks/telemetry_trust_gate0_distance_error.py`
* `docs/plans/03-implementation-plans/evidence/telemetry-trust-gate0.md`
* `docs/plans/03-implementation-plans/evidence/telemetry-trust-gate0.json`

Do not modify application code.

> **Convention note:** existing Databricks notebooks in `telemetry-platform/databricks/notebooks/`
> (e.g. `train_rul.py`, `fused_state_vector.py`) are committed as **Databricks-source `.py`** files,
> not `.ipynb`. Match that format — the notebook should be `…_gate0_distance_error.py`. If a `.ipynb`
> is preferred for authoring, export the source `.py` for the repo.

## Execution Prerequisites

* **Databricks PAT** must be present in the execution environment (`DATABRICKS_PAT`, sourced from
  `claude_token.txt`, verified read-only — confirm it is a real `dapi…` token and STOP otherwise).
  Prior `docs/tips.md` history shows this environment has repeatedly lacked Databricks credentials; if
  the PAT is unavailable, the correct output is a "credentials unavailable" receipt, not a partial run.
* Reuse `skills/historyrhymes/scripts/databricks_client.py` (the proven client used by the telemetry
  build) and the `novendor_1.telemetry` Unity Catalog schema. Start/stop the warehouse per step.

## Final Report Requirements

At completion, report:

1. notebook path
2. tables used
3. embedding source used
4. distance metric
5. per-band rho results
6. top A/B pair
7. recommendation: continue / train SupCon next / kill
8. evidence artifact path
9. tests or validation run
10. any reusable lessons that should be added to `docs/tips.md`

---

*Next step: file this through `.skills/azure-devops-intake/SKILL.md` (Epic → Feature → Task on the
Novendor board) to produce the Session Brief, then hand the brief to `.skills/feature-dev/SKILL.md`.
The assessment artifact stays frozen until this gate returns a decision.*
