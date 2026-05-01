from pathlib import Path


MIGRATION = Path(__file__).resolve().parents[2] / "repo-b" / "db" / "schema" / "607_winston_eval_repe_extensions.sql"


def test_repe_capability_registry_seeds_legacy_forbidden_tables():
    sql = MIGRATION.read_text(encoding="utf-8")

    for capability in (
        "repe.rank_funds_by_metric_change",
        "repe.get_authoritative_fund_snapshots",
        "repe.get_metric_provenance",
        "repe.explain_unavailable_metric",
        "repe.resolve_repe_context",
    ):
        assert capability in sql

    assert '"re_fund_quarter_state","re_fund_metrics_qtr"' in sql
    assert "repe_capabilities" in sql
    assert "mutation_class IN ('read', 'stage_only', 'commit_only', 'read_and_commit')" in sql
