"""Provider adapter core for the Coding Relay.

Derived from skills/winston-plan-relay/scripts/adapters/__init__.py
(the plan-relay Ticket 2 adapter core). Copied rather than imported: the
skill directory is not an importable package and stays self-contained.
Keep run_cli/AdapterResult behavior-compatible; sync changes manually.

Additions over the original:
- probe(): one --help call per run, cached to the run folder, so command
  builders can gate optional flags (like model selection) on what the
  installed CLI actually supports instead of hard-coding.
"""
from __future__ import annotations

import re
import shutil
import subprocess
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional


class AdapterUnavailable(Exception):
    """Raised when a provider CLI is not installed or not on PATH."""

    def __init__(self, agent: str, command: str, detail: str = ""):
        self.agent = agent
        self.command = command
        self.detail = detail
        msg = (
            f"provider CLI for {agent} is unavailable.\n"
            f"  attempted command: {command}\n"
        )
        if detail:
            msg += f"  detail: {detail}\n"
        msg += "  fallback: re-run with --fixture to exercise the loop without CLIs."
        super().__init__(msg)


@dataclass
class AdapterResult:
    """Outcome of one provider invocation. The relay turns this into files."""

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

    def meta(self) -> dict:
        return {
            "agent": self.agent,
            "adapter": self.adapter,
            "command": self.command,
            "exit_code": self.exit_code,
            "duration_ms": self.duration_ms,
        }


def resolve_executable(names: list[str]) -> Optional[str]:
    """Return the first CLI name on PATH, or None."""
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
    cwd: Optional[str] = None,
    env: Optional[dict] = None,
) -> AdapterResult:
    """Run `command` feeding `stdin_text` on stdin. Captures both streams.
    Never raises on a non-zero exit; timeouts become exit code 124.

    `cwd` matters: `claude -p` and `codex exec` operate on their CWD, so a
    coding agent launched from the wrong directory reasons but edits nothing.
    """
    start = time.monotonic()
    try:
        proc = subprocess.run(
            command,
            input=stdin_text,
            capture_output=True,
            text=True,
            # Force UTF-8 on all pipes; the Windows default cp1252 cannot
            # encode characters providers routinely emit.
            encoding="utf-8",
            errors="replace",
            timeout=timeout_s,
            cwd=cwd,
            env=env,
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
            stderr=((exc.stderr or "") if isinstance(exc.stderr, str) else "")
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


@dataclass
class CliCapabilities:
    exe: str
    help_text: str
    flags: set = field(default_factory=set)


FLAG_RE = re.compile(r"(?<![\w-])(--[a-z][a-z0-9-]+|-[a-zA-Z])(?![\w-])")


def probe(exe: str, cache_file: Optional[Path] = None, timeout_s: int = 60) -> CliCapabilities:
    """Run `<exe> --help` once and extract the flags it advertises.

    Command builders use this to gate optional flags (e.g. model selection)
    on the installed CLI instead of assuming. A failed probe returns empty
    capabilities; builders then emit only their required flags.
    """
    try:
        proc = subprocess.run(
            [exe, "--help"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout_s,
        )
        help_text = (proc.stdout or "") + "\n" + (proc.stderr or "")
    except (OSError, subprocess.TimeoutExpired) as exc:
        help_text = f"[probe failed: {exc}]"
    caps = CliCapabilities(exe=exe, help_text=help_text, flags=set(FLAG_RE.findall(help_text)))
    if cache_file is not None:
        try:
            cache_file.parent.mkdir(parents=True, exist_ok=True)
            cache_file.write_text(help_text, encoding="utf-8")
        except OSError:
            pass
    return caps
