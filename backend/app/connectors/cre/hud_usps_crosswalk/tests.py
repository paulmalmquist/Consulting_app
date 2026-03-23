from app.connectors.cre.base import ConnectorContext
from app.connectors.cre.hud_usps_crosswalk.fetch import fetch
from app.connectors.cre.hud_usps_crosswalk.parse import parse


def smoke_test() -> None:
    ctx = ConnectorContext(run_id="test", source_key="hud_usps_crosswalk", scope="metro", filters={})
    assert len(parse(fetch(ctx), ctx)) == 2

