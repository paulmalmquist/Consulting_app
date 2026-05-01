from pathlib import Path


def test_change_set_lifecycle_tables_are_in_single_migration():
    sql = (Path(__file__).resolve().parents[2] / "repo-b/db/schema/607_winston_eval_repe_extensions.sql").read_text(encoding="utf-8")

    for table in (
        "re_change_sets",
        "re_change_items",
        "re_change_validations",
        "re_change_impact_preview",
        "re_change_approvals",
        "re_change_audit_receipts",
    ):
        assert f"CREATE TABLE IF NOT EXISTS {table}" in sql

    for status in ("staged", "validated", "impact_computed", "approved", "committed", "rolled_back"):
        assert status in sql
