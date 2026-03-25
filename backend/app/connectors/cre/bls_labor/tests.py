from app.connectors.cre.base import ConnectorContext
from app.connectors.cre.bls_labor.fetch import fetch
from app.connectors.cre.bls_labor.parse import parse


def smoke_test() -> None:
    ctx = ConnectorContext(run_id="test", source_key="bls_labor", scope="metro", filters={})
    assert len(parse(fetch(ctx), ctx)) == 2

