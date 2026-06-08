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

## Track A — scientific defensibility (first)

Make the honest metric the promotion gate, and put a measured false-alarm budget on the live decision.

- Add range-aware metrics — VUS-PR, VUS-ROC, and a formal affiliation / PATE implementation — beside
  the point-wise metrics, using a vetted library so the numbers can be checked rather than hand-rolled.
  These were deferred from Stage 0 on purpose: a wrong range-aware number is worse than an honest simple
  one.
- Move the promotion gate in `notebooks/train_anomaly.py` + `notebooks/promote_models.py` to the honest
  metric, declared before any recompute, fail-closed. The point-adjusted F1 stays recorded for
  reference, never as the gate.
- Add a conformal false-alarm budget: hold out a calibration split, pick the threshold quantile for a
  target alarm rate, store `conformal_alpha` / `conformal_threshold_quantile` in `tel_model_runs.metrics`
  (no migration), and surface the measured calibration-split coverage on the Monitoring view and the
  Go/No-Go band.

**Gate A.** Range-aware metrics computed from real champion scores and shown beside point-adjusted F1;
the champion clears the declared honest gate; Monitoring shows a live conformal budget with measured
calibration-split coverage; PROOF.md cites the run IDs.

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
