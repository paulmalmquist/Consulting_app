# Divergence Receipts Manifest

> Every receipt behind the divergence program: PRs, ADO stories, reproducible artifacts, tests, prod
> surfaces, and the handoff notes for the two compute-only findings whose UI cards are deferred behind a
> concurrent frontend refactor. Pairs with `PLAN_DIVERGENCE_REVIEW.md`, `claim_coverage_matrix.md`, and
> `DIVERGENCE_FINDINGS_DEMO_SCRIPT.md`.

## Finding ledger

| Finding | Status | PR | ADO | Reproducible artifact | Eval test | Prod page |
|---|---|---|---|---|---|---|
| **Spin 1** regime-conditioned anomaly | **LIVE + verified** | #314 | #718 | `telemetry-platform/regime_anomaly_evidence.json` (+ `compute_regime_anomaly.py`, `regime_core.py`) | `test_regime_core.py` (3) | `/telemetry/evidence` → RegimeAnomalyCard |
| **Spin 2** sensor lead-lag attribution | **compute shipped · card deferred** | #331 | #726 | `telemetry-platform/lead_lag_attribution_evidence.json` (+ `compute_lead_lag_attribution.py`, `lead_lag_core.py`) | `test_lead_lag_core.py` (5) | — (artifact only) |
| **Spin 3** conformal lower-bound RUL | **LIVE + verified** | #308 | #716 | `telemetry-platform/rul_conformal_evidence.json` (+ `compute_rul_conformal.py`, `conformal_core.py`) | `test_conformal_core.py` (4) | `/telemetry/evidence` → RulConformalCard |
| **Spin 4** feature-completeness gate | **declined — not feasible without fabricated data** | — | — | — (no artifact; intentional) | — | — |
| **Spin 5** pre-test competence envelope | **LIVE + verified** | #316 | #719 | `telemetry-platform/competence_envelope_evidence.json` (+ `compute_competence_envelope.py`, `envelope_core.py`) | `test_envelope_core.py` (3) | `/telemetry/evidence` → CompetenceEnvelopeCard |
| **Spin 6** event-windowed analog retrieval | **compute shipped · card deferred** | #327 | #723 | `telemetry-platform/event_windowed_analog_evidence.json` (+ `compute_event_windowed_analog.py`, `analog_core.py`) | `test_analog_core.py` (4) | — (artifact only) |
| **Spin 7** grouped walk-forward | RUL already grouped-by-unit (leakage control passes); anomaly version null by construction | (#308 RUL) | (#716) | `rul_conformal_evidence.json` (grouped split) | — | — |
| **Derived A** degenerate autoencoder | surfaced + **fixed by Spin 1** | #305 / #314 | #707 / #718 | `regime_anomaly_evidence.json` | — | evidence page |
| **Derived B** honest vs point-adjusted F1 | already in the system | (pre-existing) | — | `eval_honest_metrics.py` / `honest_metrics_result.json` | — | model-performance |

## Measured values (the unfakeable numbers)

- **Spin 1:** worst-regime false-positive **100% → 10.2% (90% reduction)**; mean **84.3% → 5.7%**;
  recon-error variance explained by regime **η² 1.0 → 0.0**; per-regime FP `[1,1,1,0.06,1,1] → [0.07,0.05,0.10,0.03,0.08,0.02]`.
- **Spin 2:** median **14 of 15** sensors deviate at failure (**93%** co-move); lead sensors **sensor_9**
  (onset freq 0.86, median lead 86.5 cyc), **sensor_14** (0.88, 81.0), **sensor_11** (1.0, 76.5); median
  downstream lag **11 cycles**.
- **Spin 3:** **PICP 0.86** at a 0.90 target; lower-bound coverage 0.85; mean interval width 56 cycles;
  point RMSE 20.96; **15/100** units flip GO→REVIEW/NO-GO on the lower bound; 22 units disagree.
- **Spin 5:** FD001 held-out **98.9% in-envelope**; FD004 **90.5% out-of-envelope** (+1.5% near); τ=61.6;
  example FD001 unit 85 d²=18.2 → SCORE, FD004 unit 83 d² ≫ τ → ABSTAIN.
- **Spin 6:** whole-series cosine **41.5%** vs event-windowed DTW **45.0%** anomalous-match (**+8.4%**),
  top-5 overlap **9%**, pool base rate 36.6%.

## All divergence PRs (merged to main)

#305 (Phase 1 evidence cards + Stargate Start + `/api/version` proxy) · #306 (`main.py` bridge init) ·
#307 (docs/tips wrap) · #308 (Spin 3 conformal RUL) · #309 (newscope narrative) · #310 (Overview heading) ·
#311 (Big Numbers inline) · #314 (Spin 1 regime anomaly) · #316 (Spin 5 competence envelope) ·
#327 (Spin 6 analog compute) · #331 (Spin 2 lead-lag compute).

> Note: **#321** was a redundant no-op duplicate of a parallel agent's PR A (#320) — 0-line merge, main
> verified clean (single primitive export set). Recorded for honesty; no impact.

## ADO

Epic **#497** (RS-Analytics) → Feature **#691** (telemetry redesign). Stories all **Closed**: #707 (Phase 1),
#716 (Spin 3), #717 (newscope), #718 (Spin 1), #719 (Spin 5), #723 (Spin 6), #726 (Spin 2).
Refactor (parallel agent): Feature #721, Story #722 (my no-op PR A).

## Tests

- **ML eval (pure-numpy, CI-safe, run locally):** `test_conformal_core` (4) · `test_regime_core` (3) ·
  `test_envelope_core` (3) · `test_analog_core` (4) · `test_lead_lag_core` (5) = **19 green**.
- **Frontend card tests (CI):** `RulConformalCard`, `RegimeAnomalyCard`, `CompetenceEnvelopeCard`, the six
  Phase-1 cards, `StargateConsole`, `telemetryNav` — green at each merge.
- **Backend (CI):** `test_stargate_bridge.py` (15, incl. `POST /stargate/replay/cycle`).

## Screenshots / receipts (local, untracked)

`repo-b/_smoke_shots/`: `evidence.png`, `conformal_evidence.png`, `regime_card.png`, `envelope_card.png`,
`stargate_live_after.png`, `overview_top.png`, `newscope_evidence.png`. Each prod-smoked via a throwaway
Playwright `.cjs` (deleted after run; password read by length only).

---

## Card handoff notes — for the frontend refactor agent (Spin 2 & Spin 6)

**Do not recompute in the frontend.** Both cards render a committed JSON artifact, exactly like the three
live cards (`RulConformalCard` etc.). The pattern: copy the artifact from `telemetry-platform/` into
`repo-b/src/lib/telemetry/`, `import` it, type it, fail closed if fields are missing, render onto the new
`TelemetryEvidenceCard` contract (`sourceStatus: "computed"`), and add to `EvidenceCards.tsx` after the
Competence Envelope card. **Preserve the values and caveat strings byte-identical from the JSON.**

### Spin 2 — "Lead-Lag Root Cause" card
- **Artifact:** `telemetry-platform/lead_lag_attribution_evidence.json` → copy to
  `repo-b/src/lib/telemetry/leadLagAttributionEvidence.json`.
- **Reference shape:** mirror `RegimeAnomalyCard.tsx` (metric strip + ranked table + finding + limitations).
- **Render:** `metrics.median_sensors_deviating_at_failure` / `channel_attribution_redundancy_pct` (the
  "93% redundant" headline), `metrics.lead_sensors` (9/14/11), `metrics.median_downstream_lag_cycles` (11);
  `sensor_ranking[]` table (sensor · onset_frequency · median_lead_cycles); `example`; `finding`.
- **Caveats to preserve (verbatim from `limitations`):** "C-MAPSS is simulated… pattern, not ground-truth
  subsystem wiring"; "onset is a threshold-crossing, not a calibrated change-point"; "lead-lag narrows
  root-cause search, it does not assign physical cause."
- **Tags:** `computed evidence artifact · not live serving` + dataset tag. **thesisRole:** "lead-lag
  separates root cause from coupled symptoms."

### Spin 6 — "Event-Windowed Analog Retrieval" card
- **Artifact:** `telemetry-platform/event_windowed_analog_evidence.json` → copy to
  `repo-b/src/lib/telemetry/eventWindowedAnalogEvidence.json`.
- **Reference shape:** mirror `RulConformalCard.tsx`.
- **Render:** `metrics.whole_series_cosine_anomalous_match_rate` (41.5%) vs
  `metrics.event_windowed_dtw_anomalous_match_rate` (45.0%), `metrics.event_windowing_lift_pct` (+8.4%),
  `metrics.topk_overlap` (9%); `params`; `example`; `finding`.
- **Caveats to preserve (do NOT oversell):** present as **modest** (+8%, not a breakthrough); "linked
  dispositions are unavailable in public data — shown as unavailable, not fabricated"; "relative method
  comparison, not an absolute retrieval benchmark."
- **Tags:** `computed evidence artifact · not live serving`. **thesisRole:** "analog retrieval is real but
  modest, not magic." **claimBoundary:** the +8% is measured, modest, and disposition-free.

### Guardrails for both
- No `null_reason` strings changed; computed-artifact label required ("not live serving").
- The cards are *additive* to the evidence page — they do not alter the three live findings.
- After wiring, prod-smoke the evidence page (the cards render real artifact values) and screenshot.
