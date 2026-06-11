"""g07 — test operations + IoT telemetry + feature windows (convo.md §4 Phase 6).

Generates test articles/types/runs, IoT sensors, raw telemetry samples (concentrated on a
few full-rate runs), limit violations, and the ML-ready feature windows. Realizes the SCN-005
hot-fire golden pair: TEST-HOTFIRE-2026-00041 (failed) and ...00088 (inconclusive, on
VEH-TR-003) both use the shared PF-TPL-01 pre-failure template, so their window-feature vectors
are highly similar (cosine >= configured threshold) yet not identical (different raw readings).

Determinism: each (run, channel) waveform is drawn from a substream seeded by run+channel; the
PF-TPL-01 base is pure math. All scenario numbers come from scenario_config.
"""

from __future__ import annotations

import datetime as _dt

import numpy as np

from .. import ids, waveforms
from ..context import BuildContext
from ..dataset import Dataset
from ..lineage import SourceSystem as SS

_SCN5 = "SCN-005-HOTFIRE-ANOMALY-SIMILARITY"
_TEST_TYPES = ["HOTFIRE", "PRESSURE", "VIBRATION", "ACCEPTANCE", "LEAK", "PROOF",
               "MODAL", "THERMAL", "STRUCTURAL", "ACTUATION", "IGNITER", "COLDFLOW",
               "BURST", "CRYO", "FLOW", "SHOCK", "EMI", "LOAD", "FATIGUE", "VACUUM",
               "PYRO", "SPIN", "SEPARATION", "QUALIFICATION"]
# non-pre_failure patterns used by ordinary runs (PF-TPL-01 is reserved for the SCN-005 pair)
_ORDINARY_PATTERNS = ["normal", "gradual_drift", "step_change", "oscillation",
                      "sensor_dropout", "false_positive"]
# samples-per-(full-rate run, channel) and windows-per-(run, channel) both come from
# scenario_config (single source of truth). With the small profile's 200 runs x 4 channels
# that yields 200*4*windows feature windows and full_rate_runs*4*samples raw samples.


def _n_samples(ctx: BuildContext) -> int:
    return int(ctx.scenario["telemetry"]["samples_per_full_run"])


def _n_windows(ctx: BuildContext) -> int:
    return int(ctx.scenario["telemetry"]["windows_per_run"])


def run(ctx: BuildContext, ds: Dataset) -> None:
    _test_types(ctx, ds)
    _test_articles(ctx, ds)
    _sensors(ctx, ds)
    runs = _test_runs(ctx, ds)
    _telemetry(ctx, ds, runs)
    _limit_violations(ctx, ds, runs)


def _test_types(ctx: BuildContext, ds: Dataset) -> None:
    n = ctx.n("test_types")
    rows = [{"test_type": t, "description": f"{t.title()} test", "scenario_id": None}
            for t in _TEST_TYPES[:n]]
    ds.add("raw_test_types", rows, key=["test_type"], source_system=SS.TEST)


def _test_articles(ctx: BuildContext, ds: Dataset) -> None:
    rng = ctx.rng("raw_test_articles")
    serials = [r["serial_id"] for r in ds.get("dim_serialized_item").rows]
    vehicles = [r["vehicle_id"] for r in ds.get("dim_vehicle").rows]
    kinds = ["engine", "tank", "subsystem", "vehicle"]
    n = ctx.n("test_articles")
    rows = []
    for i in range(n):
        rows.append({
            "article_id": ids.test_article(i + 1),
            "kind": kinds[int(rng.integers(0, len(kinds)))],
            "serial_id": serials[int(rng.integers(0, len(serials)))],
            "vehicle_id": vehicles[int(rng.integers(0, len(vehicles)))],
            "scenario_id": None,
        })
    ds.add("raw_test_articles", rows, key=["article_id"], source_system=SS.TEST)


def _sensors(ctx: BuildContext, ds: Dataset) -> None:
    rng = ctx.rng("raw_iot_sensors")
    channels = ctx.scenario["telemetry"]["channels"]
    stands = [m["machine_id"] for m in ds.get("dim_machine").rows if m["machine_type"] == "test_stand"]
    if not stands:
        stands = [m["machine_id"] for m in ds.get("dim_machine").rows[:3]]
    units = {"pressure": "psi", "temperature": "degF", "vibration_rms": "g", "flow_rate": "gpm"}
    n = ctx.n("sensors")
    rows = []
    for i in range(n):
        ch = channels[i % len(channels)]
        rows.append({
            "sensor_id": ids.sensor(i + 1),
            "channel": ch,
            "test_stand": stands[int(rng.integers(0, len(stands)))],
            "unit": units.get(ch, "raw"),
            "scenario_id": None,
        })
    ds.add("raw_iot_sensors", rows, key=["sensor_id"], source_system=SS.TEST)


def _test_runs(ctx: BuildContext, ds: Dataset) -> list[dict]:
    rng = ctx.rng("raw_test_runs")
    articles = [r["article_id"] for r in ds.get("raw_test_articles").rows]
    stands = sorted({s["test_stand"] for s in ds.get("raw_iot_sensors").rows})
    vehicles = [r["vehicle_id"] for r in ds.get("dim_vehicle").rows]
    scn5 = ctx.scenario["scenarios"][_SCN5]
    failed_id = scn5["failed_run"]            # TEST-HOTFIRE-2026-00041
    incon_id = scn5["inconclusive_run"]       # TEST-HOTFIRE-2026-00088
    incon_vehicle = scn5["inconclusive_run_vehicle"]
    template = scn5["shared_template"]        # PF-TPL-01

    n = ctx.n("test_runs")
    # Proportional allocation preserves the small profile's 90/50/30/30 split and scales.
    hotfire = max(90, round(n * 0.45))
    pressure = round(n * 0.25)
    vibration = round(n * 0.15)
    acceptance = n - hotfire - pressure - vibration
    alloc = [
        ("HOTFIRE", hotfire),
        ("PRESSURE", pressure),
        ("VIBRATION", vibration),
        ("ACCEPTANCE", acceptance),
    ]
    rows: list[dict] = []
    for ttype, cnt in alloc:
        for seq in range(1, cnt + 1):
            if len(rows) >= n:
                break
            run_id = ids.test_run(ttype, 2026, seq)
            pattern = _ORDINARY_PATTERNS[(seq + len(rows)) % len(_ORDINARY_PATTERNS)]
            tmpl = None
            result = str(rng.choice(["pass", "fail", "inconclusive"], p=[0.8, 0.13, 0.07]))
            vehicle = vehicles[int(rng.integers(0, len(vehicles)))]
            scenario = None
            # SCN-005 anchors (exact ids)
            if run_id == failed_id:
                pattern, tmpl, result, scenario = "pre_failure", template, "fail", _SCN5
            elif run_id == incon_id:
                pattern, tmpl, result, scenario = "pre_failure", template, "inconclusive", _SCN5
                vehicle = incon_vehicle
            day = int(rng.integers(180, ctx.days_span()))   # test campaign window
            start_dt = ctx.date_at(day)
            # make the two anchor runs differ in timestamp explicitly
            if run_id == failed_id:
                start_dt = _dt.date(2026, 5, 12)
            elif run_id == incon_id:
                start_dt = _dt.date(2026, 5, 30)
            rows.append({
                "run_id": run_id,
                "test_type": ttype,
                "article_id": articles[int(rng.integers(0, len(articles)))],
                "test_stand": stands[int(rng.integers(0, len(stands)))],
                "vehicle_id": vehicle,
                "started_date": start_dt.isoformat(),
                "duration_s": int(rng.integers(20, 600)),
                "result": result,
                "pattern": pattern,
                "template": tmpl,
                "scenario_id": scenario,
            })
    ds.add("raw_test_runs", rows, key=["run_id"], source_system=SS.TEST)
    return rows


def _telemetry(ctx: BuildContext, ds: Dataset, runs: list[dict]) -> None:
    channels = ctx.scenario["telemetry"]["channels"]
    n_full = min(
        len(runs),
        ctx.n("telemetry_samples") // (len(channels) * _n_samples(ctx)),
    )
    failed_id = ctx.scenario["scenarios"][_SCN5]["failed_run"]
    incon_id = ctx.scenario["scenarios"][_SCN5]["inconclusive_run"]

    runs_sorted = sorted(runs, key=lambda r: r["run_id"])
    # full-rate runs: the SCN-005 pair + a deterministic spread of others, up to n_full
    forced = [r for r in runs_sorted if r["run_id"] in (failed_id, incon_id)]
    others = [r for r in runs_sorted if r["run_id"] not in (failed_id, incon_id)]
    step = max(1, len(others) // (n_full - len(forced)))
    full_rate = {r["run_id"] for r in (forced + others[::step][: n_full - len(forced)])}

    n_windows = ctx.n("feature_windows") // (len(runs) * len(channels))
    n_samples = _n_samples(ctx)
    seg_rows: list[dict] = []
    sample_rows: list[dict] = []
    fw_rows: list[dict] = []
    seg_seq = sample_seq = fw_seq = 0

    for r in runs_sorted:
        run_id = r["run_id"]
        pattern = r["pattern"]
        is_full = run_id in full_rate
        seg_seq += 1
        seg_id = ids.telemetry_segment(seg_seq)
        seg_rows.append({
            "segment_id": seg_id, "run_id": run_id, "kind": "test",
            "start_offset_s": 0, "duration_s": r["duration_s"], "scenario_id": r["scenario_id"],
        })
        for ch in channels:
            wave = waveforms.generate(pattern, ch, n_samples, ctx.rng(f"wave:{run_id}:{ch}"))
            # raw samples only for full-rate runs
            if is_full:
                for ti in range(n_samples):
                    sample_seq += 1
                    sample_rows.append({
                        "sample_id": ids.telemetry_sample(sample_seq),
                        "run_id": run_id, "segment_id": seg_id, "channel": ch,
                        "t_offset_ms": ti * 4,
                        "value": round(float(wave[ti]), 4),
                        "scenario_id": r["scenario_id"],
                    })
            # feature windows for ALL runs
            wsize = n_samples // n_windows
            for wi in range(n_windows):
                lo = wi * wsize
                hi = n_samples if wi == n_windows - 1 else lo + wsize
                feats = waveforms.window_features(wave[lo:hi])
                fw_seq += 1
                fw_rows.append({
                    "feature_window_id": ids.feature_window(fw_seq),
                    "run_id": run_id, "channel": ch, "window_index": wi,
                    "window_start_ms": lo * 4, "window_end_ms": hi * 4,
                    "mean": feats["mean"], "std": feats["std"], "rms": feats["rms"],
                    "slope": feats["slope"], "peak_to_peak": feats["peak_to_peak"],
                    "pattern": pattern, "scenario_id": r["scenario_id"],
                })

    ds.add("raw_iot_telemetry_segments", seg_rows, key=["segment_id"], source_system=SS.IOT)
    ds.add("raw_iot_telemetry_samples", sample_rows, key=["sample_id"], source_system=SS.IOT)
    ds.add("fact_process_feature_window", fw_rows,
           key=["feature_window_id"], source_system=SS.IOT)


def _limit_violations(ctx: BuildContext, ds: Dataset, runs: list[dict]) -> None:
    rng = ctx.rng("raw_test_limit_violations")
    channels = ctx.scenario["telemetry"]["channels"]
    n = ctx.n("test_limit_violations")
    # weight violations toward fail/pre_failure runs
    weighted = []
    for r in runs:
        w = 6 if r["pattern"] == "pre_failure" else (3 if r["result"] == "fail" else 1)
        weighted.extend([r] * w)
    rows = []
    for i in range(n):
        r = weighted[int(rng.integers(0, len(weighted)))]
        ch = channels[int(rng.integers(0, len(channels)))]
        rows.append({
            "violation_id": ids.limit_violation(i + 1),
            "run_id": r["run_id"], "channel": ch,
            "limit_kind": str(rng.choice(["upper", "lower"])),
            "threshold": round(float(rng.uniform(50, 500)), 2),
            "observed": round(float(rng.uniform(50, 600)), 2),
            "scenario_id": r["scenario_id"],
        })
    ds.add("raw_test_limit_violations", rows, key=["violation_id"], source_system=SS.TEST)
