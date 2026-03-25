from app.connectors.cre.base import BaseConnector
from app.connectors.cre.tiger_geography.fetch import fetch
from app.connectors.cre.tiger_geography.load import load
from app.connectors.cre.tiger_geography.parse import parse

CONNECTOR = BaseConnector(
    source_key="tiger_geography",
    fetch_fn=fetch,
    parse_fn=parse,
    load_fn=load,
)

