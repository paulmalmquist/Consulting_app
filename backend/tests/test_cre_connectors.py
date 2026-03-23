"""Fixture-driven tests for CRE connector parsing."""

from __future__ import annotations

from app.connectors.cre import get_connector, list_connector_keys
from app.connectors.cre.base import ConnectorContext
from app.connectors.cre.acs_5y.fetch import fetch as fetch_acs
from app.connectors.cre.acs_5y.parse import parse as parse_acs
from app.connectors.cre.kalshi_markets.fetch import fetch as fetch_kalshi
from app.connectors.cre.kalshi_markets.parse import parse as parse_kalshi
from app.connectors.cre.tiger_geography.fetch import fetch as fetch_tiger
from app.connectors.cre.tiger_geography.parse import parse as parse_tiger


def test_connector_registry_exposes_expected_sources():
    keys = list_connector_keys()
    assert "tiger_geography" in keys
    assert "acs_5y" in keys
    assert "kalshi_markets" in keys
    assert get_connector("hud_fmr").source_key == "hud_fmr"


def test_tiger_geography_parser_returns_miami_fixture_rows():
    ctx = ConnectorContext(run_id="test", source_key="tiger_geography", scope="metro", filters={})
    rows = parse_tiger(fetch_tiger(ctx), ctx)
    assert len(rows) >= 3
    assert any(row["geoid"] == "33100" for row in rows)


def test_acs_parser_emits_metric_rows_without_network():
    ctx = ConnectorContext(run_id="test", source_key="acs_5y", scope="metro", filters={})
    rows = parse_acs(fetch_acs(ctx), ctx)
    assert any(row["metric_key"] == "median_income" for row in rows)
    assert all(row["source"] == "acs_5y" for row in rows)


def test_kalshi_parser_returns_read_only_market_probability_fixture():
    ctx = ConnectorContext(
        run_id="test",
        source_key="kalshi_markets",
        scope="national",
        filters={"question_text": "Will Miami unemployment exceed 5% by 2026-12-31?"},
    )
    rows = parse_kalshi(fetch_kalshi(ctx), ctx)
    assert len(rows) == 1
    assert 0 < rows[0]["last_traded_probability"] < 1

