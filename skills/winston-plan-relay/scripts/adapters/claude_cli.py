"""Claude CLI adapter for winston-plan-relay.

Invokes the locally installed `claude` CLI in non-interactive (print) mode,
feeding the assembled bundle on stdin. The relay owns file writing; this
module only detects, builds the command, runs it, and returns AdapterResult.
"""
from __future__ import annotations

from . import AdapterResult, AdapterUnavailable, resolve_executable, run_cli

AGENT = "claude-code"
ADAPTER = "claude_cli"
# `claude` is the standard CLI name. No versioned alias assumed.
CANDIDATES = ["claude"]


def detect() -> str:
    """Return the resolved `claude` executable path, or raise AdapterUnavailable."""
    exe = resolve_executable(CANDIDATES)
    if exe is None:
        raise AdapterUnavailable(
            AGENT,
            "claude --print < <bundle>",
            f"none of {CANDIDATES} found on PATH",
        )
    return exe


def build_command(exe: str) -> list[str]:
    """Non-interactive invocation: `claude --print` reads the prompt from stdin
    and emits the response to stdout, then exits. This is the documented
    headless mode and avoids assuming any unsupported flags."""
    return [exe, "--print"]


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
