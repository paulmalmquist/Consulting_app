"""Git operation MCP tools — git.diff, git.commit."""

from __future__ import annotations

import subprocess
from pathlib import Path

from app.mcp.auth import McpContext
from app.mcp.registry import ToolDef, registry
from app.mcp.schemas.git_tools import GitDiffInput, GitCommitInput


def _repo_root() -> Path:
    """Resolve the repo root (parent of backend/)."""
    return Path(__file__).resolve().parents[4]


def _run_git(args: list[str], cwd: Path | None = None) -> tuple[str, str, int]:
    """Run git command and return (stdout, stderr, returncode)."""
    if cwd is None:
        cwd = _repo_root()

    result = subprocess.run(
        ["git"] + args,
        cwd=cwd,
        capture_output=True,
        text=True,
        timeout=30,
    )

    return result.stdout, result.stderr, result.returncode


def _git_diff(ctx: McpContext, inp: GitDiffInput) -> dict:
    """Get git diff output."""
    root = _repo_root()

    args = ["diff"]

    if inp.staged:
        args.append("--cached")

    args.append(inp.target)

    if inp.paths:
        args.append("--")
        args.extend(inp.paths)

    stdout, stderr, code = _run_git(args, root)

    if code != 0:
        return {
            "success": False,
            "error": stderr or "git diff failed",
            "returncode": code,
        }

    # Also get file list
    stat_args = ["diff", "--name-status"]
    if inp.staged:
        stat_args.append("--cached")
    stat_args.append(inp.target)
    if inp.paths:
        stat_args.append("--")
        stat_args.extend(inp.paths)

    stat_stdout, _, stat_code = _run_git(stat_args, root)

    changed_files = []
    if stat_code == 0 and stat_stdout:
        for line in stat_stdout.strip().split("\n"):
            if line:
                parts = line.split("\t", 1)
                if len(parts) == 2:
                    status, path = parts
                    changed_files.append({"status": status, "path": path})

    return {
        "success": True,
        "diff": stdout,
        "changed_files": changed_files,
        "file_count": len(changed_files),
    }


def _git_commit(ctx: McpContext, inp: GitCommitInput) -> dict:
    """Create a git commit."""
    root = _repo_root()

    # Stage files if specified
    if inp.add_paths:
        for path in inp.add_paths:
            stdout, stderr, code = _run_git(["add", path], root)
            if code != 0:
                return {
                    "success": False,
                    "error": f"Failed to stage {path}: {stderr}",
                    "returncode": code,
                }
    else:
        # Stage all tracked modified files
        stdout, stderr, code = _run_git(["add", "-u"], root)
        if code != 0:
            return {
                "success": False,
                "error": f"Failed to stage changes: {stderr}",
                "returncode": code,
            }

    # Get status before commit
    pre_stdout, _, _ = _run_git(["status", "--short"], root)

    # Commit with message
    # Add co-author attribution
    full_message = f"{inp.message}\n\nCo-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"

    stdout, stderr, code = _run_git(
        ["commit", "-m", full_message],
        root
    )

    if code != 0:
        return {
            "success": False,
            "error": stderr or "git commit failed",
            "returncode": code,
            "pre_commit_status": pre_stdout,
        }

    # Get the commit hash
    hash_stdout, _, hash_code = _run_git(["rev-parse", "HEAD"], root)
    commit_hash = hash_stdout.strip() if hash_code == 0 else "unknown"

    # Get post-commit status
    post_stdout, _, _ = _run_git(["status", "--short"], root)

    return {
        "success": True,
        "commit_hash": commit_hash,
        "message": inp.message,
        "commit_output": stdout,
        "pre_commit_status": pre_stdout,
        "post_commit_status": post_stdout,
    }


def register_git_tools():
    """Register git operation tools."""

    registry.register(ToolDef(
        name="git.diff",
        description="Get git diff output with optional path filtering. Does not push to remote.",
        module="git",
        permission="read",
        input_model=GitDiffInput,
        handler=_git_diff,
    ))

    registry.register(ToolDef(
        name="git.commit",
        description="Stage and commit changes with a message. Adds co-author attribution. Does not push to remote.",
        module="git",
        permission="write",
        input_model=GitCommitInput,
        handler=_git_commit,
    ))
