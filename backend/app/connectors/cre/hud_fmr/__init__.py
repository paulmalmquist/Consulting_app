from app.connectors.cre.base import BaseConnector
from app.connectors.cre.hud_fmr.fetch import fetch
from app.connectors.cre.hud_fmr.load import load
from app.connectors.cre.hud_fmr.parse import parse

CONNECTOR = BaseConnector(source_key="hud_fmr", fetch_fn=fetch, parse_fn=parse, load_fn=load)

