from __future__ import annotations

from app.connectors.opportunity.base import BaseOpportunityConnector
from app.connectors.opportunity.polymarket_markets.fetch import fetch
from app.connectors.opportunity.polymarket_markets.load import load
from app.connectors.opportunity.polymarket_markets.parse import parse

CONNECTOR = BaseOpportunityConnector(
    source_key="polymarket_markets",
    fetch_fn=fetch,
    parse_fn=parse,
    load_fn=load,
)
