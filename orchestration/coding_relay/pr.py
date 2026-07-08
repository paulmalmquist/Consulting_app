"""Commit, push, and draft-PR creation, with a manual fallback.

Structural rules: the relay never force-pushes, never merges, and always
passes --draft. Any failure along the way degrades to MANUAL_PR.md with
the exact commands for a human.
"""
from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path

CO_AUTHOR = "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"


def _run(cmd: list, cwd: Path, timeout: int = 300, env: dict | None = None) -> subprocess.CompletedProcess:
    """Never raises: hangs and launch failures degrade to a failed result so
    every PR-step failure lands in the MANUAL_PR.md fallback, not a traceback."""
    try:
        return subprocess.run(
            cmd, capture_output=True, text=True, encoding="utf-8",
            errors="replace", cwd=str(cwd), timeout=timeout, env=env,
        )
    except subprocess.TimeoutExpired:
        return subprocess.CompletedProcess(cmd, 124, stdout="", stderr=f"timed out after {timeout}s")
    except OSError as exc:
        return subprocess.CompletedProcess(cmd, 127, stdout="", stderr=str(exc))


def commit_all(worktree: Path, slug: str, run_id: str, title: str) -> tuple[bool, str]:
    _run(["git", "add", "-A"], worktree)
    staged = _run(["git", "diff", "--cached", "--name-only"], worktree)
    if not staged.stdout.strip():
        return False, "nothing to commit"
    msg = f"relay: {title[:60]} (run {run_id})\n\n{CO_AUTHOR}\n"
    res = _run(["git", "commit", "-m", msg], worktree)
    if res.returncode != 0:
        return False, f"git commit failed: {(res.stderr or res.stdout).strip()[:400]}"
    return True, _run(["git", "rev-parse", "HEAD"], worktree).stdout.strip()


def push(worktree: Path, branch: str) -> tuple[bool, str]:
    # GIT_TERMINAL_PROMPT=0 plus the gh credential helper: a credential
    # prompt hang (Git Credential Manager) must fail fast, not block 10min.
    env = {**os.environ, "GIT_TERMINAL_PROMPT": "0"}
    res = _run(
        ["git", "-c", "credential.helper=", "-c", "credential.helper=!gh auth git-credential",
         "push", "-u", "origin", branch],
        worktree, timeout=600, env=env,
    )
    if res.returncode != 0:
        return False, f"git push failed: {(res.stderr or res.stdout).strip()[:400]}"
    return True, f"pushed origin/{branch}"


def create_draft_pr(
    worktree: Path,
    branch: str,
    title: str,
    body_file: Path,
    base: str = "main",
) -> tuple[bool, str]:
    gh = shutil.which("gh")
    if gh is None:
        return False, "gh not on PATH"
    res = _run(
        [gh, "pr", "create", "--draft",
         "--title", f"relay: {title[:70]}",
         "--body-file", str(body_file),
         "--base", base, "--head", branch],
        worktree, timeout=300,
    )
    if res.returncode != 0:
        return False, f"gh pr create failed: {(res.stderr or res.stdout).strip()[:400]}"
    return True, res.stdout.strip().splitlines()[-1] if res.stdout.strip() else "created"


def manual_pr_instructions(
    repo_root: Path, worktree: Path, branch: str, title: str, body_file: Path, reason: str
) -> str:
    return (
        "# Manual PR instructions\n\n"
        f"Automatic draft-PR creation was skipped: {reason}\n\n"
        "Run these commands yourself:\n\n"
        "```\n"
        f"cd {worktree}\n"
        "git add -A\n"
        f'git commit -m "relay: {title[:60]}"\n'
        f"git push -u origin {branch}\n"
        f'gh pr create --draft --title "relay: {title[:70]}" '
        f'--body-file "{body_file}" --base main --head {branch}\n'
        "```\n\n"
        "The PR body draft is saved next to this file as PR_BODY.md.\n"
        "The relay never merges; review and merge by hand.\n"
    )
