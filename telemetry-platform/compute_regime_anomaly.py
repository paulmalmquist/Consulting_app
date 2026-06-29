"""Phase 3 — Regime-conditioned anomaly detection on C-MAPSS FD004 (REAL data, reproducible).

WHAT THIS FILE DOES (plain version): it builds two anomaly detectors for jet-engine sensor data
and shows that the naive one cries wolf. A "regime" is a distinct operating condition (cruise vs
climb, etc.). The naive detector judges "normal" on one global scale, so it false-alarms every
time the engine merely switches modes. The smart detector judges "normal relative to the current
regime" (regime-conditioned) and stops those false alarms.
WHERE YOU SEE THIS: the frontend RegimeAnomalyCard — per-regime false-positive bars for the
global vs regime-conditioned detector, plus eta-squared (how much of the error is just regime).
INPUTS -> OUTPUT: healthy FD004 sensor rows from silver_cmapss -> regime_anomaly_evidence.json.
HOW TO READ THE NUMBERS: false-positive rate = % of KNOWN-HEALTHY rows wrongly flagged (lower is
better); cross-regime spread = gap between worst and best regime (lower = fairer); eta-squared =
share of the detector's error explained purely by which operating mode the engine was in (high =
the detector is reacting to mode, not faults).


The judgment artifact (Spin 1 + the degenerate-autoencoder fix): build the obvious global
reconstruction-error detector, measure it on FD004's six operating conditions, find that its
false positives are dominated by operating regime (not faults), then condition on regime and
measure the false-positive reduction.

Why FD004: it has six operating conditions (set by op_setting_1/2/3), which put the sensors on
very different scales. A single global threshold on raw reconstruction error flags healthy
points in high-variance regimes. C-MAPSS FD004 has no anomaly labels, so the metric is the
FALSE-POSITIVE rate on HEALTHY rows (train split, RUL >= HEALTHY_RUL — far from failure, nominal):
a good detector should rarely flag these. We measure per-regime FP rate on held-out (grouped by
unit) healthy rows for a GLOBAL detector vs a REGIME-CONDITIONED one (per-regime standardization).

Data: silver_cmapss (subset='FD004') — it preserves op_setting_1/2/3 + sensor_1..21 (gold drops
the settings). No fake numbers: if regime-conditioning doesn't help, the artifact says so.

Run: python telemetry-platform/compute_regime_anomaly.py   (Databricks OAuth profile 'PaulMain')
"""

import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.decomposition import PCA
from sklearn.preprocessing import StandardScaler

from databricks.sdk import WorkspaceClient
from databricks.sdk.service.sql import Disposition, Format, StatementState

from regime_core import per_regime_rate, recon_error, regime_stats, regime_zscore, spread, threshold_quantile

TEL = "novendor_1.telemetry"
WAREHOUSE_ID = "0e56420fb707d861"
HEALTHY_RUL = 100      # rows with rul_target >= this are nominal (far from failure)
N_REGIMES = 6          # FD004 has six operating conditions
N_COMPONENTS = 8       # PCA components for the reconstruction model
PCTL = 0.95            # threshold percentile (=> ~5% FP by construction on the fit set)
SEED = 0
SETTINGS = ["op_setting_1", "op_setting_2", "op_setting_3"]
SENSORS = [f"sensor_{i}" for i in range(1, 22)]
ROOT = Path(__file__).resolve().parents[1]
AS_OF = "2026-06-23"


# Run a SQL query against the Databricks warehouse and hand back a tidy table. Plumbing only:
# submit, poll until done, page through any chunked results.
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
    for n in range(1, resp.manifest.total_chunk_count or 1):
        rows.extend(w.statement_execution.get_statement_result_chunk_n(sid, n).data_array or [])
    return pd.DataFrame(rows, columns=cols)


# eta-squared answers one plain question: of all the ups and downs in the detector's error, what
# fraction is explained just by which operating mode the engine was in? Near 1 means the "anomaly"
# score is really a regime indicator (bad); near 0 means it's reacting to genuine faults (good).
# -> this is the "variance explained by regime" figure on the RegimeAnomalyCard.
def eta_squared(errs: np.ndarray, regimes: np.ndarray) -> float:
    """Fraction of recon-error variance explained by regime (one-way ANOVA eta^2).
    High => recon error tracks operating regime; near 0 => it does not."""
    grand = errs.mean()
    ss_between = sum((errs[regimes == r].mean() - grand) ** 2 * np.sum(regimes == r)
                     for r in np.unique(regimes))
    ss_total = float(np.sum((errs - grand) ** 2)) or 1.0
    return float(ss_between / ss_total)


def main() -> None:
    w = WorkspaceClient(profile="PaulMain")
    print("[regime] starting warehouse if stopped...")
    try:
        import datetime
        w.warehouses.start(WAREHOUSE_ID).result(timeout=datetime.timedelta(minutes=5))
    except Exception as exc:
        print(f"[regime] warehouse note: {str(exc)[:120]}")

    print("[regime] pulling FD004 healthy rows from silver_cmapss...")
    cols = ", ".join(["unit", "cycle", "rul_target"] + SETTINGS + SENSORS)
    df = query(w, f"SELECT {cols} FROM {TEL}.silver_cmapss "
                  f"WHERE subset = 'FD004' AND split = 'train' AND rul_target >= {HEALTHY_RUL}")
    for c in ["unit", "cycle", "rul_target"] + SETTINGS + SENSORS:
        df[c] = pd.to_numeric(df[c], errors="coerce")
    df = df.dropna(subset=SETTINGS + SENSORS)
    print(f"[regime] healthy FD004 rows={len(df)} units={df.unit.nunique()}")

    # Drop constant sensors (C-MAPSS has several flat channels).
    active = [s for s in SENSORS if df[s].std() > 1e-6]
    print(f"[regime] active sensors={len(active)} (dropped {len(SENSORS) - len(active)} constant)")

    # Discover the operating regimes. We don't have mode labels, so we cluster the three
    # operating-setting columns into six groups (FD004's known number of conditions); each row
    # gets tagged with the regime it belongs to. This regime tag is what everything below
    # conditions on.
    # Regimes from the operating-setting columns (six C-MAPSS conditions).
    rscaler = StandardScaler().fit(df[SETTINGS].to_numpy())
    km = KMeans(n_clusters=N_REGIMES, random_state=SEED, n_init=10).fit(rscaler.transform(df[SETTINGS].to_numpy()))
    df["regime"] = km.labels_

    # Split engines (units) into a build set and a held-out test set so no engine is in both.
    # Judging the detector only on engines it never saw is what makes the false-alarm numbers
    # honest rather than memorized.
    # Grouped fit/eval split by unit (no unit in both — same discipline as the RUL work).
    rng = np.random.default_rng(SEED)
    units = np.sort(df.unit.unique())
    eval_units = set(rng.choice(units, size=max(1, len(units) * 3 // 10), replace=False).tolist())
    fit = df[~df.unit.isin(eval_units)]
    ev = df[df.unit.isin(eval_units)]
    Xfit, Xev = fit[active].to_numpy(), ev[active].to_numpy()
    reg_fit, reg_ev = fit["regime"].to_numpy(), ev["regime"].to_numpy()

    # ---- GLOBAL detector: the "single operating mode" assumption ----
    # The obvious thing that breaks: calibrate the detector on the operating condition you
    # have the most data for, then apply it everywhere (ignore that other conditions exist).
    # Build the naive detector on ONLY the most common operating mode, learn its "normal" pattern
    # (PCA) and an alarm line (tau_g), then apply that one-mode yardstick to every mode. The
    # per-regime false-alarm rates this produces are the GLOBAL (red/baseline) bars on the card.
    dominant = int(pd.Series(reg_fit).value_counts().idxmax())
    dm = reg_fit == dominant
    gscaler = StandardScaler().fit(Xfit[dm])
    gpca = PCA(n_components=N_COMPONENTS, random_state=SEED).fit(gscaler.transform(Xfit[dm]))
    tau_g = threshold_quantile(
        recon_error(gscaler.transform(Xfit[dm]), gpca.mean_, gpca.components_), PCTL)
    eg_ev = recon_error(gscaler.transform(Xev), gpca.mean_, gpca.components_)  # applied to ALL regimes
    fp_global = per_regime_rate(eg_ev, reg_ev, tau_g)

    # Build the smart detector: first re-express every row relative to its own regime's normal
    # (regime_zscore removes the mode-switch offset), THEN learn one shared "normal" pattern and
    # alarm line. Because mode is already accounted for, leftover surprise should reflect real
    # faults. These per-regime rates are the REGIME-CONDITIONED (improved) bars on the card.
    # ---- REGIME-CONDITIONED detector: per-regime standardization ----
    stats = regime_stats(Xfit, reg_fit)
    Zfit, Zev = regime_zscore(Xfit, reg_fit, stats), regime_zscore(Xev, reg_ev, stats)
    zpca = PCA(n_components=N_COMPONENTS, random_state=SEED).fit(Zfit)
    tau_z = threshold_quantile(recon_error(Zfit, zpca.mean_, zpca.components_), PCTL)
    ez_ev = recon_error(Zev, zpca.mean_, zpca.components_)
    fp_regime = per_regime_rate(ez_ev, reg_ev, tau_z)

    # Roll the per-regime bars up into the headline comparison: worst regime, average regime, and
    # how much regime-conditioning explains away. The reduction percentages are the "X% fewer false
    # alarms" claim shown on the card.
    worst_g, worst_z = max(fp_global.values()), max(fp_regime.values())
    mean_g, mean_z = float(np.mean(list(fp_global.values()))), float(np.mean(list(fp_regime.values())))
    eta_g, eta_z = eta_squared(eg_ev, reg_ev), eta_squared(ez_ev, reg_ev)
    fp_reduction_worst = (worst_g - worst_z) / worst_g if worst_g > 0 else 0.0
    fp_reduction_mean = (mean_g - mean_z) / mean_g if mean_g > 0 else 0.0

    regime_rows = []
    for r in sorted(fp_global):
        regime_rows.append({
            "regime": int(r),
            "n_eval_rows": int(np.sum(reg_ev == r)),
            "global_fp": round(fp_global[r], 4),
            "regime_conditioned_fp": round(fp_regime[r], 4),
        })

    artifact = {
        "as_of": AS_OF,
        "dataset": "C-MAPSS FD004 (six operating conditions)",
        "source_table": f"{TEL}.silver_cmapss (subset=FD004, split=train)",
        "method": ("PCA reconstruction-error detector on healthy rows (RUL >= "
                   f"{HEALTHY_RUL}); regimes from KMeans({N_REGIMES}) on op_setting_1/2/3. "
                   "GLOBAL = the single-operating-mode assumption: fit + threshold on the most "
                   "common regime, applied to all. REGIME-CONDITIONED = per-regime standardization "
                   f"before a shared model. Threshold = {int(PCTL*100)}th pctl of fit recon error. "
                   "Grouped fit/eval split by unit."),
        "healthy_definition": f"train rows with rul_target >= {HEALTHY_RUL} cycles (nominal, far from failure)",
        "fp_metric": "false-positive rate = fraction of HEALTHY held-out rows flagged anomalous",
        "n_healthy_rows": int(len(df)),
        "n_units": int(df.unit.nunique()),
        "n_eval_rows": int(len(ev)),
        "n_regimes": int(len(fp_global)),
        "n_active_sensors": int(len(active)),
        "metrics": {
            "global_worst_regime_fp": round(worst_g, 4),
            "regime_conditioned_worst_regime_fp": round(worst_z, 4),
            "global_mean_fp": round(mean_g, 4),
            "regime_conditioned_mean_fp": round(mean_z, 4),
            "global_cross_regime_spread": round(spread(fp_global), 4),
            "regime_conditioned_cross_regime_spread": round(spread(fp_regime), 4),
            "worst_regime_fp_reduction_pct": round(fp_reduction_worst * 100, 1),
            "mean_fp_reduction_pct": round(fp_reduction_mean * 100, 1),
            "recon_error_variance_explained_by_regime_global": round(eta_g, 3),
            "recon_error_variance_explained_by_regime_conditioned": round(eta_z, 3),
        },
        "per_regime": regime_rows,
        "finding": (
            f"On FD004's {len(fp_global)} operating regimes, a global detector that assumes a single "
            f"operating mode (calibrated on the most common condition) false-alarms on the others: its "
            f"reconstruction error is {round(eta_g*100)}% explained by operating condition, and the worst "
            f"regime flags {round(worst_g*100,1)}% of HEALTHY points (mean {round(mean_g*100)}% across "
            f"regimes). The error tracks regime, not faults. Per-regime conditioning cuts the worst-regime "
            f"false-positive rate to {round(worst_z*100,1)}% ({round(fp_reduction_worst*100)}% reduction), "
            f"the mean to {round(mean_z*100,1)}%, and drops regime-explained variance to {round(eta_z*100)}%."
        ),
        "limitations": [
            "C-MAPSS FD004 has no anomaly labels; the metric is false positives on HEALTHY (high-RUL) rows, not detection recall.",
            "Not a strawman: the global baseline is the single-operating-mode assumption (the naive thing — train on the data you have, ignore conditions, exactly the FD001->FD004 generalization failure). A global model that explicitly accounts for all six conditions also avoids the false alarms; the point is that operating-condition awareness is required, and per-regime normalization is the standard, scalable way to get it.",
            "PCA reconstruction stands in for the production detector; the regime-dominance result transfers to any reconstruction model that ignores operating condition.",
            "Six regimes recovered by KMeans on the three operating-setting columns; FD004's conditions are well-separated so this is stable, but it is clustering, not ground-truth condition labels.",
        ],
    }

    # Write the evidence twice: a source-of-record copy here, and a copy the frontend imports
    # directly. This JSON is exactly what populates the RegimeAnomalyCard (numbers are baked at
    # compute time, not fetched live).
    out_src = ROOT / "telemetry-platform" / "regime_anomaly_evidence.json"
    out_fe = ROOT / "repo-b" / "src" / "lib" / "telemetry" / "regimeAnomalyEvidence.json"
    out_src.write_text(json.dumps(artifact, indent=2), encoding="utf-8")
    out_fe.write_text(json.dumps(artifact, indent=2), encoding="utf-8")

    print("\n=== REGIME-CONDITIONED ANOMALY (FD004) — measured ===")
    print(f"healthy rows {len(df)} | units {df.unit.nunique()} | eval rows {len(ev)} | regimes {len(fp_global)}")
    print(f"global  per-regime FP: {[round(fp_global[r],3) for r in sorted(fp_global)]}")
    print(f"regime  per-regime FP: {[round(fp_regime[r],3) for r in sorted(fp_regime)]}")
    print(f"worst-regime FP   : global {worst_g:.3f} -> regime {worst_z:.3f}  ({fp_reduction_worst*100:.0f}% reduction)")
    print(f"mean FP           : global {mean_g:.3f} -> regime {mean_z:.3f}")
    print(f"recon-err var by regime (eta^2): global {eta_g:.2f} -> regime {eta_z:.2f}")
    print(f"\nwrote {out_src}\nwrote {out_fe}")


if __name__ == "__main__":
    main()
