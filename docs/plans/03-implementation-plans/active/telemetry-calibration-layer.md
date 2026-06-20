# Telemetry Calibration Layer — Implementation Plan

**Created:** 2026-06-13
**Status:** ✅ DONE 2026-06-20 — Tickets 1–3 all shipped (RUL Calibration screen live at `/lab/env/[envId]/telemetry/calibration`). No further build work; demo-prep only. Kept in `active/` for reference. Original status retained below.

**Original status:** ACTIVE — **Tickets 1 & 2 DONE 2026-06-13.** Ticket 1 reproduced + calibrated the GBM
baseline (gate PASS; `evidence/telemetry-calibration-baseline.md`, commit `92ac2865`). **Ticket 2: a
CNN-LSTM challenger GRADUATED** as FD001 RUL champion — RMSE 17.33 (vs 20.32), PHM 742 (vs 1423),
calibrated 80/90% coverage, tighter intervals (`evidence/telemetry-calibration-challenger.md`). Still
NOT literature-competitive (>13); no such claim made. **Ticket 3 DONE 2026-06-13** — one thin RUL
Calibration screen at `/lab/env/[envId]/telemetry/calibration` (component `RulCalibration.tsx`, static
evidence fixture `lib/telemetry/calibrationEvidence.ts`, nav entry added). Frontend-local, no backend,
no schema. 5 component tests pass; 40/40 telemetry tests green; typecheck + lint clean. Demo build is
complete (kill story → reproduced+calibrated baseline → graduated champion → calibration screen).
**Supersedes thesis:** the Telemetry Trust Layer (`factory-pattern-intelligence.md`), **KILLED** by
Gate 0 (`evidence/telemetry-trust-negative-result-writeup.md`, commit `383536bd`).
**Owning env plan:** `docs/plans/telemetry-platform/` (update its `next-session.md` / `backlog.md` per
`PLAN_MAINTENANCE_RULES.md`).
**Horizon:** two weeks, to a Long Beach / Relativity-facing demo.

## 1. Context

The Telemetry Trust Layer proposed using **embedding distance from the training fleet** as a trust
signal for RUL predictions. Gate 0 falsified it: within predicted-RUL bands, distance **anti-correlated**
with absolute error (overall Spearman ρ = −0.127; 3 of 5 bands significantly negative). Verdict: KILL.

This plan **does not revive** embedding-distance trust in any form. It pivots to a different, defensible
claim about uncertainty — one that survives evaluation rather than failing it. The throughline of the
two-week story is **calibrated honesty about uncertainty**: the kill is honesty about a *thesis*; this
build is honesty about a *prediction*.

## 2. Product thesis

> We do not claim the model knows when it has no analog.
> We do make its RUL uncertainty **measurable, calibrated, and visible**.

Concretely: a RUL point prediction shipped *with* a calibrated prediction interval whose coverage we can
verify (PICP within tolerance of nominal), whose width we report honestly (MPIW/PINAW), and whose
late-prediction risk (the asymmetric PHM08 penalty) is shown rather than hidden.

## 3. Scope

A calibrated RUL prognostics artifact on **C-MAPSS FD001**, reusing the existing telemetry data path.
Deliverables:

- RUL **point prediction** (reproduce the existing baseline first, then one stronger model if warranted).
- **PHM08 Score** (asymmetric, late-penalty-heavy) reported alongside **RMSE**.
- **Conformal prediction interval** (distribution-free coverage guarantee) at nominal 80% and/or 90%.
- **PICP** (coverage), **MPIW / PINAW** (interval width/sharpness).
- **CRPS** if feasible (probabilistic accuracy).
- **Reliability diagram** (observed vs nominal coverage).
- **Prediction-interval replay** for one engine trajectory (RUL truth, point prediction, interval band
  over the engine's life).
- An **honest model card** (data, method, metrics, caveats, the explicit non-competitive note).

## 4. Non-goals (hard constraints — do not violate)

The killed thesis stays dead. Explicitly **not** in scope, now or as a follow-on, unless a *new*
approved falsification plan reopens it:

- ❌ SupCon / any contrastive encoder
- ❌ contrastive retrieval / analog retrieval as a trust mechanism
- ❌ embedding-distance trust / novelty-distance claims of any kind
- ❌ pgvector analog trust
- ❌ Trust/Divergence schema
- ❌ Trust/Divergence UI screens / multi-screen "cockpit"
- ❌ GNN root-cause graph
- ❌ sonification
- ❌ Vertex AI, Dataflow, BigQuery as a new dependency, a new Kafka topic, a new telemetry environment
- ❌ any claim the RUL model is literature-competitive unless a metric actually clears the bar (see §7)

Also: **no multi-screen cockpit.** One thin screen, and only after the model + calibration gates pass.

## 5. Reuse map (what already exists — build on it, don't rebuild)

| Need | Reuse | Path |
|---|---|---|
| C-MAPSS data (FD001) | Gold features table, real per-cycle train truth | `novendor_1.telemetry.gold_cmapss_features`; test truth `silver_cmapss_rul` |
| RUL training code | Existing baseline (Linear + GBM), feature selection, splits | `telemetry-platform/databricks/notebooks/train_rul.py` (also `09_train_rul.py`) |
| **PHM08 scoring** | `phm_score()` already implemented (a=13 early / a=10 late) | `train_rul.py:58` |
| RUL conventions | `RUL_CAP = 125`, `FEAT_COLS = sensor_*` (~47 cols), no-look-ahead rolling features | `train_rul.py:24,32` |
| Model registry / promotion | MLflow + Unity Catalog, champion/challenger, promotion gates | `tel_rul_regressor` v1; `10_promote_models.py`, `promote_models.py` |
| Serving | Lean champion-as-rule pattern, fail-closed null_reasons, receipts | `backend/app/services/telemetry_serving.py` (576 lines), `backend/app/routes/telemetry.py` (193) |
| UI host | **Extend** the existing model-performance page (no new shell) | `repo-b/src/app/lab/env/[envId]/telemetry/model-performance/`, `repo-b/src/components/telemetry/` |
| Evidence convention | Metrics artifacts in the evidence folder | `docs/plans/03-implementation-plans/evidence/` |
| Reproducibility | sklearn pin, serverless job shape, CLI auth | `docs/tips.md` (2026-06-13 Gate 0 entries) |

Note: the existing champion is GBM at **RMSE 20.32 / PHM 1423** on the last-cycle-per-unit benchmark.
That is the number to **improve and report honestly** — not to call competitive.

## 6. Technical approach (simplest path first)

1. **Reproduce the existing RUL benchmark exactly.** Re-run `train_rul.py`'s evaluation
   (last-cycle-per-unit, truth from `silver_cmapss_rul`, RUL cap 125) and confirm RMSE ≈ 20.32 / PHM ≈
   1423. This is the honest baseline everything is measured against. *Gate: reproduces within rounding.*
2. **Correct preprocessing only if a real gap is found.** Verify, don't assume:
   - FD001 subset, `RUL_CAP = 125` (piecewise-linear).
   - 30-cycle sliding windows (current gold uses `_rmean5`-style rolling features; confirm window
     definition and whether a 30-cycle sequence input materially helps before adopting it).
   - Train/validation/test split with **no unit leakage** (split by unit id, as Gate 0 did).
   - Normalization **fit on train only**.
   - Document any correction as a delta from the current pipeline; do not silently change conventions.
3. **Train one stronger baseline — only one — if step 1's RMSE motivates it.** Choose a single model
   (Deep CNN, CNN-LSTM, TCN, or a compact transformer), not a menu. Justify the pick in the model card.
   Do not chase SOTA; the target is credible + reproducible.
4. **Add conformal prediction intervals.** Hold out a dedicated **calibration split** (units disjoint
   from train and test). Use split-conformal (or CQR on a quantile head) to produce nominal **80%**
   and/or **90%** intervals with a distribution-free coverage guarantee.
5. **Emit metrics.** Point metrics (RMSE, PHM08) + calibration metrics (PICP, MPIW/PINAW, CRPS if
   feasible) + a reliability diagram, written to the evidence folder; record the model version.

Keep the model dependency-light (the serving layer must stay free of heavy ML imports per the existing
`telemetry_serving.py` pattern — predictions and intervals are precomputed/served, not cold-inferred).

## 7. Evaluation gates

### Predictive
- **FD001 RMSE** — stretch **≤ 13** (literature-credible); acceptable-demo: **materially improves on
  20.32 and is reported honestly.** No competitiveness claim is made unless RMSE actually clears ~13.
- **PHM08 Score** reported alongside RMSE every time (comparable only on identical test sets).

### Calibration (the real point of this build)
- **PICP** within **±0.03** of nominal (e.g. 0.90 interval → observed coverage 0.87–0.93). Hard gate.
- **MPIW / PINAW** reported (an interval that covers by being absurdly wide is not a pass — report width
  so the seam is honest).
- **Reliability diagram** generated (observed vs nominal across coverage levels).
- **Late-prediction cases called out** — PHM08 penalizes late (optimistic) RUL harder; surface where the
  model and its interval are late.

### Reproducibility
- One command / one Databricks job reruns training + eval end to end (`scikit-learn==1.4.2` pinned).
- Metrics artifact saved to `docs/plans/03-implementation-plans/evidence/`.
- Model version recorded (MLflow run id + UC registry version).

## 8. Demo surface (one thin screen)

Extend the **existing** model-performance page or add a single route:
`repo-b/src/app/lab/env/[envId]/telemetry/calibration` (or a tab on
`.../telemetry/model-performance`). **No three-screen cockpit.** Built only after §7 gates pass.

It shows, for one selected engine trajectory:
- true RUL vs predicted RUL over the engine's life,
- the calibrated interval band (80% / 90%),
- late-prediction risk highlighted,
- the PHM08 penalty region (asymmetric: late costs more),
- a coverage summary (PICP / MPIW for the fleet),
- a link to the model card.

All values read from the API / precomputed metrics — no hardcoded numbers. Reuse `TelemetryShell` and
the existing telemetry chrome; this is a screen, not a new environment.

## 9. Two-week execution plan

| Window | Work | Output |
|---|---|---|
| **Days 1–2** | Package the negative result. | `telemetry-trust-negative-result-writeup.md` (done this session); this plan. |
| **Days 3–7** | Train + evaluate the calibrated RUL model. | Reproduced baseline → (optional) one stronger model → conformal intervals → metrics artifact. §7 gates. |
| **Days 8–10** | Thin demo surface — **only if §7 gates pass.** | One calibration screen / model-performance tab. |
| **Days 11–12** | Buffer + hardening. | Fix calibration/coverage misses; tighten the model card. |
| **Days 13–14** | Presentation + Q&A prep. | Demo script (kill story + calibrated model), anticipated questions. |

Gate discipline: if Days 3–7 do not clear the calibration gate, **do not** build the screen (Days
8–10) — fix calibration or present the honest gap. The model is the deliverable; the screen is dressing.

## 10. Risk register

| Risk | Rank | Mitigation |
|---|---|---|
| Model doesn't reach RMSE ≤ 13 | Medium | Acceptable-demo path is "materially better than 20.32, reported honestly." Calibration is the headline, not the leaderboard number. |
| Conformal intervals too wide (MPIW large) | Medium | Report PINAW; try CQR (quantile head) for adaptive width; state the width honestly rather than hiding it. |
| Coverage misses nominal (PICP outside ±0.03) | High | Recalibrate on the dedicated calibration split before building any UI; coverage is a hard gate. |
| Databricks credential friction | Medium | PAT auth + serverless job shape + sklearn pin documented in `tips.md`; budget for "credentials unavailable → blocker receipt." |
| **Accidental revival of the killed Trust Layer** | High | §4 non-goals are explicit; the assessment carries a kill banner; reviewers reject any distance/analog/SupCon creep. Any reopen needs a *new* approved falsification plan. |
| UI bloat (cockpit creep) | Medium | One screen, gated on the model. No second screen without explicit approval. |
| Benchmark comparability errors | High | PHM08 Score only comparable on identical test sets; RMSE always reported beside it; never compare last-cycle and all-cycle numbers; no SOTA claim without clearing the bar. |

## 11. First implementation ticket

**"Reproduce and calibrate C-MAPSS FD001 RUL baseline."**

- **Scope:** Databricks-/notebook-only. **No UI, no API, no new schema.**
- **Do:** (1) reproduce `train_rul.py`'s last-cycle benchmark (confirm ≈ RMSE 20.32 / PHM 1423);
  (2) verify the preprocessing conventions in §6.2 and document any correction; (3) add a dedicated
  calibration split (units disjoint from train/test) and split-conformal 80%/90% intervals;
  (4) compute RMSE, PHM08, PICP, MPIW/PINAW, (CRPS if feasible) and a reliability diagram.
- **Output:** a metrics artifact to `docs/plans/03-implementation-plans/evidence/`
  (`telemetry-calibration-baseline.{json,md}`) + MLflow run id / model version recorded.
- **Reproducibility:** pin `scikit-learn==1.4.2`; serverless job shape per `tips.md`.
- **Gate:** PICP within ±0.03 of nominal; baseline RMSE reproduced. Only then consider §6.3 (one
  stronger model) and §8 (the screen).
- **Route:** through `azure-devops-intake` → `feature-dev` per the work-intake gate, when ADO +
  Databricks creds are confirmed in the same session (per the prior Gate 0 sequencing lesson).

## 12. Tips update

A durable lesson was added to `docs/tips.md` this session: Gate 0 killed embedding-distance trust on
C-MAPSS, and future telemetry work must not revive SupCon / contrastive retrieval / novelty-distance
without a *new* approved falsification plan. Benchmark-comparability and conformal-calibration
methodology notes belong there too as they are discovered during implementation.

---

*Planning only. No implementation code, schema, API, UI, or Databricks training changes were made in the
session that created this plan.*
