"""Telemetry ML — metric definitions (PRODUCTION source of truth).

Pure numpy. These are the canonical RUL metric definitions; experimental notebooks may carry inline
copies, but production promotion and reporting import from here so the math agrees by construction.
"""
from __future__ import annotations

import numpy as np

RUL_CAP = 125  # standard C-MAPSS piecewise-linear RUL ceiling


def rmse(a, b) -> float:
    return float(np.sqrt(np.mean((np.asarray(a, float) - np.asarray(b, float)) ** 2)))


def mae(a, b) -> float:
    return float(np.mean(np.abs(np.asarray(a, float) - np.asarray(b, float))))


def phm_score(y_true, y_pred) -> float:
    """NASA PHM'08 asymmetric score. LOWER IS BETTER.

    Late predictions (pred > true => d > 0, over-stating remaining life) are penalized harder (a=10)
    than early ones (a=13), because over-stating safe life is the dangerous direction.
    """
    d = np.asarray(y_pred, float) - np.asarray(y_true, float)
    s = np.where(d < 0, np.exp(-d / 13.0) - 1.0, np.exp(d / 10.0) - 1.0)
    return float(np.sum(s))


def late_diagnostics(y_true, y_pred) -> dict:
    """RUL 'late' = predicted RUL HIGHER than actual (model thinks more safe life remains than truth).
    That is the dangerous failure mode. Returns late/early rates and late-error magnitudes.
    """
    err = np.asarray(y_pred, float) - np.asarray(y_true, float)  # >0 late (optimistic), <0 early
    late = err > 0
    early = err < 0
    late_err = err[late]
    return {
        "rul_late_prediction_rate": float(late.mean()),
        "rul_early_prediction_rate": float(early.mean()),
        "rul_mean_late_error": float(late_err.mean()) if late_err.size else 0.0,
        "rul_p95_late_error": float(np.percentile(late_err, 95)) if late_err.size else 0.0,
        "rul_late_error_count": int(late.sum()),
    }


def regime_late_rates(y_true, y_pred, cap: int = RUL_CAP) -> dict:
    """Late-prediction rate sliced by RUL regime (single-regime FD001 -> slice by remaining life)."""
    y_true = np.asarray(y_true, float)
    err = np.asarray(y_pred, float) - y_true
    out = {}
    for name, lo, hi in [("low_RUL_<50", 0, 50), ("mid_RUL_50_100", 50, 100), ("high_RUL_>=100", 100, cap + 1)]:
        m = (y_true >= lo) & (y_true < hi)
        out[name] = {"n": int(m.sum()), "late_rate": round(float((err[m] > 0).mean()), 3) if m.any() else None}
    return out


# ── Anomaly honest / affiliation metrics (canonical) ────────────────────────────────────────────────
# Single source for the SMAP/MSL anomaly metrics that today live (identically) in
# `databricks/notebooks/train_anomaly.py` (cluster, logs the gated metrics) and
# `eval_honest_metrics.py` (local evaluator). Channel-keyed numpy; no pandas. Distances are WITHIN
# channel, so a labeled window's length cannot inflate affiliation (each event contributes one recall
# term, each predicted positive one precision term).
AFFIL_CAP_D = 50  # fixed tick budget for affiliation proximity (NOT window length) — un-gameable cap


def _prf(tp: int, fp: int, fn: int) -> dict:
    prec = tp / (tp + fp) if (tp + fp) else 0.0
    rec = tp / (tp + fn) if (tp + fn) else 0.0
    f1 = 2 * prec * rec / (prec + rec) if (prec + rec) else 0.0
    return {"precision": prec, "recall": rec, "f1": f1, "tp": int(tp), "fp": int(fp), "fn": int(fn)}


def events_from_labels(y) -> list:
    """Contiguous is_anomaly==1 runs in one channel -> list of inclusive (a, b) positions."""
    y = np.asarray(y).astype(int)
    ev, i, n = [], 0, len(y)
    while i < n:
        if y[i] == 1:
            j = i
            while j < n and y[j] == 1:
                j += 1
            ev.append((i, j - 1))
            i = j
        else:
            i += 1
    return ev


def point_metrics(y, p) -> dict:
    """Point-wise P/R/F1 (NO point adjustment) over flat arrays — the defensible honest floor."""
    y = np.asarray(y).astype(int)
    p = np.asarray(p).astype(int)
    return _prf(int(((p == 1) & (y == 1)).sum()), int(((p == 1) & (y == 0)).sum()),
                int(((p == 0) & (y == 1)).sum()))


def point_adjusted_metrics(channels) -> dict:
    """Point-ADJUSTED P/R/F1 (telemanom convention): within each labeled segment, if any point is
    flagged, credit the whole segment. `channels` = iterable of (y_chan, p_chan). Inflates — reference."""
    TP = FP = FN = 0
    for y, p in channels:
        y = np.asarray(y).astype(int)
        p = np.asarray(p).astype(int)
        adj = p.copy()
        for a, b in events_from_labels(y):
            if p[a:b + 1].any():
                adj[a:b + 1] = 1
        TP += int(((adj == 1) & (y == 1)).sum())
        FP += int(((adj == 1) & (y == 0)).sum())
        FN += int(((adj == 0) & (y == 1)).sum())
    return _prf(TP, FP, FN)


def _pt_to_intervals_dist(idx: np.ndarray, intervals: list) -> np.ndarray:
    """Min tick-distance from each position in `idx` to any inclusive [a, b] interval (0 if inside)."""
    if idx.size == 0:
        return np.empty(0, dtype=np.float64)
    if not intervals:
        return np.full(idx.shape, np.inf)
    d = np.full(idx.shape, np.inf)
    for a, b in intervals:
        dd = np.where(idx < a, a - idx, np.where(idx > b, idx - b, 0)).astype(np.float64)
        d = np.minimum(d, dd)
    return d


def affiliation_metrics(per_chan: list, cap_d: int = AFFIL_CAP_D) -> dict:
    """Capped-proximity affiliation P/R/F1. `per_chan` = list of {"events": [(a,b)...], "pred_idx": ndarray}."""
    prec_sum = rec_sum = 0.0
    prec_cnt = rec_cnt = 0
    for ch in per_chan:
        events, pred_idx = ch["events"], np.asarray(ch["pred_idx"])
        if pred_idx.size:                                   # precision: pred -> nearest event
            d = _pt_to_intervals_dist(pred_idx, events)
            prox = np.clip(1.0 - d / cap_d, 0.0, 1.0)
            prox[~np.isfinite(d)] = 0.0
            prec_sum += float(prox.sum())
            prec_cnt += int(pred_idx.size)
        for (a, b) in events:                               # recall: event -> nearest pred
            if pred_idx.size:
                dist = float(_pt_to_intervals_dist(pred_idx, [(a, b)]).min())
                prox = max(0.0, 1.0 - dist / cap_d) if np.isfinite(dist) else 0.0
            else:
                prox = 0.0
            rec_sum += prox
            rec_cnt += 1
    p = prec_sum / prec_cnt if prec_cnt else 0.0
    r = rec_sum / rec_cnt if rec_cnt else 0.0
    f1 = 2 * p * r / (p + r) if (p + r) else 0.0
    return {"affiliation_precision": p, "affiliation_recall": r, "affiliation_f1": f1,
            "predicted_positives": prec_cnt, "events": rec_cnt, "cap_d_ticks": cap_d}


def honest_anomaly_metrics(channels, cap_d: int = AFFIL_CAP_D) -> dict:
    """Full honest bundle the gate reads — pooled point-wise + event_recall + alarm_precision +
    affiliation. `channels` = iterable of (y_chan, p_chan). Matches train_anomaly.honest_and_affiliation."""
    chans = [(np.asarray(y).astype(int), np.asarray(p).astype(int)) for y, p in channels]
    yall = np.concatenate([y for y, _ in chans]) if chans else np.zeros(0, int)
    pall = np.concatenate([p for _, p in chans]) if chans else np.zeros(0, int)
    pt = point_metrics(yall, pall)
    per_chan = [{"events": events_from_labels(y), "pred_idx": np.flatnonzero(p)} for y, p in chans]
    aff = affiliation_metrics(per_chan, cap_d)
    seg_total = seg_hit = 0
    for y, p in chans:
        for a, b in events_from_labels(y):
            seg_total += 1
            if p[a:b + 1].any():
                seg_hit += 1
    alarms = int((pall == 1).sum())
    alarm_prec = (int(((pall == 1) & (yall == 1)).sum()) / alarms) if alarms else 0.0
    return {
        "f1_pointwise": pt["f1"], "precision_pointwise": pt["precision"], "recall_pointwise": pt["recall"],
        "event_recall": (seg_hit / seg_total if seg_total else 0.0), "alarm_precision": alarm_prec,
        "affiliation_precision": aff["affiliation_precision"], "affiliation_recall": aff["affiliation_recall"],
        "affiliation_f1": aff["affiliation_f1"],
    }


def naive_baselines(y_train, y_test) -> dict:
    """Constant remaining-life baselines (median + mean). The STRONGEST (lowest-RMSE) naive is the bar
    a model must beat. Returns per-baseline scores, the strongest key, and the strongest scores."""
    y_train = np.asarray(y_train, float)
    y_test = np.asarray(y_test, float)
    preds = {"median": np.full_like(y_test, float(np.median(y_train))),
             "mean": np.full_like(y_test, float(y_train.mean()))}
    scores = {k: {"rmse": rmse(y_test, p), "mae": mae(y_test, p), "phm": phm_score(y_test, p)}
              for k, p in preds.items()}
    best = min(scores, key=lambda k: scores[k]["rmse"])
    return {"per_baseline": scores, "strongest": best, "strongest_scores": scores[best]}
