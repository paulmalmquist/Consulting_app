"""Local audit logging."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .models import AppConfig, MessageRef


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def log_event(
    config: AppConfig,
    *,
    action: str,
    target: MessageRef | None,
    result: str,
    details: dict[str, Any] | None = None,
) -> None:
    record = {
        "timestamp": utc_now_iso(),
        "action": action,
        "target": target.to_dict() if target else None,
        "result": result,
        "details": details or {},
    }
    path = Path(config.log_file)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(record, sort_keys=True) + "\n")
