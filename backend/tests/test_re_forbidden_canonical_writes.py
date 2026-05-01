from pathlib import Path


def test_forbidden_canonical_write_trigger_is_defined_for_snapshot_tables():
    sql = (Path(__file__).resolve().parents[2] / "repo-b/db/schema/607_winston_eval_repe_extensions.sql").read_text(encoding="utf-8")

    assert "forbidden_direct_write_canonical_table" in sql
    for table in (
        "re_authoritative_fund_state_qtr",
        "re_authoritative_investment_state_qtr",
        "re_authoritative_asset_state_qtr",
    ):
        assert table in sql
    assert "app.change_set_committing" in sql
