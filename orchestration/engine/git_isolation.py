from __future__ import annotations

import os
import subprocess
import time
from dataclasses import dataclass
from pathlib import Path

from .paths import ROOT, WORKTREES_DIR

# ── Lock-safe git layer ──────────────────────────────────────────
# Autonomous sessions get killed mid-operation and leave .git/*.lock
# files behind. This layer clears stale locks before each git call
# and retries on lock errors.

_LOCK_MAX_AGE_SECS = int(os.environ.get("GIT_LOCK_MAX_AGE_SECS", "30"))
_LOCK_RETRY_WAIT = int(os.environ.get("GIT_LOCK_RETRY_WAIT", "2"))
_LOCK_MAX_RETRIES = int(os.environ.get("GIT_LOCK_MAX_RETRIES", "3"))

_LOCK_CANDIDATES = [
    "index.lock",
    "HEAD.lock",
    "REBASE_HEAD.lock",
    "MERGE_HEAD.lock",
    "COMMIT_EDITMSG.lock",
    "packed-refs.lock",
    "config.lock",
    "objects/maintenance.lock",
]


def _clear_stale_locks(repo: Path | None = None) -> int:
    """Remove .git lock files left by dead processes."""
    git_dir = (repo or ROOT) / ".git"
    if not git_dir.is_dir():
        return 0
    now = time.time()
    removed = 0

    # Fixed locations
    candidates = [git_dir / name for name in _LOCK_CANDIDATES]

    # Dynamic: refs/**/*.lock
    refs_dir = git_dir / "refs"
    if refs_dir.is_dir():
        candidates.extend(refs_dir.rglob("*.lock"))

    for lf in candidates:
        if not lf.is_file():
            continue
        try:
            stat = lf.stat()
            age = now - stat.st_mtime
            # Zero-byte = always stale; otherwise wait for age threshold
            if stat.st_size == 0 or age >= _LOCK_MAX_AGE_SECS:
                lf.unlink(missing_ok=True)
                removed += 1
        except OSError:
            pass
    return removed


def _git(*args: str, cwd: Path | None = None) -> str:
    _clear_stale_locks(cwd or ROOT)

    for attempt in range(_LOCK_MAX_RETRIES + 1):
        cp = subprocess.run(["git", *args], cwd=str(cwd or ROOT), capture_output=True, text=True)
        if cp.returncode == 0:
            return cp.stdout.strip()

        err = cp.stderr.strip() or cp.stdout.strip() or ""
        is_lock_error = any(phrase in err.lower() for phrase in [
            "unable to create", ".lock", "cannot lock ref",
        ])

        if is_lock_error and attempt < _LOCK_MAX_RETRIES:
            time.sleep(_LOCK_RETRY_WAIT)
            _clear_stale_locks(cwd or ROOT)
            continue

        raise RuntimeError(err or f"git {' '.join(args)} failed")

    raise RuntimeError(f"git {' '.join(args)} failed after {_LOCK_MAX_RETRIES} retries")


def current_branch() -> str:
    return _git("branch", "--show-current")


def ensure_branch_exists(branch: str, base: str = "main") -> None:
    branches = _git("branch", "--list", branch)
    if branches:
        return
    _git("branch", branch, base)


def ensure_worktree(session_id: str, branch: str) -> Path:
    wt = WORKTREES_DIR / session_id
    if wt.exists() and (wt / ".git").exists():
        return wt
    wt.parent.mkdir(parents=True, exist_ok=True)
    ensure_branch_exists(branch)
    _git("worktree", "add", str(wt), branch)
    return wt


def head_sha(cwd: Path | None = None) -> str:
    return _git("rev-parse", "HEAD", cwd=cwd)


def changed_files(cwd: Path | None = None) -> list[str]:
    out = _git("status", "--porcelain", cwd=cwd)
    if not out:
        return []
    files: list[str] = []
    for line in out.splitlines():
        if len(line) < 4:
            continue
        f = line[3:].strip()
        if " -> " in f:
            f = f.split(" -> ")[-1]
        files.append(f)
    return sorted(set(files))


def diff_numstat(cwd: Path | None = None) -> tuple[int, int]:
    out = _git("diff", "--numstat", cwd=cwd)
    add = 0
    rem = 0
    for ln in out.splitlines():
        parts = ln.split("\t")
        if len(parts) >= 2:
            try:
                add += int(parts[0]) if parts[0].isdigit() else 0
                rem += int(parts[1]) if parts[1].isdigit() else 0
            except Exception:
                pass
    return add, rem


def restore_files(files: list[str], cwd: Path | None = None) -> None:
    if not files:
        return
    subprocess.run(["git", "restore", "--staged", "--worktree", "--", *files], cwd=str(cwd or ROOT), check=False)
    subprocess.run(["git", "clean", "-f", "--", *files], cwd=str(cwd or ROOT), check=False)
