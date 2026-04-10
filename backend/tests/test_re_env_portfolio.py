"""Tests for environment-level RE portfolio KPI aggregation.

After the authoritative-state lockdown (commit e2b16f33), get_portfolio_kpis
delegates released base-scenario reads to
`re_authoritative_snapshots.get_released_portfolio_kpis` and returns a fixed
"unsupported_metric_at_scope" stub for any scenario_id query. These tests
exercise the new contract.
"""

import os
import sys
import types

os.environ.setdefault("DATABASE_URL", "postgresql://test:test@localhost:5432/test")
os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-key")
os.environ.setdefault("_BM_SKIP_DB_CHECK", "1")

if "psycopg" not in sys.modules:
    psycopg_stub = types.ModuleType("psycopg")
    psycopg_stub.connect = lambda *args, **kwargs: None
    psycopg_stub.Connection = object
    psycopg_stub.rows = types.SimpleNamespace(dict_row=None)
    sys.modules["psycopg"] = psycopg_stub

if "dotenv" not in sys.modules:
    dotenv_stub = types.ModuleType("dotenv")
    dotenv_stub.load_dotenv = lambda *args, **kwargs: None
    sys.modules["dotenv"] = dotenv_stub

from app.services import re_authoritative_snapshots, re_env_portfolio


def test_delegates_base_scenario_to_authoritative_snapshot(monkeypatch):
    captured: dict = {}

    def fake_get_released_portfolio_kpis(*, env_id, business_id, quarter):
        captured["env_id"] = env_id
        captured["business_id"] = business_id
        captured["quarter"] = quarter
        return {
            "env_id": env_id,
            "business_id": business_id,
            "quarter": quarter,
            "effective_quarter": quarter,
            "fund_count": 3,
            "total_commitments": "490000000",
            "portfolio_nav": "2000000.75",
            "active_assets": 12,
            "gross_irr": "0.145",
            "net_irr": "0.118",
            "warnings": [],
            "trust_status": "trusted",
        }

    monkeypatch.setattr(
        re_authoritative_snapshots,
        "get_released_portfolio_kpis",
        fake_get_released_portfolio_kpis,
    )

    result = re_env_portfolio.get_portfolio_kpis(
        env_id="00000000-0000-0000-0000-000000000001",
        business_id="00000000-0000-0000-0000-000000000002",
        quarter="2026Q1",
    )

    assert captured == {
        "env_id": "00000000-0000-0000-0000-000000000001",
        "business_id": "00000000-0000-0000-0000-000000000002",
        "quarter": "2026Q1",
    }
    assert result["scenario_id"] is None
    assert result["fund_count"] == 3
    assert result["total_commitments"] == "490000000"
    assert result["portfolio_nav"] == "2000000.75"
    assert result["gross_irr"] == "0.145"
    # Defaults injected by the env_portfolio wrapper
    assert result["weighted_dscr"] is None
    assert result["weighted_ltv"] is None
    assert result["pct_invested"] is None


def test_scenario_id_returns_unsupported_stub_without_db(monkeypatch):
    # Make any DB call explode so we can prove the scenario path never touches it.
    def boom(*args, **kwargs):
        raise AssertionError("scenario path must not query the database")

    monkeypatch.setattr(re_env_portfolio, "get_cursor", boom)
    monkeypatch.setattr(
        re_authoritative_snapshots, "get_released_portfolio_kpis", boom
    )

    result = re_env_portfolio.get_portfolio_kpis(
        env_id="00000000-0000-0000-0000-000000000001",
        business_id="00000000-0000-0000-0000-000000000002",
        quarter="2026Q1",
        scenario_id="00000000-0000-0000-0000-000000000003",
    )

    assert result["scenario_id"] == "00000000-0000-0000-0000-000000000003"
    assert result["fund_count"] == 0
    assert result["total_commitments"] == "0"
    assert result["portfolio_nav"] is None
    assert result["gross_irr"] is None
    assert result["null_reason"] == "unsupported_metric_at_scope"
    assert result["trust_status"] == "missing_source"
    assert result["warnings"] == [
        "Authoritative portfolio KPIs are only available for released base-scenario snapshots."
    ]
