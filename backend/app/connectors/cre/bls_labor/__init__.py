from app.connectors.cre.base import BaseConnector
from app.connectors.cre.bls_labor.fetch import fetch
from app.connectors.cre.bls_labor.load import load
from app.connectors.cre.bls_labor.parse import parse

CONNECTOR = BaseConnector(source_key="bls_labor", fetch_fn=fetch, parse_fn=parse, load_fn=load)

