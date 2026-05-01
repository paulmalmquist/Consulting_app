from app.services.winston_eval_runner import grade_repe_eval_observation


def test_all_null_brutal_case_passes_when_fail_closed_with_coverage_and_hash():
    observation = {
        "capability_called": "repe.rank_funds_by_metric_change",
        "source_tables_used": ["re_authoritative_fund_state_qtr"],
        "data_snapshot_hash": "abc123",
        "comparison_result": {
            "coverage": {"total": 3, "included": 0, "excluded": 3, "by_reason": {"null_metric": 3}},
        },
        "coverage": {"total": 3, "included": 0, "excluded": 3, "by_reason": {"null_metric": 3}},
    }
    scenario = {"expected_capability": "repe.rank_funds_by_metric_change"}

    grade = grade_repe_eval_observation(observation, scenario)

    assert grade["pass_fail"] == "pass"
    assert grade["failure_category"] is None
