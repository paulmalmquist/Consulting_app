# Benchmark Critique — what SMAP/MSL proves, and what it doesn't

This platform started on the SMAP/MSL telemanom anomaly dataset. It still runs there, and the numbers
are real. But a skeptical reviewer should know exactly where that benchmark is weak, why the headline
F1 looks better than the detector actually is, and what we report instead. This doc is that disclosure.

## Why SMAP/MSL is here at all

SMAP and MSL are public NASA spacecraft telemetry channels with human-labeled off-nominal windows. They
share the shape of engine-test telemetry: multivariate streams, long nominal stretches, and rare
labeled anomalies. That made them a reasonable starting analog for an anomaly-detection loop with no
proprietary data. The dataset gave us labeled windows to gate against and a fixed test split to report.

That is the limit of the claim. SMAP/MSL is a starting baseline, not the serious narrative. The serious
run-to-failure prognostics story is C-MAPSS RUL today and N-CMAPSS / IMS next (see
[DATA_EXPANSION_PLAN.md](DATA_EXPANSION_PLAN.md)).

## Problem 1 — point-adjusted F1 inflates the score

The published telemanom-style metric applies a *point adjustment*: if the detector fires on even one
tick inside a labeled anomaly segment, the entire segment is counted as correctly detected. One hit
credits the whole window. That rewards a detector for being roughly in the neighborhood and hides how
noisy its tick-level decisions are.

We measured the size of that inflation on our own frozen champion (rolling-MAD, K=4.0), using the
detector's real predictions over the full labeled test split (81 channels, 509,555 ticks, 104 labeled
segments). Same predictions, two scoring rules:

| Metric | Value | What it credits |
|---|---|---|
| **F1 (point-adjusted — legacy)** | **0.639** | a segment is "caught" if any tick inside it fires |
| **F1 (point-wise — honest)** | **0.313** | every tick is scored on its own |
| Precision (point-wise) | 0.328 | of all firing ticks, how many land in a labeled window |
| Recall (point-wise) | 0.299 | of all anomaly ticks, how many the detector flags |
| Event recall (segment detection rate) | 0.769 | 80 of 104 labeled segments get at least one hit |
| Alarm precision | 0.328 | share of alarm ticks inside any labeled window |

The honest point-wise F1 is **less than half** the point-adjusted number. The detector is decent at
*noticing* a segment (event recall 0.77) and weak at *pinpointing* it tick-for-tick (point-wise F1
0.31). Both facts are true. Reporting only the first one is the trap.

Reproduce it yourself, offline, with no Databricks and no retrain:

```
python telemetry-platform/eval_honest_metrics.py \
  --data-dir telemetry-platform/databricks/data/smap_msl
```

The script applies the exact frozen rule (value minus trailing rolling-mean-50; per-channel scale =
median train residual, global fallback; flag when residual > 4.0 × scale; labels from
`labeled_anomalies.csv`). It re-derives the point-adjusted F1 as a fidelity check — **0.645 locally vs
0.639 stored** (recall matches to three decimals) — which confirms the local reproduction tracks the
champion that the registry actually promoted. Result snapshot: [honest_metrics_result.json](honest_metrics_result.json).
These honest keys are merged into the champion's `tel_model_runs.metrics` row beside the legacy F1
(`f1_pointwise`, `precision_pointwise`, `recall_pointwise`, `event_recall`, `alarm_precision`) and shown
side by side on the Model Performance page.

## Problem 2 — the benchmark itself is criticized

SMAP/MSL is one of the datasets named in the literature on flawed time-series anomaly benchmarks (Wu &
Keogh, "Current Time Series Anomaly Detection Benchmarks are Flawed"): many labeled anomalies are
trivially detectable, some labels are coarse or arguable, and a constant or near-trivial detector can
post a strong point-adjusted score. A high number here is not evidence of a hard problem solved. We
treat SMAP/MSL as a sanity baseline and put the weight of the prognostics claim on run-to-failure data.

## Problem 3 — the fused-vector alignment caveat

The 256-dimensional fused state vector (the Phase-7A multi-signal-fusion proof) concatenates per-channel
features after per-channel normalization. Channels run on different scales and sampling characteristics,
so the fusion is a normalized alignment, not a physically calibrated one. It is a legacy multi-signal
baseline that shows the loop composes many channels into one decision surface — not a claim that the
fused distance is a calibrated physical quantity.

## Problem 4 — single-source limits

SMAP/MSL is spacecraft telemetry, not engine-test-stand data, and the labels come from one labeling
effort. It cannot stand in for a specific firm's hardware. Public rocket run-to-failure data is scarce,
so N-CMAPSS (turbofan) and IMS (bearing run-to-failure) are honest proxies for the prognostics narrative
— closer to engine-health, still public, still not a specific test stand.

## Our stance

- Keep SMAP/MSL, labeled as a **legacy anomaly baseline**, not the headline.
- Report point-adjusted F1 only with the adjustment **named**, and always next to honest point-wise and
  event metrics computed from the same predictions.
- The honest metric becomes the **promotion gate** in Track A (see
  [CREDIBILITY_ROADMAP.md](CREDIBILITY_ROADMAP.md)), declared before any recompute, fail-closed.
- Add range-aware metrics (VUS-PR, VUS-ROC, formal affiliation / PATE) in Track A, where a vetted
  implementation can be checked rather than hand-rolled under time pressure. They are deferred from
  Stage 0 on purpose: a wrong range-aware number is worse than an honest simple one.
- Move the serious prognostics claim to N-CMAPSS and IMS (Track B).

## Caveats that stay visible everywhere

Public NASA analog data only, no proprietary data. SMAP/MSL has documented benchmark criticism and is a
legacy baseline. Point-adjusted F1 inflates and is always reported with the adjustment named. Limited
public rocket run-to-failure data means N-CMAPSS / IMS are honest proxies, not rocket ground truth. Any
LLM narration in the copilot is advisory and never overrides the deterministic verdict; human review is
required; the copilot refuses root-cause and safety calls.
