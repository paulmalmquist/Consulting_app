"""Environment variable management MCP tools — env.get, env.set."""

from __future__ import annotations

import os
import re
from pathlib import Path

from app.mcp.auth import McpContext
from app.mcp.registry import ToolDef, AuditPolicy, registry
from app.mcp.schemas.env_tools import EnvGetInput, EnvSetInput


def _repo_root() -> Path:
    """Resolve the repo root (parent of backend/)."""
    return Path(__file__).resolve().parents[4]


def _redact_value(value: str) -> str:
    """Redact sensitive-looking values."""
    # Patterns that indicate secrets
    secret_patterns = [
        r'(?i)(key|token|secret|password|api|auth)',
        r'^sk-',  # OpenAI keys
        r'^[A-Za-z0-9+/]{32,}={0,2}$',  # Base64-encoded values
    ]

    for pattern in secret_patterns:
        if re.search(pattern, value) or len(value) > 40:
            return "[REDACTED]"

    return value


def _parse_env_file(file_path: Path) -> dict[str, str]:
    """Parse .env file into key-value dict."""
    if not file_path.exists():
        return {}

    env_vars = {}
    with open(file_path, "r") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue

            if "=" in line:
                key, value = line.split("=", 1)
                key = key.strip()
                value = value.strip()
                # Remove quotes if present
                if value.startswith('"') and value.endswith('"'):
                    value = value[1:-1]
                elif value.startswith("'") and value.endswith("'"):
                    value = value[1:-1]
                env_vars[key] = value

    return env_vars


def _write_env_file(file_path: Path, env_vars: dict[str, str]) -> None:
    """Write env vars to file, preserving formatting."""
    lines = []

    # Preserve existing comments and structure if file exists
    existing_lines = []
    if file_path.exists():
        with open(file_path, "r") as f:
            existing_lines = f.readlines()

    # Track which keys we've written
    written_keys = set()

    # Update existing lines
    for line in existing_lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            lines.append(line.rstrip("\n"))
            continue

        if "=" in stripped:
            key = stripped.split("=", 1)[0].strip()
            if key in env_vars:
                # Update value
                value = env_vars[key]
                # Add quotes if value contains spaces or special chars
                if " " in value or any(c in value for c in ['$', '#', '&', '|']):
                    value = f'"{value}"'
                lines.append(f"{key}={value}")
                written_keys.add(key)
            else:
                # Keep unchanged
                lines.append(line.rstrip("\n"))
        else:
            lines.append(line.rstrip("\n"))

    # Add new keys at the end
    for key, value in env_vars.items():
        if key not in written_keys:
            if " " in value or any(c in value for c in ['$', '#', '&', '|']):
                value = f'"{value}"'
            lines.append(f"{key}={value}")

    # Write back
    file_path.parent.mkdir(parents=True, exist_ok=True)
    with open(file_path, "w") as f:
        f.write("\n".join(lines) + "\n")


def _get_env_file_path(scope: str) -> Path:
    """Resolve env file path from scope."""
    root = _repo_root()

    if scope == "backend/.env":
        return root / "backend" / ".env"
    elif scope == "repo-b/.env.local":
        return root / "repo-b" / ".env.local"
    else:
        raise ValueError(f"Invalid scope for file operation: {scope}")


def _env_get(ctx: McpContext, inp: EnvGetInput) -> dict:
    """Get environment variable status or value."""
    key = inp.key
    scope = inp.scope
    reveal = inp.reveal

    # Process scope - check runtime environment
    if scope == "process":
        value = os.environ.get(key)
        if value is None:
            return {
                "key": key,
                "scope": scope,
                "status": "not set",
            }

        if reveal:
            return {
                "key": key,
                "scope": scope,
                "status": "set",
                "value": _redact_value(value),
            }
        else:
            return {
                "key": key,
                "scope": scope,
                "status": "set",
            }

    # File scopes
    env_file = _get_env_file_path(scope)
    env_vars = _parse_env_file(env_file)

    if key not in env_vars:
        return {
            "key": key,
            "scope": scope,
            "status": "not set",
            "file_path": str(env_file.relative_to(_repo_root())),
        }

    value = env_vars[key]

    if reveal:
        return {
            "key": key,
            "scope": scope,
            "status": "set",
            "value": _redact_value(value),
            "file_path": str(env_file.relative_to(_repo_root())),
        }
    else:
        return {
            "key": key,
            "scope": scope,
            "status": "set",
            "file_path": str(env_file.relative_to(_repo_root())),
        }


def _env_set(ctx: McpContext, inp: EnvSetInput) -> dict:
    """Set environment variable."""
    key = inp.key
    value = inp.value
    scope = inp.scope

    # Process scope - set in runtime only (no persistence)
    if scope == "process":
        os.environ[key] = value
        return {
            "key": key,
            "scope": scope,
            "action": "set",
            "message": "Set in process environment (not persisted to file)",
        }

    # File scopes
    env_file = _get_env_file_path(scope)

    # Read existing vars
    env_vars = _parse_env_file(env_file)

    # Track if this is an update or new key
    is_update = key in env_vars

    # Update
    env_vars[key] = value

    # Write back
    _write_env_file(env_file, env_vars)

    return {
        "key": key,
        "scope": scope,
        "action": "updated" if is_update else "created",
        "file_path": str(env_file.relative_to(_repo_root())),
        "message": f"{'Updated' if is_update else 'Created'} {key} in {scope}",
    }


def register_env_tools():
    """Register environment variable tools."""

    # Audit policy that redacts secrets
    secret_audit = AuditPolicy(
        redact_keys=["value"],
        redact_value_patterns=[
            re.compile(r'sk-[A-Za-z0-9_-]{32,}'),  # API keys
            re.compile(r'[A-Za-z0-9+/]{32,}={0,2}'),  # Base64
        ],
    )

    registry.register(ToolDef(
        name="env.get",
        description="Get environment variable status (default) or value (with reveal=true). Never reveals secrets by default.",
        module="env",
        permission="read",
        input_model=EnvGetInput,
        handler=_env_get,
        audit_policy=secret_audit,
    ))

    registry.register(ToolDef(
        name="env.set",
        description="Set environment variable in file or process scope. Preserves file formatting. Never echoes values in logs.",
        module="env",
        permission="write",
        input_model=EnvSetInput,
        handler=_env_set,
        audit_policy=secret_audit,
    ))
