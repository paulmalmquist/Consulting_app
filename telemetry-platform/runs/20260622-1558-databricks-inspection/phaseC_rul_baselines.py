"""Phase C — RUL naive-baseline comparison (READ-ONLY).

The train_rul notebook reports linear + GBM but NO naive baseline, and selects the champion on
RMSE alone even though GBM's PHM is worse than linear's. This computes the naive constant predictors
(train-mean, train-median, predict-125) on the SAME protocol (FD001, last cycle per unit, capped 125,
clip [0,125], asymmetric PHM) so we can state plainly whether the trained models beat naive.

Pulls only the test truth (silver_cmapss_rul) and train RUL distribution via SQL. No model load,
no mutation.
"""
from __future__ import annotations
import json
import sys
import time
from pathlib import Path
import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "databricks"))
from _bootstrap import get_client, TEL  # noqa: E402

RUL_CAP = 125
# Champion + baseline metrics observed from this run's train_rul (run ids in manifest).
TRAINED = {
    "linear (run d4035973)": {"rmse": 21.702448390120548, "phm": 1036.1390874014483},
    "gbm CHAMPION (run d773eab9)": {"rmse": 20.321851416076, "phm": 1423.3269302516078},
}


def sql(client, statement, timeout=120):
    r = client.execute_sql(statement)
    sid = r.get("statement_id"); state = r.get("status", {}).get("state"); t0 = time.time()
    while state in ("PENDING", "RUNNING") and time.time() - t0 < timeout:
        time.sleep(2); r = client._request("GET", f"/api/2.0/sql/statements/{sid}")
        state = r.get("status", {}).get("state")
    if state != "SUCCEEDED":
        raise RuntimeError(f"SQL {state}: {json.dumps(r.get('status'))[:200]}")
    return r.get("result", {}).get("data_array", []) or []


def rmse(a, b):
    return float(np.sqrt(np.mean((np.asarray(a, float) - np.asarray(b, float)) ** 2)))


def mae(a, b):
    return float(np.mean(np.abs(np.asarray(a, float) - np.asarray(b, float))))


def phm_score(y_true, y_pred):
    d = np.asarray(y_pred, float) - np.asarray(y_true, float)
    s = np.where(d < 0, np.exp(-d / 13.0) - 1.0, np.exp(d / 10.0) - 1.0)
    return float(np.sum(s))


def main() -> int:
    c = get_client()
    # Train RUL distribution (capped) over FD001 train rows with non-null target.
    tr = sql(c, f"""SELECT LEAST(rul_target,{RUL_CAP}) AS y FROM {TEL}.gold_cmapss_features
                    WHERE subset='FD001' AND split='train' AND rul_target IS NOT NULL""")
    ytr = np.array([float(r[0]) for r in tr])
    # Test truth: official RUL per FD001 unit, capped.
    te = sql(c, f"SELECT unit, rul FROM {TEL}.silver_cmapss_rul WHERE subset='FD001' ORDER BY unit")
    yte = np.minimum(np.array([float(r[1]) for r in te]), RUL_CAP)

    train_mean = float(ytr.mean()); train_median = float(np.median(ytr))
    naive = {
        "predict_train_mean": np.full_like(yte, train_mean),
        "predict_train_median": np.full_like(yte, train_median),
        "predict_125_max_life": np.full_like(yte, float(RUL_CAP)),
    }
    rows = {}
    for name, pred in naive.items():
        rows[name] = {"rmse": round(rmse(yte, pred), 3), "mae": round(mae(yte, pred), 3),
                      "phm": round(phm_score(yte, pred), 1)}
    for name, m in TRAINED.items():
        rows[name] = {"rmse": round(m["rmse"], 3), "mae": None, "phm": round(m["phm"], 1)}

    out = {
        "protocol": "FD001, last cycle per unit, truth capped at 125, asymmetric PHM (lower=better)",
        "n_train_rows": int(len(ytr)), "n_test_units": int(len(yte)),
        "train_mean_y": round(train_mean, 2), "train_median_y": round(train_median, 2),
        "test_truth_stats": {"min": float(yte.min()), "max": float(yte.max()),
                             "mean": round(float(yte.mean()), 2), "std": round(float(yte.std()), 2)},
        "results_sorted_by_rmse": dict(sorted(rows.items(), key=lambda kv: kv[1]["rmse"])),
        "verdict_rmse": "trained models beat naive on RMSE" if min(TRAINED.values(), key=lambda m: m["rmse"])["rmse"] < min(rmse(yte, p) for p in naive.values()) else "naive competitive on RMSE",
    }
    best_naive_phm = min(phm_score(yte, p) for p in naive.values())
    out["best_naive_phm"] = round(best_naive_phm, 1)
    out["gbm_phm_vs_best_naive"] = "WORSE than best naive" if TRAINED["gbm CHAMPION (run d773eab9)"]["phm"] > best_naive_phm else "better than best naive"
    out["linear_phm_vs_best_naive"] = "WORSE than best naive" if TRAINED["linear (run d4035973)"]["phm"] > best_naive_phm else "better than best naive"

    (HERE / "phaseC_rul_baselines.json").write_text(json.dumps(out, indent=2), encoding="utf-8")
    print(json.dumps(out, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
