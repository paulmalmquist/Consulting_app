from __future__ import annotations

from app.connectors.pds.base import BaseConnector
from app.connectors.pds.pds_internal_crm import CONNECTOR as CRM_CONNECTOR
from app.connectors.pds.pds_internal_finance import CONNECTOR as FINANCE_CONNECTOR
from app.connectors.pds.pds_internal_portfolio import CONNECTOR as PORTFOLIO_CONNECTOR
from app.connectors.pds.pds_m365_calendar import CONNECTOR as M365_CALENDAR_CONNECTOR
from app.connectors.pds.pds_m365_mail import CONNECTOR as M365_MAIL_CONNECTOR
from app.connectors.pds.pds_market_external import CONNECTOR as MARKET_CONNECTOR

_CONNECTORS: dict[str, BaseConnector] = {
    PORTFOLIO_CONNECTOR.connector_key: PORTFOLIO_CONNECTOR,
    CRM_CONNECTOR.connector_key: CRM_CONNECTOR,
    FINANCE_CONNECTOR.connector_key: FINANCE_CONNECTOR,
    M365_MAIL_CONNECTOR.connector_key: M365_MAIL_CONNECTOR,
    M365_CALENDAR_CONNECTOR.connector_key: M365_CALENDAR_CONNECTOR,
    MARKET_CONNECTOR.connector_key: MARKET_CONNECTOR,
}


def get_connector(connector_key: str) -> BaseConnector:
    connector = _CONNECTORS.get(connector_key)
    if not connector:
        raise ValueError(f"Unknown PDS connector: {connector_key}")
    return connector


def list_connector_keys() -> list[str]:
    return sorted(_CONNECTORS.keys())
