"""g07 tests: RI, volumes, determinism touchpoints, and the SCN-005 *golden pair*.

SCN-005 is asserted like ML-8821 is a golden thread: the two hot-fire runs are structurally
similar (same pattern family + same PF-TPL-01 template + cosine >= threshold) yet NOT identical
(different run ids, timestamps, and raw readings), and 00041 is the single most-similar run to
00088 (similarity_top1)."""

from collections import defaultdict

import numpy as np

from rs_factory_seed import waveforms
from rs_factory_seed.cli import build_dataset


def _run_vectors(ds):
    """Reconstruct each run's similarity vector from fact_process_feature_window.

    Pass the per-window trajectory (windows in window_index order) per channel — the same
    structure run_feature_vector consumes in the pipeline / g10."""
    by_run_ch = defaultdict(lambda: defaultdict(list))
    for w in ds.get("fact_process_feature_window").rows:
        by_run_ch[w["run_id"]][w["channel"]].append(w)
    vectors = {}
    for run_id, chans in by_run_ch.items():
        channel_windows = {
            ch: sorted(windows, key=lambda x: x["window_index"])
            for ch, windows in chans.items()
        }
        vectors[run_id] = waveforms.run_feature_vector(channel_windows)
    return vectors


def test_g07_foreign_keys_resolve():
    _ctx, ds = build_dataset("small")
    runs = {r["run_id"] for r in ds.get("raw_test_runs").rows}
    articles = {r["article_id"] for r in ds.get("raw_test_articles").rows}
    types = {r["test_type"] for r in ds.get("raw_test_types").rows}
    assert {r["test_type"] for r in ds.get("raw_test_runs").rows} <= types
    assert {r["article_id"] for r in ds.get("raw_test_runs").rows} <= articles
    assert {r["run_id"] for r in ds.get("raw_iot_telemetry_segments").rows} <= runs
    assert {r["run_id"] for r in ds.get("raw_iot_telemetry_samples").rows} <= runs
    assert {r["run_id"] for r in ds.get("fact_process_feature_window").rows} <= runs
    assert {r["run_id"] for r in ds.get("raw_test_limit_violations").rows} <= runs


def test_g07_volumes():
    _ctx, ds = build_dataset("small")
    assert len(ds.get("raw_test_types").rows) == 12
    assert len(ds.get("raw_test_articles").rows) == 120
    assert len(ds.get("raw_iot_sensors").rows) == 400
    assert len(ds.get("raw_test_runs").rows) == 200
    assert len(ds.get("raw_test_limit_violations").rows) == 400
    assert len(ds.get("raw_iot_telemetry_samples").rows) == 150000
    assert len(ds.get("fact_process_feature_window").rows) == 12000


def test_scn005_pair_exists_and_shares_template():
    ctx, ds = build_dataset("small")
    s = ctx.scenario["scenarios"]["SCN-005-HOTFIRE-ANOMALY-SIMILARITY"]
    runs = {r["run_id"]: r for r in ds.get("raw_test_runs").rows}
    failed, incon = runs[s["failed_run"]], runs[s["inconclusive_run"]]
    assert failed["pattern"] == incon["pattern"] == s["pattern_family"] == "pre_failure"
    assert failed["template"] == incon["template"] == "PF-TPL-01"
    assert incon["vehicle_id"] == s["inconclusive_run_vehicle"] == "VEH-TR-003"
    assert failed["result"] == "fail" and incon["result"] == "inconclusive"
    # PF-TPL-01 used by exactly the two anchor runs (so 00041 is uniquely closest)
    pf01 = [r for r in ds.get("raw_test_runs").rows if r["template"] == "PF-TPL-01"]
    assert {r["run_id"] for r in pf01} == {s["failed_run"], s["inconclusive_run"]}


def test_scn005_golden_pair_similar_but_not_identical():
    ctx, ds = build_dataset("small")
    s = ctx.scenario["scenarios"]["SCN-005-HOTFIRE-ANOMALY-SIMILARITY"]
    failed_id, incon_id = s["failed_run"], s["inconclusive_run"]

    # different run ids + timestamps
    runs = {r["run_id"]: r for r in ds.get("raw_test_runs").rows}
    assert failed_id != incon_id
    assert runs[failed_id]["started_date"] != runs[incon_id]["started_date"]

    # raw readings differ (no duplicate-copy fakery)
    def raw(run_id):
        return [r["value"] for r in sorted(
            (x for x in ds.get("raw_iot_telemetry_samples").rows if x["run_id"] == run_id),
            key=lambda x: (x["channel"], x["t_offset_ms"]))]
    assert raw(failed_id) != raw(incon_id)

    # structurally similar: cosine >= threshold and < 1
    vecs = _run_vectors(ds)
    sim = waveforms.cosine(vecs[failed_id], vecs[incon_id])
    assert sim >= s["similarity_threshold"], f"cosine {sim:.4f} < {s['similarity_threshold']}"
    assert sim < s["similarity_must_be_below"], f"cosine {sim:.6f} is identical"

    # 00041 is the single most-similar run to 00088 (similarity_top1), by a clear margin —
    # the signal is the shared pre-failure trajectory, not just PF-TPL-01 being unique.
    ranked = sorted(((rid, waveforms.cosine(vecs[incon_id], v)) for rid, v in vecs.items()
                     if rid != incon_id), key=lambda kv: kv[1], reverse=True)
    assert ranked[0][0] == failed_id, f"top-1 was {ranked[0][0]} ({ranked[0][1]:.4f}), not {failed_id}"
    assert ranked[0][1] - ranked[1][1] > 0.3, (
        f"golden pair not separated: top1 {ranked[0][1]:.4f} vs next {ranked[1][1]:.4f}")
