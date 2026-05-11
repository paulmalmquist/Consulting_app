from __future__ import annotations

from datetime import date
import importlib.util
from pathlib import Path

import pytest

from app.services import trading_analytics as svc

_SEED_SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "seed_trading_analytics_demo.py"
_SPEC = importlib.util.spec_from_file_location("seed_trading_analytics_demo", _SEED_SCRIPT)
assert _SPEC and _SPEC.loader
_seed_module = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(_seed_module)
build_demo_market_rows = _seed_module.build_demo_market_rows
build_demo_feature_rows = _seed_module.build_demo_feature_rows


ENV_ID = "11111111-1111-1111-1111-111111111111"


@pytest.fixture(scope="module")
def seeded_rows():
    return build_demo_market_rows(as_of=date(2026, 5, 8), years=6)


@pytest.fixture
def patch_rows(monkeypatch, seeded_rows):
    monkeypatch.setattr(svc, "_load_market_rows", lambda env_id, symbols=None, start_date=None, end_date=None: [
        row for row in seeded_rows
        if symbols is None or row["symbol"] in symbols
    ])
    monkeypatch.setattr(svc, "_load_feature_summary", lambda env_id: {"row_count": 1200, "feature_count": 3, "min_date": "2020-05-08", "max_date": "2026-05-08"})
    monkeypatch.setattr(svc, "_count_table", lambda env_id, table: 2 if table == "trading_analytics_runs" else 1)
    monkeypatch.setattr(svc, "record_analytics_run", lambda *args, **kwargs: "run-test")


def test_seed_data_includes_expected_symbols(seeded_rows):
    symbols = {row["symbol"] for row in seeded_rows}
    assert set(svc.EXPECTED_SERIES).issubset(symbols)
    feature_rows = build_demo_feature_rows(seeded_rows)
    assert feature_rows
    assert {row["feature_name"] for row in feature_rows} >= {"log_return_1d", "z_score_252d", "rolling_vol_30d"}


def test_pipeline_health_returns_layer_statuses(patch_rows):
    result = svc.get_pipeline_health(ENV_ID)
    assert result["available"] is True
    assert [layer["name"] for layer in result["layers"]] == ["Bronze", "Silver", "Gold"]
    assert result["layers"][0]["row_count"] > 0
    assert result["market_overview"][0]["source"] == "demo_fixture:v1"


def test_seasonality_computes_with_enough_data(patch_rows):
    result = svc.compute_seasonality(ENV_ID, "HH_GAS", 5, persist=True)
    assert result["available"] is True
    assert result["run_id"] == "run-test"
    assert result["latest"]["seasonal_percentile"] is not None
    assert result["chart"]


def test_correlation_computes_and_threshold_fails(monkeypatch, seeded_rows, patch_rows):
    result = svc.compute_rolling_correlation(ENV_ID, "WTI", "BRENT", 60, persist=True)
    assert result["available"] is True
    assert result["stats"]["latest"] is not None

    small_rows = [row for row in seeded_rows if row["symbol"] in {"WTI", "BRENT"}][:120]
    monkeypatch.setattr(svc, "_load_market_rows", lambda env_id, symbols=None, start_date=None, end_date=None: small_rows)
    result = svc.compute_rolling_correlation(ENV_ID, "WTI", "BRENT", 60, persist=True)
    assert result["available"] is False
    assert "window_days + 20" in result["unavailable_reason"]


def test_regression_scenario_and_analogs_compute(patch_rows):
    regression = svc.run_factor_regression(ENV_ID, "WTI", ["DXY_PROXY", "UST10Y", "VIX", "CRUDE_INVENTORY_PROXY"], persist=True)
    assert regression["available"] is True
    assert regression["n_obs"] >= 120
    assert regression["r_squared"] is not None
    assert regression["coefficients"]

    scenario = svc.run_scenario_model(
        ENV_ID,
        "WTI",
        {"inventory_shock": 5, "dxy_shock": 1, "rate_shock": 10, "volatility_shock": 2, "storage_shock": 25},
        persist=True,
    )
    assert scenario["available"] is True
    assert scenario["directional_pressure"] in {"bullish", "bearish", "neutral"}
    assert len(scenario["sensitivity_table"]) == 5

    analogs = svc.find_historical_analogs(ENV_ID, "WTI", 60, 5, persist=True)
    assert analogs["available"] is True
    assert len(analogs["analogs"]) == 5
    assert analogs["engine_label"] == "demo analog engine"


def test_regression_and_analog_thresholds_fail_closed(monkeypatch, seeded_rows, patch_rows):
    small_rows = seeded_rows[:900]
    monkeypatch.setattr(svc, "_load_market_rows", lambda env_id, symbols=None, start_date=None, end_date=None: [
        row for row in small_rows
        if symbols is None or row["symbol"] in symbols
    ])
    regression = svc.run_factor_regression(ENV_ID, "WTI", ["DXY_PROXY", "UST10Y", "VIX"], persist=True)
    assert regression["available"] is False
    assert "120 aligned observations" in regression["unavailable_reason"]

    analogs = svc.find_historical_analogs(ENV_ID, "WTI", 60, 5, persist=True)
    assert analogs["available"] is False
    assert "250 aligned observations" in analogs["unavailable_reason"]


def test_memo_persists_with_fake_cursor(fake_cursor):
    fake_cursor.push_result([{"id": "run-1"}])
    fake_cursor.push_result([{"id": "memo-1", "created_at": "2026-05-09T12:00:00Z"}])
    payload = {
        "available": True,
        "run_type": "regression",
        "r_squared": 0.42,
        "n_obs": 252,
        "coefficients": [{"factor": "DXY_PROXY", "coefficient": -0.2}],
        "source": {"series_source": "demo_fixture:v1", "latest_observation_date": "2026-05-08", "staleness_status": "fresh"},
        "warnings": [],
    }
    memo = svc.generate_desk_memo(ENV_ID, "Generate a trader-facing memo with evidence and caveats.", payload)
    assert memo["id"] == "memo-1"
    assert "Question asked" in memo["memo_md"]
    assert any("trading_memos" in query for query, _params in fake_cursor.queries)


def test_copilot_routes_known_prompts_without_ai(monkeypatch, patch_rows):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("AI_GATEWAY_ENABLED", raising=False)

    seasonality = svc.ask_trading_copilot(ENV_ID, "Show 5-year natural gas seasonality and where current price sits by percentile.")
    assert seasonality["tool_used"] == "seasonality"
    assert seasonality["ai_available"] is False
    assert seasonality["available"] is True

    corr = svc.ask_trading_copilot(ENV_ID, "Run rolling 60-day correlation between WTI and Brent.")
    assert corr["tool_used"] == "rolling_correlation"
    assert corr["available"] is True

    regression = svc.ask_trading_copilot(ENV_ID, "Run a regression of WTI returns against DXY, rates, VIX, and inventory.")
    assert regression["tool_used"] == "regression"
    assert regression["available"] is True

    unknown = svc.ask_trading_copilot(ENV_ID, "Can you trade this for me?")
    assert unknown["tool_used"] == "unsupported"
    assert "seasonality" in unknown["unsupported_capabilities"]
