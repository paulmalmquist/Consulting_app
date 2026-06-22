"""Codex CLI adapter for winston-plan-relay.

Invokes the locally installed `codex` CLI in non-interactive mode, feeding the
assembled bundle on stdin. The relay owns file writing; this module only
detects, builds the command, runs it, and returns AdapterResult.
"""
from __future__ import annotations

from . import AdapterResult, AdapterUnavailable, resolve_executable, run_cli

AGENT = "codex"
ADAPTER = "codex_cli"
CANDIDATES = ["codex"]


def detect() -> str:
    """Return the resolved `codex` executable path, or raise AdapterUnavailable."""
    exe = resolve_executable(CANDIDATES)
    if exe is None:
        raise AdapterUnavailable(
            AGENT,
            "codex exec - < <bundle>",
            f"none of {CANDIDATES} found on PATH",
        )
    return exe


def build_command(exe: str) -> list[str]:
    """Non-interactive invocation: `codex exec -` runs a single prompt read
    from stdin and exits. `exec` is the documented headless subcommand; the
    trailing `-` tells it to read the prompt from stdin. No other flags are
    assumed — keep the command minimal and documented per Ticket 2 scope."""
    return [exe, "exec", "-"]


def invoke(bundle_text: str, timeout_s: int = 600) -> AdapterResult:
    exe = detect()
    command = build_command(exe)
    return run_cli(
        agent=AGENT,
        adapter=ADAPTER,
        command=command,
        stdin_text=bundle_text,
        timeout_s=timeout_s,
    )
