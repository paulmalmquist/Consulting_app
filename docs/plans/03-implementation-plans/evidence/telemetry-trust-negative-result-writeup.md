# Telemetry Trust Layer — Negative Result Writeup

*Three-minute read. Narrative compression of the Gate 0 evidence — not a replacement for it.
Raw data: `telemetry-trust-gate0.json` · full receipt: `telemetry-trust-gate0.md`.*

## 1. Hypothesis

A single falsifiable claim:

> Among engines/windows with similar **predicted** RUL, greater embedding distance from the training
> fleet should predict **larger absolute RUL error**.

If true, embedding distance is a usable "trust" signal: the model could flag predictions it shouldn't
be trusted on ("no close analog → wider doubt"), independent of the RUL number itself. That signal was
the entire novelty of the proposed "Telemetry Trust Layer."

## 2. Why this was tested first

The assessment (`factory-pattern-intelligence.md`) found that most of the proposed build was already
owned infrastructure, and that the **one** genuinely novel claim was distance-as-trust. So we tested
the riskiest claim **before** spending two weeks on a contrastive (SupCon) encoder, a Trust/Divergence
schema, API endpoints, three UI screens, or any infrastructure. The gate was designed to be able to
**kill the project for ~half a day of analysis** — frozen inference, no new model, no build.

## 3. Method

- **Frozen inference, no new predictor.** Loaded the registered `tel_rul_regressor` champion (GBM,
  `scikit-learn==1.4.2`) and ran it as-is. No training.
- **Real per-cycle truth.** The C-MAPSS **test** split has no per-cycle `rul_target` (truncated units),
  so the analysis ran on the **FD001 train split**, which has a real per-cycle target for every row.
- **Held-out units, no leakage.** 100 FD001 units split by unit id (seed 0) into **80 fleet** (16,220
  rows) and **20 held-out** (4,311 rows). Held-out units are disjoint from the fleet, so distance
  reflects fleet novelty, not memorization.
- **Cheap embedding.** z-score + PCA(24) of the existing ~47 `gold_cmapss_features` sensor/rolling
  columns, fit on **fleet rows only**. Deliberately the cheap path — the gate's job was to test whether
  the signal exists *before* paying for a learned encoder.
- **Distance.** Mean L2 to the k=10 nearest fleet windows (deep-kNN style).
- **Conditioning.** Bucket held-out windows by **predicted** RUL (0–25, 25–50, 50–75, 75–100, 100+) to
  isolate the distance effect from the trivial "long horizons are just harder" confound.
- **Statistic.** Within each band, Spearman ρ(distance, |error|) with a 2,000-sample bootstrap CI.

## 4. Result

**Embedding distance anti-correlated with RUL error.** The relationship is not flat — it points the
**wrong way**.

| Band | n | Spearman ρ | 95% CI | |
|---|---|---|---|---|
| 0–25 | 485 | **−0.135** | [−0.222, −0.046] | negative, CI excludes 0 |
| 25–50 | 432 | **−0.160** | [−0.256, −0.066] | negative, CI excludes 0 |
| 50–75 | 383 | −0.073 | [−0.175, +0.027] | negative, CI spans 0 |
| 75–100 | 766 | −0.053 | [−0.127, +0.015] | negative, CI spans 0 |
| 100+ | 2245 | **−0.045** | [−0.084, −0.004] | negative, CI excludes 0 |
| **overall** | 4311 | **−0.127** | — | negative |

Every band is negative; 3 of 5 have CIs excluding zero on the negative side. The median-error-by-
distance-quartile tables agree (within bands, error tends to *fall* as distance rises). Far-from-fleet
windows had slightly **lower** error — the reverse of the hypothesis.

## 5. Decision

**Gate 0 verdict: KILL.** The decision rule required a *positive* within-band ρ with CI excluding zero
to continue (or even to route to SupCon). There were zero positive bands and several significantly
negative ones. A negative, significant result is a **stronger** refutation than flatness, so it does
**not** route to a learned encoder.

**Do not proceed to SupCon, contrastive retrieval, embedding-distance trust, pgvector analog trust, the
Trust/Divergence schema, the Trust/Divergence UI screens, or any infrastructure from this thesis.**

## 6. Why this is a win

The gate did exactly its job: it killed a plausible-but-wrong feature for ~half a day of frozen-inference
analysis, before any of the polished surface was built. The alternative — shipping a "trust" badge whose
distance signal silently anti-correlates with error — would have been a confident, demo-ready, *wrong*
thing. Catching that with evidence is the outcome a calibration-honest team wants.

## 7. What survives

Nothing about the underlying telemetry platform is invalidated. Still valid and reusable:

- C-MAPSS RUL forecasting (point prediction) and the **PHM08 asymmetric scoring function**.
- RMSE / benchmark evaluation discipline.
- Calibration and **honest uncertainty quantification** (conformal intervals, PICP/MPIW/CRPS,
  reliability diagrams) — uncertainty *about a prediction*, which is a different and defensible claim
  from uncertainty *from analog distance*.
- Model cards, provenance labels, fail-closed contracts, the MLflow registry, the serving layer.

The successor build is `telemetry-calibration-layer.md`.

## 8. Interview framing

> "I had a clever thesis — that distance from the training fleet would flag untrustworthy RUL
> predictions. Instead of building it, I designed a cheap kill-test: frozen inference, real per-cycle
> truth, held-out units, distance-vs-error conditioned on predicted RUL. I ran it, and the data said no
> — distance *anti-*correlated with error. I honored the result, killed the feature, and redirected the
> two weeks to a calibrated RUL model that actually survives evaluation. The discipline is the same
> thing twice: honesty about a thesis, then honesty about a prediction."

## 9. Evidence links

- Full receipt: [`telemetry-trust-gate0.md`](./telemetry-trust-gate0.md)
- Machine-readable: [`telemetry-trust-gate0.json`](./telemetry-trust-gate0.json)
- Notebook: `telemetry-platform/databricks/notebooks/telemetry_trust_gate0_distance_error.py`
- Assessment (with kill banner): [`../active/factory-pattern-intelligence.md`](../active/factory-pattern-intelligence.md)
- Gate 0 ticket: [`../active/telemetry-trust-gate0-ticket.md`](../active/telemetry-trust-gate0-ticket.md)
- Commits: `383536bd` (verdict: KILL), `6b9b4702` (blocked — test-truth data fact),
  `f7f93db4` (ticket reconciled to live data), `80e0efaf` (assessment kill banner).
