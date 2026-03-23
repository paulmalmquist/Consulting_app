"""Procore project data connector — stub for future integration.

adapter_id: procore-project-draw
system_of_record: Procore
read_scopes: projects, budgets, change_events, rfis
write_scopes: [] (read-only)
"""
from __future__ import annotations

from typing import Any


class ProcoreAdapter:
    ADAPTER_ID = "procore-project-draw"
    SYSTEM_OF_RECORD = "Procore"
    READ_SCOPES = ["projects", "budgets", "change_events", "rfis"]
    WRITE_SCOPES: list[str] = []

    def __init__(self, config: dict[str, Any] | None = None):
        self.config = config or {}

    def fetch_project_budget(self, procore_project_id: str) -> dict:
        raise NotImplementedError("Procore integration not yet configured")

    def fetch_change_events(self, procore_project_id: str) -> list[dict]:
        raise NotImplementedError("Procore integration not yet configured")

    def fetch_daily_logs(self, procore_project_id: str, date_range: tuple[str, str]) -> list[dict]:
        raise NotImplementedError("Procore integration not yet configured")
