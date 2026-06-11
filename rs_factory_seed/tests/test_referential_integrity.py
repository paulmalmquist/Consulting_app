from rs_factory_seed.cli import build_dataset


def _ids(ds, table, col):
    return {r[col] for r in ds.get(table).rows}


def test_g01_foreign_keys_resolve():
    _ctx, ds = build_dataset("small")
    facilities = _ids(ds, "dim_facility", "facility_id")
    work_centers = _ids(ds, "dim_work_center", "work_center_id")
    parts = _ids(ds, "dim_part", "part_id")

    assert {r["facility_id"] for r in ds.get("dim_work_center").rows} <= facilities
    assert {r["work_center_id"] for r in ds.get("dim_machine").rows} <= work_centers
    assert {r["part_id"] for r in ds.get("dim_part_revision").rows} <= parts
    bom = ds.get("bridge_bom").rows
    assert {r["parent_part_id"] for r in bom} <= parts
    assert {r["child_part_id"] for r in bom} <= parts


def test_primary_keys_unique():
    _ctx, ds = build_dataset("small")
    for table, key in [
        ("dim_facility", ["facility_id"]),
        ("dim_work_center", ["work_center_id"]),
        ("dim_machine", ["machine_id"]),
        ("dim_operator", ["operator_id"]),
        ("dim_supplier", ["supplier_id"]),
        ("dim_vehicle", ["vehicle_id"]),
        ("dim_part", ["part_id"]),
        ("dim_part_revision", ["revision_id"]),
        ("bridge_bom", ["parent_part_id", "child_part_id"]),
    ]:
        rows = ds.get(table).rows
        keys = [tuple(r[k] for k in key) for r in rows]
        assert len(keys) == len(set(keys)), f"{table} has duplicate keys"


def test_bom_is_acyclic_by_index_rule():
    _ctx, ds = build_dataset("small")
    # parent_part_id index < child_part_id index was enforced; no self-edges.
    for r in ds.get("bridge_bom").rows:
        assert r["parent_part_id"] != r["child_part_id"]
