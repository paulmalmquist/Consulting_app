"""Tests for environment-level RE portfolio KPI aggregation."""

import os
import sys
import types
from contextlib import contextmanager
from decimal import Decimal

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

from app.services import re_env_portfolio


class _FakeCursor:
    def __init__(self, row: dict):
        self.row = row
        self.queries: list[tuple[str, list[str]]] = []

    def execute(self, sql: str, params: list[str]):
        self.queries.append((sql, params))

    def fetchone(self):
        return self.row


def test_returns_warning_and_null_nav_when_no_quarter_state(monkeypatch):
    cursor = _FakeCursor(
        {
            "fund_count": 3,
            "total_commitments": Decimal("490000000"),
            "portfolio_nav": None,
            "active_assets": 12,
        }
    )

    @contextmanager
    def fake_get_cursor():
        yield cursor

    monkeypatch.setattr(re_env_portfolio, "get_cursor", fake_get_cursor)

    result = re_env_portfolio.get_portfolio_kpis(
        env_id="00000000-0000-0000-0000-000000000001",
        business_id="00000000-0000-0000-0000-000000000002",
        quarter="2026Q1",
    )

    assert result["fund_count"] == 3
    assert result["total_commitments"] == "490000000"
    assert result["portfolio_nav"] is None
    assert result["active_assets"] == 12
    assert result["warnings"] == [
        "No fund quarter state rows found for quarter 2026Q1 and scenario base."
    ]


def test_serializes_numeric_values_as_strings(monkeypatch):
    cursor = _FakeCursor(
        {
            "fund_count": 2,
            "total_commitments": Decimal("1000000.50"),
            "portfolio_nav": Decimal("2000000.75"),
            "active_assets": 4,
        }
    )

    @contextmanager
    def fake_get_cursor():
        yield cursor

    monkeypatch.setattr(re_env_portfolio, "get_cursor", fake_get_cursor)

    result = re_env_portfolio.get_portfolio_kpis(
        env_id="00000000-0000-0000-0000-000000000001",
        business_id="00000000-0000-0000-0000-000000000002",
        quarter="2026Q1",
        scenario_id="00000000-0000-0000-0000-000000000003",
    )

    assert result["total_commitments"] == "1000000.50"
    assert result["portfolio_nav"] == "2000000.75"
    assert result["warnings"] == []
