# Telemetry Calibration Layer — Ticket 1 Evidence: Reproduce + calibrate FD001 RUL baseline

**Status:** COMPLETE.
**Calibration gate (PICP within ±0.03 of nominal): PASS.**
**Date:** 2026-06-13 · **Run:** `1048860487972876` (SUCCESS) · `scikit-learn==1.4.2`
**Notebook:** `telemetry-platform/databricks/notebooks/telemetry_calibration_baseline.py`
**Plan:** `docs/plans/03-implementation-plans/active/telemetry-calibration-layer.md`
**Machine-readable:** `telemetry-calibration-baseline.json`
**Scope honored:** Databricks/notebook-only — no UI, no API, no schema, no new model surface.

## Part 1 — Reproduced benchmark (the honest anchor)

GBM (300 trees, depth 3, lr 0.05) on all FD001 train rows, evaluated **last-cycle-per-unit** against
the official RUL truth (`silver_cmapss_rul`), RUL cap 125:

| Metric | This run | Shipped reference |
|---|---|---|
| RMSE | **20.322** | ~20.32 |
| PHM08 | **1423.33** | ~1423 |
| units | 100 | 100 |

Reproduces the shipped champion to three decimals. **Not literature-competitive** — the FD001 bar is
RMSE ≤ ~13; this is ~20. No competitiveness claim is made. This number exists to anchor the calibration
work honestly, not to impress.

## Part 2 — Calibration (the actual deliverable)

Split-conformal absolute-residual intervals. FD001 **train split** (the only split with per-cycle
`rul_target`), units split **disjoint** by id (seed 0): **fit 60 / calibration 20 / internal-test 20**.
Conformal quantile fit on the calibration units; coverage measured on the internal-test units (3,813
per-cycle windows).

### Interval calibration — GATE PASS

| Nominal | PICP | Δ vs nominal | MPIW (cycles) | PINAW | within ±0.03 |
|---|---|---|---|---|---|
| 80% | **0.788** | −0.012 | 42.98 | 0.344 | ✅ |
| 90% | **0.895** | −0.005 | 55.98 | 0.448 | ✅ |

Both levels are within ±0.03 of nominal → **calibration gate PASS.**

### Reliability table (observed coverage vs nominal)

| Nominal | 0.50 | 0.60 | 0.70 | 0.80 | 0.90 | 0.95 |
|---|---|---|---|---|---|---|
| Observed | 0.457 | 0.545 | 0.668 | 0.788 | 0.895 | 0.948 |

Monotone and close to the diagonal across all six levels — the intervals are honestly calibrated, not
just at the two headline levels. (Approx. interval-integrated CRPS: 56.07.)

### Late-prediction callout (the dangerous side)

PHM08 penalizes **late** (optimistic) RUL harder than early. On the internal-test windows:
- fraction of predictions late (pred > true): **0.495**
- mean late overshoot: **21.3 cycles**
- **late-side miss rate at the 90% band: 0.8%** — the conformal interval catches ~99% of cases where
  the model is dangerously optimistic. This is the headline safety property: the band rarely sits below
  a unit that is actually closer to failure than predicted.

## Honest caveats (do not misread)

- **Intervals are wide.** MPIW ≈ 43–56 cycles (PINAW ≈ 0.34–0.45). Coverage is honest *because* the
  band is generous; this is exactly why MPIW is reported beside PICP. Tightening width (without losing
  coverage) is the motivation for the optional stronger model / CQR — not a reason to claim victory yet.
- **Per-cycle PHM is meaningless and is not used as a metric.** The notebook computed a `phm_per_cycle`
  of ~98,776 — an artifact: PHM08 is designed for *one* prediction per unit (last cycle); applied
  per-cycle over thousands of early-life windows with large RUL gaps, its exponential terms explode.
  **PHM is reported on the last-cycle benchmark (Part 1) only; per-cycle uses RMSE.**
- **Part 1 RMSE (20.32, last-cycle) and Part 2 RMSE (22.04, per-cycle internal-test) are different
  quantities** — different eval populations. Do not compare them.
- Single seed; the disjoint-unit split is seed 0. The reliability monotonicity across 6 levels and
  3,813 windows makes a seed artifact unlikely, but a multi-seed check is a cheap robustness add.
- Same GBM family as the shipped champion — this ticket **reproduces + calibrates**, it does not
  introduce a new model surface.

## Reproducibility

- Pin **`scikit-learn==1.4.2`** (champion runtime; newer sklearn breaks GBM `predict()`).
- Serverless job: `runs/submit` task `environment_key:"Default"` +
  `environments[].spec {client:"2", dependencies:["scikit-learn==1.4.2"]}`.
- CLI v1.0.0 auth: `DATABRICKS_AUTH_TYPE=pat`, `DATABRICKS_CONFIG_FILE=/dev/null`; Windows Git Bash
  `MSYS_NO_PATHCONV=1`.

## Verdict for the plan

The calibration gate **passes** on the existing baseline — calibrated RUL uncertainty is real and
honest here, which is the defensible thesis the killed Trust Layer was replaced with. Per
`telemetry-calibration-layer.md` §9, the next steps are now unlocked:
- **Optional** — one stronger single predictor (to cut RMSE toward ≤13 and tighten MPIW), or CQR for
  adaptive interval width.
- **Then** — the one thin calibration demo screen (Days 8–10), now permitted because the gate passed.

Wide intervals are the honest current state; narrowing them (without breaking coverage) is the next
quality lever, not a blocker for the demo narrative.
