# Pre-Interview Divergence Review — Telemetry ML/MLOps Demo

> Read-only technical audit of the telemetry demo (the `telemetry` lab environment + `telemetry-platform/`
> Databricks pipeline + `backend/app/services/telemetry_*` serving), produced for a Director, Software
> Engineering — Data & AI interview. Every claim cites file:symbol. Honest over generous.

The risk this audit addresses: the demo can read as *famous tutorials wired together* — Telemanom, NASA
C-MAPSS RUL, Feast, MLflow, Evidently, Open MCT — which a skeptical director recognizes on sight and discounts.
The generator for divergence: the canonical datasets are a **different regime** than rocket hot-fire test
telemetry. C-MAPSS is slow degradation over hundreds of flights; SMAP/MSL is spacecraft housekeeping; hot-fire
is short, high-rate, transient-dominated, phase-structured, safety-gated. Every place that mismatch quietly
breaks the standard approach is a candidate original finding.

---

## 1. Executive read

Does the demo defensibly back a director-level claim today? **Partially — and more honestly than most demos,
which is itself the strongest card.** Genuinely substantive, director-grade work: a real PySpark feature
pipeline with enforced no-look-ahead (`ROWS BETWEEN n PRECEDING`, never `FOLLOWING`); grouped-by-unit
walk-forward on RUL with a **passing label-shuffle leakage control** (shuffle RMSE 41.65 ≈ naive 41.71); an
MLflow promotion gate that **fail-closes on honest metrics** (event recall / affiliation F1), not the inflated
point-adjusted F1; Ed25519 hash-chained signed receipts; and a copilot that refuses out-of-scope questions and
**post-validates its own prose against fabricated numbers**. That cluster reads as judgment, not tutorials.

The liabilities are specific and fixable: the "autoencoder anomaly detector" is **degenerate** (flags
everything — F1 0.757 = the all-positive baseline); RUL has **no prediction intervals**; go/no-go runs on the
**point estimate**, not a lower bound; metric lineage is a **hand-authored catalog**, not derived; only **FD001**
is wired despite FD002–004 sitting downloaded in the repo.

**Top 3 highest-leverage moves to diverge from "wired tutorials" into "original engineering with findings":**

1. **Decide go/no-go on the conformal lower bound of RUL**, not the point estimate — turns the interval from a
   nicety into a safety mechanism. The demo's best single moment.
2. **Ship the degenerate-autoencoder result as a judgment artifact** and fix it with regime-conditioning on
   FD004 — one move that converts the worst liability and the biggest unwired asset into a finding.
3. **Correct the claim matrix** (`claim_coverage_matrix.md`) so the autoencoder row stops claiming "strong,"
   the RUL row stops implying calibration, and lineage stops implying auto-derivation.

---

## 2. Topology + data flow

```
RAW     C-MAPSS FD001–FD004 (manifest_cmapss.json; all 4 downloaded+verified; only FD001 wired)
        SMAP/MSL telemanom (manifest_smap_msl.json; 81 channels; 509,555 test ticks; 12.48% positive)
        IMS bearings (manifest_ims.json; ~1GB; archive-verified only — NOT feature-engineered)
        Synthetic NCR (ncr_corpus.py; 128 records; seed=20260609)
          │
BRONZE  02/03/04_bronze_*.py                provenance + raw load
          │
SILVER  05_silver.py                        no-look-ahead: rul_target on train only; test censored (NULL)
          │
GOLD    06_gold.py                          rolling features via ROWS BETWEEN n PRECEDING / LAG (past-only)
          │
TRAIN   08/train_anomaly.py  → rolling-MAD champion (K=4)            [REAL]
        09/train_rul.py      → GBM champion, FD001, 100 units         [REAL]
        14/fused_state_vector.py → 256-d AE/PCA vector                [vector REAL; anomaly eval DEGENERATE]
        15/16 ncr_*          → clustering + backlog forecast           [forecast ties naive]
          │
PROMOTE 10/promote_models.py                fail-closed: passes_honest_gate() + rul_gate_eval()
          │
SCORE   11/score_replay_feed.py → replay_fixture.json
        13_backfill_serving.py  → custom PSI drift (Σ(c−b)·ln(c/b), 10-bin) → tel_drift_metrics
          │
LIVE    stargate_bridge.py (SSE /stargate/stream) — capture-replay / Kafka consumer; ring-buffered, no DB hot path
          │
SERVE   Postgres tel_* tables (predictions, model_runs, drift_metrics, fused_state_vectors[pgvector 256])
          │
API     telemetry_serving.py    verdict bands (GO/REVIEW/NO_GO, point estimate)
        telemetry_copilot.py    fixed-intent grounded Q&A + refusals + post-validate
        telemetry_metadata.py   hand-authored metadata_catalog.json + Postgres freshness
          │
UI      repo-b/src/components/telemetry/*  Stargate · ControlTower · Monitoring · ModelPerformance ·
                                           MetricLineage · Replay · GovernanceDashboard · CopilotWorkbench
```

---

## 3. Claim-to-code trace

| Capability | file:symbol | Verdict | Note |
|---|---|---|---|
| Autoencoder reconstruction anomaly detection | `fused_state_vector.py:233` (MLPRegressor X→X) | **ABSENT (degenerate)** | Both AE & PCA-16 == all-positive baseline (F1 0.757); train 99th-pctl threshold below min test recon error → flags everything. Champion is rolling-MAD, not AE. |
| Reconstruction/residual anomaly scoring | `train_anomaly.py:156` (rolling-MAD, K=4) | **REAL** | The actual champion. Honest pointwise F1 0.313, event recall 0.769, affiliation F1 0.475. |
| Per-channel / divergence attribution | `fused_state_vector.py:257 top_contributors`; `train_anomaly.py:94` | **REAL (narrow)** | Post-hoc per-feature recon-error ranking (test set only). Not gradient/SHAP; no interaction terms. |
| RUL regression | `train_rul.py:216` (linear + GBM) | **REAL** | GBM RMSE 20.32 vs naive 41.94; PHM 1423; late-rate 0.58. FD001, 100 test units. |
| RUL calibration / conformal intervals (PICP/PINAW) | model card `train_rul.py:176` | **ABSENT** | "Point predictions only." Conformal diagnostic exists only on the anomaly detector (`eval_honest_metrics.py:156`) and is a blocked-residual diagnostic, not distribution-free. |
| Walk-forward / grouped-by-unit validation | `train_rul.py:42` (split by unit, last cycle/unit) | **REAL** | Grouped by engine unit; leakage control PASSES (`telemetry_model_improvement_log.md:23`). Anomaly split is time-only. NCR forecast walk-forward (`ncr_backlog_forecast.py:80`). |
| PySpark feature pipeline + point-in-time | `05_silver.py`, `06_gold.py:47` | **REAL** | Real Databricks SQL; `ROWS BETWEEN n PRECEDING`, no `FOLLOWING`; train-only `rul_target`; test censored. |
| Feature store / registry / contract | `fused_feature_manifest.json`; `tel_feature_manifest` | **PARTIAL** | Not Feast. Custom manifest + hand-authored catalog (`"confidence":"explicit"`), not derived. Call it a **feature contract**. |
| MLflow tracking + registry + promotion gate | `promote_models.py:37 passes_honest_gate`, `:42 rul_gate_eval` | **REAL** | UC registry + champion alias. Anomaly gate: event_recall≥0.50, alarm_precision≥0.20, affiliation_f1≥0.25. RUL gate: RMSE≤25, vs-naive≤0.75, PHM improvement>0, late-rate≤0.55, leakage-control==1. |
| Drift monitoring (PSI) | `13_backfill_serving.py:263 compute_psi` → `tel_drift_metrics` | **REAL** | Custom PSI (not Evidently/NannyML). Bands <0.1 / 0.1–0.25 / >0.25. Surfaced in `Monitoring.tsx`. Calendar-time framing. |
| Metric / data lineage | `metadata_catalog.json` + `telemetry_metadata.py:25` | **PARTIAL** | Hand-authored static graph (91 edges; some tagged "inferred"); Postgres enrichment adds freshness, not lineage. Not auto-extracted. |
| pgvector + HNSW analog retrieval + composite | `history_rhymes_service.py:185`; schema `10024`, `10009` | **REAL (cross-env)** | 0.6 cosine + 0.3 DTW + 0.1 categorical; HNSW m=16, ef=256. **In markets env, not telemetry.** `tel_fused_state_vectors` (pgvector 256 + HNSW) exists but no telemetry retrieval surface. |
| Live stream (Stargate) | `stargate_bridge.py:390 initialize`, route `:66`; `StargateConsole.tsx`; `stargateStream.ts:139` | **REAL (capture replay)** | SSE @10Hz, ring-buffered, cursor deltas. Modes: capture / local (Redpanda) / cloud (Confluent+Flink). No API to (re)start replay after boot → "Waiting for stream…". |
| Walk-forward (anomaly) | `train_anomaly.py:38` | **PARTIAL** | Time-only split; not grouped by channel. |
| RAG w/ citations + governed retrieval + refusals + audit | `telemetry_copilot.py:41 ALLOW_LIST`, `:251 _postvalidate`, `:997 emit` | **REAL (not document RAG)** | Fixed-intent structured-evidence Q&A. Real refusals, real anti-fabrication post-validator (blocks prose numbers absent from evidence), real audit log (`tel_copilot_interactions`). No vector corpus retrieval. |
| MCP governed registry + plan→approve→execute→receipt | `mcp/registry.py:105`; `control_tower/signing.py:171` | **REAL platform / PARTIAL telemetry** | Platform registry + permissions + Ed25519 hash-chained receipts are real. Telemetry copilot tools are an **inline allow-list, not MCP-registered** — Trust Center's "telemetry MCP not available" is accurate. |
| Go/No-Go operator surface | `telemetry_serving.py:_verdict_for`, `control_tower/runner.py:run_gonogo` | **REAL (point estimate)** | Bands from `peak_residual/threshold`: GO<1, REVIEW 1–2, NO_GO>2. **Conformal budget is surface-only diagnostic — NOT wired into the verdict** (`telemetry_serving.py:177`). |
| Model evidence card (unified) | `HowItWorks.tsx` + `howItWorksData.ts` | **ABSENT** | No single card aggregating contract×windows×walk-forward×conformal×drift×gate. Registry/drift/promotion exist as separate real panels. |
| Classification / directional forecasting | `ncr_backlog_forecast.py:88` | **PARTIAL / WEAK** | Backlog forecast **ties naive** (skill +0.0125; worse MAPE 9.15 vs 9.06). Soften resume language. |

### Already-measured numbers (from the prior `telemetry-platform/runs/…databricks-inspection/`)

- **RUL (FD001, GBM champion):** RMSE 20.32 (linear 21.70; naive-mean 41.94); PHM 1423 (linear 1036; naive-mean
  33,354); late-rate 0.58; **label-shuffle leakage control PASS** (shuffle RMSE 41.65 ≈ naive 41.71); 100 test units.
- **Anomaly (SMAP/MSL, rolling-MAD):** point-adjusted F1 **0.6453** vs honest pointwise F1 **0.3130** (prec 0.328,
  rec 0.299); event recall 0.769; affiliation F1 0.475; 81 channels; 509,555 ticks; 12.48% positive; conformal
  diagnostic coverage 93.3% / false-alarm 6.7% at K=4.
- **Fused vector (degenerate):** PCA-16 and AE both F1 0.757 = all-positive baseline; 128/128 test buckets
  flagged; vector dim 256 (32 ch × 8 features).
- **NCR forecast:** drift MAE 1.234 vs naive 1.25 (skill +0.0125); MAPE 9.15% vs 9.06%; 8 walk-forward folds.

---

## 4. Seeded / mocked-value liabilities (collapse under "is that number real?")

| Surface | file | Mode | Liability |
|---|---|---|---|
| Control Tower run input | `ControlTower.tsx:52 sampleWindow()` | seeded synthetic | Verdict is real; the input window is `1.0 + ((t%5)-2)*0.002` / scripted spike, not sensor data. Say so. |
| Stargate live values | `stargate_bridge.py` capture mode | capture replay | Melt-pool / msgs-per-sec / toolhead are replayed fixture frames, not a live printer — currently static ("Waiting for stream…"). Label "recorded capture, replayed." |
| Conformal budget panel | `telemetry_serving.py:_conformal_budget` | real data / static interpretation | Values real; "budget" is a human label. Honest as a *diagnostic*; overclaims if presented as a *guarantee* — and it does not change the verdict. |
| How This Works matrix | `howItWorksData.ts:169` | static_demo_labeled | 40+ hand-authored Built/Partial/Planned rows. Honest (test-enforced) but no runtime data. |
| Replay fixture | `replay_fixture.json` | precomputed | Real champion outputs, marked "legacy baseline." |
| RUL calibration panel | `RulCalibration.tsx` | static_demo_labeled | "evidence artifact — not live data." |
| Factory ML console | `factory-ml/*.json` | static_demo_labeled | Committed exports until medallion refresh. |
| Governance eval pass-rate | `telemetry_copilot.py:evals()` | committed artifact | Verify on the running app before quoting. |
| Usefulness (assisted vs unassisted) | `telemetry_copilot.py:usefulness_summary()` | unavailable_fail_closed | `{"status":"not_measured"}` until real sessions — explicit null, never fabricated 0. Good. |
| Gemma tier status | `ControlTower.tsx:288` | static_demo_labeled | Vertex fields render "—" when cold. |
| Metric lineage graph | `metadata_catalog.json` | hand-authored | Presented as lineage; is a curated catalog. Don't claim auto-derivation. |

---

## 5. Divergence scorecard (7 candidate spins + 2 derived from the code)

Format: **Feasibility** (on current code+data) · **Effort** · **Finding** · **Interview sentence**.

1. **Regime-conditioned anomaly detection** · **HIGH** (FD004 downloaded+verified; 6 op-conditions + 2 failure
   modes; only FD001 wired) · **M** · raw reconstruction error tracks operating condition not fault;
   per-regime normalization cuts false positives by X% on FD004 · *"I built the global detector, measured it on
   FD004, found error is dominated by regime not faults, and shipped regime-conditioned normalization."* Fixes
   finding A. Builds on `06_gold.py`, `02_bronze_cmapss.py`; missing FD004 wiring + condition clustering.

2. **Subsystem attribution + lead-lag** · **MED** (channels carry type prefixes; per-channel residuals exist) ·
   **M** · channel-level attribution is redundant under physical coupling; subsystem grouping + cross-correlation
   lag isolates the originating channel · *"Per-channel SHAP said eight coupled sensors all caused it; subsystem
   + lead-lag found the one that moved first."* Missing subsystem map + lag computation + UI.

3. **Decide on the conformal lower bound, not the point estimate** · **HIGH** (RUL GBM real; conformal machinery
   exists for anomaly) · **M** · near the maintenance threshold, point-estimate vs lower-bound decisions
   disagree in N% of units · *"In a go/no-go context you clear on the worst case — calibrated uncertainty
   changes the call here, here, and here."* **Best single demo moment.** Missing split-conformal on RUL +
   lower-bound gate.

4. **Feature completeness as a go/no-go gate** · **MED-LOW** (no multi-rate / late-arriving data in repo;
   train-median imputation hides missingness) · **M** · in multi-rate streams the decision-blocking risk is
   incomplete state; surface completeness — below threshold → REVIEW, not a silent NaN · *"Point-in-time isn't
   only about leakage; the risk is incomplete state, so completeness is a surfaced go/no-go input."* Needs
   late-arrival simulation.

5. **Pre-test in-distribution / competence-envelope check** · **HIGH** (FD001 single-condition → FD004
   multi-condition shift; PSI machinery exists) · **M** · the highest-value drift check is pre-test — abstain if
   the build is outside the model's competence envelope · *"I flipped drift from a post-deployment afterthought
   to a pre-test gate: out-of-envelope → abstain, don't guess."* Missing pre-score gate + abstention path.

6. **Event-windowed analog retrieval with linked dispositions** · **MED** (telemetry has no analog surface;
   composite lives in markets env; `tel_fused_state_vectors` pgvector+HNSW exists) · **M-L** (net-new in
   telemetry) · whole-series cosine is dominated by steady-state and buries the rare event; DTW on the anomalous
   window + linked disposition finds precedents cosine misses · *"Full-vector similarity surfaced the wrong
   precedents; event-windowed DTW retrieval found the cases a cosine search missed."*

7. **Grouped walk-forward by unit** · **HIGH but largely DONE** (RUL already grouped-by-unit + leakage control
   PASS; anomaly is time-only) · **S** / done · the honest grouped number is lower than the time-split — which is
   the credible one · *"Grouped validation gave a less flattering number, which is the honest one, because the
   naive split memorized unit identity."* Emphasize what exists; small add = anomaly grouped-by-channel split.

**Derived A — The degenerate autoencoder as a shipped judgment artifact** · **REAL, already measured**
(`fused_state_vector.py:222/239`; `telemetry_ml_inspection_report.md:77`) · **ZERO build to tell** ·
reconstruction-error anomaly scoring is degenerate under train→test distribution shift; kept rolling-MAD,
repurposed the 256-d vector for retrieval · *"I built the obvious 256-d autoencoder detector, measured it, found
it flagged everything because the train threshold sits below the test error floor, and kept the simpler
rolling-MAD champion — the AE vector earns its keep in retrieval, not scoring."* Spin 1 is the fix.

**Derived B — Point-adjusted vs honest metrics as an honesty artifact** · **REAL, already shipped**
(`eval_honest_metrics.py`; `honest_metrics_result.json`; gate uses affiliation/event, not point-adjusted F1) ·
**ZERO build to tell** · refused the benchmark's inflated metric; gated promotion on affiliation + event-level
metrics · *"Every SMAP/MSL paper quotes point-adjusted F1 (0.645); I implemented it, saw it nearly doubled my
honest score (0.313), and gated promotion on affiliation and event-level metrics instead."*

> The thread (the owner's own framing): **package negative results as judgment artifacts.** Derived A, Spin 5,
> and Spin 7 each have the shape *"I built the obvious thing, measured it, found where it broke, shipped the
> corrected version."* Those are the one thing a skeptical interviewer cannot dismiss as borrowed.

---

## 6. Recommended sequence (max-credible)

Findings A/B and the evidence cards mostly **surface real data that already exists**, so they lead. Each
finding-build (Phases 2–6) is its own Work Intake Gate ticket.

- **Phase 0 (no code):** rewrite `claim_coverage_matrix.md` with evidence; bake findings A/B into the narrative;
  adopt the §7 reframes and the resume-demo alignment language.
- **Phase 1 (low effort; surface real data):** Stargate "Start recorded capture" control; Model Evidence Card;
  Pipeline/Spark Evidence Card; Feature Contract view; One Known Anomaly Walkthrough; repeatable RAG answer +
  refusal; Deployment/CI receipt.
- **Phase 2:** Spin 3 — conformal lower-bound go/no-go (PICP/PINAW + disagreement %).
- **Phase 3:** Spin 1 — regime-conditioned anomaly on FD004 (fixes finding A; FP reduction %).
- **Phase 4:** Spin 5 — pre-test in-distribution gate (FD001→FD004; abstention).
- **Phase 5:** Spin 6 — event-windowed DTW analog retrieval in telemetry (linked dispositions).
- **Phase 6 (caveated tail):** Spin 2 (subsystem + lead-lag), Spin 4 (completeness, needs simulated
  late-arrival), Spin 7 (anomaly grouped split).

### Demo walkthrough (proof order — do not over-index on the Overview)

**Mission Summary** → **Stargate Live** (click Start → live hot-fire stream) → **System Health** → **Model
Performance / Registry** → **Metric Lineage** → **Replay** → **Trust Center / AI** → **Data Engineering
evidence**. The Overview/Bottleneck Map gets attention; these pages defend the claims.

### Resume-demo alignment language (use live)

> "The claim isn't that this is Relativity's production system. It's that I built the same operating pattern:
> multivariate time-series ingestion, feature generation, model training, registry promotion, drift monitoring,
> governed serving, and a human-facing decision surface — and the demo is deliberately honest about what's
> live, what's backfilled, what's unavailable, and what still needs a production-grade source."

---

## 7. Honesty & risk pass

| Risk under a sharp question | Fix type |
|---|---|
| "Autoencoder anomaly detection" — degenerate, flags everything | **Talk-track now** (champion is rolling-MAD; AE vector is for retrieval) + **code** (Spin 1). Lead with finding A. |
| "Calibrated RUL / prediction intervals / Brier" — RUL has none | **Talk-track** (point predictions; conformal is an anomaly diagnostic; "Brier for probabilistic forecasting work, not this slice") + **code** (Spin 3). Don't force Brier. |
| "Automatic metric lineage" — hand-authored catalog | **Talk-track** (a governed metric *catalog* with provenance + freshness, not auto-derived lineage). OpenLineage emit is large; defer. |
| "Is that a live printer?" (Stargate) | **Talk-track + label** (recorded capture, replayed over the real Kafka/SSE bridge). Never imply a live printer. |
| "Beats baseline forecasting / directional" — NCR forecast ties naive | **Talk-track** (prototype; ties naive on this synthetic slice). Don't center it. |
| "Telemetry MCP fully operational" — inline allow-list | **Talk-track** (platform MCP + signed receipts are real; telemetry tools staged behind the same pattern) + **one visible receipt**. |
| "What about multi-condition data?" — only FD001 wired | **Code** (Spin 1 wires FD004) — turns the gap into a finding. |

---

## 8. Open questions for the owner

- **Interview timeline / runway** — gates how far down the sequence to build (Phase 0–1 are days; 2–6 each an intake).
- **FD004 regime basis (Spin 1/5)** — cluster the operating-setting columns (standard 6 conditions) or use
  provided condition labels?
- **Conformal method for RUL (Spin 3)** — split conformal vs MAPIE EnbPI (time-series aware)? coverage 90% or 95%?
- **Findings A/B placement** — a dedicated "what I tried that didn't work" surface, or fold into the Model
  Evidence Card?
- **History Rhymes reference** — may the markets-env analog retrieval be shown as adjacent platform work, or is
  the interview strictly telemetry-only?

---

*Companion artifact: `claim_coverage_matrix.md` — the per-claim demo-proof matrix with evidence-backed status.*

---

## Status — Phase 0 + Phase 1 shipped & verified (Story #707)

- **Phase 0** docs merged (this file + `claim_coverage_matrix.md`).
- **Phase 1** merged (PR #305 cards/route + PR #306 `main.py` bridge init) and **prod-verified on novendor.ai**:
  the `/telemetry/evidence` page renders all six cards with real data or explicit null states; **Stargate is
  live** (capture replay, `msgs_in_per_sec ~20`, anomaly bands, "stream live") and **Start recorded capture
  returns 200**; `/api/version` returns the live backend SHA; 0 console errors on the evidence routes.
- **Root cause fixed:** the shared backend mounted `/stargate/*` but never initialized the bridge → 503; now
  initialized in `main.py`'s lifespan, deployed to authentic-sparkle (git_sha `01067ee2`).
- **Bridge redeploy follow-up: RESOLVED** (no longer outstanding).
- **Phases 2–6** (conformal lower-bound RUL, FD004 regime-conditioning, pre-test competence envelope,
  event-windowed analog retrieval, secondary findings) remain open; each is its own intake'd unit. Databricks
  access is available (`~/.databrickscfg`), so they are runnable with real data.

---

## Status — Phase 2 shipped (Spin 3, Story #716)

Conformal lower-bound RUL go/no-go is built and **measured from real FD001 data** (split conformal,
unit-grouped calibration):
- measured **PICP 0.86** (two-sided) at a 0.90 target; lower-bound coverage 0.85; PINAW 0.448 (mean width 56
  cycles); point RMSE 20.96.
- operator gate on the calibrated **lower bound**: **15/100 units GO on the point estimate but flagged** by the
  lower bound; **22 units disagree** between the two gates.
- honest framing: PICP is slightly under nominal (n=30 calibration units; marginal intervals; FD001
  single-condition). A first calibration on near-failure last cycles under-covered (PICP 0.44) — the measured
  fix was to calibrate on operational-cycle rows matching the test-time RUL distribution. That break-then-fix is
  itself the judgment artifact.
- reproducible: `telemetry-platform/compute_rul_conformal.py` (real Databricks pull) → `rul_conformal_evidence.json`;
  pure math in `conformal_core.py` with `test_conformal_core.py` (4 tests, numpy-only/CI-safe).
- surface: `RulConformalCard` on `/telemetry/evidence` (computed artifact, not live serving).

Phases 3–6 (FD004 regime-conditioning, pre-test competence envelope, event-windowed analog retrieval, secondary
findings) remain open, each its own intake'd unit.

---

## Status — Phase 3 shipped (Spin 1 + Derived A, Story #718)

Regime-conditioned anomaly detection on C-MAPSS **FD004**, measured from real Databricks data
(`silver_cmapss`, which preserves the operating-setting columns the gold table drops):
- A global detector under the **single-operating-mode assumption** (calibrated on the dominant condition)
  flags **~100% of HEALTHY points in 5 of 6 operating regimes** — recon error is **100% explained by regime
  (η²=1.0)**, not faults.
- **Per-regime standardization** cuts the worst-regime false-positive rate **100% → 10.2% (90% reduction)**,
  the mean **84% → 6%**, and drops regime-explained variance to **0**.
- This is the **judgment artifact behind the degenerate autoencoder** (Derived A): built the obvious global
  reconstruction-error detector, measured it, found the error tracks operating regime, shipped the fix.
- reproducible: `telemetry-platform/compute_regime_anomaly.py` (real FD004 pull) → `regime_anomaly_evidence.json`;
  pure math in `regime_core.py` with `test_regime_core.py` (3 tests, numpy-only/CI-safe).
- surface: `RegimeAnomalyCard` on `/telemetry/evidence` (computed artifact, not live serving).
- honest framing: the global baseline is the single-mode assumption (the real FD001→FD004 generalization
  failure), not a strawman; FD004 has no anomaly labels so the metric is false-positives on healthy rows.

Remaining spins: **5** (pre-test competence envelope — FD001→FD004 shift, the natural next), **6** (event-windowed
telemetry analog retrieval), **2** (subsystem + lead-lag attribution), **4** (feature-completeness gate),
**7** (anomaly grouped-by-channel split). Each its own intake'd unit.

---

## Status — Phase 4 / Spin 5 shipped (pre-test competence envelope, Story #719)

Drift, flipped from a post-deployment afterthought into an upstream gate, measured on real C-MAPSS data
(`silver_cmapss`, reusing the Phase 3 FD001→FD004 framing):
- Competence envelope = Mahalanobis distance to the FD001 training distribution; in-envelope = d² ≤ τ
  (τ = FD001 99th-pctl), near-boundary = τ..3τ (review), out = >3τ (abstain).
- **FD001 held-out: 98.9% in-envelope** (the envelope holds for the trained operating condition).
- **FD004 stress test: 90.5% out-of-envelope** (+1.5% near) — the FD001-trained model is outside its
  competence for most of FD004's six conditions; the gate **abstains** instead of scoring confidently.
- Examples: FD001 unit (settings ~[0,0,100], d²=18 < τ=62 → SCORE) vs FD004 unit (settings [25,0.6,60], d² far
  beyond τ → ABSTAIN).
- reproducible: `compute_competence_envelope.py` → `competence_envelope_evidence.json`; pure math in
  `envelope_core.py` with `test_envelope_core.py` (3 tests, numpy-only/CI-safe).
- surface: `CompetenceEnvelopeCard` on `/telemetry/evidence`.
- honest framing: FD004 is a regime-shift stress test (not hot-fire); the envelope gates input distribution,
  not correctness; "abstain/review/within trained scope" wording, never "safe/certified".

Remaining spins: **6** (event-windowed telemetry analog retrieval), **2** (subsystem + lead-lag attribution),
**4** (feature-completeness gate), **7** (anomaly grouped-by-channel split). Each its own intake'd unit. The
regime/distribution trio (1, 3, 5) is now complete.
