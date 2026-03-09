from __future__ import annotations

from app.connectors.opportunity.base import BaseOpportunityConnector
from app.connectors.opportunity.kalshi_markets.fetch import fetch
from app.connectors.opportunity.kalshi_markets.load import load
from app.connectors.opportunity.kalshi_markets.parse import parse

CONNECTOR = BaseOpportunityConnector(
    source_key="kalshi_markets",
    fetch_fn=fetch,
    parse_fn=parse,
    load_fn=load,
)
