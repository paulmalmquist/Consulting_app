from app.connectors.cre.base import BaseConnector
from app.connectors.cre.noaa_storm_events.fetch import fetch
from app.connectors.cre.noaa_storm_events.load import load
from app.connectors.cre.noaa_storm_events.parse import parse

CONNECTOR = BaseConnector(
    source_key="noaa_storm_events",
    fetch_fn=fetch,
    parse_fn=parse,
    load_fn=load,
)

