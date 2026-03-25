from app.connectors.cre.base import BaseConnector
from app.connectors.cre.sec_edgar.fetch import fetch
from app.connectors.cre.sec_edgar.load import load
from app.connectors.cre.sec_edgar.parse import parse

CONNECTOR = BaseConnector(source_key="sec_edgar", fetch_fn=fetch, parse_fn=parse, load_fn=load)
