from __future__ import annotations

import os
import re
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable


DEFAULT_ALLOWED_ROOTS = ["backend", "repo-b", "repo-c", "docs", "scripts"]
DENY_PREFIXES = [
    ".git",
    "node_modules",
    ".next",
    "dist",
    "build",
    "out",
    ".venv",
]
DENY_GLOBS = [
    ".env",
    ".env.*",
]


@dataclass(frozen=True)
class Snippet:
    path: str
    start_line: int
    end_line: int
    text: str


def _repo_root() -> Path:
    # backend/app/ai/retrieval.py -> backend/app/ai -> backend/app -> backend -> repo root
    return Path(__file__).resolve().parents[3]


def _is_denied(rel: Path) -> bool:
    parts = rel.parts
    if parts and parts[0] in DENY_PREFIXES:
        return True
    for p in parts:
        if p in DENY_PREFIXES:
            return True
    s = str(rel)
    if s.endswith(".env") or "/.env" in s or s.startswith(".env"):
        return True
    for g in DENY_GLOBS:
        if Path(s).match(g):
            return True
    return False


def _iter_files(allowed_roots: list[str]) -> Iterable[Path]:
    root = _repo_root()
    for r in allowed_roots:
        base = (root / r).resolve()
        if not base.exists():
            continue
        for path in base.rglob("*"):
            if not path.is_file():
                continue
            rel = path.relative_to(root)
            if _is_denied(rel):
                continue
            # Skip huge files.
            try:
                if path.stat().st_size > 2_000_000:
                    continue
            except OSError:
                continue
            yield path


def _extract_snippet(lines: list[str], line_no: int, context: int = 20) -> tuple[int, int, str]:
    start = max(1, line_no - context)
    end = min(len(lines), line_no + context)
    text = "".join(lines[start - 1 : end])
    return start, end, text


def _dedupe(snippets: list[Snippet]) -> list[Snippet]:
    out: list[Snippet] = []
    seen: set[tuple[str, int, int]] = set()
    for s in snippets:
        key = (s.path, s.start_line, s.end_line)
        if key in seen:
            continue
        seen.add(key)
        out.append(s)
    return out


def retrieve_snippets(
    query: str,
    allowed_roots: list[str] | None = None,
    top_k: int = 8,
    max_files: int = 12,
    max_bytes: int = 200_000,
) -> list[Snippet]:
    if not allowed_roots:
        allowed_roots = DEFAULT_ALLOWED_ROOTS

    query = (query or "").strip()
    if not query:
        return []

    root = _repo_root()

    rg = shutil.which("rg")
    if rg:
        return _retrieve_rg(rg, root, query, allowed_roots, top_k, max_files, max_bytes)
    return _retrieve_python(root, query, allowed_roots, top_k, max_files, max_bytes)


def _retrieve_rg(
    rg_path: str,
    root: Path,
    query: str,
    allowed_roots: list[str],
    top_k: int,
    max_files: int,
    max_bytes: int,
) -> list[Snippet]:
    # Use literal search; safer and predictable.
    cmd = [
        rg_path,
        "-n",
        "--no-heading",
        "--color=never",
        "--hidden",
        "--no-ignore-vcs",
        "--fixed-strings",
        query,
        *allowed_roots,
    ]
    try:
        p = subprocess.run(cmd, cwd=str(root), capture_output=True, text=True, timeout=8.0)
    except Exception:
        return []

    # ripgrep convention:
    # - 0: matches found
    # - 1: no matches
    # - 2+: error (bad flag, permission, etc.)
    if p.returncode == 1:
        return []
    if p.returncode != 0:
        # Some environments (e.g., editor-shipped rg wrappers) may not support all flags.
        # Fall back to Python search rather than silently returning no citations.
        return _retrieve_python(root, query, allowed_roots, top_k, max_files, max_bytes)

    hits: dict[str, list[int]] = {}
    for line in p.stdout.splitlines():
        # format: path:line:match
        parts = line.split(":", 2)
        if len(parts) < 2:
            continue
        path, line_s = parts[0], parts[1]
        try:
            line_no = int(line_s)
        except ValueError:
            continue
        rel = Path(path)
        if _is_denied(rel):
            continue
        hits.setdefault(path, []).append(line_no)

    # Score by hit count (cap), plus filename exact match boost.
    scored = sorted(hits.items(), key=lambda kv: min(len(kv[1]), 50), reverse=True)
    scored = scored[: max_files]

    snippets: list[Snippet] = []
    total_bytes = 0
    for path, line_nos in scored:
        file_path = (root / path).resolve()
        try:
            content = file_path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        lines = content.splitlines(keepends=True)
        for ln in line_nos[: top_k]:
            start, end, text = _extract_snippet(lines, ln, context=20)
            snippet = Snippet(path=str(Path(path)), start_line=start, end_line=end, text=text)
            b = len(text.encode("utf-8"))
            if total_bytes + b > max_bytes:
                break
            snippets.append(snippet)
            total_bytes += b
        if total_bytes >= max_bytes:
            break

    return _dedupe(snippets)


def _retrieve_python(
    root: Path,
    query: str,
    allowed_roots: list[str],
    top_k: int,
    max_files: int,
    max_bytes: int,
) -> list[Snippet]:
    # Simple regex search (case-insensitive). Used only if ripgrep not present.
    pattern = re.compile(re.escape(query), re.IGNORECASE)
    candidates: list[tuple[str, int]] = []
    for path in _iter_files(allowed_roots):
        rel = str(path.relative_to(root))
        try:
            content = path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        hits = sum(1 for _ in pattern.finditer(content))
        if hits:
            candidates.append((rel, hits))

    candidates.sort(key=lambda x: x[1], reverse=True)
    candidates = candidates[:max_files]

    snippets: list[Snippet] = []
    total_bytes = 0
    for rel, _hits in candidates:
        file_path = root / rel
        content = file_path.read_text(encoding="utf-8", errors="replace")
        lines = content.splitlines(keepends=True)
        match_lines = []
        for idx, line in enumerate(lines, start=1):
            if pattern.search(line):
                match_lines.append(idx)
                if len(match_lines) >= top_k:
                    break
        for ln in match_lines:
            start, end, text = _extract_snippet(lines, ln, context=20)
            b = len(text.encode("utf-8"))
            if total_bytes + b > max_bytes:
                break
            snippets.append(Snippet(path=rel, start_line=start, end_line=end, text=text))
            total_bytes += b
        if total_bytes >= max_bytes:
            break
    return _dedupe(snippets)
