from __future__ import annotations

from datetime import date

from app.connectors.opportunity import get_connector, list_connector_keys, load_market_signal_rows
from app.connectors.opportunity.base import OpportunityConnectorContext
from app.connectors.opportunity.kalshi_markets.fetch import fetch as fetch_kalshi
from app.connectors.opportunity.kalshi_markets.parse import parse as parse_kalshi
from app.connectors.opportunity.polymarket_markets.fetch import fetch as fetch_polymarket
from app.connectors.opportunity.polymarket_markets.parse import parse as parse_polymarket


def test_connector_registry_exposes_expected_sources():
    keys = list_connector_keys()
    assert "kalshi_markets" in keys
    assert "polymarket_markets" in keys
    assert get_connector("kalshi_markets").source_key == "kalshi_markets"


def test_fixture_market_parsers_return_canonical_topics():
    ctx = OpportunityConnectorContext(
        run_id="test",
        source_key="kalshi_markets",
        mode="fixture",
        as_of_date=date(2026, 3, 9),
        filters={},
    )
    kalshi_rows = parse_kalshi(fetch_kalshi(ctx), ctx)
    polymarket_rows = parse_polymarket(
        fetch_polymarket(
            OpportunityConnectorContext(
                run_id="test",
                source_key="polymarket_markets",
                mode="fixture",
                as_of_date=date(2026, 3, 9),
                filters={},
            )
        ),
        ctx,
    )

    assert kalshi_rows
    assert polymarket_rows
    assert all(row["canonical_topic"] for row in kalshi_rows)
    assert any(row["canonical_topic"] == "rates_easing" for row in kalshi_rows)


def test_load_market_signal_rows_dedupes_fixture_signals():
    rows, stats = load_market_signal_rows(run_id="test", mode="fixture", as_of_date=date(2026, 3, 9))

    assert rows
    assert len(stats) == 2
    assert len({row["signal_key"] for row in rows}) == len(rows)
