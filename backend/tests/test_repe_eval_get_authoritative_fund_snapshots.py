from pathlib import Path


def test_authoritative_snapshot_capability_requires_released_source_table():
    sql = (Path(__file__).resolve().parents[2] / "repo-b/db/schema/607_winston_eval_repe_extensions.sql").read_text(encoding="utf-8")

    assert "repe.get_authoritative_fund_snapshots" in sql
    assert '"re_authoritative_fund_state_qtr"' in sql
    assert "'released'" in sql
