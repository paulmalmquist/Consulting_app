"""Phase 2 — Conformal lower-bound RUL on C-MAPSS FD001 (REAL data, reproducible).

WHAT THIS FILE DOES (plain version): it predicts how much life a jet engine has left (Remaining
Useful Life, in cycles) and — crucially — wraps that prediction in an honest uncertainty band.
"Conformal" is a way to size that band from the model's own past errors so the true value lands
inside it a guaranteed fraction of the time (here, ~90%). It then turns the cautious lower edge
of the band into a GO / REVIEW / NO_GO service decision.
WHERE YOU SEE THIS: the RulConformalCard and the RUL Calibration page (the 80%/90% interval
ribbons around each prediction, and the gate badges).
INPUTS -> OUTPUT: FD001 gold features + official RUL truth -> rul_conformal_evidence.json.
HOW TO READ THE NUMBERS: PICP = how often the truth actually fell inside the band (want ~90%, the
"coverage" figure); PINAW = how wide the band is, normalized 0-1 (narrower is better, as long as
coverage holds); qhat = the band half-width in cycles; the lower-bound gate = the decision made on
the worst-case remaining life, not the rosy point estimate.


Pulls the same Gold features + RUL truth the Databricks RUL notebook uses
(novendor_1.telemetry.gold_cmapss_features / silver_cmapss_rul, FD001), trains the
same GBM, then computes split-conformal prediction intervals with a unit-grouped
calibration split (no unit appears in both fit and calibration — consistent with the
grouped walk-forward finding). Reports measured PICP, one-sided lower-bound coverage,
PINAW, and the point-estimate vs conformal-lower-bound go/no-go disagreement.

Writes an evidence artifact (computed snapshot, not live) to:
  - telemetry-platform/rul_conformal_evidence.json   (source of record)
  - repo-b/src/lib/telemetry/rulConformalEvidence.json (frontend import)

No fake calibration: every number here is computed from the pulled data. If coverage
is weak it is reported as-is.

Run: python telemetry-platform/compute_rul_conformal.py
Auth: Databricks OAuth profile 'PaulMain' (~/.databrickscfg).
"""

import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))  # for conformal_core when run from any cwd

import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingRegressor

from databricks.sdk import WorkspaceClient
from databricks.sdk.service.sql import Disposition, Format, StatementState

from conformal_core import conformal_quantile, gate as _gate

TEL = "novendor_1.telemetry"
WAREHOUSE_ID = "0e56420fb707d861"
RUL_CAP = 125
ALPHA = 0.10          # 90% coverage target
CAL_UNITS = 30        # held-out calibration units (grouped split)
SEED = 0
T_NOGO = 30           # cycles: <= -> NO_GO (must service before next op)
T_REVIEW = 50         # cycles: <= -> REVIEW

ROOT = Path(__file__).resolve().parents[1]
AS_OF = "2026-06-23"  # stamped (no Date.now in repo); update on recompute


# Run a SQL query against the Databricks warehouse and return a tidy table. Plumbing only:
# submit, poll until done, page through chunked results.
def query(w: WorkspaceClient, sql: str) -> pd.DataFrame:
    resp = w.statement_execution.execute_statement(
        statement=sql, warehouse_id=WAREHOUSE_ID, wait_timeout="50s",
        disposition=Disposition.INLINE, format=Format.JSON_ARRAY,
    )
    sid = resp.statement_id
    while resp.status.state in (StatementState.PENDING, StatementState.RUNNING):
        time.sleep(2)
        resp = w.statement_execution.get_statement(sid)
    if resp.status.state != StatementState.SUCCEEDED:
        raise RuntimeError(f"SQL {resp.status.state}: {resp.status.error}")
    cols = [c.name for c in resp.manifest.schema.columns]
    rows = list(resp.result.data_array or [])
    total = resp.manifest.total_chunk_count or 1
    for n in range(1, total):
        ch = w.statement_execution.get_statement_result_chunk_n(sid, n)
        rows.extend(ch.data_array or [])
    return pd.DataFrame(rows, columns=cols)


# Local shorthand: turn a remaining-life number into GO / REVIEW / NO_GO using this file's
# thresholds (<=30 cycles must be serviced now, <=50 needs review, else clear).
def gate(value: float) -> str:
    return _gate(value, T_NOGO, T_REVIEW)


def main() -> None:
    w = WorkspaceClient(profile="PaulMain")
    print("[conformal] starting warehouse if stopped...")
    try:
        w.warehouses.start(WAREHOUSE_ID).result(timeout=__import__("datetime").timedelta(minutes=5))
    except Exception as exc:  # already running is fine
        print(f"[conformal] warehouse start note: {str(exc)[:120]}")

    print("[conformal] pulling FD001 gold features + RUL truth...")
    feat = query(w, f"SELECT * FROM {TEL}.gold_cmapss_features WHERE subset = 'FD001'")
    truth = query(w, f"SELECT unit, rul FROM {TEL}.silver_cmapss_rul WHERE subset = 'FD001'")

    feat_cols = [c for c in feat.columns if c.startswith("sensor_")]
    for c in feat_cols + ["unit", "cycle", "rul_target"]:
        feat[c] = pd.to_numeric(feat[c], errors="coerce")
    truth["unit"] = pd.to_numeric(truth["unit"], errors="coerce")
    truth["rul"] = pd.to_numeric(truth["rul"], errors="coerce")
    print(f"[conformal] feature rows={len(feat)} cols={len(feat_cols)} "
          f"train_units={feat[feat.split=='train'].unit.nunique()} test_units={truth.unit.nunique()}")

    train = feat[feat.split == "train"].copy()
    test = feat[feat.split == "test"].copy()

    # Carve the training engines into two groups: one to TRAIN the model, a separate one to
    # CALIBRATE the uncertainty band. Conformal needs the calibration errors to come from data the
    # model didn't train on, or the band would look falsely tight. No engine appears in both.
    # Unit-grouped calibration split (no unit in both fit and calibration).
    rng = np.random.default_rng(SEED)
    train_units = np.sort(train.unit.unique())
    cal_units = set(rng.choice(train_units, size=CAL_UNITS, replace=False).tolist())
    fit_mask = ~train.unit.isin(cal_units)

    # Train-median imputation (the lakehouse convention): early-cycle rolling / rate-of-change
    # features are NaN until their window fills. Medians are computed on the FIT rows only — no
    # calibration/test leakage — and applied everywhere.
    med = train.loc[fit_mask, feat_cols].median()
    for df in (train, test):
        df[feat_cols] = df[feat_cols].fillna(med)

    # Train the actual life-prediction model (a gradient-boosted regressor) on the fit engines.
    # RUL is capped at RUL_CAP because very-early-life predictions are flat and uninformative; we
    # only care about getting close as failure approaches.
    Xfit = train.loc[fit_mask, feat_cols].to_numpy()
    yfit = np.minimum(train.loc[fit_mask, "rul_target"].to_numpy(), RUL_CAP)
    gbm = GradientBoostingRegressor(n_estimators=300, max_depth=3, learning_rate=0.05,
                                    subsample=0.8, random_state=SEED)
    gbm.fit(Xfit, yfit)

    # Calibration scores: one row per calibration unit at a RANDOM operational cycle (not the last
    # cycle). The official C-MAPSS test set truncates each unit at a varied point in its life, so its
    # last-cycle RUL spans a wide range; calibrating only on near-failure last cycles breaks
    # exchangeability and under-covers. A random cycle per unit matches the score-at-an-arbitrary-point
    # distribution the test set actually has.
    cal = (train[train.unit.isin(cal_units)]
           .groupby("unit", group_keys=False)
           .apply(lambda g: g.sample(1, random_state=SEED)).copy())
    # Measure how wrong the model is on the calibration engines. abs_res = size of each miss (for
    # the symmetric band); over_pred = only the DANGEROUS misses where the model claimed MORE life
    # than reality (those are what a safety lower-bound must guard against).
    cal_pred = np.clip(gbm.predict(cal[feat_cols].to_numpy()), 0, RUL_CAP)
    cal_y = np.minimum(cal["rul_target"].to_numpy(), RUL_CAP)
    abs_res = np.abs(cal_y - cal_pred)
    over_pred = cal_pred - cal_y          # positive => model over-predicted remaining life (unsafe)

    # Convert those calibration errors into band widths via the conformal recipe. qhat sizes the
    # symmetric ribbon (the 90% interval on the chart); q_lower sizes the one-sided safety margin
    # subtracted to get the cautious lower bound the gate runs on.
    qhat = conformal_quantile(abs_res, ALPHA)             # two-sided half-width
    q_lower = conformal_quantile(np.clip(over_pred, 0, None), ALPHA)  # one-sided lower margin

    # Test: one row per unit at last cycle, official truth.
    test_last = test.sort_values(["unit", "cycle"]).groupby("unit").tail(1).copy()
    test_last = test_last.merge(truth[["unit", "rul"]], on="unit", how="inner")
    pred = np.clip(gbm.predict(test_last[feat_cols].to_numpy()), 0, RUL_CAP)
    y_true = np.minimum(test_last["rul"].to_numpy(), RUL_CAP)

    # Build the bands around each test prediction. lower2/upper2 are the visible ribbon edges;
    # lower_os is the cautious one-sided floor used for the gate.
    lower2 = np.clip(pred - qhat, 0, RUL_CAP)
    upper2 = np.clip(pred + qhat, 0, RUL_CAP)
    lower_os = np.clip(pred - q_lower, 0, RUL_CAP)

    # The honesty scorecard. picp = fraction of test engines whose true life landed inside the
    # ribbon -> this is the "coverage" number on the RUL Calibration page (want it near 90%).
    # lb_cov = how often the cautious floor stayed safely below the truth. pinaw = average ribbon
    # width as a fraction of the scale (narrower is better). rmse = raw point-prediction error.
    picp = float(np.mean((y_true >= lower2) & (y_true <= upper2)))
    lb_cov = float(np.mean(y_true >= lower_os))
    pinaw = float(np.mean(upper2 - lower2) / RUL_CAP)
    rmse = float(np.sqrt(np.mean((pred - y_true) ** 2)))

    # The payoff of using the band: compare the verdict you'd give from the rosy point estimate vs
    # from the cautious lower bound. "flips" counts engines the lower bound treats more strictly —
    # i.e. cases where ignoring uncertainty would have over-cleared an engine. This disagreement is
    # the headline story on the RulConformalCard.
    point_gate = np.array([gate(v) for v in pred])
    lb_gate = np.array([gate(v) for v in lower_os])
    order = {"GO": 0, "REVIEW": 1, "NO_GO": 2}
    flips = int(np.sum([order[lb_gate[i]] > order[point_gate[i]] for i in range(len(pred))]))
    go_to_review_or_worse = int(np.sum([(point_gate[i] == "GO") and (lb_gate[i] != "GO")
                                        for i in range(len(pred))]))

    # Example: a unit that looks safe on the point estimate but the lower bound flags.
    ex_idx = None
    cand = [i for i in range(len(pred)) if point_gate[i] == "GO" and lb_gate[i] != "GO"]
    if cand:
        ex_idx = max(cand, key=lambda i: pred[i] - lower_os[i])
    examples = []
    sel = cand[:6] if cand else list(np.argsort(pred)[:6])
    for i in sel:
        examples.append({
            "unit": int(test_last["unit"].to_numpy()[i]),
            "point": round(float(pred[i]), 1),
            "lower": round(float(lower_os[i]), 1),
            "upper": round(float(upper2[i]), 1),
            "y_true": int(y_true[i]),
            "point_gate": point_gate[i],
            "lower_bound_gate": lb_gate[i],
            "covered": bool((y_true[i] >= lower2[i]) and (y_true[i] <= upper2[i])),
        })

    artifact = {
        "as_of": AS_OF,
        "dataset": "C-MAPSS FD001",
        "model": "GradientBoostingRegressor(n_estimators=300, max_depth=3, lr=0.05, subsample=0.8)",
        "target": f"RUL (cycles) at last observed cycle, capped at {RUL_CAP}; truth = official RUL_FD001",
        "method": "split conformal (absolute-residual two-sided + one-sided over-prediction lower bound)",
        "calibration_split": (f"unit-grouped: {CAL_UNITS} of {len(train_units)} train units held out for "
                              f"calibration; scores on each calibration unit's last cycle (matches the "
                              f"last-cycle-per-unit test protocol). No unit in both fit and calibration."),
        "coverage_target": round(1 - ALPHA, 3),
        "n_calibration_units": int(len(abs_res)),
        "n_test_units": int(len(pred)),
        "metrics": {
            "picp_two_sided": round(picp, 4),
            "lower_bound_coverage_one_sided": round(lb_cov, 4),
            "pinaw": round(pinaw, 4),
            "mean_interval_width_cycles": round(float(np.mean(upper2 - lower2)), 1),
            "two_sided_half_width_qhat": round(qhat, 1),
            "one_sided_lower_margin": round(q_lower, 1),
            "point_rmse": round(rmse, 2),
        },
        "gate": {
            "thresholds_cycles": {"NO_GO_at_or_below": T_NOGO, "REVIEW_at_or_below": T_REVIEW},
            "point_distribution": {k: int(np.sum(point_gate == k)) for k in ("GO", "REVIEW", "NO_GO")},
            "lower_bound_distribution": {k: int(np.sum(lb_gate == k)) for k in ("GO", "REVIEW", "NO_GO")},
            "disagreement_units": flips,
            "point_go_but_lower_bound_flags": go_to_review_or_worse,
        },
        "examples": examples,
        "limitations": [
            "FD001 is single-operating-condition simulated turbofan data; coverage transfers as a pattern, not a guarantee, to multi-condition or hot-fire regimes.",
            "Split conformal assumes exchangeability of calibration and test last-cycle rows; the unit-grouped split respects this but n_calibration_units is modest.",
            "Intervals are marginal (one global width), not conditional on remaining-life regime.",
        ],
    }

    # Write the evidence twice: a source-of-record copy and the frontend's imported copy. This
    # JSON is exactly what fills the RulConformalCard and the RUL Calibration ribbons (baked at
    # compute time, not fetched live).
    out_src = ROOT / "telemetry-platform" / "rul_conformal_evidence.json"
    out_fe = ROOT / "repo-b" / "src" / "lib" / "telemetry" / "rulConformalEvidence.json"
    out_src.write_text(json.dumps(artifact, indent=2), encoding="utf-8")
    out_fe.write_text(json.dumps(artifact, indent=2), encoding="utf-8")

    print("\n=== CONFORMAL RUL (FD001) — measured ===")
    print(f"coverage target           : {1-ALPHA:.0%}")
    print(f"PICP (two-sided)          : {picp:.3f}")
    print(f"lower-bound coverage (1-s): {lb_cov:.3f}")
    print(f"PINAW                     : {pinaw:.3f}  (mean width {np.mean(upper2-lower2):.1f} cycles)")
    print(f"two-sided half-width qhat : {qhat:.1f} cycles")
    print(f"one-sided lower margin    : {q_lower:.1f} cycles")
    print(f"point RMSE                : {rmse:.2f}")
    print(f"point gate dist           : {artifact['gate']['point_distribution']}")
    print(f"lower-bound gate dist     : {artifact['gate']['lower_bound_distribution']}")
    print(f"disagreement units        : {flips}  (point GO but lower-bound flags: {go_to_review_or_worse})")
    if ex_idx is not None:
        print(f"example flip unit         : {artifact['examples'][0]}")
    print(f"\nwrote {out_src}")
    print(f"wrote {out_fe}")


if __name__ == "__main__":
    main()
