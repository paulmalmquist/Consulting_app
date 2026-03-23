"""MRI Software ERP Adapter (stub).

Connects to MRI S/W platform to extract:
- Property data → dim_property
- Lease/tenant records → dim_entity + bridge_property_entity
- GL and financial data → fact_property_timeseries

Requires client-specific MRI credentials and schema mapping.
"""
from app.connectors.erp.base import BaseErpAdapter, ErpAdapterContext


class MriAdapter(BaseErpAdapter):
    """MRI Software adapter stub. Implement per client engagement."""

    def extract(self, ctx: ErpAdapterContext) -> list[dict]:
        raise NotImplementedError("MRI adapter requires client-specific implementation")

    def transform(self, records: list[dict], ctx: ErpAdapterContext) -> list[dict]:
        raise NotImplementedError("MRI field mapping requires client-specific configuration")

    def load(self, records: list[dict], ctx: ErpAdapterContext) -> int:
        raise NotImplementedError("MRI load requires client-specific implementation")
