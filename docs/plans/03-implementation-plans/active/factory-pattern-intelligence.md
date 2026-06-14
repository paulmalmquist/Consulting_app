# Factory Pattern Intelligence — Architecture Review & Build Decision

**Created:** 2026-06-13
**Status:** ASSESSMENT — not yet routed to intake or feature-dev. No tickets, no schema, no code.
**Relationship to existing work:** This is a proposed capability layer on top of the **already-shipped**
Telemetry Anomaly Platform (`docs/plans/03-implementation-plans/active/0003-telemetry-platform-build.md`,
Phases 0–6 complete 2026-06-01, live on Railway + novendor.ai). It is effectively "Phase 7+" of that
platform, not a new platform.
**Source material:** `new_plan_6_13_2026.md` (the idea + design conversation), `claude_613_2026.md`
(the C-MAPSS methods literature survey).
**Naming flag (read first):** "Factory Pattern Intelligence" collides with the existing
`tel_ncr_records` "Factory & NCR Intelligence" surface (migration `10016`) and mis-describes the
actual content, which is **aerospace turbofan RUL divergence**, not factory pattern matching. Rename
before any schema or route is created. Working name used below: **the Trust Layer** (alt:
"Divergence Engine", "Latent Health").

---

## 1. Executive Assessment

**The brutal headline: the idea is good, the plan is a rebuild of things you already own.**

The source plan proposes building Kafka → Dataflow → BigQuery (bronze/silver/gold) → Vertex AI
training → Vertex endpoint → UI. Every one of those layers already has a working equivalent in this
repo, deployed, with tests and real row counts:

| Source-plan layer | Already exists | Evidence |
|---|---|---|
| Kafka streaming | Confluent Cloud + managed Flink (Stargate lane) | `infra/confluent/stargate/`, `stargate_bridge.py` |
| Medallion (bronze/silver/gold) | Postgres medallion + Databricks medallion | `10015_telemetry_streaming_slice.sql`, `telemetry-platform/databricks/06_gold.py` |
| Vertex AI training | Databricks + MLflow, models registered with promotion gates | dispatch `0003` Phase 2: `tel_rul_regressor` v1, `tel_anomaly_detector` v1 |
| Vertex endpoint serving | Lean FastAPI champion serving | `telemetry_serving.py`, `/api/telemetry/*` live |
| RUL model + PHM08 score | Built and trained on C-MAPSS FD001 | `train_rul.py` (GBM, RMSE 20.32 / PHM 1423, `phm_score()` implemented) |
| Analog retrieval (pgvector) | Live in History Rhymes; scaffolded for telemetry | `history_rhymes_service.py`, `tel_fused_state_vectors VECTOR(256)` |
| Cockpit UI | 5-page dark-console telemetry env | `repo-b/src/app/lab/env/[envId]/telemetry/` |

**If you build the source plan as written, a Director of Data & AI's first question is "why are you
rebuilding what you already shipped three weeks ago?" That question is fatal.** It reframes you from
"can architect a platform" to "doesn't know their own stack." The plan's biggest risk is not
technical — it is that it ignores the platform you already have.

**Is it genuinely differentiated?** One part is. The rest is commodity or trope.

- **Novel (defensible):** the *single contrastive embedding serving three jobs* — RUL retrieval,
  novelty/epistemic uncertainty (kNN/Mahalanobis distance in the same space), and the input to a
  divergence view. The literature survey confirms these four ingredients exist only separately in
  aerospace PHM. This is the one card worth playing.
- **Novel (narrative, not technical):** the "reported vs latent health / is the factory lying to
  itself" framing. Real phenomenon (closed-loop control masks degradation; citable — Sweet et al.
  2024 rover paper). Strong as a story. Not a technical contribution.
- **Commodity:** streaming telemetry, medallion ETL, an LSTM/transformer RUL regressor, an anomaly
  dashboard, a model registry. C-MAPSS RMSE leaderboards are saturated; beating them by 0.5 RMSE
  impresses nobody and is a multi-week tax.
- **AI-demo trope:** "self-aware prognostics," the four-model deep-learning stack (autoencoder +
  transformer + contrastive + heteroscedastic + kNN), the GNN root-cause graph (already cut in the
  conversation — keep it cut), sonification (already cut — keep cut). "Self-aware" especially reads as
  marketing to anyone senior.

**What impresses a Director of Data & AI:** not the model. The *operated discipline* you already have —
fail-closed null_reasons, RLS tenant isolation, promotion gates that recorded a *missed* gate honestly,
provenance labels (`databricks | local_fallback`), cost hygiene (warehouse auto-stop), calibration
metrics, and the explicit "this is eval-only, not deployed" honesty line. Directors buy governance and
honesty. The Trust Layer's contribution to that story is **calibrated, self-diagnosing uncertainty** —
a model that says *why* it doesn't know.

**What impresses a principal ML engineer:** the Gate 0 falsification experiment — conditioning
distance-vs-error on the predicted-RUL band to isolate the effect from the trivial "long horizons are
harder" confound. That single methodological move signals more competence than any architecture
diagram. Also: aleatoric/epistemic separation, conformal coverage, held-out-fault-mode novelty AUROC.

**What gets dismissed as superficial:** any claim of "real-time GCP/Vertex/Dataflow" when it is a
static public file replayed through a stream; the word "self-aware"; the four-model kitchen sink; a
second standalone environment when telemetry already exists; an RUL number of 20.32 cited as
"competitive" (it is ~7 RMSE above the literature-credible bar of ≤13).

**Verdict:** the *idea* clears the bar. The *plan as written* would make a strong candidate look like
a weak one, because it rebuilds owned infrastructure on a four-model stack and oversells novelty. Trim
to one embedding, one new claim, layered on the platform you already shipped.

---

## 2. Technical Feasibility Review

### Streaming architecture

| Component | Keep / cut | Reasoning |
|---|---|---|
| **Kafka** | Keep only if a live feed is needed; otherwise demote to optional | Confluent + Flink already exist for Stargate. The Trust Layer's claim (embedding distance carries trust) is a **batch** claim. Don't put Kafka on the critical path. If you want a live feel, replay C-MAPSS through the existing Capture-adapter pattern, not a new Kafka topic. |
| **Dataflow** | **Cut** | Pure liability. The Postgres medallion ETL (`telemetry_stream_etl.py`) and the Databricks gold pipeline already do silver/gold. Dataflow adds GCP ops burden for zero demo value. |
| **BigQuery** | **Cut for v1** | Planned-only in `RS_ANALYTICS_PLATFORM_PLAN.md`; not built beyond an event-sink smoke test. The divergence claim needs no warehouse scale. Postgres `tel_*` is the production backbone today. Revisit only if a separate analytics-scale story is needed. |
| **Vertex AI** | **Cut** | Databricks + MLflow already trains and registers models with promotion gates. Serving is the lean FastAPI champion pattern (`telemetry_serving.py`). A Vertex endpoint is a parallel serving stack with nothing to add. |

**Cost / latency / ops:** the source stack (Dataflow + BigQuery + Vertex) is real recurring GCP spend
and three new operational surfaces. The existing stack is Databricks-serverless (auto-stop) + Postgres
+ one Railway service. Staying on the existing stack is cheaper, lower-latency for the demo (replay
from precomputed rows, never cold inference), and adds zero new ops surface.

**Conclusion:** keep the existing Databricks→Postgres→FastAPI→Next.js spine. Cut Dataflow, BigQuery,
and Vertex entirely. Kafka stays optional and off the critical path.

### Deep learning architecture

| Model | Essential / optional / overengineering | Call |
|---|---|---|
| **Sequence autoencoder** | Optional | The shipped anomaly champion is rolling-MAD (F1 0.6387) and it *beat* the PCA challenger. An AE is a challenger, not load-bearing. Stage later if at all. |
| **Temporal transformer** | Optional | A transformer buys you leaderboard RMSE, not the thesis. The existing GBM clears the (weak) gate. Only build a stronger sequence model if you decide to chase RMSE ≤ 13 (see §5) — and that is a *separate, optional* objective from the trust thesis. |
| **Contrastive embedding** | **Essential** | This is the differentiator. SupCon over 30-cycle windows, supervised by health stage / RUL band. Replaces or augments the existing PCA fused-state vector. |
| **Heteroscedastic head** | Essential-ish (aleatoric) | A variance head gives the "uncertain because noisy" signal. Cheap. Keep, but it is the *junior* uncertainty — the epistemic/novelty signal from embedding geometry is the headline. |
| **kNN / Mahalanobis novelty** | **Essential** | This is the other half of the thesis and it is *free* once the embedding exists — no extra head, just distance in the same space. Lead with deep-kNN (legible: "how far from its nearest lived experiences"), hold Mahalanobis as the rigorous fallback. |

**What is overengineering:** running five networks. The honest minimum is **one contrastive encoder +
one RUL regression head + one variance head, with kNN distance read off the embedding.** That is *one*
network with two small heads, plus a non-parametric distance. Everything else stages later or never.

### Retrieval architecture

The choice is window vs episode vs trajectory vs degradation-stage. Recommendation: **window-level
embeddings, trajectory-linked, stage-labeled.**

- **Windows** (30 cycles, the C-MAPSS convention) are the retrieval unit — matches the existing
  `train_rul.py` feature construction and the `fused_state_vector.py` windowing.
- **Trajectory link** (parent `unit_id` + `cycle`) is mandatory for the killer demo: retrieval must
  return "unit 47 at cycle X" so you can walk *forward* to that unit's actual death and show the
  flagged engine was the one that cascaded.
- **Stage label** (early / mid / late health stage, or RUL band) supervises the contrastive loss so
  the geometry is degradation-aligned, not just visually similar.
- **Reject** pure trajectory-level retrieval (too coarse for "11 cycles before cascade") and pure
  episode retrieval (History Rhymes' financial framing; wrong granularity for cycle-level RUL).

This reuses the History Rhymes retrieval pattern (`_pgvector_search`, cosine `<=>`, top-k) and the
`tel_fused_state_vectors` table that already exists — swap the PCA encoder for the contrastive one,
add the trajectory/stage columns.

---

## 3. Literature Gap Analysis

**Strongest novelty claim:** one embedding serving retrieval **and** novelty detection in the same
space. The survey is explicit that in aerospace PHM the four ingredients (similarity-based RUL,
contrastive RUL embeddings, latent-space novelty, deep-kNN/Mahalanobis OOD) exist only separately.
This is the claim to lead with.

**Weakest novelty claim:** "self-aware prognostics" / "the factory is lying to itself" as a *technical*
contribution. It is a narrative. As a measurable claim it depends on a reported-vs-latent divergence,
and on classic C-MAPSS you would *construct* the latent health index yourself (VAE/JSD per Fernandes
2024), which reintroduces the circularity critique ("you detected the divergence you generated").
N-CMAPSS ships a ground-truth HI but it is **eval-only on certain subsets** — train on it and the
critique lands. This is the claim most likely to be challenged.

**Likely to survive peer review:** the motivation that standard UQ methods are not OOD-robust (Basora
et al. 2025, RESS) → an explicit embedding-distance novelty detector is justified, not decorative; the
contrastive-RUL gains (Fu et al. 2024, RESS, 7.00% RMSE); conformal coverage guarantees (Javanmardi &
Hüllermeier 2023, IJPHM). Lean on these peer-reviewed anchors when you need to look authoritative.

**Likely to be challenged:** the unification framed as *novel*. A principal ML engineer will know
Masana et al. 2018 ("Metric Learning for Novelty and Anomaly Detection") and Tack et al. 2020 (CSI) —
the idea that one metric space does both retrieval and novelty already exists in general ML. So the
honest framing is **"to our knowledge, this unification is unclaimed *in aerospace PHM*"** — an
application + integration contribution, not a new technique. State it that way unprompted; it is a
credibility signal, and the alternative (claiming it as new ML) gets you caught.

**Is "one embedding serving prediction + retrieval + novelty" the actual differentiator?**
**Yes for the artifact, no for a paper.** It is the elegant, memorable, defensible spine of a *demo*:
"I didn't bolt on an uncertainty module; the same space that finds analogs measures their absence."
That sentence wins a room. As a *research* claim it is incremental (the general-ML precedent exists).
Position it as engineering elegance and an honest application gap — not as a breakthrough.

---

## 4. Productization Review

**Decision: do not create a new environment.** Add a capability surface to the existing telemetry
environment (`repo-b/src/app/lab/env/[envId]/telemetry/`). A second environment dilutes the single
Relativity artifact, doubles maintenance, and the user's own rule is that env UIs are standalone
full-bleed shells — you already have `TelemetryShell`. The Trust Layer is new *screens and tabs*, not
a new shell.

**Environment name:** keep "Telemetry Platform"; the new capability is a section titled **Trust**
(or **Divergence**). Do not ship "Factory Pattern Intelligence" as an env name — it collides with the
existing factory-NCR surface and misdescribes turbofan content.

**User personas:**

- **Executive** — sees green KPIs, point RUL with go/amber/red bands. The target of the confrontation:
  the dashboard reads healthy while latent health bleeds.
- **Operations Lead** — has to *act* on borrowed time. Wants the verdict and the cycles-remaining
  number, not the math.
- **Reliability Engineer** — lives in the seam and the analog view; wants to see *which* historical
  units this rhymes with and how they died.
- **Data Scientist** — lives in the evaluation center; wants calibration plots, novelty AUROC,
  retrieval-vs-regression parity, model cards, the honest caveats.

**Core screens** (new screens marked ★; reused screens cite the existing page):

1. **Telemetry view** — *exists* (`telemetry/stream`, `telemetry/factory`). Raw/windowed sensor
   streams, the live (replayed) feed. No new build beyond a deep-link.
2. **★ Analog view** — the History Rhymes-for-turbofans screen. Current trajectory as a bright path;
   the faded paths of the k nearest fleet ancestors ghosting behind it, each ending at its actual
   failure. "This rhymes with unit 47, 11 cycles before its cascade." Built on the pgvector retrieval.
3. **★ Uncertainty view** — the split aleatoric vs epistemic. Two bands: "noisy" (variance head) vs
   "unprecedented" (kNN distance). The screen that says *why* the model is unsure. Conformal interval
   (PICP/MPIW) shown so the band is defensible, not decorative.
4. **★ Divergence view** — reported-health channel vs latent-health channel drawn as overlapping
   waveforms; divergence renders as visual interference (moiré) you catch pre-cognitively. Scrub-back
   to watch the divergence bloom 20 cycles before any number turned red. Latent channel sourced from
   N-CMAPSS HI **as eval-reference only**, labeled as such on-screen.
5. **Model registry** — *exists* (`telemetry/registry`, `telemetry/model-performance`). Add the
   contrastive encoder + its champion/challenger record. Minimal new work.
6. **★ Evaluation center** — partly exists (`telemetry/model-performance`, `telemetry/runs`). Add the
   calibration plot, novelty AUROC, retrieval-vs-regression parity table, and the honest caveat block.
   This is the screen the Data Scientist persona trusts the artifact on.

**The killer demo** (the climax to design every screen toward): two engines, near-identical predicted
RUL; Engine A has close fleet analogs (low kNN distance, tight interval), Engine B has none (high
distance, wide epistemic band) — and **Engine B is the one that cascades early.** The number would
have killed you; the geometry saved you. Critical: the A/B pair must be *surfaced by Gate 0 from
evidence*, never hand-picked for the stage.

---

## 5. Evaluation Strategy

**Dataset decision:** FD001 for headline RMSE comparability (single fault mode, the standard leaderboard
subset); **cross-subset for novelty** — train the embedding on FD001 (1 fault mode), novelty-test on
FD003's second fault mode (genuinely unseen → distance should rise). This sidesteps the missing
fault-mode labels in FD003's raw files and makes the novelty claim honest rather than self-generated.

### Predictive performance
- **RMSE** — target **FD001 ≤ 13** if you want to claim "competitive" (SOTA: MTSTAN 10.97, DVGTformer
  ~11.3; floor: Li et al. 2018 = 12.61). **The shipped model is RMSE 20.32 — well above the bar.**
  Improving it is an *optional* objective; the trust thesis does not require it, but any "competitive
  RUL" wording does. Decide explicitly whether you are chasing the number.
- **PHM08 Score** — report alongside RMSE always (asymmetric, late-penalty-heavy). Already implemented
  (`phm_score()` in `train_rul.py`). Comparable only on identical test sets — never compare Scores
  across subsets.

### Calibration
- **PICP** — within ±0.03 of nominal coverage (e.g. ~0.90). Gate.
- **MPIW / PINAW** — interval sharpness; report so the seam is quantitative.
- **CRPS** — probabilistic accuracy; report with reliability diagram.
- Method: conformal prediction / CQR on top of the regression + variance head (peer-reviewed coverage).

### Retrieval quality
- kNN-retrieval-weighted RUL must land within **~10%** of the direct regressor. If retrieval is far
  worse, the embedding is not degradation-aligned and the analog view is theater.
- Qualitative: retrieved analogs should share fault mode / health stage with the query (inspectable).

### Novelty detection
- **Held-out-fault-mode AUROC ≥ 0.80**: train embedding on FD001, score FD003 second-fault-mode
  windows; kNN/Mahalanobis distance should separate seen from unseen. If AUROC ≈ 0.5 the embedding
  isn't capturing unprecedence and the whole epistemic story collapses.

### Failure modes (what would prove the concept wrong)
- **Gate 0 kill:** within predicted-RUL band, Spearman ρ between kNN distance and |error| ≈ 0 or
  negative → distance carries no trust information → **kill the project** (half a day in).
- **Divergence false positives:** if healthy holdout units show reported-vs-latent divergence, the
  detector has a false-alarm problem and the "green-on-paper" story inverts.
- **Epistemic doesn't lead:** if epistemic uncertainty does *not* rise *before* KPI degradation in
  time, the "bleed-out / borrowed time" narrative fails — you need an earlier latent signal.
- **No real A/B pair:** if no two same-RUL / different-distance / different-error engines exist in the
  held-out set, the killer demo isn't real — learn this in Gate 0, not on stage.

---

## 6. Architecture Decision Record

**Options:** A. research platform · B. production-grade Winston environment · C. Relativity-style
telemetry showcase · D. hybrid.

**Decision: D (Hybrid), specifically B-realized-as-an-extension + C-as-framing.**

- Realize **B** by extending the *existing* telemetry environment with the Trust capability —
  production-grade because it inherits the shipped platform's RLS, fail-closed contracts, promotion
  gates, and provenance discipline.
- Frame it as **C** — the Relativity-pointed showcase (the killer A/B demo, the divergence narrative)
  is the presentation skin over the production capability.
- **Reject A (research platform):** open-ended, no defined end state, no shippable artifact — the
  opposite of what a job demo needs.
- **Reject "new standalone environment":** dilutes the single artifact, doubles maintenance, ignores
  `TelemetryShell` and the shipped pages.

**Justification:** the platform exists; the differentiator (one embedding, three jobs) is a *capability
layer*, not a platform. Hybrid B+C lets you say "this is production-grade and operated" *and* "here is
the moment that changes how you think," without the open-ended research-platform trap or the
maintenance cost of a parallel environment.

---

## 7. Phased Roadmap

Each phase is gated; a failed gate stops the line. Phases reuse existing infrastructure — see §8.

**Phase 0 — Research validation (Gate 0).** *½–1 day.* **No model training in this phase.**
- *Goals:* prove embedding distance carries trust information the RUL number doesn't, using only what
  already exists, before any infra or training spend. *Deliverables:* one Databricks notebook over the
  existing C-MAPSS gold tables that uses (1) the **existing PCA/fused-state vector** (no new encoder),
  (2) the **existing RUL predictions** from the shipped regressor, (3) **kNN distance** from each
  held-out window to the training fleet, (4) the **within-band distance/error correlation** (Spearman ρ
  conditioned on predicted-RUL band), and (5) **A/B pair discovery**; plus the **persisted evidence
  artifact** below. *Risks:* the cheap embedding may understate a signal a learned encoder would
  sharpen — so the decision is three-way, not pass/fail. *Success / decision:*
  - **ρ strongly positive** (≥ ~0.3, CI excludes 0) and ≥1 real A/B pair → **continue**; the thesis
    holds on the cheap embedding and contrastive training only improves it.
  - **ρ weak-but-real** (CI excludes 0 but ρ below ~0.3) → **proceed to the contrastive-encoder
    ticket** (Phase 3); sharpening this signal is exactly that encoder's job, and is the *only* thing
    that should trigger training.
  - **ρ ≈ 0 or negative** (CI includes 0) across bands, or no real A/B pair → **kill.**

#### Gate 0 output contract (required evidence artifact)

The notebook must **persist** a small, machine-readable evidence artifact — not only render results
inline. Save both a JSON (canonical) and a human-readable Markdown summary to the Trust evidence
folder: `docs/plans/telemetry-platform/trust/gate-0/gate-0-evidence.{json,md}`. The JSON schema:

```json
{
  "run_id": "databricks run id (real)",
  "generated_at": "ISO-8601 (stamped from the run, not hand-typed)",
  "model_id": "registry id of the shipped RUL regressor (predictions reused, not retrained)",
  "embedding_method": "pca_fused_state_vector",
  "dataset_split": { "subset": "FD001", "train_units": 80, "holdout_units": 20, "split_seed": 0 },
  "predicted_rul_bands": [ { "label": "0-25", "lo": 0, "hi": 25 }, "..." ],
  "spearman_by_band": [
    { "band": "0-25", "rho": 0.41, "n": 312,
      "p_value": 0.003, "ci95": [0.28, 0.53], "ci_method": "bootstrap_2000" }
  ],
  "top_candidate_pairs": [
    { "engine_a": 47, "engine_b": 12, "pred_rul_a": 50, "pred_rul_b": 51,
      "knn_dist_a": 0.18, "knn_dist_b": 0.74, "abs_err_a": 6, "abs_err_b": 38 }
  ],
  "selected_demo_pair": { "engine_a": 47, "engine_b": 12 },
  "recommendation": "continue | train_contrastive | kill",
  "caveats": [ "embedding is the existing PCA/fused vector, not a learned encoder — a weak-but-real rho routes to the SupCon ticket, not a kill", "..." ]
}
```

Required fields, restated as the contract: `model_id` / `embedding_method`; the exact dataset split
used; the predicted-RUL band definitions; Spearman ρ **per band**; a **p-value or bootstrap CI per
band** (ρ alone is not enough — a small holdout can show a large ρ by chance); the **top 10 candidate
A/B pairs**; the **selected demo pair, if any** (null if none qualifies); the **kill/continue
recommendation** (`continue | train_contrastive | kill`, matching the three-way decision above); and
**caveats**. The `.md` mirror is a scannable table of the same data plus a one-paragraph verdict. This
gate **trains nothing** — `embedding_method` is the existing PCA/fused vector and the predictions are
the shipped regressor's; the SupCon encoder is a separate, later ticket gated on a weak-but-real result
here. This artifact is the gate's deliverable — the decision is read from it, and it is the first piece
of proof a reviewer can audit.

**Phase 1 — Baseline.** *1–2 days (mostly exists).*
- *Goals:* a trustworthy RUL signal under the trust views. *Deliverables:* confirm/clear FD001 RMSE
  gate, report RMSE + PHM08 + a calibration plot. *Risks:* the shipped GBM is RMSE 20.32; if you want
  "competitive," budget time for a stronger sequence model (optional). *Success:* RMSE ≤ 13 *if*
  chasing the number; otherwise RMSE reported honestly with the caveat that it is a baseline.

**Phase 2 — Uncertainty.** *1–2 days.*
- *Goals:* calibrated intervals + aleatoric signal. *Deliverables:* heteroscedastic variance head +
  conformal/CQR calibration. *Risks:* miscalibration. *Success:* PICP within ±0.03 of nominal; MPIW
  and CRPS reported.

**Phase 3 — Contrastive retrieval.** *1–2 days.*
- *Goals:* the History Rhymes-for-turbofans embedding. *Deliverables:* SupCon encoder over 30-cycle
  windows (stage-supervised) → embeddings in `tel_fused_state_vectors` (or a successor table) →
  pgvector k-NN retrieval reusing the History Rhymes pattern. *Risks:* embedding not degradation-
  aligned. *Success:* retrieval-weighted RUL within ~10% of the regressor.

**Phase 4 — Novelty detection.** *1 day.*
- *Goals:* epistemic uncertainty from the same geometry. *Deliverables:* deep-kNN (primary) +
  Mahalanobis (fallback) distance on the embedding; cross-subset novelty eval. *Risks:* AUROC near 0.5.
  *Success:* held-out-fault-mode AUROC ≥ 0.80.

**Phase 5 — Winston environment (the surface).** *2–3 days.*
- *Goals:* the three new screens + the A/B climax in the existing telemetry env. *Deliverables:* Analog
  view, Uncertainty view, Divergence view, evaluation-center additions; all reading live from the API,
  no hardcoded metrics, standalone full-bleed under `TelemetryShell`. *Risks:* demo fragility. *Success:*
  the A/B replay flips trust verdicts deterministically on its own.

**Phase 6 — Production hardening.** *1 day.*
- *Goals:* operated discipline + honesty. *Deliverables:* model card, calibration/eval writeup,
  fail-closed null_reasons for the new signals, provenance labels, the explicit "eval-only HI / replay
  not real-time" caveat. *Success:* a skeptical reviewer can independently verify real run IDs,
  non-round metrics, and an honest scope statement.

---

## 8. Repo Mapping

Map everything onto the real repo. **Do not invent new architecture where the platform already
supports it.**

**Reuse (no rebuild):**
- *Training/ML:* `telemetry-platform/databricks/notebooks/train_rul.py` (RUL + `phm_score`),
  `fused_state_vector.py` (PCA/autoencoder windowing → 256-dim), the `novendor_1.telemetry` Databricks
  schema, the MLflow experiment + Unity Catalog registry, promotion-gate pattern from dispatch `0003`.
- *Retrieval:* `backend/app/services/history_rhymes_service.py` `_pgvector_search` (cosine `<=>`,
  top-k, HNSW) as the retrieval template; `tel_fused_state_vectors VECTOR(256)` as the embedding store.
- *Serving:* `backend/app/services/telemetry_serving.py` (lean champion-as-rule pattern; no
  databricks/mlflow/pyspark imports on the API) + `backend/app/routes/telemetry.py`.
- *Schema:* `tel_` prefix (already registered in `ARCHITECTURE.md`), RLS tenant-isolation convention,
  the `10006_telemetry_serving.sql` table pattern; next migration number resolved live (current high
  is `10016`).
- *Frontend:* `repo-b/src/app/lab/env/[envId]/telemetry/` + `repo-b/src/components/telemetry/`
  (`TelemetryShell`), the `isDomainRoute` full-bleed token in
  `repo-b/src/components/lab/LabEnvironmentShell.tsx`, `repo-b/src/lib/api.ts`.
- *Provisioning:* `backend/app/services/environment_seed_packs_v2/telemetry_starter.py` — extend the
  existing telemetry seed pack; do not create a new template.

**Net-new (the actual work):**
- *Databricks notebook:* a contrastive (SupCon) encoder + heteroscedastic head, replacing/augmenting
  the PCA fused vector. New file under `telemetry-platform/databricks/`.
- *Backend:* a divergence/trust scoring function — extend `telemetry_serving.py` (compute kNN distance,
  assemble the trust verdict, separate aleatoric/epistemic) rather than a new service. New read
  endpoints under `backend/app/routes/telemetry.py` (`/trust`, `/analogs`, `/divergence`).
- *Schema:* one migration adding embedding columns/trajectory link + `tel_trust_verdicts` and
  `tel_analog_matches` (env_id + business_id + RLS + COMMENT, `tel_` prefix — no new prefix).
- *Frontend:* three new screens (Analog, Uncertainty, Divergence) + evaluation-center additions under
  the existing telemetry env; new components in `repo-b/src/components/telemetry/`.

**Per surface:**
- **backend/** — extend `telemetry_serving.py`, `routes/telemetry.py`, `schemas/telemetry.py`,
  `telemetry_starter.py`; new tests `backend/tests/test_telemetry_trust.py`.
- **repo-b/** — new telemetry sub-pages + components + `lib/` client methods; `isDomainRoute` already
  covers `/telemetry`.
- **repo-c/** — none. (No provisioning changes; reuse the telemetry env.)
- **supabase/ (repo-b/db/schema/)** — one `NNN_telemetry_trust_*.sql` migration; number resolved live.
- **orchestration/** — none required for v1 (optional: a scheduled re-embed job later).
- **MCP** — optional. A read-only `telemetry.get_trust_verdict` / `telemetry.find_analogs` ToolDef
  would surface in `/api/ade/skill-registry` and let the copilot reason over trust. Defer to post-v1.

**Explicitly not used:** BigQuery, Dataflow, Vertex AI, a new Kafka topic, a new environment, a new
schema prefix, a GNN.

---

## 9. Risk Register

| Rank | Risk | Type | Mitigation |
|---|---|---|---|
| **High** | Rebuilding owned infra (Dataflow/BigQuery/Vertex/new Kafka) — wasted weeks + "doesn't know their stack" perception | Overengineering / demo | Cut all four; reuse Databricks→Postgres→FastAPI→Next.js. This document is the mitigation. |
| **High** | Embedding distance doesn't predict error → thesis is false | Technical / novelty | Gate 0 first; kill in ½ day if within-band ρ ≈ 0. |
| **High** | RUL 20.32 cited as "competitive" (bar is ≤13) | Demo / credibility | Either improve the model (optional, budgeted) or never call it competitive; report honestly. |
| **High** | Divergence built on eval-only HI → "you generated the divergence" circularity | Data / novelty | Use N-CMAPSS HI as labeled *reference only*; never train on it; state it on-screen. Lean on the citable control-masking phenomenon, not a self-built signal. |
| **Medium** | Novelty unification claimed as "novel ML" → challenged (Masana 2018, Tack 2020) | Novelty | Frame as "to our knowledge, unclaimed *in aerospace PHM*"; cite the general-ML precedents yourself. |
| **Medium** | A/B demo pair hand-picked → reads as staged | Demo | Surface the pair from Gate 0 evidence; show it was found, not chosen. |
| **Medium** | "Real-time" claim on a replayed static file | Demo / credibility | Say "I replay a public file through the stream to simulate live telemetry." Never "Kafka dataset." |
| **Medium** | Name collision with `tel_ncr_records` "Factory & NCR Intelligence" (10016) | Maintenance | Rename before schema/routes; use Trust / Divergence. |
| **Medium** | Four-model stack → shallow, hard to evaluate, hard to maintain | Overengineering / maintenance | One encoder + two heads + kNN. Stage autoencoder/transformer only if needed. |
| **Low** | Conformal intervals miscalibrated | Technical | Recalibrate at Phase 2 gate (PICP ±0.03) before building the seam. |
| **Low** | pgvector retrieval latency at fleet scale | Technical | HNSW index already proven in History Rhymes; fleet is small (hundreds of units). |
| **Low** | Writing reusable lessons to the wrong tips file | Maintenance | Canonical is `docs/tips.md` (255 KB); root `tips.md` is a do-not-write duplicate. |

---

## 10. Final Recommendation

**Should we build this? Yes — the trimmed version, and only after Gate 0.**

Build **one contrastive degradation encoder with an RUL head, a variance head, and kNN-distance
novelty, layered onto the existing telemetry environment as a "Trust" capability** — three new screens
(Analog, Uncertainty, Divergence) culminating in the same-RUL / different-trust A/B demo. Reuse the
shipped Databricks medallion, MLflow registry, `tel_*` serving, pgvector retrieval pattern, and
`TelemetryShell`. Build nothing on GCP. Validate the entire thesis in a half-day notebook first.

**Do not build** the source plan as written: no Dataflow, no BigQuery, no Vertex, no new Kafka topic,
no four-model stack, no GNN, no second environment, no "self-aware" framing. Those are either rebuilds
of owned infrastructure or portfolio gimmicks.

**What is genuinely defensible:** one embedding doing retrieval + novelty (in aerospace PHM, honestly
framed); calibrated self-diagnosing uncertainty; the operated discipline you already have. **What is a
gimmick:** "self-aware," sonification, the GNN, real-time claims on replayed data, RMSE-leaderboard
chasing for its own sake.

### First implementation ticket (recommended)

**Ticket: "Gate 0 — embedding-distance-vs-error falsification notebook (no training)."**
A single Databricks notebook over the existing C-MAPSS gold tables (`novendor_1.telemetry`) that
trains **nothing** and reuses what is already computed: (1) the **existing PCA/fused-state vector**;
(2) the **existing RUL predictions** from the shipped regressor; (3) **kNN distance** from each
held-out window to the training fleet; (4) the **within-band distance/error correlation** (Spearman ρ
conditioned on predicted-RUL band, with a bootstrap CI per band); (5) **A/B pair discovery** (same
predicted RUL, different distance, different actual error). It emits the Gate 0 output-contract
artifact (§7). Three-way decision: strongly-positive ρ → continue; **weak-but-real ρ → the *next*
ticket trains the SupCon contrastive encoder** (the only thing that should trigger training); ρ ≈ 0 /
negative or no A/B pair → kill. ~½ day, zero new infrastructure, no training, reuses the shipped
Databricks workspace. This ticket has the authority to kill the project before a dollar is spent —
which is exactly why it goes first, and why it trains nothing. Route it through `azure-devops-intake`
→ `feature-dev` per the work-intake gate.

**Second ticket (conditional): "Train the SupCon contrastive encoder."** Runs *only* if Gate 0 returns
weak-but-real. A clearly strong PCA signal continues without it; a dead signal kills before it. The
cheap embedding earns the training spend, or there is no training spend.

### Add to `docs/tips.md` (canonical — NOT root `tips.md`)

- The telemetry platform's shipped C-MAPSS RUL champion is **GBM, RMSE 20.32 / PHM 1423 on FD001**
  (gate was ≤25). The literature-competitive bar is **≤13**. Never cite 20.32 as "competitive" without
  improving the model first.
- **N-CMAPSS ground-truth HI is eval-only on certain subsets** (DS02/DS03). Never train on it. Any
  divergence/latent-health view must use it as labeled reference only, or the "you generated the
  divergence" critique lands.
- `tel_fused_state_vectors VECTOR(256)` already exists (Phase 7A scaffold). Reuse it for degradation
  embeddings — do not create a parallel embedding table.
- Reuse the History Rhymes pgvector retrieval pattern (`history_rhymes_service.py` `_pgvector_search`,
  cosine `<=>`, HNSW) for fleet analog retrieval — it is the proven template.
- The name "Factory Pattern Intelligence" collides with `tel_ncr_records` "Factory & NCR Intelligence"
  (migration `10016`) and misdescribes aerospace turbofan content. Pick a distinct name (Trust /
  Divergence / Latent Health) before any schema or route.
- Gate 0 (within-band distance-vs-error Spearman ρ) must precede any infrastructure and can falsify the
  whole thesis in ½ day using existing gold tables.
- Reusable lessons go to `docs/tips.md` (canonical, ~255 KB). The root `tips.md` is a do-not-write
  duplicate.

### Remove from the source idea (`new_plan_6_13_2026.md` / the pitch) before implementation

- The greenfield GCP stack as core: **Kafka → Dataflow → BigQuery bronze/silver/gold → Vertex AI
  training → Vertex endpoint.** Owned equivalents exist; this is a rebuild.
- The **four-model deep-learning stack** (sequence autoencoder + temporal transformer + contrastive +
  heteroscedastic + kNN). Collapse to one encoder + two heads + kNN distance.
- The **GNN / supply-chain graph / root-cause dependency ranking** (already cut in conversation —
  ensure it does not creep back).
- **Sonification** (already cut — the visual interference view is the survivor).
- **"Self-aware prognostics" / "the factory is lying to itself"** as technical claims — keep only as
  narrative framing, demoted to a slogan, not a contribution.
- The **dataset buffet** (Backblaze, SECOM, industrial anomaly sets, supply-chain graphs). Commit to
  C-MAPSS FD001 + FD003 cross-subset. Remove the rest.
- The **manufacturing/factory/supplier/rework vocabulary** ("yield stable, rework rising",
  "supplier substitutions") if the artifact stays aerospace-pointed at Relativity. Recast hidden-
  fragility examples as turbofan/controller-masking, or remove.
- Any implication of **real-time streaming**. It is a replay of a static public file — state it
  plainly.
- The **novelty-claim overreach** ("largely absent from aerospace prognostics literature"). Reframe to
  "to our knowledge, in aerospace PHM" and acknowledge the general-ML precedent (Masana 2018, Tack
  2020).

---

*This document is assessment-only. Implementation begins with the Gate 0 ticket, routed through
`azure-devops-intake` → `.skills/feature-dev/SKILL.md` per the CLAUDE.md work-intake gate.*
