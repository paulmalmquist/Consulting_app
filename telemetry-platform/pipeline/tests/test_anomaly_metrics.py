"""Reconcile the canonical anomaly honest/affiliation metrics against BOTH current implementations.

- Ground truth: a tiny hand-computed 2-channel fixture.
- `train_anomaly.py`: a faithful transcription of its `honest_and_affiliation` algorithm (the notebook
  can't be imported — it has Spark refs at module top — so we transcribe and pin it here).
- `eval_honest_metrics.py`: imported live (numpy-only, importable) and compared directly.
"""
import numpy as np
import pytest

from pipeline import metrics as M

# Fixture: 2 channels.
yA = np.array([0, 0, 1, 1, 0, 0]); pA = np.array([0, 0, 0, 1, 0, 1])   # event (2,3); preds at 3,5
yB = np.array([0, 1, 0]);          pB = np.array([0, 0, 0])            # event (1,1); no preds
CHANNELS = [(yA, pA), (yB, pB)]


# ── Ground truth (hand-computed) ────────────────────────────────────────────
def test_point_metrics_ground_truth():
    m = M.point_metrics(np.concatenate([yA, yB]), np.concatenate([pA, pB]))
    assert (m["tp"], m["fp"], m["fn"]) == (1, 1, 2)
    assert m["precision"] == pytest.approx(0.5)
    assert m["recall"] == pytest.approx(1 / 3)
    assert m["f1"] == pytest.approx(0.4)


def test_point_adjusted_ground_truth():
    m = M.point_adjusted_metrics(CHANNELS)
    assert (m["tp"], m["fp"], m["fn"]) == (2, 1, 1)  # segment (2,3) credited whole
    assert m["f1"] == pytest.approx(2 / 3)


def test_honest_bundle_ground_truth():
    h = M.honest_anomaly_metrics(CHANNELS, cap_d=50)
    assert h["event_recall"] == pytest.approx(0.5)        # 1 of 2 events hit
    assert h["alarm_precision"] == pytest.approx(0.5)     # 1 of 2 alarms inside a window
    assert h["affiliation_precision"] == pytest.approx(0.98)   # (1 + 0.96)/2
    assert h["affiliation_recall"] == pytest.approx(0.5)       # (1 + 0)/2
    assert h["affiliation_f1"] == pytest.approx(2 * 0.98 * 0.5 / 1.48)


def test_events_from_labels():
    assert M.events_from_labels([0, 1, 1, 0, 1]) == [(1, 2), (4, 4)]
    assert M.events_from_labels([0, 0]) == []


# ── Reconcile vs a transcription of train_anomaly.honest_and_affiliation ─────
def _ref_train_anomaly_honest(channels, cap_d=50):
    """Verbatim transcription of databricks/notebooks/train_anomaly.py honest_and_affiliation,
    re-expressed on (y_chan, p_chan) arrays. If the canonical drifts from the notebook, this fails."""
    yall = np.concatenate([np.asarray(y).astype(int) for y, _ in channels])
    pall = np.concatenate([np.asarray(p).astype(int) for _, p in channels])
    tp = int(((pall == 1) & (yall == 1)).sum()); fp = int(((pall == 1) & (yall == 0)).sum())
    fn = int(((pall == 0) & (yall == 1)).sum())
    prec = tp / (tp + fp) if (tp + fp) else 0.0
    rec = tp / (tp + fn) if (tp + fn) else 0.0
    f1 = 2 * prec * rec / (prec + rec) if (prec + rec) else 0.0
    seg_total = seg_hit = 0; prec_prox = rec_prox = 0.0; prec_cnt = rec_cnt = 0
    for y, p in channels:
        yy = np.asarray(y).astype(int); pp = np.asarray(p).astype(int)
        pred_idx = np.flatnonzero(pp); events = []
        i, n = 0, len(yy)
        while i < n:
            if yy[i] == 1:
                j = i
                while j < n and yy[j] == 1:
                    j += 1
                events.append((i, j - 1)); i = j
            else:
                i += 1
        if pred_idx.size:
            d = np.full(pred_idx.shape, np.inf)
            for a, b in events:
                dd = np.where(pred_idx < a, a - pred_idx, np.where(pred_idx > b, pred_idx - b, 0)).astype(float)
                d = np.minimum(d, dd)
            prox = np.clip(1.0 - d / cap_d, 0.0, 1.0); prox[~np.isfinite(d)] = 0.0
            prec_prox += float(prox.sum()); prec_cnt += int(pred_idx.size)
        for a, b in events:
            seg_total += 1
            if pp[a:b + 1].any():
                seg_hit += 1
            if pred_idx.size:
                dd = np.where(pred_idx < a, a - pred_idx, np.where(pred_idx > b, pred_idx - b, 0)).astype(float)
                pr = max(0.0, 1.0 - float(dd.min()) / cap_d)
            else:
                pr = 0.0
            rec_prox += pr; rec_cnt += 1
    ap = prec_prox / prec_cnt if prec_cnt else 0.0
    ar = rec_prox / rec_cnt if rec_cnt else 0.0
    af1 = 2 * ap * ar / (ap + ar) if (ap + ar) else 0.0
    alarms = int((pall == 1).sum())
    alarm_prec = (int(((pall == 1) & (yall == 1)).sum()) / alarms) if alarms else 0.0
    return {"f1_pointwise": f1, "precision_pointwise": prec, "recall_pointwise": rec,
            "event_recall": (seg_hit / seg_total if seg_total else 0.0), "alarm_precision": alarm_prec,
            "affiliation_precision": ap, "affiliation_recall": ar, "affiliation_f1": af1}


@pytest.mark.parametrize("channels", [
    CHANNELS,
    [(np.array([1, 1, 0, 0, 1]), np.array([1, 0, 1, 0, 0]))],
    [(np.array([0, 0, 0]), np.array([1, 0, 1]))],          # preds, no events
    [(np.array([0, 1, 0]), np.array([0, 0, 0]))],          # event, no preds
])
def test_canonical_matches_train_anomaly_transcription(channels):
    got = M.honest_anomaly_metrics(channels, cap_d=50)
    ref = _ref_train_anomaly_honest(channels, cap_d=50)
    for k in ref:
        assert got[k] == pytest.approx(ref[k]), k


# ── Reconcile vs eval_honest_metrics.py (imported live) ─────────────────────
def test_canonical_matches_eval_honest_metrics():
    import eval_honest_metrics as EH  # numpy-only module, importable (telemetry-platform on path)
    y = np.concatenate([yA, yB]); p = np.concatenate([pA, pB])
    offsets = [(0, len(yA)), (len(yA), len(yA) + len(yB))]
    eh_pa = EH.point_adjust(y, p, offsets)
    can_pa = M.point_adjusted_metrics(CHANNELS)
    for k in ("precision", "recall", "f1"):
        assert can_pa[k] == pytest.approx(eh_pa[k]), f"point_adjust:{k}"

    per_chan = [{"events": [(2, 3)], "pred_idx": np.array([3, 5])},
                {"events": [(1, 1)], "pred_idx": np.array([], dtype=int)}]
    eh_aff = EH.affiliation_metrics(per_chan, cap_d=50)
    can_aff = M.affiliation_metrics(per_chan, cap_d=50)
    for k in ("affiliation_precision", "affiliation_recall", "affiliation_f1"):
        assert can_aff[k] == pytest.approx(eh_aff[k]), f"affiliation:{k}"
