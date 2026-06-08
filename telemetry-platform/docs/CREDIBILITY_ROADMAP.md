# Credibility Roadmap — Stage 0 + three tracks

The goal of this expansion is to make the telemetry platform defensible to a skeptical senior reviewer,
not to add demo features. It runs as a small **Stage 0** (done) plus three independent tracks, each
behind its own proof gate. Track A runs first.

## Stage 0 — done

Docs repositioning plus honest metrics computed and recorded now, with no change to the live `/score`
path, the promoted model aliases, or the copilot behavior.

- Repositioned SMAP/MSL as a legacy anomaly baseline and wrote [BENCHMARK_CRITIQUE.md](BENCHMARK_CRITIQUE.md).
- Computed honest metrics from the frozen champion's real predictions over the labeled SMAP/MSL test
  split (point-wise precision/recall/F1, event recall, alarm precision) with a self-contained offline
  script, no retrain and no Databricks. Merged the keys into the champion's `tel_model_runs.metrics` row
  beside the legacy point-adjusted F1; the Model Performance page shows them side by side.
- Reproduced the stored point-adjusted F1 as a fidelity check (0.645 local vs 0.639 stored).
- Wrote the [DATA_EXPANSION_PLAN.md](DATA_EXPANSION_PLAN.md) (N-CMAPSS + IMS) and this roadmap.

The honest headline from Stage 0: point-adjusted F1 0.639 collapses to a point-wise F1 of 0.313 on the
same predictions. The detector notices most segments (event recall 0.77) and is weak at the tick level
(point-wise F1 0.31). Both are now visible.

## Track A — scientific defensibility — DONE

Made the honest metric the declared promotion gate and surfaced a measured false-alarm budget — without
retraining, moving the `@champion` alias, or changing the live `/score` verdict bands.

- **Affiliation** precision/recall/F1 added beside the point-wise metrics (capped proximity, fixed tick
  budget `D=50`, so long windows can't inflate it). Computed from the frozen champion's real predictions
  in `eval_honest_metrics.py`; affiliation F1 = 0.475.
- **Honest gate** (declared before recompute, fail-closed): `f1_pointwise ≥ 0.10`, `event_recall ≥ 0.50`,
  `alarm_precision ≥ 0.20`, `affiliation_f1 ≥ 0.25`. The frozen champion clears all four. The notebook gate
  in `train_anomaly.py` + `promote_models.py` now uses it (legacy point-adjusted F1 = reference only).
  Recorded on the champion's `tel_model_runs.metrics` row via the idempotent `update_track_a_champion_metrics.py`.
- **Conformal false-alarm budget** — a blocked-calibration **diagnostic** (α=0.05; measured FA rate 6.7%,
  coverage 93.3% at the frozen K=4.0; K≈6.66 would hold α). Stored on the champion row and surfaced on the
  Monitoring tab + a display-only Replay annotation. **No change to `_verdict_for` / the live decision.**
- **VUS-PR / VUS-ROC** remain pending (the vetted `vus` package fails to build); recorded as
  `vus_status` rather than hand-rolled. No homegrown VUS.

**Gate A — met.** Range-aware (affiliation) metrics computed from real champion scores and shown beside
point-adjusted + point-wise F1; the champion clears the declared honest gate; Monitoring shows a live
conformal budget with measured calibration-split coverage; live `/score` bands unchanged; PROOF.md cites
the champion row + eval. (VUS is the one carried-forward item, gated on a clean library.)

## Track B — ML depth

The serious run-to-failure prognostics build. Full plan in
[DATA_EXPANSION_PLAN.md](DATA_EXPANSION_PLAN.md).

- N-CMAPSS + IMS migration, reusing the C-MAPSS medallion pattern.
- N-CMAPSS RUL champion benchmarked head-to-head against FD001; a transformer RUL challenger.
- A learned inter-sensor dependency graph (GDN / MTAD-GAT) that names the sensors contributing to the
  t=728 break; embedding projection; an RUL-residual drift panel.

**Gate B.** The N-CMAPSS RUL champion on real data clears a declared RMSE gate and is benchmarked
against FD001; the graph names the t=728 contributing sensors; no legacy regression.

## Track C — applied-AI usefulness (roadmap only in this PR)

> **Nothing in Track C is implemented in Stage 0.** No usefulness A/B, no red-team fixtures, no LLM
> judge, no governance-panel change. This section records the plan so all three tracks live in one
> place. `eval_results.json`, the `/copilot/evals` route, and the governance dashboard already exist
> from Phase 8 — Track C adds to them later, it does not create them.

- **Copilot usefulness A/B.** Measure median time-to-verdict with and without the copilot, plus
  completeness, unsupported-claim count, and report-acceptance rate. Add a section to the existing
  `eval_results.json` and a panel on the existing `GovernanceDashboard.tsx`. The "X% faster" number
  stays blank until it is measured — no invented figure.
- **Faithfulness LLM judge,** logged beside the deterministic controls and never overriding them. The
  fixed intent classifier, allow-list, pre-tool refusal, post-response validator, audit receipts, and
  human-review requirement always sit above any judge.
- **Red-team harness** as fixtures (prompt injection, root-cause bait, disposition bait, evidence
  injection, report jailbreak) with tests asserting pre-LLM refusal and post-validator rejection.
- **Foundation-model bake-off** on the same grounded evidence set (cost, latency, accuracy).

**Gate C.** Red-team passes 100% in CI; the usefulness A/B reports a real measured time-to-verdict
reduction with zero unsupported root-cause claims (verified by the post-validator log); the LLM judge is
logged advisory-only.

## Discipline that holds across all tracks

No synthetic data except clearly labeled fault injection or red-team inputs. The honest metric is the
gate, declared before recompute, fail-closed. Deterministic controls always sit above any LLM judge. No
invented percentages. Each track ships behind its own gate, on its own branch.
