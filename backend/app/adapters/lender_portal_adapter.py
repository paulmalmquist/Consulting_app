"""Lender portal submission connector — stub for future integration.

adapter_id: lender-portal-draw
system_of_record: Lender Portal
read_scopes: draw_status, funding_history
write_scopes: draw_submission (HITL REQUIRED for all writes)
"""
from __future__ import annotations

from typing import Any


class LenderPortalAdapter:
    ADAPTER_ID = "lender-portal-draw"
    SYSTEM_OF_RECORD = "Lender Portal"
    READ_SCOPES = ["draw_status", "funding_history"]
    WRITE_SCOPES = ["draw_submission"]

    def __init__(self, config: dict[str, Any] | None = None):
        self.config = config or {}

    def submit_draw_package(self, draw_id: str, pdf_path: str, hitl_metadata: dict[str, Any] | None = None) -> dict:
        """Submit draw package to lender. HITL approval metadata required."""
        if not hitl_metadata or not hitl_metadata.get("approved_by"):
            raise ValueError("HITL approval metadata required for lender submission")
        raise NotImplementedError("Lender portal integration not yet configured")

    def check_draw_status(self, external_draw_id: str) -> dict:
        raise NotImplementedError("Lender portal integration not yet configured")

    def fetch_funding_history(self, project_ref: str) -> list[dict]:
        raise NotImplementedError("Lender portal integration not yet configured")
