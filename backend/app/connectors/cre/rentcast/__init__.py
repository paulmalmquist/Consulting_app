from app.connectors.cre.base import BaseConnector
from app.connectors.cre.rentcast.fetch import fetch
from app.connectors.cre.rentcast.load import load
from app.connectors.cre.rentcast.parse import parse

CONNECTOR = BaseConnector(
    source_key="rentcast",
    fetch_fn=fetch,
    parse_fn=parse,
    load_fn=load,
)
