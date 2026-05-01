from pathlib import Path


def test_classify_unavailable_metric_function_contains_locked_reason_taxonomy():
    sql = (Path(__file__).resolve().parents[2] / "repo-b/db/schema/607_winston_eval_repe_extensions.sql").read_text(encoding="utf-8")

    assert "CREATE OR REPLACE FUNCTION repe.fn_classify_unavailable_metric" in sql
    for reason in (
        "unsupported_metric",
        "draft_only_snapshot",
        "no_released_snapshot",
        "scope_violation",
        "null_metric",
    ):
        assert reason in sql
