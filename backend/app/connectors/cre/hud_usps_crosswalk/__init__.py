from app.connectors.cre.base import BaseConnector
from app.connectors.cre.hud_usps_crosswalk.fetch import fetch
from app.connectors.cre.hud_usps_crosswalk.load import load
from app.connectors.cre.hud_usps_crosswalk.parse import parse

CONNECTOR = BaseConnector(
    source_key="hud_usps_crosswalk",
    fetch_fn=fetch,
    parse_fn=parse,
    load_fn=load,
)

