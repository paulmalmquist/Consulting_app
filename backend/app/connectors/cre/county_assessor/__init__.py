from app.connectors.cre.base import BaseConnector
from app.connectors.cre.county_assessor.fetch import fetch
from app.connectors.cre.county_assessor.load import load
from app.connectors.cre.county_assessor.parse import parse

CONNECTOR = BaseConnector(
    source_key="county_assessor",
    fetch_fn=fetch,
    parse_fn=parse,
    load_fn=load,
)
