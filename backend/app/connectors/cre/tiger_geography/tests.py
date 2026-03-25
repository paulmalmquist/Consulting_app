from app.connectors.cre.base import ConnectorContext
from app.connectors.cre.tiger_geography.fetch import fetch
from app.connectors.cre.tiger_geography.parse import parse


def smoke_test() -> None:
    ctx = ConnectorContext(run_id="test", source_key="tiger_geography", scope="metro", filters={})
    assert len(parse(fetch(ctx), ctx)) >= 3

