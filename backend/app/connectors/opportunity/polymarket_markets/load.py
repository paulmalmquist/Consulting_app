from __future__ import annotations

from app.connectors.opportunity.base import OpportunityConnectorContext


def load(records: list[dict], _context: OpportunityConnectorContext) -> int:
    return len(records)
