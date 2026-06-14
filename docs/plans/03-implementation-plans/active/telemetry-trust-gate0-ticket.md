# Gate 0 Ticket — Telemetry Trust Layer Falsification

**Created:** 2026-06-13
**Status:** READY FOR INTAKE — draft ticket; file via `azure-devops-intake` before `feature-dev` picks it up.
**Type:** Read-only analysis spike (falsification gate).
**Parent assessment:** `docs/plans/03-implementation-plans/active/factory-pattern-intelligence.md`
(kept stable — do **not** rename until this gate validates or kills the idea).

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

1. Use existing C-MAPSS gold/features/prediction data.
2. Use the existing `tel_fused_state_vectors VECTOR(256)` or equivalent available fused/PCA vector source.
3. Compute kNN distance from each held-out window to the training fleet.
4. Group windows into predicted-RUL bands.
5. Within each predicted-RUL band, compute the relationship between embedding distance and absolute RUL prediction error.
6. Identify possible A/B demo pairs:

   * similar predicted RUL
   * materially different kNN distance
   * materially different actual error
7. Emit a persisted evidence artifact.

## Non-Goals

Do not:

* Train SupCon.
* Train a new RUL model.
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

Required fields or equivalents:

* unit_id
* cycle
* split / train-test marker
* predicted_rul
* true_rul
* absolute_error
* fused_state_vector or embedding vector
* model_id / prediction source if available

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
