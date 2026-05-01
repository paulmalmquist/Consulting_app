from pathlib import Path


def test_eligible_metric_history_function_declares_required_output_contract():
    sql = (Path(__file__).resolve().parents[2] / "repo-b/db/schema/607_winston_eval_repe_extensions.sql").read_text(encoding="utf-8")

    assert "CREATE OR REPLACE FUNCTION repe.fn_eligible_metric_history" in sql
    assert "comparison_window_policy" in sql
    for column in ("eligible_periods date[]", "start_value numeric", "end_value numeric", "exclusion_reason text", "snapshot_ids uuid[]"):
        assert column in sql
