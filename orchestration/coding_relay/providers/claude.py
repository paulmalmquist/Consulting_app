"""Claude CLI adapter: the BUILDER.

Invocation matches the proven pattern from
skills/winston-plan-relay/scripts/build_review_loop.py: non-interactive
coding agent scoped to the worktree, prompt on stdin, cwd = worktree.

    claude -p --permission-mode acceptEdits --add-dir <worktree>

Model selection is passed through only when the installed CLI's --help
advertises --model; otherwise the CLI default is used and the run metadata
records that fact.
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Optional

from orchestration.coding_relay.providers import (
    AdapterResult,
    CliCapabilities,
    run_cli,
)


def scrubbed_env(keep: bool = False) -> Optional[dict]:
    """Drop CLAUDE* variables from the child env by default.

    The relay is frequently launched from inside a Claude Code session;
    inherited CLAUDE* variables can confuse the nested CLI. --keep-env
    disables the scrub.
    """
    if keep:
        return None
    return {k: v for k, v in os.environ.items() if not k.upper().startswith("CLAUDE")}


def build_coding_command(
    exe: str,
    worktree: Path,
    permission_mode: str = "acceptEdits",
    model: Optional[str] = None,
    caps: Optional[CliCapabilities] = None,
) -> tuple[list[str], Optional[str]]:
    """Return (command, note). note explains a dropped flag, if any."""
    cmd = [exe, "-p", "--permission-mode", permission_mode, "--add-dir", str(worktree)]
    note = None
    if model:
        if caps is not None and "--model" in caps.flags:
            cmd += ["--model", model]
        else:
            note = (
                f"--claude-model {model} requested but the installed CLI help "
                "does not advertise --model; using the CLI default."
            )
    return cmd, note


def invoke_builder(
    prompt: str,
    worktree: Path,
    exe: str,
    permission_mode: str = "acceptEdits",
    model: Optional[str] = None,
    caps: Optional[CliCapabilities] = None,
    timeout_s: int = 1800,
    keep_env: bool = False,
) -> AdapterResult:
    cmd, _ = build_coding_command(exe, worktree, permission_mode, model, caps)
    return run_cli(
        agent="claude-code",
        adapter="relay_builder",
        command=cmd,
        stdin_text=prompt,
        timeout_s=timeout_s,
        cwd=str(worktree),
        env=scrubbed_env(keep_env),
    )
