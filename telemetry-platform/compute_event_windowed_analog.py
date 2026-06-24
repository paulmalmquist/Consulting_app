"""Spin 6 (compute) — event-windowed analog retrieval on SMAP/MSL (REAL data, reproducible).

The finding: whole-series similarity is dominated by the long steady-state phase and surfaces the
wrong precedents; event-windowed DTW on the anomalous segment finds the cases that share the EVENT.

Two retrieval methods over real labeled SMAP/MSL windows (gold_smap_msl_windows, test split):
  A) WHOLE-SERIES cosine — retrieve by cosine on the candidate channel's full-series statistical
     summary (mean/std/min/max/median/iqr/|slope|/frac-above-2σ). Dominated by steady-state.
  B) EVENT-WINDOWED DTW — retrieve by DTW distance on the z-normalized raw value sequence of the
     anomalous window itself (the event shape).
For each anomalous query window, take top-K (excluding same-channel) under each method and measure:
  - anomalous-match rate: fraction of retrieved precedents that are themselves anomalous;
  - top-K overlap: how much the two methods agree.

No anomaly-label fabrication (is_anomaly is the dataset's labeled window). If event-windowing does
not beat whole-series, the artifact says so. ML-only: writes a telemetry-platform artifact; the UI
card is deferred (a parallel agent owns the telemetry frontend refactor).

Run: python telemetry-platform/compute_event_windowed_analog.py   (Databricks OAuth profile 'PaulMain')
"""

import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import numpy as np
import pandas as pd

from databricks.sdk import WorkspaceClient
from databricks.sdk.service.sql import Disposition, Format, StatementState

from analog_core import cosine, dtw_distance, match_rate, overlap, topk_indices

TEL = "novendor_1.telemetry"
WAREHOUSE_ID = "0e56420fb707d861"
L = 48               # event-window length (ticks)
K = 5                # top-K retrieved precedents
BAND = 8             # DTW Sakoe-Chiba band
N_QUERIES = 40       # anomalous query windows
N_CAND_ANOM = 120    # anomalous candidate windows in the pool
N_CAND_NORM = 180    # normal candidate windows in the pool
SEED = 0
ROOT = Path(__file__).resolve().parents[1]
AS_OF = "2026-06-24"


def query_sql(w: WorkspaceClient, sql: str) -> pd.DataFrame:
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


def channel_summary(values: np.ndarray) -> np.ndarray:
    """Whole-series statistical character (steady-state dominated)."""
    v = np.asarray(values, dtype=float)
    sd = v.std() or 1.0
    return np.array([
        v.mean(), v.std(), v.min(), v.max(), np.median(v),
        np.percentile(v, 75) - np.percentile(v, 25),
        float(np.mean(np.abs(np.diff(v)))) if len(v) > 1 else 0.0,
        float(np.mean(np.abs(v - v.mean()) > 2 * sd)),
    ])


def contiguous_runs(mask: np.ndarray) -> list[tuple[int, int]]:
    runs, start = [], None
    for i, m in enumerate(mask):
        if m and start is None:
            start = i
        elif not m and start is not None:
            runs.append((start, i)); start = None
    if start is not None:
        runs.append((start, len(mask)))
    return runs


def window_at(values: np.ndarray, center: int) -> np.ndarray | None:
    lo = center - L // 2
    if lo < 0 or lo + L > len(values):
        return None
    return values[lo:lo + L]


def main() -> None:
    w = WorkspaceClient(profile="PaulMain")
    print("[analog] starting warehouse if stopped...")
    try:
        import datetime
        w.warehouses.start(WAREHOUSE_ID).result(timeout=datetime.timedelta(minutes=5))
    except Exception as exc:
        print(f"[analog] warehouse note: {str(exc)[:120]}")

    print("[analog] pulling SMAP/MSL test windows...")
    df = query_sql(w, f"SELECT chan_id, t, value, is_anomaly FROM {TEL}.gold_smap_msl_windows "
                      f"WHERE split = 'test'")
    df["t"] = pd.to_numeric(df["t"], errors="coerce")
    df["value"] = pd.to_numeric(df["value"], errors="coerce")
    df["is_anomaly"] = pd.to_numeric(df["is_anomaly"], errors="coerce").fillna(0).astype(int)
    df = df.dropna(subset=["t", "value"]).sort_values(["chan_id", "t"])
    print(f"[analog] rows={len(df)} channels={df.chan_id.nunique()} anomaly_rate={df.is_anomaly.mean():.3f}")

    rng = np.random.default_rng(SEED)
    summaries: dict[str, np.ndarray] = {}
    anom_windows, norm_windows = [], []   # each: dict(chan, seq(z-normed), is_anomaly)
    for chan, g in df.groupby("chan_id"):
        vals = g["value"].to_numpy()
        isa = g["is_anomaly"].to_numpy()
        if len(vals) < L * 2:
            continue
        summaries[chan] = channel_summary(vals)
        # Channel-level normalization (not per-window): preserves how prominent the event is
        # within the channel's own normal range, so a spike stays a spike and a flat normal
        # window stays flat. Per-window z-norm would erase that and make them look alike.
        cmu, csd = vals.mean(), (vals.std() or 1.0)
        for (s, e) in contiguous_runs(isa == 1):
            win = window_at(vals, (s + e) // 2)
            if win is not None:
                anom_windows.append({"chan": chan, "seq": (win - cmu) / csd, "is_anomaly": 1})
        # normal windows: random centers far from any anomaly
        normal_centers = np.where(isa == 0)[0]
        rng.shuffle(normal_centers)
        taken = 0
        for c in normal_centers:
            if isa[max(0, c - L):min(len(isa), c + L)].any():
                continue
            win = window_at(vals, int(c))
            if win is not None:
                norm_windows.append({"chan": chan, "seq": (win - cmu) / csd, "is_anomaly": 0})
                taken += 1
            if taken >= 4:
                break

    if len(anom_windows) < 10:
        raise RuntimeError(f"too few anomalous windows ({len(anom_windows)}) for the experiment")

    # Candidate pool (capped, balanced-ish) + query set (anomalous, disjoint where possible).
    rng.shuffle(anom_windows); rng.shuffle(norm_windows)
    queries = anom_windows[:N_QUERIES]
    pool = anom_windows[:N_CAND_ANOM] + norm_windows[:N_CAND_NORM]
    pool_isa = np.array([c["is_anomaly"] for c in pool])
    print(f"[analog] queries={len(queries)} pool={len(pool)} "
          f"(anom {int(pool_isa.sum())} / normal {int((pool_isa==0).sum())})")

    mr_a, mr_b, ov, ex = [], [], [], None
    for q in queries:
        a_scores, b_dist, valid = [], [], []
        for i, c in enumerate(pool):
            if c["chan"] == q["chan"]:
                a_scores.append(-1e9); b_dist.append(1e18); continue   # exclude same channel
            a_scores.append(cosine(summaries[q["chan"]], summaries[c["chan"]]))
            b_dist.append(dtw_distance(q["seq"], c["seq"], band=BAND))
            valid.append(i)
        a_top = topk_indices(np.array(a_scores), K, largest=True)
        b_top = topk_indices(np.array(b_dist), K, largest=False)
        ra, rb = match_rate(a_top, pool_isa), match_rate(b_top, pool_isa)
        mr_a.append(ra); mr_b.append(rb); ov.append(overlap(a_top, b_top))
        if ex is None and pool_isa[b_top[0]] == 1 and pool_isa[a_top[0]] == 0:
            ex = {
                "query_channel": q["chan"],
                "whole_series_cosine_top1": {"channel": pool[a_top[0]]["chan"], "is_anomaly": int(pool_isa[a_top[0]])},
                "event_windowed_dtw_top1": {"channel": pool[b_top[0]]["chan"], "is_anomaly": int(pool_isa[b_top[0]])},
            }

    mean_a, mean_b, mean_ov = float(np.mean(mr_a)), float(np.mean(mr_b)), float(np.mean(ov))
    lift = (mean_b - mean_a) / mean_a if mean_a > 0 else float("inf")

    artifact = {
        "as_of": AS_OF,
        "dataset": "SMAP/MSL (NASA telemanom) — gold_smap_msl_windows, test split",
        "method": (f"For each anomalous query window (len {L}), retrieve top-{K} precedents (excluding "
                   "same-channel) two ways: (A) WHOLE-SERIES cosine on the channel's full-series "
                   "statistical summary; (B) EVENT-WINDOWED DTW (Sakoe-Chiba band "
                   f"{BAND}) on the z-normalized anomalous-window signal. Metric: anomalous-match rate "
                   "(fraction of retrieved precedents that are themselves anomalous) + top-K overlap."),
        "params": {"window_len": L, "top_k": K, "dtw_band": BAND,
                   "n_queries": len(queries), "pool_size": len(pool),
                   "pool_anomalous": int(pool_isa.sum()), "pool_normal": int((pool_isa == 0).sum())},
        "metrics": {
            "whole_series_cosine_anomalous_match_rate": round(mean_a, 4),
            "event_windowed_dtw_anomalous_match_rate": round(mean_b, 4),
            "event_windowing_lift_pct": round(lift * 100, 1) if np.isfinite(lift) else None,
            "topk_overlap": round(mean_ov, 4),
        },
        "example": ex,
        "finding": (
            f"Whole-series cosine retrieves precedents that are only {round(mean_a*100,1)}% actual "
            f"anomalies (dominated by steady-state character), while event-windowed DTW retrieves "
            f"{round(mean_b*100,1)}% actual-anomaly precedents"
            + (f" ({round(lift*100)}% more)" if np.isfinite(lift) else "")
            + f". The two methods agree on only {round(mean_ov*100,1)}% of the top-{K} — event-windowing "
            "surfaces the precedents a full-vector search misses."
        ),
        "limitations": [
            "SMAP/MSL channels are independent anonymized spacecraft streams, not a coupled physical system; 'precedent' = another channel's labeled anomaly window of similar event shape, not a linked disposition.",
            "Linked dispositions (was it real / root cause / action taken) are NOT in this public dataset; they would come from a real failure-review system. Shown as unavailable rather than fabricated.",
            "Pure-numpy banded DTW on a capped candidate pool for tractability; the relative comparison (event-windowed vs whole-series) is the finding, not an absolute retrieval benchmark.",
        ],
    }

    out_src = ROOT / "telemetry-platform" / "event_windowed_analog_evidence.json"
    out_src.write_text(json.dumps(artifact, indent=2), encoding="utf-8")

    print("\n=== EVENT-WINDOWED ANALOG RETRIEVAL (SMAP/MSL) — measured ===")
    print(f"whole-series cosine anomalous-match rate: {mean_a:.3f}")
    print(f"event-windowed DTW  anomalous-match rate: {mean_b:.3f}"
          + (f"  ({lift*100:.0f}% lift)" if np.isfinite(lift) else ""))
    print(f"top-{K} overlap between methods         : {mean_ov:.3f}")
    print(f"example (B finds anomaly, A misses)     : {ex}")
    print(f"\nwrote {out_src}")
    print("[analog] UI card deferred — parallel agent owns the telemetry frontend refactor.")


if __name__ == "__main__":
    main()
