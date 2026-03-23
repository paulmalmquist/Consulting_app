from app.connectors.cre.base import ConnectorContext
from app.connectors.cre.hud_fmr.fetch import fetch
from app.connectors.cre.hud_fmr.parse import parse


def smoke_test() -> None:
    ctx = ConnectorContext(run_id="test", source_key="hud_fmr", scope="metro", filters={})
    rows = parse(fetch(ctx), ctx)
    assert rows[0]["metric_key"] == "fair_market_rent"

