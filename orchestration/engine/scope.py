from __future__ import annotations

from pathlib import Path


def normalize_allowed_dirs(allowed: list[str]) -> list[str]:
    out: list[str] = []
    for p in allowed:
        x = p.strip().strip("/")
        if not x:
            continue
        out.append(x)
    return sorted(set(out))


def enforce_scope(changed_files: list[str], allowed_dirs: list[str], max_files: int) -> list[str]:
    errors: list[str] = []
    if len(changed_files) > max_files:
        errors.append(f"File count {len(changed_files)} exceeds max_files_per_execution {max_files}")
    allowed = normalize_allowed_dirs(allowed_dirs)
    for f in changed_files:
        rel = f.strip().lstrip("./")
        if not any(rel == d or rel.startswith(d + "/") for d in allowed):
            errors.append(f"Out-of-scope change: {rel}")
    return errors
