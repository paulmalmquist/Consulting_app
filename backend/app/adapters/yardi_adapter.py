"""Yardi GL data connector — stub for future ERP connectivity.

adapter_id: yardi-gl-draw
system_of_record: Yardi Voyager
read_scopes: gl_transactions, properties, vendors
write_scopes: [] (read-only)
"""
from __future__ import annotations

from typing import Any


class YardiAdapter:
    ADAPTER_ID = "yardi-gl-draw"
    SYSTEM_OF_RECORD = "Yardi Voyager"
    READ_SCOPES = ["gl_transactions", "properties", "vendors"]
    WRITE_SCOPES: list[str] = []

    def __init__(self, config: dict[str, Any] | None = None):
        self.config = config or {}

    def fetch_gl_balances(self, property_id: str, period: str) -> list[dict]:
        raise NotImplementedError("Yardi integration not yet configured")

    def fetch_vendor_list(self) -> list[dict]:
        raise NotImplementedError("Yardi integration not yet configured")

    def fetch_payment_history(self, vendor_id: str) -> list[dict]:
        raise NotImplementedError("Yardi integration not yet configured")
