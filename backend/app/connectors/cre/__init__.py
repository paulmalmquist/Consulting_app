from __future__ import annotations

from app.connectors.cre.acs_5y import CONNECTOR as ACS_5Y_CONNECTOR
from app.connectors.cre.bls_labor import CONNECTOR as BLS_LABOR_CONNECTOR
from app.connectors.cre.hud_fmr import CONNECTOR as HUD_FMR_CONNECTOR
from app.connectors.cre.hud_usps_crosswalk import CONNECTOR as HUD_USPS_CONNECTOR
from app.connectors.cre.kalshi_markets import CONNECTOR as KALSHI_CONNECTOR
from app.connectors.cre.noaa_storm_events import CONNECTOR as NOAA_CONNECTOR
from app.connectors.cre.county_assessor import CONNECTOR as COUNTY_ASSESSOR_CONNECTOR
from app.connectors.cre.tiger_geography import CONNECTOR as TIGER_CONNECTOR

_CONNECTORS = {
    TIGER_CONNECTOR.source_key: TIGER_CONNECTOR,
    ACS_5Y_CONNECTOR.source_key: ACS_5Y_CONNECTOR,
    BLS_LABOR_CONNECTOR.source_key: BLS_LABOR_CONNECTOR,
    HUD_FMR_CONNECTOR.source_key: HUD_FMR_CONNECTOR,
    HUD_USPS_CONNECTOR.source_key: HUD_USPS_CONNECTOR,
    NOAA_CONNECTOR.source_key: NOAA_CONNECTOR,
    KALSHI_CONNECTOR.source_key: KALSHI_CONNECTOR,
    COUNTY_ASSESSOR_CONNECTOR.source_key: COUNTY_ASSESSOR_CONNECTOR,
}


def get_connector(source_key: str):
    connector = _CONNECTORS.get(source_key)
    if not connector:
        raise ValueError(f"Unknown connector: {source_key}")
    return connector


def list_connector_keys() -> list[str]:
    return sorted(_CONNECTORS.keys())

