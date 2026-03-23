from app.connectors.cre.base import BaseConnector
from app.connectors.cre.kalshi_markets.fetch import fetch
from app.connectors.cre.kalshi_markets.load import load
from app.connectors.cre.kalshi_markets.parse import parse

CONNECTOR = BaseConnector(
    source_key="kalshi_markets",
    fetch_fn=fetch,
    parse_fn=parse,
    load_fn=load,
)

