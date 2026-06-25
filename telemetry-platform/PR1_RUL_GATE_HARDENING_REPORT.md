# PR-1 RUL Gate Hardening Report

Date: 2026-06-22 · Scope: RUL training/eval + promotion gate + model card. No frontend/backend/endpoint/cluster changes.
Verified remotely on Databricks serverless (workspace `dbc-2504bec5-b5ab`, exp `3740651530987773`).
Run evidence: `train_rul` run `121809086188445` (MLflow runs linear `cb555055`, gbm `37423c47`); `promote_models` run `261177164841175`.

## What changed
- **`telemetry-platform/databricks/notebooks/train_rul.py`** — now computes and logs naive baselines, late-prediction diagnostics (the dangerous mode), PHM-aware metrics, a label-shuffle leakage control, and a full **RUL model card** (`rul_model_card.json`) for *each* candidate. All diagnostics are logged on **both** model runs so the gate can read them regardless of the winner. The leakage control is diagnostic only — it never trains or influences the champion.
- **`telemetry-platform/databricks/notebooks/promote_models.py`** — RUL promotion gate replaced. RMSE alone can no longer promote. New fail-closed gate (`rul_gate_eval`) + safest-by-PHM selection among gate-passers.
- **`telemetry-platform/databricks/notebooks/build_ml_fundamentals_ipynb.py`** (+ regenerated `telemetry_ml_fundamentals.ipynb`) — model-card template gains `known_unsafe_failure_mode`, `approved_use`, `not_approved_use`, and a pointer to the RUL card.
- **`docs/tips.md`** — RUL-evaluation lessons appended.

## Metrics added (all logged to MLflow, on both RUL runs)
- **Naive baselines:** `rul_naive_rmse`, `rul_naive_mae`, `rul_naive_phm_score` (strongest = lowest-RMSE naive, here the train-MEAN baseline), plus `rul_naive_median_*` and `rul_naive_mean_*`. `rul_model_vs_naive_rmse_ratio`.
- **PHM-aware:** `rul_phm_score`, `rul_naive_phm_score`, `rul_phm_improvement` (= naive_phm − model_phm; **lower PHM is better**, so positive improvement = better than naive).
- **Late diagnostics** (late = predicted RUL **higher** than actual = over-stating safe life): `rul_late_prediction_rate`, `rul_early_prediction_rate`, `rul_mean_late_error`, `rul_p95_late_error`, `rul_late_error_count`; plus late-rate **by RUL regime** in the card.
- **Leakage control:** `rul_label_shuffle_rmse`, `rul_label_shuffle_vs_naive_delta`, `rul_leakage_control_passed`.

## Gate changes
Old gate (RMSE-only): *promote the lower-RMSE model if rmse ≤ 25.* New `RUL_GATE` (declared, conservative, documented — not tuned to force any outcome):

| Check | Threshold | Rationale |
|---|---|---|
| `rmse_under_abs_ceiling` | rmse ≤ 25 cycles | kept absolute ceiling |
| `beats_naive_rmse_by_margin` | rmse ≤ 0.75 × strongest-naive rmse | must beat naive by ≥25% to be "skillful" |
| `phm_better_than_naive` | model PHM < naive PHM | operational-cost-aware (lower PHM better) |
| `late_rate_under_ceiling` | late_prediction_rate ≤ 0.55 | over-stating remaining life is the unsafe mode |
| `leakage_control_passed` | shuffled-label RMSE ≥ 0.80 × naive | no target leakage |

Selection among gate-passers = **lowest PHM** (safest), then lowest late-rate, then lowest RMSE. If none pass → **fail-closed (no promotion)**; the safest-by-PHM candidate is named for the record with its `failed_checks`.

## Before/after behavior
| | Before (RMSE-only) | After (PR-1) |
|---|---|---|
| Gate inputs | rmse only | rmse + naive-margin + PHM + late-rate + leakage |
| RUL decision | **promote GBM** (rmse 20.3 ≤ 25) | **model_not_promoted** (fail-closed) |
| Why | lowest RMSE | both fail `late_rate_under_ceiling` (linear 0.59, gbm 0.58 > 0.55); all other checks pass |
| Naive baseline | none logged | mean rmse 41.7 / phm 30,753; models beat it ~2× on RMSE |
| Leakage control | none | PASS (shuffle rmse 41.65 ≈ naive 41.70) |
| Late visibility | none | overall 0.58–0.59; **near-failure regime 0.73 (gbm) / 0.93 (linear)** |
| Model card | none for RUL | full `rul_model_card.json` per candidate |

## Whether current champion passes the stricter gate
**No.** The deployed champion `tel_rul_regressor` v2 is the GBM (run `d773eab9`), identical to the re-evaluated `rul_gbm`, which **fails** the new gate on `late_rate_under_ceiling` (0.58 > 0.55). Per the PR's intent, this is the honest outcome and is acceptable. The gate is fail-closed: it did **not** promote a new version and did **not** move the alias — **the RUL champion remains v2 GBM, unchanged** (no silent overwrite). Note: the RUL champion is not consumed by any scoring notebook in this pipeline (only the anomaly `@champion` is), so nothing downstream breaks. Recommendation: do not re-promote any RUL model until the late-prediction behavior is addressed (see risks).

## Remaining RUL risks
- **Systematic optimism (the headline risk):** ~58% late overall, and **0.73–0.93 late in the near-failure (low-RUL) regime** — exactly where over-prediction is dangerous (e.g. unit 52: true RUL 29, GBM predicted 86). Mean late error ~16–18 cycles, p95 ~40–45.
- **No calibrated intervals:** point predictions only; no prediction-interval coverage. Do not present as calibrated failure probability.
- **Aggregate RMSE hides regime regressions:** GBM beats linear at low/high RUL but loses mid-RUL; linear has the better PHM (1036 vs 1423).
- **Single subset:** FD001 only, 100 test units — small; conclusions don't transfer to FD002–004 (multi-regime) untested.
- **Fix direction (next PR):** an asymmetric/quantile loss (penalize late > early) or a conservative bias/offset to push predictions earlier, then re-evaluate against this same gate. That is a modeling change, out of PR-1 scope.

## Demo language update
- Say: *"RUL beats a naive baseline ~2× on RMSE, passes a label-shuffle leakage test, and we measure the dangerous mode — late predictions — explicitly. Under our PHM-/late-rate-aware safety gate, no current RUL model is promotable yet, which is the honest state."*
- Do **not** say: *"calibrated RUL,"* *"flight-safe,"* *"production maintenance authorization,"* or imply the champion passed a safety gate. Model card states: **Approved use: telemetry demo / maintenance-risk investigation support. Not approved use: autonomous launch, flight-safety, or maintenance authorization.**

## Tests / notebook runs
- `py_compile` on `train_rul.py`, `promote_models.py`, `build_ml_fundamentals_ipynb.py` → clean.
- `build_ml_fundamentals_ipynb.py` regenerated `telemetry_ml_fundamentals.ipynb` (46 cells).
- **Remote `train_rul` SUCCESS (170 s):** MLflow logs naive (`rul_naive_rmse` 41.70), PHM (`rul_phm_score`/`rul_phm_improvement` +29,717 linear / +29,330 gbm), late (`rul_late_prediction_rate` 0.59/0.58 + regime slices), leakage (`rul_leakage_control_passed` 1.0); `rul_model_card.json` emitted per candidate.
- **Remote `promote_models` SUCCESS (32 s):** RUL gate evaluates 5 checks (verified `gate_eval`/`failed_checks` in output), decision `model_not_promoted`, **RUL champion alias unchanged at v2** (confirmed via UC alias API). Anomaly re-promoted MAD (passes honest gate) to v3 — same run/model, benign.
- All guardrails honored: no endpoint/GPU/HPO/cluster-package change; no silent champion overwrite; no promotion outside `promote_models.py`; no fake metrics; no tuning on test; late behavior surfaced, not hidden; PAT used via gitignored fallback, scanned (clean), deleted, **rotate recommended**.

## tips.md updates
Appended a "RUL gate hardening" subsection to `docs/tips.md` (late = pred > truth is the unsafe mode; gate on PHM + late-rate + naive-margin + leakage, not RMSE alone; a fail-closed gate that no model passes is a valid honest outcome).
