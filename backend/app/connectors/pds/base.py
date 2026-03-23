from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any
from uuid import UUID


@dataclass
class ConnectorContext:
    env_id: UUID
    business_id: UUID
    run_id: str
    force_refresh: bool = False
    provider_config: dict[str, Any] = field(default_factory=dict)


@dataclass
class ConnectorResult:
    connector_key: str
    rows_read: int
    rows_written: int
    records: list[dict[str, Any]] = field(default_factory=list)
    comm_items: list[dict[str, Any]] = field(default_factory=list)
    raw_artifact_path: str | None = None
    token_cost: float = 0.0
    metadata: dict[str, Any] = field(default_factory=dict)


class BaseConnector:
    connector_key: str = "unknown"

    def run(self, context: ConnectorContext) -> ConnectorResult:
        raise NotImplementedError
