from eval_loop.scenario_loader import load_scenarios, scenario_enabled_for_environment
from eval_loop.regression_store import RegressionStore


def test_environment_filter_keeps_meridian_isolated() -> None:
    scenarios = load_scenarios(mode="smoke", environment="meridian")
    ids = {scenario["id"] for scenario in scenarios}

    assert "env_identity_meridian" in ids
    assert "env_identity_novendor" not in ids
    assert "missing_context_downside_asset" not in ids
    assert all(
        scenario.get("environment") == "meridian"
        or scenario_enabled_for_environment(scenario, "meridian")
        for scenario in scenarios
    )


def test_environment_filter_keeps_novendor_isolated() -> None:
    scenarios = load_scenarios(mode="smoke", environment="novendor")
    ids = {scenario["id"] for scenario in scenarios}

    assert "env_identity_novendor" in ids
    assert "operator_readiness_novendor" in ids
    assert "env_identity_meridian" not in ids
    assert "missing_context_downside_asset" not in ids


def test_assistant_scenarios_default_to_canonical_runtime_contract() -> None:
    scenarios = load_scenarios(mode="smoke", environment="meridian")
    assistant = next(s for s in scenarios if s["id"] == "env_identity_meridian")

    assert assistant["expected"]["runtime_identity_required"] is True
    assert assistant["expected"]["runtime_path"] == "canonical"


def test_regression_store_keeps_latest_run_ids_env_scoped(tmp_path) -> None:
    store = RegressionStore(tmp_path / "eval_loop.db")
    try:
        store.insert_summary({
            "run_id": "run_meridian",
            "cycle": 1,
            "suite": "smoke",
            "environment": "meridian",
            "scenario_count": 1,
            "passed_count": 1,
            "failed_count": 0,
        })
        store.insert_summary({
            "run_id": "run_novendor",
            "cycle": 1,
            "suite": "smoke",
            "environment": "novendor",
            "scenario_count": 1,
            "passed_count": 0,
            "failed_count": 1,
        })

        assert store.latest_run_id(suite="smoke", environment="meridian") == "run_meridian"
        assert store.latest_run_id(suite="smoke", environment="novendor") == "run_novendor"
        assert store.last_good_run_id(suite="smoke", environment="meridian") == "run_meridian"
    finally:
        store.close()
