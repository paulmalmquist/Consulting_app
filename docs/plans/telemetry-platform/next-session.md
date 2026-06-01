# Next Session — Telemetry Platform (Phase 2)

**Last updated:** 2026-06-01 (Phase 1 complete)

Phase 1 landed real NASA data in `novendor_1.telemetry` (13 Delta tables; proof in
`telemetry-platform/PROOF.md`). Phase 2 trains real models and logs real metrics to MLflow.

## Copy-paste prompt for the next Claude Code session

```
You are starting Phase 2 of the Telemetry Platform build (dispatch 0003): train real models on the
Gold tables and log real metrics + run IDs to MLflow, with a promotion gate that refuses to promote
sub-threshold models. Do NOT sprawl into the dashboard (Phase 4) or serving (Phase 3).

PREREQUISITE GATE (same as Phase 1) — run first, never print the token:
  cd telemetry-platform/databricks
  python auth_gate.py            # must print PASS; STOP if it fails

Read first:
- docs/plans/03-implementation-plans/active/0003-telemetry-platform-build.md
- docs/plans/telemetry-platform/architecture.md   (Phase 1 outcome + Databricks reference)
- docs/plans/telemetry-platform/roadmap.md         (Phase 2 tickets — authoritative)
- telemetry-platform/PROOF.md                      (Phase 1 table inventory + counts)
- telemetry-platform/databricks/_bootstrap.py      (get_client, TEL='novendor_1.telemetry')
- skills/historyrhymes/scripts/databricks_client.py  (create_mlflow_run / log_metric / log_param /
                                                       end_mlflow_run / search_mlflow_runs)

Gold tables available:
- novendor_1.telemetry.gold_smap_msl_windows  (per chan_id,split,t: value + rolling features +
                                               is_anomaly label on the test split). 705,876 rows.
- novendor_1.telemetry.gold_cmapss_features   (per subset,unit,cycle: rolling features + rul_target
                                               train label). 265,256 rows.
- novendor_1.telemetry.gold_replay_feed       (T-1 SMAP test sequence, 8,612 ticks, labeled).

Phase 2 tickets (from roadmap.md):
1. Baseline anomaly detector on SMAP/MSL — dynamic/nonparametric thresholding on reconstruction or
   rolling-z error. Evaluate precision/recall/F1 against is_anomaly on the TEST split. Log to MLflow
   experiment 3740651530987773.
2. LSTM autoencoder on SMAP/MSL — reconstruction-error scoring; precision/recall/F1; walk-forward,
   no look-ahead (train only on train split / earlier ticks).
3. RUL model on C-MAPSS FD001 — RMSE + PHM score; holdout by unit; compare vs gold_cmapss_rul truth.
4. Registry + promotion gate — register passing models; gate refuses promotion if thresholds missed
   (echo the eligible_for_promotion / ContractVerificationReport idiom in backend/app/routes/lab_v2.py).
   Record held-back models honestly (e.g. "F1 0.62 < gate 0.70 -> not promoted").
5. Mirror model metadata for Phase 3 serving (name, version, run_id, gate decision, metrics).

Decisions to make and record in architecture.md:
- Whether training runs inside a Databricks notebook job (heavier, needs notebook upload via the
  Jobs API the client already supports) OR locally pulling Gold via execute_sql then logging metrics
  back through the MLflow REST endpoints on the client. Pick the simpler path that produces REAL run
  IDs and REAL metrics; document it.
- The exact promotion thresholds (state them before training so the gate is honest, not retrofit).

Proof to append to telemetry-platform/PROOF.md (Phase 2 section):
- MLflow experiment path + run IDs (baseline, autoencoder, RUL)
- exact non-round metrics, baseline-vs-autoencoder comparison, promotion decisions (incl. held-back)
- flip the README results table from "pending Phase 2" to real numbers

Honesty + secret rules (unchanged): metrics exactly as computed, no rounding; a missed gate is
recorded as missed; never read/print/log/commit the PAT; start the warehouse before work and stop
after.

PHASE GATE: stop after Phase 2. Append PROOF, update dispatch 0003 + docs/plans/telemetry-platform/*,
record lessons in docs/tips.md (canonical). Do NOT start Phase 3 without approval.
```
