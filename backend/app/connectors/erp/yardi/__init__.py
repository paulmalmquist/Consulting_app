"""Yardi Voyager ERP Adapter (stub).

Connects to Yardi Voyager API or database views to extract:
- Property master data → dim_property
- Tenant/lease records → dim_entity + bridge_property_entity
- Rent rolls, operating statements → fact_property_timeseries

Requires client-specific Yardi credentials and schema mapping.
"""
from app.connectors.erp.base import BaseErpAdapter, ErpAdapterContext


class YardiAdapter(BaseErpAdapter):
    """Yardi Voyager adapter stub. Implement per client engagement."""

    def extract(self, ctx: ErpAdapterContext) -> list[dict]:
        # TODO: Connect to Yardi API or database views
        # ctx.connection_config should contain: host, port, database, username, password
        raise NotImplementedError("Yardi adapter requires client-specific implementation")

    def transform(self, records: list[dict], ctx: ErpAdapterContext) -> list[dict]:
        # TODO: Map Yardi field names to intelligence graph schema
        raise NotImplementedError("Yardi field mapping requires client-specific configuration")

    def load(self, records: list[dict], ctx: ErpAdapterContext) -> int:
        # Standard load uses dim_property, dim_entity, fact_property_timeseries
        raise NotImplementedError("Yardi load requires client-specific implementation")
