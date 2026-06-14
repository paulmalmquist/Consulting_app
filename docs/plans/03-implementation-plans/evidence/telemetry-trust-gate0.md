# Gate 0 — Telemetry Trust Layer — Evidence Receipt (BLOCKED)

**Status:** BLOCKED — no verdict produced.
**Date:** 2026-06-13
**Notebook:** `telemetry-platform/databricks/notebooks/telemetry_trust_gate0_distance_error.py`
**Ticket:** `docs/plans/03-implementation-plans/active/telemetry-trust-gate0-ticket.md`
**Workspace:** `dbc-2504bec5-b5ab` · model `novendor_1.telemetry.tel_rul_regressor` v1 (GBM, frozen inference)

## Verdict

**None. Gate 0 is blocked, not decided.** The Trust Layer thesis is **neither validated nor killed**
by this session. Do not infer continue / train-SupCon / kill from this receipt.

## The blocker (decisive finding, run 4)

Gate 0 as designed scores **all FD001 test cycles** and correlates per-window absolute RUL error with
embedding distance. That design is **not executable**, because:

> **Every FD001 test row in `gold_cmapss_features` has a NaN `rul_target` (13,096 / 13,096).** Train
> rows are fully populated (20,631 / 20,631).

This is the **C-MAPSS dataset structure**, not a defect. Test units are truncated and only a single
final-cycle RUL is published per unit; per-unit test truth lives in `silver_cmapss_rul` (100 units,
one RUL each). The shipped `train_rul.py` handles this by evaluating **one row per unit at its last
cycle**. There is no per-cycle test target to compute `abs_err` against, so the all-cycle within-band
analysis (and its A/B-pair density) cannot be computed.

Direct confirmation (SQL):

| split | rows | non-null `rul_target` | null |
|---|---|---|---|
| test | 13,096 | **0** | 13,096 |
| train | 20,631 | 20,631 | 0 |

## Why this is a stop, not a fifth patch

The valid alternative — evaluate **last-cycle-per-unit** (100 windows, truth merged from
`silver_cmapss_rul`) — is a **different experiment**: n drops from ~13k to 100, which changes the
within-band density and the A/B-pair premise the ticket is built on. Per the ticket's attempt rule
(four runs spent; the failing cause is now a method-relevant data fact, not an environmental one;
"do not keep patching into a different experiment"), the correct action is a **blocker receipt** and a
next-ticket method decision — not another run.

## Execution notes / failed attempts (not the analytic conclusion)

| Run | run_id | Cause | Class | Fix |
|---|---|---|---|---|
| 1 | 917327227746956 | `No module named 'mlflow'` | environmental | added serverless `environments` spec |
| 2 | 784126618132498 | `HalfSquaredError has no get_init_raw_predictions` on `predict()` | environmental (version skew) | pinned `scikit-learn==1.4.2` |
| 3 | 183194355323548 | `cannot convert float NaN to integer` (A/B serialization) | notebook bug — first symptom of the data fact | dropped NaN-truth rows + guard |
| 4 | 847101562663737 | `Found array with 0 sample(s)` — NaN drop emptied the test set | **decisive data discovery** | none; stopped here |

Runs 1–3 are reproducibility/bug fixes. Run 4 is the finding. None produced a statistical result.

## Environment reproducibility (carry forward)

- **`scikit-learn==1.4.2` is REQUIRED, not incidental.** The champion was pickled under 1.4.2; newer
  sklearn removes `GradientBoostingRegressor`'s `HalfSquaredError.get_init_raw_predictions` and
  `predict()` raises `AttributeError`. Any future run that loads `tel_rul_regressor` must pin it.
- **Serverless ML job:** `runs/submit` with `environment_key: "Default"` + an `environments` block
  `spec: {client: "2", dependencies: ["mlflow", "scikit-learn==1.4.2"]}`. A bare serverless task has
  no mlflow/sklearn.
- **CLI auth (v1.0.0):** set `DATABRICKS_AUTH_TYPE=pat` and `DATABRICKS_CONFIG_FILE=/dev/null` (the
  cached PAT is rejected). For SQL, `curl` `/api/2.0/sql/statements` (warehouse `0e56420fb707d861`);
  `databricks api post` returns Not Found.

## Important caveat (do not misread)

The shipped **20.32 RMSE is the last-cycle-per-unit benchmark** and was **not** recomputed here. This
session computed nothing comparable. Make no competitiveness claim — either direction — from it.

## Recommended next ticket

Redesign Gate 0 to a valid target before re-running:

1. **Option A — last-cycle-per-unit** (mirror `train_rul.py`): 100 FD001 test units, truth from
   `silver_cmapss_rul`. Honest, but n=100 may be too thin for within-band ρ across 5 bands.
2. **Option B — train-set cross-validation**, where per-cycle `rul_target` **does** exist (20,631
   rows): hold out a fraction of train units, score them, and run the distance-vs-error analysis there.
   This preserves the per-cycle density the gate wants and keeps train/holdout units disjoint for the
   novelty interpretation.

Option B is likely the stronger falsification surface and should be weighed first. **This is a method
decision for the next session — not a patch to this run.**

---

*Gate 0 remains OPEN. The Trust Layer assessment
(`docs/plans/03-implementation-plans/active/factory-pattern-intelligence.md`) stays frozen and unrenamed.*
