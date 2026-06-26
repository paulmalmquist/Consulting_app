"""Determinism + honesty invariants for the Relativity MES Sandbox synthetic seed generator.

Loads scripts/relativity_mes_seed/generate.py by path (pure stdlib, no network) and asserts the
demo guarantees: deterministic output, three vehicles, the suspect lot installed on exactly two
vehicles, the targeted NCRs/dispositions, a real cost variance, the honesty columns on every row,
and that no real Relativity / Manufacturo identifier leaks into any synthetic data row.
"""

import importlib.util
import json
from pathlib import Path

GEN_PATH = (Path(__file__).resolve().parents[2] / "scripts" / "relativity_mes_seed" / "generate.py")

spec = importlib.util.spec_from_file_location("rel_mes_generate", GEN_PATH)
gen = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gen)  # type: ignore[union-attr]

BANNED = ("relativity", "manufacturo", "terran", "aeon", "andea")
LINEAGE_COLS = ("synthetic", "source_system", "source_table", "source_pk", "ingest_batch_id", "as_of")


def _ds():
    return gen.build_dataset()


def test_deterministic():
    a = json.dumps(_ds(), sort_keys=True)
    b = json.dumps(_ds(), sort_keys=True)
    assert a == b


def test_three_vehicles():
    ds = _ds()
    serials = [v["vehicle_serial"] for v in ds["source"]["rel_mes_vehicle"]]
    assert serials == ["VEH-DEMO-001", "VEH-DEMO-002", "VEH-DEMO-003"]


def test_suspect_lot_affects_exactly_two_vehicles():
    ds = _ds()
    edges = ds["source"]["rel_mes_as_built_genealogy"]
    vehicles = sorted({e["vehicle_serial"] for e in edges if e.get("lot_no") == gen.SUSPECT_LOT})
    assert vehicles == ["VEH-DEMO-001", "VEH-DEMO-002"]
    # and the gold NCR mart agrees
    ncr = next(n for n in ds["gold"]["gold.rel_ncr_traceability"] if n["ncr_id"] == "NCR-0001")
    assert ncr["affected_vehicle_count"] == 2
    assert ncr["lot_no"] == gen.SUSPECT_LOT


def test_has_open_major_ncr():
    ds = _ds()
    ncrs = ds["source"]["rel_mes_nonconformance"]
    open_major = [n for n in ncrs if n["status"] == "open" and n["severity"] == "major"]
    assert open_major, "expected at least one open major NCR"


def test_dispositions_cover_required_types():
    ds = _ds()
    types = {d["disposition_type"] for d in ds["source"]["rel_mes_disposition"]}
    assert "rework" in types
    assert "use-as-is" in types


def test_cost_variance_present():
    ds = _ds()
    recon = ds["gold"]["gold.rel_mes_erp_reconciliation"]
    assert any(abs(r["variance_amount"]) > 0 for r in recon)
    assert any(r["reconciliation_status"] == "exception" for r in recon)


def test_overview_blocks_vehicle_with_open_ncr():
    ds = _ds()
    by_serial = {r["vehicle_serial"]: r for r in ds["gold"]["gold.rel_build_overview"]}
    assert by_serial["VEH-DEMO-001"]["readiness_state"] == "blocked"
    assert by_serial["VEH-DEMO-001"]["affected_by_suspect_lot"] is True
    assert by_serial["VEH-DEMO-003"]["affected_by_suspect_lot"] is False


def test_every_row_has_honesty_columns():
    ds = _ds()
    for table, rows in ds["source"].items():
        for r in rows:
            for col in LINEAGE_COLS:
                assert col in r, f"{table} row missing {col}"
            assert r["synthetic"] is True


def test_no_real_identifiers_in_data_rows():
    blob = json.dumps({"source": _ds()["source"], "gold": _ds()["gold"]}).lower()
    for term in BANNED:
        assert term not in blob, f"banned identifier '{term}' leaked into a synthetic data row"


def test_gold_marts_present_and_nonempty():
    ds = _ds()
    for mart in (
        "gold.rel_build_overview", "gold.rel_as_built_genealogy", "gold.rel_ncr_traceability",
        "gold.rel_build_cost_rollup", "gold.rel_mes_erp_reconciliation",
    ):
        assert ds["gold"][mart], f"{mart} is empty"
