from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .contracts import validate_with_schema
from .paths import SESSIONS_DIR, ensure_runtime_dirs


@dataclass
class Session:
    payload: dict[str, Any]

    @property
    def session_id(self) -> str:
        return str(self.payload["session_id"])

    @property
    def branch(self) -> str:
        return str(self.payload["branch"])


def session_path(session_id: str) -> Path:
    return SESSIONS_DIR / f"{session_id}.json"


def create_session_payload(
    *,
    session_id: str,
    intent: str,
    model: str,
    reasoning_effort: str,
    allowed_directories: list[str],
    allowed_tools: list[str],
    max_files_per_execution: int,
    auto_approval: bool,
    risk_level: str,
) -> dict[str, Any]:
    return {
        "session_id": session_id,
        "model": model,
        "reasoning_effort": reasoning_effort,
        "branch": f"feature/{session_id}/{intent}",
        "allowed_directories": allowed_directories,
        "allowed_tools": allowed_tools,
        "max_files_per_execution": max_files_per_execution,
        "auto_approval": auto_approval,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "intent": intent,
        "risk_level": risk_level,
        "status": "active",
    }


def save_session(session: dict[str, Any], session_schema: dict[str, Any]) -> Path:
    ensure_runtime_dirs()
    validate_with_schema(session_schema, session)
    p = session_path(str(session["session_id"]))
    p.write_text(json.dumps(session, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return p


def load_session(session_id: str, session_schema: dict[str, Any]) -> Session:
    p = session_path(session_id)
    if not p.exists():
        raise FileNotFoundError(f"Missing session file: {p}")
    payload = json.loads(p.read_text(encoding="utf-8"))
    validate_with_schema(session_schema, payload)
    return Session(payload)
