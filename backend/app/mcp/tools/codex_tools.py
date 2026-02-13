"""Codex CLI delegation MCP tools — codex.task."""

from __future__ import annotations

import subprocess
import shutil
from pathlib import Path

from app.mcp.auth import McpContext
from app.mcp.registry import ToolDef, registry
from app.mcp.schemas.codex_tools import CodexTaskInput


def _repo_root() -> Path:
    """Resolve the repo root (parent of backend/)."""
    return Path(__file__).resolve().parents[4]


def _is_codex_available() -> bool:
    """Check if codex CLI is available."""
    return shutil.which("codex") is not None


def _is_safe_cwd(cwd: str) -> bool:
    """Validate that cwd is within repo root."""
    if ".." in cwd or cwd.startswith("/"):
        return False
    return True


def _codex_task(ctx: McpContext, inp: CodexTaskInput) -> dict:
    """Delegate a task to Codex CLI."""

    # Check if Codex CLI is installed
    if not _is_codex_available():
        return {
            "success": False,
            "error": "Codex CLI not found. Install from: https://developers.openai.com/codex/cli/",
            "available": False,
        }

    # Validate mode + confirm
    if inp.mode == "apply_changes" and not inp.confirm:
        raise PermissionError("codex.task with mode=apply_changes requires confirm=true")

    # Validate cwd
    if not _is_safe_cwd(inp.cwd):
        raise PermissionError(f"Invalid cwd: {inp.cwd}. Must be relative path within repo.")

    root = _repo_root()
    work_dir = root / inp.cwd

    if not work_dir.exists():
        raise FileNotFoundError(f"Working directory not found: {inp.cwd}")

    # Build constraints for Codex
    constraints = [
        "You are working in a Business Machine monorepo.",
        "Do not print or log environment variables, API keys, or secrets.",
        "Do not make network requests outside of localhost.",
        f"You may only read/write files matching these patterns: {inp.files}",
    ]

    # Build full prompt
    full_prompt = f"""
{inp.prompt}

CONSTRAINTS:
{chr(10).join(f'- {c}' for c in constraints)}

MODE: {inp.mode}
""".strip()

    # Determine Codex CLI command
    # Note: This is a placeholder. Adjust based on actual Codex CLI invocation syntax.
    # The actual command depends on Codex CLI's interface.
    # For now, we'll use a hypothetical invocation pattern.

    if inp.mode == "plan_only":
        cmd = ["codex", "plan", "--prompt", full_prompt]
    else:
        cmd = ["codex", "apply", "--prompt", full_prompt, "--yes"]

    try:
        # Run Codex CLI
        result = subprocess.run(
            cmd,
            cwd=work_dir,
            capture_output=True,
            text=True,
            timeout=inp.timeout_sec,
            env={**subprocess.os.environ, "CODEX_NO_INTERACTIVE": "1"},
        )

        # After execution, compute git diff to see what changed
        changed_files = []
        diff_output = ""

        if inp.mode == "apply_changes":
            # Get changed files
            diff_result = subprocess.run(
                ["git", "diff", "--name-status"],
                cwd=root,
                capture_output=True,
                text=True,
                timeout=10,
            )

            if diff_result.returncode == 0:
                for line in diff_result.stdout.strip().split("\n"):
                    if line:
                        parts = line.split("\t", 1)
                        if len(parts) == 2:
                            status, path = parts
                            # Filter to allowlisted files
                            if any(Path(path).match(pattern) for pattern in inp.files):
                                changed_files.append({"status": status, "path": path})

            # Get full diff
            diff_full_result = subprocess.run(
                ["git", "diff"],
                cwd=root,
                capture_output=True,
                text=True,
                timeout=10,
            )
            if diff_full_result.returncode == 0:
                diff_output = diff_full_result.stdout[:10000]  # Limit to 10KB

        return {
            "success": result.returncode == 0,
            "mode": inp.mode,
            "returncode": result.returncode,
            "stdout": result.stdout[-5000:] if result.stdout else "",  # Last 5KB
            "stderr": result.stderr[-5000:] if result.stderr else "",
            "changed_files": changed_files,
            "diff": diff_output if diff_output else None,
            "truncated": len(result.stdout or "") > 5000 or len(result.stderr or "") > 5000,
        }

    except subprocess.TimeoutExpired:
        return {
            "success": False,
            "error": f"Codex CLI timed out after {inp.timeout_sec} seconds",
            "timeout": True,
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
        }


def register_codex_tools():
    """Register Codex CLI delegation tools."""

    registry.register(ToolDef(
        name="codex.task",
        description="Delegate a task to Codex CLI (OpenAI Codex). Supports plan_only (safe) or apply_changes (writes files). File allowlist enforced. Returns diff of changes.",
        module="codex",
        permission="write",
        input_model=CodexTaskInput,
        handler=_codex_task,
    ))
