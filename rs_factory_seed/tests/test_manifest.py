import json
import tempfile
from pathlib import Path

from rs_factory_seed import cli


def _build_manifest(profile="small"):
    ctx, ds = cli.build_dataset(profile)
    td = Path(tempfile.mkdtemp())
    cli._emit(ds, ctx, td)
    return ds, json.loads((td / "manifest.json").read_text(encoding="utf-8"))


def test_manifest_records_every_table_with_sha256():
    ds, m = _build_manifest()
    assert m["generator"] == "rs_factory_seed"
    assert m["generator_version"]
    assert m["as_of"] == "2026-06-08"               # fixed, not wall-clock
    assert m["table_count"] == len(ds.tables)
    assert m["total_rows"] == sum(len(t.rows) for t in ds.tables.values())
    for t in m["tables"]:
        assert t["csv_sha256"], f"{t['name']} missing sha256"
        assert "source_system" in t and t["source_system"]
        assert isinstance(t["dependency_order"], int)
    assert m["sqlite"]["dump_sha256"]


def test_manifest_carries_scenario_ids():
    _ds, m = _build_manifest()
    by_name = {t["name"]: t for t in m["tables"]}
    assert "SCN-001-VEHICLE-TR003-READINESS-BLOCKED" in by_name["dim_vehicle"]["scenario_ids"]
    assert "SCN-002-MATERIAL-LOT-ML8821-QUALITY-RISK" in by_name["dim_supplier"]["scenario_ids"]


def test_every_row_has_source_system_lineage():
    _ctx, ds = cli.build_dataset("small")
    for name in ds.names():
        for r in ds.get(name).rows:
            assert r.get("source_system"), f"{name} row missing source_system"
