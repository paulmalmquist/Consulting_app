from rs_factory_seed.cli import build_dataset


def test_plm_foreign_keys_resolve():
    _ctx, ds = build_dataset("small")
    parts = {r["part_id"] for r in ds.get("dim_part").rows}
    revs = {r["revision_id"] for r in ds.get("dim_part_revision").rows}
    assert {r["part_id"] for r in ds.get("raw_plm_engineering_changes").rows} <= parts
    assert {r["part_id"] for r in ds.get("raw_plm_specs").rows} <= parts
    cur = {r["current_revision_id"] for r in ds.get("raw_plm_specs").rows if r["current_revision_id"]}
    assert cur <= revs


def test_eco_count_matches_revision_transitions():
    _ctx, ds = build_dataset("small")
    nrev = len(ds.get("dim_part_revision").rows)
    nparts = len(ds.get("dim_part").rows)
    # one ECO per (revision - first revision) of each part = nrev - nparts
    assert len(ds.get("raw_plm_engineering_changes").rows) == nrev - nparts


def test_rev_b_to_c_eco_anchor():
    _ctx, ds = build_dataset("small")
    ecos = [r for r in ds.get("raw_plm_engineering_changes").rows
            if r["part_id"] == "PART-ENG-VALVE-014"]
    bc = [r for r in ecos if r["from_rev"] == "B" and r["to_rev"] == "C"]
    assert len(bc) == 1
    assert bc[0]["scenario_id"] == "SCN-004-REV-C-YIELD-IMPROVEMENT"
    assert "yield" in bc[0]["reason"]


def test_specs_one_per_part():
    _ctx, ds = build_dataset("small")
    assert len(ds.get("raw_plm_specs").rows) == len(ds.get("dim_part").rows)
