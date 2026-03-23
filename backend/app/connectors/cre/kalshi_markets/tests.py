from app.connectors.cre.base import ConnectorContext
from app.connectors.cre.kalshi_markets.fetch import fetch
from app.connectors.cre.kalshi_markets.parse import parse


def smoke_test() -> None:
    ctx = ConnectorContext(
        run_id="test",
        source_key="kalshi_markets",
        scope="national",
        filters={"question_text": "Will Miami unemployment exceed 5% by 2026-12-31?"},
    )
    rows = parse(fetch(ctx), ctx)
    assert 0 < rows[0]["last_traded_probability"] < 1

