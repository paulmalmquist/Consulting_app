"""Frontend management MCP tools — fe.edit, fe.run."""

from __future__ import annotations

import subprocess
from pathlib import Path

from app.mcp.auth import McpContext
from app.mcp.registry import ToolDef, registry
from app.mcp.schemas.fe_tools import FeEditInput, FeRunInput


def _repo_root() -> Path:
    """Resolve the repo root (parent of backend/)."""
    return Path(__file__).resolve().parents[4]


def _is_safe_fe_path(path: str) -> bool:
    """Check if path is within allowed frontend directories."""
    # Must be relative path
    if path.startswith("/") or ".." in path:
        return False

    # Must be within repo-b/src/ or repo-b/public/
    allowed_prefixes = ["repo-b/src/", "repo-b/public/", "repo-b/app/"]

    return any(path.startswith(prefix) for prefix in allowed_prefixes)


def _fe_edit(ctx: McpContext, inp: FeEditInput) -> dict:
    """Apply edits to frontend files.

    This is a placeholder that returns instructions for manual editing.
    In a full implementation, this could integrate with an AST editor or
    pass work to Codex CLI.
    """
    root = _repo_root()

    # Validate all paths
    invalid_paths = [p for p in inp.files if not _is_safe_fe_path(p)]
    if invalid_paths:
        raise PermissionError(
            f"Invalid file paths (must be in repo-b/src/, repo-b/app/, or repo-b/public/): {invalid_paths}"
        )

    # Check files exist
    missing = []
    for file_path in inp.files:
        full_path = root / file_path
        if not full_path.exists():
            missing.append(file_path)

    if missing:
        raise FileNotFoundError(f"Files not found: {missing}")

    # For now, return a dry-run result
    # In the future, this could invoke an editor or delegate to codex.task
    return {
        "action": "dry_run",
        "files": inp.files,
        "instructions": inp.instructions,
        "message": "fe.edit is a placeholder. Use codex.task for actual file editing, or edit manually.",
        "suggestion": f"Run: codex.task with prompt='{inp.instructions}' and files={inp.files}",
    }


def _fe_run(ctx: McpContext, inp: FeRunInput) -> dict:
    """Run a frontend command preset."""
    root = _repo_root()
    repo_b = root / "repo-b"

    if not repo_b.exists():
        raise FileNotFoundError("repo-b directory not found")

    # Map presets to actual commands
    command_map = {
        "lint": ["npm", "run", "lint"],
        "test": ["npm", "run", "test:e2e"],
        "typecheck": ["npx", "tsc", "--noEmit"],
        "dev": ["npm", "run", "dev"],
        "build": ["npm", "run", "build"],
    }

    cmd = command_map[inp.command_preset]

    try:
        result = subprocess.run(
            cmd,
            cwd=repo_b,
            capture_output=True,
            text=True,
            timeout=inp.timeout_sec,
        )

        return {
            "success": result.returncode == 0,
            "command": " ".join(cmd),
            "returncode": result.returncode,
            "stdout": result.stdout[-5000:] if result.stdout else "",  # Last 5KB
            "stderr": result.stderr[-5000:] if result.stderr else "",  # Last 5KB
            "truncated": len(result.stdout or "") > 5000 or len(result.stderr or "") > 5000,
        }

    except subprocess.TimeoutExpired:
        return {
            "success": False,
            "command": " ".join(cmd),
            "error": f"Command timed out after {inp.timeout_sec} seconds",
            "timeout": True,
        }
    except Exception as e:
        return {
            "success": False,
            "command": " ".join(cmd),
            "error": str(e),
        }


def register_fe_tools():
    """Register frontend management tools."""

    registry.register(ToolDef(
        name="fe.edit",
        description="Apply edits to frontend files (placeholder - currently returns suggestions). Path sandbox: repo-b/src/, repo-b/app/, repo-b/public/ only.",
        module="fe",
        permission="write",
        input_model=FeEditInput,
        handler=_fe_edit,
        tags=frozenset({"infra"}),
    ))

    registry.register(ToolDef(
        name="fe.run",
        description="Run frontend command presets: lint, test, typecheck, dev, or build. Output truncated to 5KB.",
        module="fe",
        permission="read",
        input_model=FeRunInput,
        handler=_fe_run,
        tags=frozenset({"infra"}),
    ))
