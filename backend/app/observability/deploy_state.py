from __future__ import annotations

import os
import sys
from dataclasses import dataclass, field
from urllib.parse import urlparse


@dataclass
class DeployState:
    booted_at: str
    git_sha: str | None
    db_fingerprint: str | None
    schema_contract_ok: bool
    schema_issues: list[str] = field(default_factory=list)
    db_connected: bool = False
    migration_head_in_code: str | None = None
    startup_duration_ms: int | None = None
    assistant_boot_enabled: bool = False

    def to_dict(self) -> dict:
        return {
            "ready": self.db_connected and self.schema_contract_ok,
            "booted_at": self.booted_at,
            "git_sha": self.git_sha,
            "db_fingerprint": self.db_fingerprint,
            "db_connected": self.db_connected,
            "schema_contract_ok": self.schema_contract_ok,
            "schema_issues": self.schema_issues,
            "migration_head_in_code": self.migration_head_in_code,
            "startup_duration_ms": self.startup_duration_ms,
            "assistant_boot_enabled": self.assistant_boot_enabled,
        }


_state: DeployState | None = None


def get_deploy_state() -> DeployState | None:
    return _state


def set_deploy_state(state: DeployState) -> None:
    global _state
    _state = state


def is_ready() -> bool:
    return _state is not None and _state.db_connected and _state.schema_contract_ok


def resolve_git_sha() -> str | None:
    return os.environ.get("RAILWAY_GIT_COMMIT_SHA") or None


def resolve_db_fingerprint() -> str | None:
    url = os.environ.get("DATABASE_URL", "")
    if not url:
        return None
    try:
        parsed = urlparse(url)
        host = parsed.hostname or "unknown"
        port = parsed.port or 5432
        dbname = (parsed.path or "").lstrip("/") or "unknown"
        return f"{host}:{port}/{dbname}"
    except Exception:
        return "parse_error"


def resolve_python_version() -> str:
    return f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}"
