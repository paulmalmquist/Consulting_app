# `pipeline/` — Telemetry ML production tier

Two-tier architecture for the telemetry ML pipeline.

| Tier | Where | Role |
|---|---|---|
| **Experimental** | `../databricks/notebooks/*.py` | Self-contained notebooks, uploaded + run as serverless jobs. Where model logic is **iterated**. Allowed to carry inline copies and to diverge — this is the sandbox. |
| **Production (source of truth)** | **this package** | Governed, importable, **locally unit-testable** definitions: the metric math and the promotion-gate contract + decision. Pure Python, no Spark/Databricks imports. When an experiment proves out, its logic graduates here. |

The point: the code that **governs promotion** (the gate thresholds + the decision) is declared **once**, here, and is covered by tests that run in CI without a cluster — instead of being duplicated across `train_*.py` and `promote_models.py` notebooks where it can silently drift.

## Modules
- `metrics.py` — RUL: `rmse`, `mae`, `phm_score` (asymmetric; **lower is better**, late penalized harder), `late_diagnostics`, `regime_late_rates`, `naive_baselines`. Anomaly (canonical, channel-keyed numpy): `point_metrics`, `point_adjusted_metrics`, `affiliation_metrics`, `honest_anomaly_metrics`, `events_from_labels`. `eval_honest_metrics.py` now **delegates** its point-adjust + affiliation to these.
- `gates.py` — `HONEST_GATE`, `RMSE_GATE`, `RUL_GATE` + `passes_honest_gate`, `rul_gate_eval`, `select_rul_winner` (fail-closed, safest-by-PHM).
- `promote.py` — `decide(anomaly_metrics, rul_metrics)`: **pure** promotion decision (no I/O). The caller supplies metrics and applies the registry side-effect.
- `run_promoter.py` — the **authoritative local promotion path**: reads the latest candidate MLflow runs, shapes them for `promote.decide`, prints a plan, and (only with `--apply`) sets UC `champion` aliases. Dry-run by default.

## Local promoter (`run_promoter.py`)

This is the production promotion path. `databricks/notebooks/promote_models.py` is now **reference
behavior only** — not authoritative.

```bash
# dry-run is the DEFAULT (no flag needed). Reads MLflow, prints a plan, writes NO aliases.
python telemetry-platform/pipeline/run_promoter.py
python telemetry-platform/pipeline/run_promoter.py --dry-run
python telemetry-platform/pipeline/run_promoter.py --dry-run --receipt path/to/receipt.json

# apply: sets champion aliases ONLY for families whose gate passes, then verifies the write.
python telemetry-platform/pipeline/run_promoter.py --apply
python telemetry-platform/pipeline/run_promoter.py --experiment <experiment_id> --apply
```

**Required env / auth.** The real backend uses the repo's `DatabricksClient`, which needs a PAT:
`DATABRICKS_PAT` in the environment, or the gitignored repo-root `claude_token.txt` (read by
`_bootstrap.py`). No PAT → **fail-closed at startup** (exit 2), never a silent fallback. `--tracking-uri`
is accepted for parity; `--experiment` overrides the MLflow experiment id used to find candidates.

**Fail-closed states (exit codes).** `0` ok · `2` config/data fail-closed · `3` apply/verify failure.
The runner fails closed (exit 2, explicit reason, receipt `status: fail_closed`) on: missing/invalid
credentials, a missing candidate run, missing/malformed required metrics, or ambiguous "latest" runs
(two runs sharing the newest `start_time`). In `--apply`, if the alias write cannot be re-read and
verified, it exits 3. It never falls back to notebook behavior.

**What it promotes.** Only families whose gate passes. Today: anomaly MAD passes the honest gate (PCA
rejected); both RUL candidates **fail** the hardened late-rate gate, so RUL is left unchanged. A family
already pointing at the winning run is a verified no-op.

**Receipts.** Every run writes a JSON receipt (default `pipeline/receipts/promote_receipt_latest.json`,
gitignored; or `--receipt <path>`) with mode, the full plan (winners, rejected candidates + reasons,
gate detail, current vs proposed alias), and — in apply — the before/after alias state. A checked-in
`receipts/example_dry_run.json` shows the read-only plan for demos/CI.

**Why CI mocks MLflow instead of hitting Databricks.** All registry I/O goes through an injectable
backend (duck-typed). `tests/test_run_promoter.py` passes a `FakeRegistry`, so the suite runs with **no
Databricks, no MLflow server, and no network** — fast, deterministic, and safe to run in CI. The real
`DatabricksBackend` is only constructed for an actual run. Behavior (dry-run never writes, apply writes
only gate-passers, fail-closed paths, write-verification) is covered by mocked tests; correctness of the
metric/gate math is covered by `test_metrics.py` / `test_gates.py` with fixtures pinned from real runs.

## Run the tests (no cluster needed)
```bash
cd telemetry-platform
python -m pytest pipeline/tests -q
```
Tests include regression fixtures from the 2026-06-22 Databricks runs: the deployed RUL champion (GBM)
**fails** the hardened gate on late-rate; MAD passes / PCA fails the honest gate; fail-closed selection
keeps the safest-by-PHM candidate; `decide()` reproduces the real promote run exactly.

## Migration path (incremental — notebooks keep working throughout)
1. **Done — foundation:** metrics + gate contract + `decide()` + tests.
2. **Done — production promoter:** `run_promoter.py` (dry-run by default, `--apply` to write,
   fail-closed, receipts, mocked tests). The **local module path is now authoritative**;
   `databricks/notebooks/promote_models.py` is reference behavior only.
3. **Done — anomaly metric math:** `point_adjust` / affiliation / `honest_anomaly_metrics` live in
   `metrics.py` (canonical). `eval_honest_metrics.py` (local) **delegates** to it; the
   `train_anomaly.py` notebook keeps its self-contained copy (cluster single-file upload — can't import
   a local package), pinned to the canonical by reconciliation tests. Reconciled by
   `tests/test_anomaly_metrics.py` against (a) hand-computed ground truth, (b) a verbatim transcription
   of the notebook algorithm, and (c) the live `eval_honest_metrics` functions.

> Databricks notebooks run as single uploaded files and can't import this local package directly, so
> the production path that consumes it runs **locally** (orchestration + gate enforcement + registry
> writes via REST/MLflow). That is by design: notebooks experiment, the local module governs.
