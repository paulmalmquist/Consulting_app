"""Local tests for the RS Factory ML pipeline — no Databricks required.

Run from the repo root with the lane venv (numpy + pyarrow + pytest):

    python -m pytest skills/rs-factory-ml/tests -q

Fixture-dependent tests read rs_factory_seed/output (gitignored, rebuilt with
`python -m rs_factory_seed build --profile medium`) and skip when absent.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
OUTPUT = ROOT / "rs_factory_seed" / "output"
EXPORTS = ROOT / "repo-b" / "public" / "labs" / "factory-ml"

needs_fixture = pytest.mark.skipif(
    not (OUTPUT / "manifest.json").exists(),
    reason="seed fixture not built (python -m rs_factory_seed build)",
)


def load_parquet(table: str):
    pq = pytest.importorskip("pyarrow.parquet")
    return pq.read_table(OUTPUT / "parquet" / f"{table}.parquet").to_pylist()


class TestSaltedAggregationMath:
    """The salted join recombines per-salt partials (sum, sum-of-squares, max)
    into exact global stats. If this algebra is wrong the silver notebook
    silently corrupts every waveform feature — so it is pinned here in pure
    Python against the naive computation."""

    def test_partial_recombination_equals_naive(self):
        import random

        rng = random.Random(20260611)
        values = [rng.gauss(450.0, 6.0) for _ in range(10_000)]
        buckets: dict[int, list[float]] = {}
        for i, v in enumerate(values):
            buckets.setdefault(i % 16, []).append(v)

        # per-salt partials, recombined the way 02_silver_features.py does
        n = sum(len(b) for b in buckets.values())
        v_sum = sum(sum(b) for b in buckets.values())
        v_sq = sum(sum(x * x for x in b) for b in buckets.values())
        v_max = max(max(b) for b in buckets.values())
        mean_salted = v_sum / n
        std_salted = math.sqrt(v_sq / n - mean_salted ** 2)

        mean_naive = sum(values) / len(values)
        std_naive = math.sqrt(sum((x - mean_naive) ** 2 for x in values) / len(values))

        assert mean_salted == pytest.approx(mean_naive, rel=1e-12)
        assert std_salted == pytest.approx(std_naive, rel=1e-9)
        assert v_max == max(values)


@needs_fixture
class TestScenarioAnchors:
    def test_scn004_fpy_anchors_reproduce(self):
        """Rev B 0.78 / Rev C 0.91 at op level — the gold join must be able to
        rediscover the seeded yield improvement exactly."""
        ops = load_parquet("raw_mes_operation_executions")
        scn4 = [o for o in ops if o.get("scenario_id") == "SCN-004-REV-C-YIELD-IMPROVEMENT"
                and o.get("op_status") == "complete"]
        assert scn4, "no SCN-004 ops in fixture"

        inspections = load_parquet("raw_qms_inspection_results")
        op_pass = {}
        for r in inspections:
            if r["op_id"] not in op_pass:
                op_pass[r["op_id"]] = bool(r["first_pass"])

        for rev, expected in (("B", 0.78), ("C", 0.91)):
            block = [o for o in scn4 if o["op_revision"] == rev and o["op_id"] in op_pass]
            assert block, f"no inspected Rev {rev} ops"
            fpy = sum(op_pass[o["op_id"]] for o in block) / len(block)
            assert fpy == pytest.approx(expected, abs=0.005), f"Rev {rev}: {fpy}"

    def test_scn005_golden_pair_present_with_full_rate_telemetry(self):
        runs = {r["run_id"]: r for r in load_parquet("raw_test_runs")}
        failed = runs["TEST-HOTFIRE-2026-00041"]
        incon = runs["TEST-HOTFIRE-2026-00088"]
        assert failed["result"] == "fail" and incon["result"] == "inconclusive"
        assert failed["template"] == incon["template"] == "PF-TPL-01"
        assert incon["vehicle_id"] == "VEH-TR-003"

    def test_min_strength_margin_separates_pass_from_fail(self):
        """The derived regression target must order the way physics would:
        failing serials carry smaller tolerance margins than passing ones."""
        rows = load_parquet("raw_qms_inspection_results")
        margins: dict[str, dict] = {}
        for r in rows:
            if not r["tolerance"]:
                continue
            m = (r["tolerance"] - abs(r["measured_value"] - r["nominal"])) / r["tolerance"]
            entry = margins.setdefault(r["serial_id"], {"min": m, "passed": True})
            entry["min"] = min(entry["min"], m)
            entry["passed"] = entry["passed"] and bool(r["first_pass"])
        passing = [e["min"] for e in margins.values() if e["passed"]]
        failing = [e["min"] for e in margins.values() if not e["passed"]]
        assert passing and failing
        assert sum(failing) / len(failing) < sum(passing) / len(passing)
        # failing serials must include genuinely out-of-tolerance measurements
        assert min(failing) < 0

    def test_iot_samples_cover_only_a_run_subset(self):
        """Raw waveforms exist only for full-rate runs (400/1000 at medium
        profile, a handful at small) — the join is sparse with zero-sample
        keys. The silver benchmark measures naive-vs-salted on whatever the
        profile produced and logs both timings; it demonstrates the salting
        technique, it does not presume a pathological key distribution."""
        samples = load_parquet("raw_iot_telemetry_samples")
        run_count = len({s["run_id"] for s in samples})
        total_runs = len(load_parquet("raw_test_runs"))
        assert run_count < total_runs * 0.5, (
            f"{run_count}/{total_runs} runs have raw samples - expected a sparse subset")


class TestExportContracts:
    """The frontend reads exactly these shapes. Validated whenever the exports
    exist (after the first pipeline run); skipped before that."""

    REQUIRED = {
        "readiness.json": ["anchor_vehicle", "vehicles"],
        "layer_heatmap.json": ["anchor_pair", "runs"],
        "feature_importance.json": ["run_id", "drivers", "headline_metrics"],
        "model_registry.json": ["seed_registry", "live_mlflow_run"],
        "ncr_clusters.json": ["clusters"],
        "train_metadata.json": ["mlflow_run_id", "seed_build_sha", "row_counts"],
    }

    @pytest.mark.parametrize("name", sorted(REQUIRED))
    def test_export_shape(self, name):
        path = EXPORTS / name
        if not path.exists():
            pytest.skip(f"{name} not exported yet (run the pipeline)")
        payload = json.loads(path.read_text(encoding="utf-8"))
        for key in self.REQUIRED[name]:
            assert key in payload, f"{name} missing {key}"

    def test_readiness_anchor_when_present(self):
        path = EXPORTS / "readiness.json"
        if not path.exists():
            pytest.skip("readiness.json not exported yet")
        payload = json.loads(path.read_text(encoding="utf-8"))
        tr003 = next(v for v in payload["vehicles"] if v["vehicle_id"] == "VEH-TR-003")
        assert tr003["scenario_open_ncrs"] == 4
        assert tr003["status"] != "green"
