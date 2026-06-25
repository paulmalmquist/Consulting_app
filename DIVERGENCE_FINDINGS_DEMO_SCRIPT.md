# Divergence Findings — Demo Script

> Companion to `PLAN_DIVERGENCE_REVIEW.md` (the audit) and `claim_coverage_matrix.md` (the
> claim→proof matrix). This is the **presentation** layer: what to click, what to say, what **not** to
> claim, and the answers to the sharp questions. Built to make the story impossible to miss and hard to
> overclaim.

## The one-sentence thesis

> Launch became a data problem because modern operations depend on **collecting, scoring, trusting, and
> acting on** telemetry fast enough to improve the next test/build/launch action. This demo proves that
> pattern with **honest ML findings**: conservative uncertainty changes calls; regime mismatch breaks
> naive detectors; out-of-envelope inputs abstain; lead-lag separates root cause from coupled symptoms;
> analog retrieval is useful but modest; and unsupported ideas are rejected instead of fabricated.

## The six beats (the spine of every walkthrough)

1. **Uncertainty changes the call** — conformal lower-bound RUL go/no-go *(Spin 3, LIVE)*
2. **Regime mismatch breaks naive anomaly detection** — FD004 regime-conditioning *(Spin 1, LIVE)*
3. **Out-of-envelope inputs should abstain before scoring** — competence envelope *(Spin 5, LIVE)*
4. **Lead-lag separates root cause from coupled symptoms** — sensor attribution *(Spin 2, compute)*
5. **Analog retrieval is real but modest, not magic** — event-windowed DTW *(Spin 6, compute)*
6. **Unsupported ideas are rejected, not fabricated** — feature-completeness gate *(Spin 4, declined)*

## Access

- **URL:** `https://novendor.ai`
- **Login:** use the **scoped reviewer credential** (username `telemetry`) — *never* the admin login in a
  demo context. Password in `docs/reference/ENV_KEYS.md`.
- **Telemetry env:** `/lab/env/dc82d39d-9be2-49b0-a01d-c7181b13a8b6/telemetry`
- **Pages used:** `…/telemetry` (Overview), `…/telemetry/stargate`, `…/telemetry/evidence`,
  `…/telemetry/model-performance`, `…/telemetry/system-health`.

---

## 5-minute walkthrough (the three live findings)

| Step | Click | Say | Don't claim |
|---|---|---|---|
| 0 | **Overview** (`/telemetry`) | "Why launch became a data problem — access, cost, reuse, scale, and now *data velocity*. Everything below is real-or-explicitly-unavailable." | Don't quote a "live printer" volume — Stargate is recorded capture. |
| 1 | **Stargate Live** → click **Start recorded capture** | "Protobuf over Kafka, windowed, anomalies routed to their own topic, ring-buffered — recorded test-stand capture replayed through the real bridge. The baseline is a rolling-MAD scorer, not an LSTM." | Not a live printer; not an LSTM. |
| 2 | **Evidence** → **Conformal RUL** card | "In a go/no-go you clear on the *worst case* — the calibrated lower bound. **15 of 100 units look GO on the point estimate but the lower bound flags them.** PICP 0.86 at a 0.90 target — measured, slightly under." | PICP is ~0.86, not "guaranteed 90%"; intervals are marginal, FD001-only. |
| 3 | **Evidence** → **Regime Anomaly** card | "The obvious global detector flags ~100% of *healthy* points in 5 of 6 operating regimes — its error is **entirely** explained by regime (η²=1.0). Regime-conditioning cuts the worst-regime false alarms **100%→10% (90% reduction)**. This is the degenerate-autoencoder story, fixed." | Global baseline is the single-mode assumption (a real naive baseline, not a strawman); FD004 has no anomaly labels — metric is false-positives on healthy rows. |
| 4 | **Evidence** → **Competence Envelope** card | "Before scoring, ask: is this input inside the model's trained envelope? FD001-trained envelope holds for its own units (**98.9% in**) but **90.5% of FD004 is out-of-envelope → abstain**. Drift, flipped upstream." | Gates the *input distribution*, not correctness; "abstain/review/within trained scope", never "safe/certified"; FD004 is a regime-shift stress test, not hot-fire. |

Close: "Three findings, all live, all honest about what's measured vs unavailable."

---

## 10-minute walkthrough (add the two compute findings + the trust layer)

Do the 5-minute path, then:

5. **Model Performance / Registry** — "Promotion is a fail-closed gate on *honest* metrics (event recall,
   affiliation F1), not the inflated point-adjusted F1. Champion is rolling-MAD; the 256-d autoencoder is
   shown as a measured judgment artifact, not a working detector."
6. **Lead-lag attribution (Spin 2 — compute, talk-track + artifact)** — "On the coupled C-MAPSS engine,
   channel-level attribution is redundant: **14 of 15 sensors deviate at failure (93% co-move)**. Onset
   timing pins **sensors 9, 14, 11** as the consistent leads (~80 cycles of lead time); downstream sensors
   lag by ~11 cycles. That's how a failure board narrows root cause." *(Artifact:
   `telemetry-platform/lead_lag_attribution_evidence.json`. UI card pending the frontend refactor.)*
7. **Event-windowed analog retrieval (Spin 6 — compute)** — "Whole-series cosine and event-windowed DTW
   agree on only **9%** of precedents; event-windowing lifts anomaly-precedent retrieval **+8%**. Real, but
   **modest, not magic** — and linked dispositions aren't in public data, so I show that as unavailable, not
   fabricated." *(Artifact: `telemetry-platform/event_windowed_analog_evidence.json`.)*
8. **System Health / Trust** — "Drift PSI bands, governed-metric catalog (provenance + freshness, not
   auto-derived lineage), and the copilot that refuses out-of-scope and post-validates its own numbers."

---

## 20-minute walkthrough (the full case)

Do the 10-minute path, then add the **methodology + honesty** layer:

- **Data Collection card** — the data types a test/build/launch program depends on, each tied to the
  decision it changes (framework, labeled not-live).
- **Pipeline / Feature Contract** — real Databricks/PySpark medallion, no-look-ahead (`ROWS BETWEEN n
  PRECEDING`), grouped-by-unit walk-forward with a **passing label-shuffle leakage control**.
- **One Known Anomaly Walkthrough** — score → ranked contributing channels → GO/REVIEW/NO-GO → lineage.
- **AI evidence** — one grounded answer + one refusal + visible audit log.
- **Deployment receipt** — live backend `/version` SHA + frontend build + CI gates.
- **Spin 4 — the rejection (say this out loud):** "I tried a feature-completeness go/no-go gate. The data
  shape doesn't support it — there's no multi-rate/late-arriving signal in these public datasets, and I
  wouldn't fabricate one. So it's **declined**, not faked. That decision is itself the point: the platform
  rejects unsupported ideas instead of overbuilding a chart."
- **The negative results as judgment artifacts:** the degenerate autoencoder (built→measured→broke→fixed
  via Spin 1), point-adjusted vs honest F1, and the first conformal calibration that under-covered (0.44)
  until I fixed the calibration set. "These are the things a skeptic can't dismiss as borrowed."

---

## What NOT to claim (hard guardrails)

- **Not** Relativity's production system — the same *operating pattern*, honestly scoped.
- **Not** a live printer — Stargate is recorded capture replayed through the real bridge.
- **Not** a working autoencoder detector — it's degenerate; the champion is rolling-MAD; the 256-d vector
  is for retrieval.
- **Not** "calibrated 90% coverage" — measured PICP **~0.86**, slightly under, on FD001 single-condition.
- **Not** "safe"/"certified" for the envelope — "within trained scope" / "abstain/review".
- **Not** "beats baseline forecasting" — the NCR forecast ties naive; don't center it.
- **Not** auto-derived lineage — a governed *catalog* with provenance + freshness.
- **Not** "event-windowed retrieval is a breakthrough" — it's a **modest +8%**, with dispositions
  unavailable.
- **Not** Brier for telemetry — that's probabilistic-forecasting work, not this slice.

## Gotcha answers (the sharp questions)

- **"Isn't the regime baseline a strawman?"** — No: it's the single-operating-mode assumption — the real
  FD001→FD004 generalization failure. A model that explicitly models all six conditions also works; the
  point is operating-condition awareness is *required*, and per-regime normalization is the scalable way.
- **"FD004 has no anomaly labels — what are you measuring?"** — False positives on *healthy* (high-RUL)
  rows, grouped fit/eval by unit. It's false-alarm rate, not detection recall — and I say so.
- **"Why is PICP under 0.90?"** — Honest: split conformal with a modest calibration set; a first cut on
  near-failure rows under-covered at 0.44, fixed by calibrating on operational-cycle rows. Reported as
  measured, not dressed up.
- **"Is C-MAPSS rocket data?"** — No — simulated turbofan / spacecraft analogs. Transferable *patterns*,
  framed as such. The hot-fire framing is the *thesis*, the datasets are honest analogs.
- **"Where's the lead-lag / analog UI?"** — Compute is shipped + reproducible; the cards are deferred
  behind a concurrent frontend refactor, wired onto the new evidence-card contract next (no recomputation
  in the frontend — they read the committed artifacts).
- **"Did you fabricate anything to fill the matrix?"** — No — Spin 4 was declined for lack of supporting
  data. That's the tell that the rest is real.
