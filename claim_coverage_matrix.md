# Resume Claim → Demo Proof Matrix

Each row maps a resume claim to its demo surface, the **evidence-backed** current status (corrected against the
code in `PLAN_DIVERGENCE_REVIEW.md`), the file:symbol that proves it, what can be said live, what must not be
overclaimed, and any required follow-up. Status legend: **STRONG** (real + visible) · **REAL** (real, may need
surfacing) · **PARTIAL** · **LIABILITY** (collapses under scrutiny) · **WEAK** · **ABSENT**.

| Resume claim | Current status | file:symbol evidence | What can be said live | What must NOT be overclaimed | Required follow-up |
|---|---|---|---|---|---|
| High-volume multivariate time-series system | **STRONG** | `honest_metrics_result.json` (509,555 ticks, 81 channels); `tel_predictions`, `tel_model_runs` | "509k telemetry values across 81 channels; predictions + runs logged to Postgres." | Don't quote a "live printer" volume — Stargate is recorded capture. | Surface counts on Mission Summary / System Health (traceable). |
| Dense multi-signal / 256-feature state vector | **REAL** | `fused_state_vector.py:32` (256 = 32 ch × 8 feat); `fused_feature_manifest.json` | "256-feature fused state vector, one manifest row per feature." | The vector is for **retrieval**, not a working anomaly score (see autoencoder row). | Show only on model/detail pages, not Overview (Feature Contract view, Phase 1.4). |
| PySpark feature pipelines | **STRONG** (under-surfaced) | `05_silver.py`, `06_gold.py:47` (`ROWS BETWEEN n PRECEDING`) | "Real Databricks/PySpark medallion; rolling features computed past-only." | Don't imply streaming Spark in the hot path (Stargate bridge is ring-buffered, no Spark). | **Pipeline/Spark Evidence Card** (Phase 1.3): runtime, input, output table, rows, last run, validation. |
| Versioned feature store / feature registry | **PARTIAL → call it feature contract** | `fused_feature_manifest.json`; `tel_feature_manifest`; catalog `"confidence":"explicit"` | "Versioned **feature contract** with per-feature source, calc, and leakage risk." | Not Feast; not auto-derived; "registry" only if a real registry exists elsewhere. | **Feature Contract view** (Phase 1.4) renders the manifest. |
| Point-in-time-correct inputs | **STRONG** | `06_gold.py:47` (no `FOLLOWING`); `05_silver.py` (train-only `rul_target`; test censored) | "No-look-ahead enforced in SQL; train target only known at train time." | — (this is genuinely strong). | Add training cutoff / scoring window fields to model + feature cards. |
| Autoencoder anomaly detection | **LIABILITY / judgment artifact** | `fused_state_vector.py:233`; degenerate F1 0.757 == all-positive baseline (`telemetry_ml_inspection_report.md:77`) | "I built the 256-d autoencoder detector, measured it, found it flags everything (threshold below the test-error floor), and kept the rolling-MAD champion." | **Do NOT** call the autoencoder the champion or a working detector. | Spin 1 (regime-conditioning) is the fix — separate ticket. Champion = `train_anomaly.py:156` rolling-MAD. |
| Channel divergence / attribution | **REAL (narrow)** | `fused_state_vector.py:257 top_contributors`; `train_anomaly.py:94` | "Per-channel reconstruction-error ranking on a flagged event." | Not SHAP/gradient; no interaction terms; coupled channels co-rank. | **One Known Anomaly Walkthrough** (Phase 1.5) shows ranked channels. Spin 2 adds lead-lag (later). |
| Threshold logic separates noise from real flags | **REAL** | `telemetry_serving.py:_verdict_for` (GO<1, REVIEW 1–2, NO_GO>2) | "GO/REVIEW/NO-GO from peak residual ÷ frozen threshold." | Decision is on the **point estimate**, not a conformal lower bound (yet). | Spin 3 (lower-bound gate) — later ticket. Show bands in Known Anomaly Walkthrough. |
| Classification & directional forecasting | **WEAK** | `ncr_backlog_forecast.py:88` (skill +0.0125; MAPE 9.15 vs naive 9.06) | "Backlog-forecast prototype." | **Don't** claim it beats baseline — it ties naive on this synthetic slice. | Soften resume wording to "forecasting prototypes." Don't center in demo. |
| Analog retrieval with pgvector + HNSW | **REAL but cross-env** | `history_rhymes_service.py:185`; schema `10024`/`10009` (HNSW m=16, ef=256) | "pgvector + HNSW composite retrieval (cosine + DTW + categorical) — in the markets environment." | Not currently a **telemetry** surface; `tel_fused_state_vectors` exists but has no retrieval UI. | Spin 6 (telemetry analog) — later ticket. Confirm whether markets env is in interview scope. |
| Composite similarity score | **REAL (cross-env)** | `history_rhymes_service.py:53` (0.6 cosine + 0.3 DTW + 0.1 categorical) | "Composite score: cosine + DTW + categorical match, weighted." | Same cross-env caveat as above. | Show formula if markets env is in scope. |
| Walk-forward validation | **STRONG** | `train_rul.py:42` (grouped by unit, last cycle/unit); `ncr_backlog_forecast.py:80` (8 folds) | "Grouped-by-unit walk-forward; whole engines held out." | Anomaly split is time-only, not grouped — say so if asked. | Add validation method to Model Evidence Card. Spin 7 anomaly grouped split (later). |
| No-look-ahead controls + leakage proof | **STRONG** | `telemetry_model_improvement_log.md:23` (label-shuffle RMSE 41.65 ≈ naive 41.71 = PASS) | "Label-shuffle control passes — model isn't memorizing; and SQL enforces no-look-ahead." | — (genuinely strong; lead with it). | Surface the leakage control on the Model Evidence Card. |
| Precision/recall on labeled events | **STRONG (honest)** | `honest_metrics_result.json` (pointwise F1 0.313; event recall 0.769; affiliation 0.475) | "Honest pointwise F1 0.313, event recall 0.769 — and I show why that's lower than the point-adjusted 0.645." | Don't quote point-adjusted F1 (0.645) as the headline — it's the inflated benchmark metric. | This is judgment artifact B — bake into narrative. |
| Brier score calibration | **ABSENT for telemetry** | no telemetry Brier; conformal diagnostic only on anomaly (`eval_honest_metrics.py:156`) | "Brier is for probabilistic-forecasting work; this telemetry slice shows F1/precision/recall, RMSE, PSI, and conformal coverage." | **Do NOT** claim Brier is computed for telemetry. | Only add if actually calculated. RUL intervals come via Spin 3 (later). |
| MLflow tracking and registry + promotion gate | **STRONG** | `promote_models.py:37 passes_honest_gate`, `:42 rul_gate_eval` (fail-closed, explicit thresholds) | "Fail-closed promotion gate on honest metrics; champion alias in Unity Catalog." | — (genuinely strong). | Show run id, stage, gate criteria on Model Evidence Card (Phase 1.2). |
| Model promotion through thresholds | **STRONG** | `promote_models.py:42` (RMSE≤25, vs-naive≤0.75, PHM>0, late≤0.55, leakage==1) | "Promoted because each gate threshold passed; held-back models recorded." | — | Make gate criteria obvious on the card. |
| Drift monitoring (PSI) | **REAL** | `13_backfill_serving.py:263 compute_psi`; bands <0.1 / 0.1–0.25 / >0.25 | "Custom PSI per channel vs the train baseline, with readable bands." | Calendar-time drift, not a pre-test competence check (yet). Custom, not Evidently. | Spin 5 (pre-test envelope) — later. Surface in Model Evidence Card drift status. |
| Metric / data lineage | **PARTIAL (hand-authored catalog)** | `metadata_catalog.json`; `telemetry_metadata.py:25` | "Governed metric **catalog** with provenance, freshness, and 91 curated edges." | **Do NOT** call it auto-derived lineage; it's hand-authored + freshness-enriched. | OpenLineage auto-emit is a large later item; keep honest framing now. |
| FastAPI serving | **REAL** | `telemetry_serving.py`; `routes/telemetry*.py` | "FastAPI serving over Postgres tel_ tables; verdict + scoring endpoints." | — | Add a serving line (endpoint, current model, last score) to a card. |
| Postgres / pgvector | **REAL** | schema `10009` (`tel_fused_state_vectors` pgvector 256 + HNSW) | "Postgres serving + pgvector index for state vectors." | Telemetry has the index but no retrieval surface yet. | Lineage/feature surfaces should expose the serving tables. |
| Next.js internal apps | **STRONG** | repo-b telemetry env | "Internal operator apps in Next.js." | — | Obvious from product; don't dwell. |
| MCP / governed tool registry | **REAL platform / PARTIAL telemetry** | `mcp/registry.py:105`; `control_tower/signing.py:171` (Ed25519 hash-chained) | "Platform MCP registry + permissions + Ed25519 signed, hash-chained receipts." | **Telemetry-specific** tools are an inline allow-list, not MCP-registered (Trust Center says so). | Show one signed receipt; describe telemetry tools as "staged behind the same approval/receipt pattern." |
| RAG with citations / governed retrieval + refusals | **REAL (not document RAG)** | `telemetry_copilot.py:41 ALLOW_LIST`, `:251 _postvalidate`, `:997 emit` | "Fixed-intent grounded Q&A: cites evidence, refuses out-of-scope, blocks prose numbers not in evidence, logs every interaction." | Not vector-corpus document RAG; it's structured-evidence Q&A. | **AI evidence script** (Phase 1.6): one grounded answer + one refusal + visible audit log. |
| CI/CD / evaluation harnesses | **PARTIAL** | CI workflows; `run_governance_evals.py`; eval artifact in `telemetry_copilot.py:evals()` | "Live build + version + test receipts." | Verbal only until a receipt is shown; eval pass-rate is a committed artifact until live sessions. | **Deployment/CI receipt** (Phase 1.7): Vercel build + Railway `/version` + tests + smoke. |
| Row-level security / tenant isolation | **STRONG (be precise)** | schema RLS policies; security posture panel | "Tenant isolation via env_id scoping; security posture panel." | Be honest about app-layer scoping vs DB RLS where that distinction holds. | Keep posture panel honest. |
| Agentic workflows (plan→approve→execute→receipt) | **PARTIAL** | `control_tower/runner.py:run_gonogo`; `signing.py:171` | "Plan → approve → execute → signed receipt over existing skills." | Keep scoped — no general-purpose planner; telemetry tools staged. | Show the receipt chain verifying. Agent Control Tower depth is a later item. |
| Live streaming telemetry (Kafka/protobuf) | **REAL (recorded capture)** | `stargate_bridge.py:390`; route `:66 /stargate/stream`; `stargateStream.ts:139` | "Protobuf-over-Kafka bridge, windowed, anomalies routed to their own topic, SSE to the UI, ring-buffered (no DB hot path)." | **Recorded capture replayed** — not a live printer. Label every claim that way. | **Stargate Start control** (Phase 1.1) restarts the capture replay, clearly labeled. |

---

**Status (post-Phase-1):** The Phase-1 evidence cards + Stargate "Start recorded capture" control are merged
and prod-verified on novendor.ai (Story #707). The live-streaming row's follow-up is **done** — Stargate
serves live capture replay and the Start control returns 200. Rows tied to Phases 2–6 (conformal RUL intervals,
regime-conditioned anomaly, competence-envelope drift, telemetry analog retrieval) update as those findings land.

---

**Status (Phase 2 — conformal RUL, Story #716):** RUL is no longer point-prediction only. Split-conformal
intervals are computed from real C-MAPSS FD001 data (unit-grouped calibration): **measured PICP 0.86**
(two-sided) at a 0.90 target — near-nominal, slightly under — lower-bound coverage 0.85, mean width 56 cycles,
point RMSE 20.96. The operator gate can clear on the calibrated **lower bound**: **15 of 100 units look GO on
the point estimate but the conformal lower bound flags them** (REVIEW/NO-GO); 22 units disagree between the two
gates. Surface: the RUL conformal card on `/telemetry/evidence` (computed evidence artifact, FD001, *not live
serving*). **Must NOT overclaim:** PICP ~0.86 is slightly under the 0.90 target — present as *measured*, not
guaranteed; intervals are marginal on FD001 single-condition data, not conditional or transferable to hot-fire
regimes. **Brier** remains absent for telemetry (probabilistic-work talk-track only).

---

**Status (Phase 3 — regime-conditioned anomaly, Story #718):** The **Autoencoder anomaly detection** row's
follow-up (Spin 1, the degenerate-AE fix) is built and measured on real C-MAPSS **FD004** (six operating
conditions). A global reconstruction-error detector that assumes a single operating mode flags **~100% of
HEALTHY points in 5 of 6 regimes** as anomalous — its recon error is **100% explained by operating condition
(η²=1.0)**, not faults. Per-regime standardization cuts the worst-regime false-positive rate **100% → 10.2%
(90% reduction)**, the mean **84% → 6%**, and drops regime-explained variance to **0**. Surface: the regime
anomaly card on `/telemetry/evidence` (computed artifact, FD004, *not live serving*). This is the judgment
artifact behind the degenerate autoencoder: *built the obvious global detector → measured → found the error
tracks regime → shipped regime-conditioned normalization.* **Must NOT overclaim:** FD004 has no anomaly labels
(metric is false-positives on healthy rows, not detection recall); the global baseline is the single-mode
assumption (a real naive baseline, not a strawman — a model that explicitly accounts for all six conditions
also works; the point is operating-condition awareness is required).

---

**Status (Phase 4 / Spin 5 — pre-test competence envelope, Story #719):** The **Drift monitoring** row gains an
upstream gate. A competence envelope fit on FD001 (single operating condition) via Mahalanobis distance holds
for its own held-out units (**98.9% in-envelope**) but flags **90.5% of FD004** (regime-shift stress test) as
**out-of-envelope** (+1.5% near-boundary). The gate **abstains/reviews** on out-of-envelope inputs instead of a
confident score. Surface: the Competence Envelope card on `/telemetry/evidence` (computed artifact, *not live
serving*) with in/out examples and the score/review/abstain action. **Must NOT overclaim:** FD004 is a
regime-shift stress test, **not rocket hot-fire**; the envelope gates the INPUT distribution (operating regime),
not label correctness — in-envelope means "within trained scope," never "safe" or "certified."

---

**Status (Spin 6 compute — event-windowed analog retrieval, Story #723):** The **Analog retrieval** row gets
a telemetry-native compute (the existing composite retrieval lives in the markets env). Measured on real
SMAP/MSL: whole-series cosine and event-windowed DTW agree on only **9%** of top-5 precedents, and
event-windowing modestly lifts anomaly-precedent retrieval to **45.0% vs 41.5% (+8.4%)**. **Must NOT
overclaim:** this is the most modest finding; **linked dispositions are unavailable** in public data (shown
as unavailable, not fabricated); it is a relative method comparison, not an absolute retrieval benchmark.
ML-only so far — the UI card is **deferred** (parallel agent owns the telemetry frontend refactor).

---

**Status (Spin 2 compute — sensor lead-lag attribution, Story #726):** The **Channel divergence /
attribution** row gets a coupled-system finding on real C-MAPSS FD001. Channel-level attribution is
redundant (median **14/15** sensors deviate at failure, 93% co-move); onset timing + cross-correlation
identify sensors **9/14/11** as the consistent leads (~80 cycles lead time), downstream sensors lag **~11
cycles**. **Must NOT overclaim:** C-MAPSS is simulated; onset is a threshold-crossing, not a calibrated
change-point; lead-lag narrows root-cause search, it does not assign physical cause. ML-only; UI card
deferred (parallel agent owns the telemetry frontend).
