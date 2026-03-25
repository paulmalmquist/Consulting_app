from __future__ import annotations

import subprocess
from dataclasses import dataclass
from pathlib import Path

from .paths import ROOT, WORKTREES_DIR


def _git(*args: str, cwd: Path | None = None) -> str:
    cp = subprocess.run(["git", *args], cwd=str(cwd or ROOT), capture_output=True, text=True)
    if cp.returncode != 0:
        raise RuntimeError(cp.stderr.strip() or cp.stdout.strip() or f"git {' '.join(args)} failed")
    return cp.stdout.strip()


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
