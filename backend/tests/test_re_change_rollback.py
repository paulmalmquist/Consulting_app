from pathlib import Path


def test_rollback_tool_and_receipt_columns_are_registered():
    sql = (Path(__file__).resolve().parents[2] / "repo-b/db/schema/607_winston_eval_repe_extensions.sql").read_text(encoding="utf-8")

    assert "repe.rollback_change" in sql
    assert "rollback_token" in sql
    assert "rolled_back_at" in sql
