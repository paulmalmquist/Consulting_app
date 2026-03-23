"""Base ERP Adapter interface."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any
from uuid import UUID


@dataclass(slots=True)
class ErpAdapterContext:
    env_id: UUID
    business_id: UUID
    connection_config: dict[str, Any]
    sync_mode: str  # 'full' | 'incremental'
    high_water_mark: datetime | None = None


class BaseErpAdapter:
    """Abstract base for ERP adapters.

    Subclasses implement extract/transform/load for their specific ERP.
    Data flows into the CRE intelligence graph tables:
    - Property master → dim_property
    - Tenant/lease data → dim_entity (tenant) + bridge_property_entity
    - Financial data → fact_property_timeseries
    """

    def extract(self, ctx: ErpAdapterContext) -> list[dict]:
        """Pull raw records from the ERP system."""
        raise NotImplementedError

    def transform(self, records: list[dict], ctx: ErpAdapterContext) -> list[dict]:
        """Map ERP-specific fields to intelligence graph schema."""
        raise NotImplementedError

    def load(self, records: list[dict], ctx: ErpAdapterContext) -> int:
        """Write transformed records to the intelligence graph tables."""
        raise NotImplementedError

    def run(self, ctx: ErpAdapterContext) -> dict:
        """Execute full ETL cycle."""
        raw = self.extract(ctx)
        transformed = self.transform(raw, ctx)
        loaded = self.load(transformed, ctx)
        return {"extracted": len(raw), "transformed": len(transformed), "loaded": loaded}
