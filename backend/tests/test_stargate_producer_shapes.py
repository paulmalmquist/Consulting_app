"""Producer signal-shape guarantees (PR 3).

These run in backend CI (numpy is a backend dependency; rs_factory_seed is in
the repo) and pin the two facts the demo depends on: physical plausibility of
every mapped channel, and the certainty that a pre_failure job crosses the
anomaly predicate so the routing beat always fires on stage.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

_STARGATE = Path(__file__).resolve().parents[2] / "scripts" / "streaming" / "stargate"
if str(_STARGATE) not in sys.path:
    sys.path.insert(0, str(_STARGATE))

pytest.importorskip("numpy")

import signal_mapping as sm  # noqa: E402
from producer import (  # noqa: E402
    BED_MAX_MM,
    BED_MIN_MM,
    JOB_PATTERNS,
    SAMPLES_PER_JOB,
    SAMPLES_PER_LAYER,
    PrintJob,
    toolpath,
)


def job_samples(pattern: str, printer_idx: int = 0, seed: int = 42):
    job_idx = JOB_PATTERNS.index(pattern)
    job = PrintJob(printer_idx, job_idx, seed)
    assert job.pattern == pattern
    return [job.sample(i) for i in range(SAMPLES_PER_JOB)]


class TestPhysicalBounds:
    def test_normal_job_stays_in_plausible_bands(self):
        for record in job_samples("normal"):
            assert 1300.0 < record["melt_pool_temp_c"] < 1700.0
            assert 0.0 <= record["arm_vibration_g"] < 0.2
            assert 15.0 < record["deposition_rate_kg_hr"] < 35.0

    def test_normal_job_never_trips_the_predicate(self):
        assert not any(
            sm.is_anomalous(r["melt_pool_temp_c"], r["arm_vibration_g"])
            for r in job_samples("normal")
        )


class TestPreFailureGuarantee:
    def test_pre_failure_job_crosses_the_predicate(self):
        hits = [
            r for r in job_samples("pre_failure")
            if sm.is_anomalous(r["melt_pool_temp_c"], r["arm_vibration_g"])
        ]
        assert hits, "pre_failure must produce at least one anomalous sample"

    def test_pre_failure_holds_across_printers_and_seeds(self):
        # The guarantee must not hinge on one lucky seed.
        for printer_idx in range(4):
            for seed in (42, 7, 20260611):
                records = [
                    PrintJob(printer_idx, JOB_PATTERNS.index("pre_failure"), seed).sample(i)
                    for i in range(SAMPLES_PER_JOB)
                ]
                assert any(
                    sm.is_anomalous(r["melt_pool_temp_c"], r["arm_vibration_g"])
                    for r in records
                ), f"printer={printer_idx} seed={seed}"


class TestToolpath:
    def test_positions_stay_on_the_bed(self):
        for i in range(0, SAMPLES_PER_JOB, 7):
            x, y, z, _layer = toolpath(i)
            assert BED_MIN_MM <= x <= BED_MAX_MM
            assert BED_MIN_MM <= y <= BED_MAX_MM
            assert z >= 0.0

    def test_z_climbs_one_layer_height_per_layer(self):
        _, _, z0, layer0 = toolpath(0)
        _, _, z1, layer1 = toolpath(SAMPLES_PER_LAYER)
        assert layer1 == layer0 + 1
        assert z1 == pytest.approx(z0 + 0.8)
