"""Relay worktree management.

Each run gets a throwaway git worktree on its own branch:

    branch   relay/<slug>-YYYYMMDD-HHMM
    path     <worktree-root>/r-<slug8>-<HHMM>   (short: Windows MAX_PATH)

The default worktree root is a sibling of the repo (<parent>/Consulting_app_relay
style: "<repo-name>_relay") so deep repo paths do not overflow MAX_PATH.
The relay NEVER removes a worktree; the final report carries the exact
removal commands instead.
"""
from __future__ import annotations

import os
import subprocess
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path


def git(repo: Path, *args: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["git", "-C", str(repo), *args],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )


@dataclass
class RelayWorktree:
    path: Path
    branch: str
    base_ref: str
    base_sha: str


def default_worktree_root(repo_root: Path) -> Path:
    return repo_root.parent / f"{repo_root.name}_relay"


def create_worktree(
    repo_root: Path,
    slug: str,
    base_ref: str,
    worktree_root: Path | None = None,
    now: datetime | None = None,
) -> RelayWorktree:
    now = now or datetime.now()
    branch = f"relay/{slug}-{now.strftime('%Y%m%d-%H%M%S')}"
    root = worktree_root or default_worktree_root(repo_root)
    root.mkdir(parents=True, exist_ok=True)
    wt_path = root / f"r-{slug[:8]}-{now.strftime('%H%M%S')}"
    if wt_path.exists():
        raise RuntimeError(
            f"worktree path already exists: {wt_path}. Remove it or wait a second and retry."
        )
    sha = git(repo_root, "rev-parse", base_ref)
    if sha.returncode != 0:
        raise RuntimeError(f"base ref {base_ref} does not resolve: {sha.stderr.strip()}")
    res = git(
        repo_root,
        "-c", "core.longpaths=true",
        "worktree", "add", str(wt_path), "-b", branch, base_ref,
    )
    if res.returncode != 0:
        raise RuntimeError(
            f"git worktree add failed (branch {branch} may exist):\n{res.stderr.strip()}"
        )
    return RelayWorktree(
        path=wt_path.resolve(), branch=branch, base_ref=base_ref,
        base_sha=sha.stdout.strip(),
    )


def link_junction(target: Path, link: Path) -> tuple[bool, str]:
    """Junction (Windows) or symlink (POSIX) `link` -> `target`.

    Never raises: dependency links are best-effort, and a failure only means
    the matching test suite is skipped with an honest reason.
    """
    try:
        if link.exists():
            return True, f"already present: {link}"
        if not target.is_dir():
            return False, f"target missing: {target}"
        link.parent.mkdir(parents=True, exist_ok=True)
        if os.name == "nt":
            res = subprocess.run(
                ["cmd", "/c", "mklink", "/J", str(link), str(target)],
                capture_output=True, text=True, encoding="utf-8", errors="replace",
            )
            if res.returncode != 0:
                return False, f"mklink failed: {(res.stderr or res.stdout).strip()[:200]}"
        else:
            os.symlink(target, link, target_is_directory=True)
        return True, f"{link} -> {target}"
    except OSError as exc:
        return False, f"{type(exc).__name__}: {exc}"


def ensure_deps_links(
    repo_root: Path, wt: RelayWorktree, dep_links: tuple | list | None = None
) -> dict[str, str]:
    """Junction heavyweight dependency dirs from the primary checkout into the
    worktree so test suites can run there. Returns {name: detail}.

    `dep_links` defaults to this repo's dirs; a downstream repo passes its own
    from RelayConfig.dep_links.
    """
    links = dep_links if dep_links is not None else ("repo-b/node_modules", "backend/.venv")
    results: dict[str, str] = {}
    for rel in links:
        target = repo_root / rel
        link = wt.path / rel
        ok, detail = link_junction(target, link)
        results[rel] = ("linked: " if ok else "unavailable: ") + detail
    return results


def removal_instructions(repo_root: Path, wt: RelayWorktree) -> str:
    return (
        "To remove the relay worktree and branch when you are done:\n"
        f"    git -C {repo_root} worktree remove --force {wt.path}\n"
        f"    git -C {repo_root} branch -D {wt.branch}\n"
    )
