from app.connectors.cre.base import BaseConnector
from app.connectors.cre.building_permits.fetch import fetch
from app.connectors.cre.building_permits.load import load
from app.connectors.cre.building_permits.parse import parse

CONNECTOR = BaseConnector(source_key="building_permits", fetch_fn=fetch, parse_fn=parse, load_fn=load)
