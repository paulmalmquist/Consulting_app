from pathlib import Path


def test_resolve_context_tool_uses_canonical_repe_entity_tables():
    sql = (Path(__file__).resolve().parents[2] / "repo-b/db/schema/607_winston_eval_repe_extensions.sql").read_text(encoding="utf-8")

    assert "repe.resolve_repe_context" in sql
    assert '"repe_fund","repe_deal","repe_asset","repe_entity"' in sql
