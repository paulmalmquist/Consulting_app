"""Subprocess adapters for winston-plan-relay (Ticket 2).

Each adapter wraps one reviewer CLI (Claude, Codex). The relay assembles a
prompt bundle, then — when --dry-run is absent — hands that bundle to the
adapter implied by --target-agent.

Design rules (Ticket 2 scope):
- No API calls. Adapters shell out to a locally installed CLI only.
- Fail loud: a missing CLI raises AdapterUnavailable with the attempted
  command and a dry-run fallback suggestion.
- The relay owns all file writing. Adapters only detect, run, and return a
  structured AdapterResult.
"""
from __future__ import annotations

import shutil
import subprocess
import time
from dataclasses import dataclass, field
from typing import Optional


class AdapterUnavailable(Exception):
    """Raised when the reviewer CLI is not installed or not on PATH.

    Carries enough context for the relay to print a loud, actionable error.
    """

    def __init__(self, agent: str, command: str, detail: str = ""):
        self.agent = agent
        self.command = command
        self.detail = detail
        msg = (
            f"reviewer CLI for --target-agent {agent} is unavailable.\n"
            f"  attempted command: {command}\n"
        )
        if detail:
            msg += f"  detail: {detail}\n"
        msg += "  fallback: re-run with --dry-run to assemble the bundle without invoking a model."
        super().__init__(msg)


@dataclass
class AdapterResult:
    """Outcome of one reviewer invocation. The relay turns this into files."""

    agent: str
    adapter: str
    command: list[str]
    exit_code: int
    duration_ms: int
    stdout: str
    stderr: str
    ok: bool = field(init=False)

    def __post_init__(self) -> None:
        self.ok = self.exit_code == 0

    @property
    def command_str(self) -> str:
        return " ".join(self.command)

    def stderr_excerpt(self, limit: int = 800) -> str:
        s = self.stderr.strip()
        if len(s) <= limit:
            return s
        return s[:limit] + f"\n…[{len(s) - limit} more chars truncated]"


def resolve_executable(names: list[str]) -> Optional[str]:
    """Return the first CLI name on PATH, or None. Tries each candidate so an
    adapter can accept e.g. both `claude` and a versioned alias."""
    for name in names:
        path = shutil.which(name)
        if path:
            return path
    return None


def run_cli(
    agent: str,
    adapter: str,
    command: list[str],
    stdin_text: str,
    timeout_s: int = 600,
) -> AdapterResult:
    """Run `command`, feeding `stdin_text` to the process stdin. Captures both
    streams. Never raises on a non-zero exit — the relay decides what a
    non-zero exit means. Raises AdapterUnavailable only if the executable
    vanishes between detection and launch."""
    start = time.monotonic()
    try:
        proc = subprocess.run(
            command,
            input=stdin_text,
            capture_output=True,
            text=True,
            # Force UTF-8 on all three pipes. The Windows default (cp1252)
            # cannot encode the ✓/✗ characters the relay puts in the bundle.
            encoding="utf-8",
            errors="replace",
            timeout=timeout_s,
        )
    except FileNotFoundError as exc:
        raise AdapterUnavailable(agent, " ".join(command), str(exc)) from exc
    except subprocess.TimeoutExpired as exc:
        duration_ms = int((time.monotonic() - start) * 1000)
        return AdapterResult(
            agent=agent,
            adapter=adapter,
            command=command,
            exit_code=124,
            duration_ms=duration_ms,
            stdout=(exc.stdout or "") if isinstance(exc.stdout, str) else "",
            stderr=(
                (exc.stderr or "") if isinstance(exc.stderr, str) else ""
            )
            + f"\n[adapter] timed out after {timeout_s}s",
        )
    duration_ms = int((time.monotonic() - start) * 1000)
    return AdapterResult(
        agent=agent,
        adapter=adapter,
        command=command,
        exit_code=proc.returncode,
        duration_ms=duration_ms,
        stdout=proc.stdout or "",
        stderr=proc.stderr or "",
    )
