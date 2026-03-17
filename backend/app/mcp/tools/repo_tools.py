"""Repo context helper MCP tools — repo.search_files, repo.read_file."""

from __future__ import annotations

import fnmatch
import os
import re
from pathlib import Path

from app.config import MCP_ALLOWED_REPO_ROOTS, MCP_DENY_GLOBS
from app.mcp.auth import McpContext
from app.mcp.registry import ToolDef, registry
from app.mcp.schemas.repo_tools import SearchFilesInput, ReadFileInput


def _repo_root() -> Path:
    """Resolve the repo root (parent of backend/)."""
    return Path(__file__).resolve().parents[3]


def _is_allowed_path(path: str) -> bool:
    """Check path against allowlist roots and denylist globs."""
    rel = path
    # Check allowlist
    root_match = any(
        rel.startswith(root) or rel.startswith(f"./{root}")
        for root in MCP_ALLOWED_REPO_ROOTS
    )
    if not root_match:
        return False

    # Check denylist
    for pattern in MCP_DENY_GLOBS:
        if fnmatch.fnmatch(rel, pattern):
            return False
        if fnmatch.fnmatch(os.path.basename(rel), pattern):
            return False
    return True


def _is_binary(path: Path) -> bool:
    """Quick check if a file is binary."""
    try:
        with open(path, "rb") as f:
            chunk = f.read(1024)
            return b"\x00" in chunk
    except Exception:
        return True


def _search_files(ctx: McpContext, inp: SearchFilesInput) -> dict:
    root = _repo_root()
    allowed_roots = inp.roots or MCP_ALLOWED_REPO_ROOTS

    # Validate roots are subset of config
    for r in allowed_roots:
        if r not in MCP_ALLOWED_REPO_ROOTS:
            raise ValueError(f"Root '{r}' is not in allowed repo roots")

    matches = []
    total_bytes = 0
    query_pattern = re.compile(re.escape(inp.query), re.IGNORECASE)

    for allowed_root in allowed_roots:
        search_dir = root / allowed_root
        if not search_dir.exists():
            continue

        for dirpath, dirnames, filenames in os.walk(search_dir):
            # Skip denied directories
            dirnames[:] = [
                d for d in dirnames
                if not any(
                    fnmatch.fnmatch(d, p.rstrip("/").split("/")[-1])
                    for p in MCP_DENY_GLOBS
                )
            ]

            if len(matches) >= inp.max_files:
                break

            for fname in filenames:
                if len(matches) >= inp.max_matches:
                    break
                if total_bytes >= inp.max_bytes:
                    break

                fpath = Path(dirpath) / fname
                rel_path = str(fpath.relative_to(root))

                if not _is_allowed_path(rel_path):
                    continue
                if _is_binary(fpath):
                    continue

                try:
                    text = fpath.read_text(errors="replace")
                except Exception:
                    continue

                for i, line in enumerate(text.split("\n"), 1):
                    if query_pattern.search(line):
                        excerpt = line.strip()[:200]
                        matches.append({
                            "path": rel_path,
                            "line": i,
                            "excerpt": excerpt,
                        })
                        total_bytes += len(excerpt)
                        if len(matches) >= inp.max_matches:
                            break
                        if total_bytes >= inp.max_bytes:
                            break

    return {"matches": matches, "total_matches": len(matches)}


def _read_file(ctx: McpContext, inp: ReadFileInput) -> dict:
    root = _repo_root()

    # Normalize path
    clean_path = inp.path.lstrip("/").lstrip("./")
    if not _is_allowed_path(clean_path):
        raise PermissionError(f"Path '{inp.path}' is not allowed")

    fpath = root / clean_path
    if not fpath.exists():
        raise FileNotFoundError(f"File not found: {inp.path}")
    if not fpath.is_file():
        raise ValueError(f"Not a file: {inp.path}")
    if _is_binary(fpath):
        raise ValueError(f"Binary files cannot be read: {inp.path}")

    # Size limit
    size = fpath.stat().st_size
    if size > 500_000:
        raise ValueError(f"File too large ({size} bytes, max 500000)")

    text = fpath.read_text(errors="replace")
    lines = text.split("\n")

    start = (inp.start_line or 1) - 1
    end = inp.end_line or len(lines)
    selected = lines[start:end]

    content = "\n".join(f"{start + i + 1:>5} | {line}" for i, line in enumerate(selected))

    return {
        "path": clean_path,
        "start_line": start + 1,
        "end_line": min(end, len(lines)),
        "total_lines": len(lines),
        "content": content,
    }


def register_repo_tools():
    registry.register(ToolDef(
        name="repo.search_files",
        description="Search repo files by text query (respects allow/deny lists)",
        module="repo",
        permission="read",
        input_model=SearchFilesInput,
        handler=_search_files,
        tags=frozenset({"infra"}),
    ))
    registry.register(ToolDef(
        name="repo.read_file",
        description="Read a repo file with optional line range (respects allow/deny lists)",
        module="repo",
        permission="read",
        input_model=ReadFileInput,
        handler=_read_file,
        tags=frozenset({"infra"}),
    ))
