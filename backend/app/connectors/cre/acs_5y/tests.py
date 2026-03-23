from app.connectors.cre.acs_5y.fetch import fetch
from app.connectors.cre.acs_5y.parse import parse
from app.connectors.cre.base import ConnectorContext


def smoke_test() -> None:
    ctx = ConnectorContext(run_id="test", source_key="acs_5y", scope="metro", filters={})
    rows = parse(fetch(ctx), ctx)
    assert any(row["metric_key"] == "median_income" for row in rows)

