from app.connectors.cre.acs_5y.fetch import fetch
from app.connectors.cre.acs_5y.load import load
from app.connectors.cre.acs_5y.parse import parse
from app.connectors.cre.base import BaseConnector

CONNECTOR = BaseConnector(source_key="acs_5y", fetch_fn=fetch, parse_fn=parse, load_fn=load)

