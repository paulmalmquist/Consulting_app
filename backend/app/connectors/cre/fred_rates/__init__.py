from app.connectors.cre.base import BaseConnector
from app.connectors.cre.fred_rates.fetch import fetch
from app.connectors.cre.fred_rates.load import load
from app.connectors.cre.fred_rates.parse import parse

CONNECTOR = BaseConnector(source_key="fred_rates", fetch_fn=fetch, parse_fn=parse, load_fn=load)
