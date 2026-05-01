from app.services.repe_eval_capabilities import validate_readonly_sql_contract


def test_rank_funds_contract_blocks_legacy_reads():
    violation = validate_readonly_sql_contract(
        sql_text="select * from re_fund_quarter_state where env_id = 'env'",
        capability={"forbidden_source_tables": ["re_fund_quarter_state", "re_fund_metrics_qtr"]},
        env_id="env",
    )

    assert violation is not None
    assert violation.failure_category == "legacy_source_violation"


def test_rank_funds_contract_requires_env_scope():
    violation = validate_readonly_sql_contract(
        sql_text="select * from re_authoritative_fund_state_qtr",
        capability={"forbidden_source_tables": []},
        env_id="env",
    )

    assert violation is not None
    assert violation.failure_category == "scope_violation"
