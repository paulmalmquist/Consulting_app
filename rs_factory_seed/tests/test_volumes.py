from rs_factory_seed.cli import build_dataset


def test_master_data_volumes_match_small_profile():
    _ctx, ds = build_dataset("small")
    exact = {
        "dim_facility": 4,
        "dim_work_center": 14,
        "dim_machine": 50,
        "dim_operator": 90,
        "dim_supplier": 30,
        "dim_customer": 8,
        "dim_vehicle": 4,
        "dim_part": 150,
    }
    for table, n in exact.items():
        assert len(ds.get(table).rows) == n, f"{table} expected {n}, got {len(ds.get(table).rows)}"

    # revisions: 1..4 per part → between parts and 4*parts
    nparts = len(ds.get("dim_part").rows)
    nrev = len(ds.get("dim_part_revision").rows)
    assert nparts <= nrev <= 4 * nparts

    # bom capped at target
    assert len(ds.get("bridge_bom").rows) <= 1000
