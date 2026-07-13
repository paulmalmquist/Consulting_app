"""Minimal test-suite inference and execution (PR 1 scope).

Maps changed paths to the portable, CI-matching commands and runs them
inside the relay worktree. When a prerequisite is missing (no interpreter,
no node_modules), the suite is SKIPPED with the exact manual command; the
relay never fabricates a test result.

Broader inference (Playwright/e2e, AI evals, migration verification) is a
documented follow-up, not silently absent: infer_suites() only claims the
four basic suites below.
"""
from __future__ import annotations

import os
import shutil
import subprocess
import time
from dataclasses import dataclass
from pathlib import Path


@dataclass
class Suite:
    name: str
    cwd_rel: str  # relative to the worktree
    command: list
    timeout_s: int
    requires: str  # "python" | "npm" | ""


@dataclass
class SuiteResult:
    name: str
    command: list
    skipped: bool = False
    reason: str = ""
    exit_code: int | None = None
    duration_s: float = 0.0
    log_relpath: str = ""

    @property
    def ok(self) -> bool:
        return not self.skipped and self.exit_code == 0

    def summary_line(self) -> str:
        if self.skipped:
            return f"{self.name}: SKIPPED ({self.reason})"
        state = "PASS" if self.exit_code == 0 else f"FAIL (exit {self.exit_code})"
        return f"{self.name}: {state} in {self.duration_s:.0f}s"

    def to_payload(self) -> dict:
        return {
            "name": self.name,
            "command": self.command,
            "skipped": self.skipped,
            "reason": self.reason,
            "exit_code": self.exit_code,
            "duration_s": round(self.duration_s, 1),
            "log": self.log_relpath,
        }


def resolve_python(
    worktree: Path, primary_root: Path | None, venv_rel: str = "backend/.venv"
) -> tuple[str | None, str]:
    """Prefer a backend venv (worktree, then primary checkout), else PATH.
    Returns (interpreter or None, description). `venv_rel` is the venv path
    relative to a checkout root, from RelayConfig's dep_links."""
    candidates = []
    for root in (worktree, primary_root):
        if root is None:
            continue
        venv = root / venv_rel
        candidates.append(venv / "Scripts" / "python.exe")
        candidates.append(venv / "bin" / "python")
    for c in candidates:
        if c.is_file():
            return str(c), f"backend venv: {c}"
    path_python = shutil.which("python") or shutil.which("python3")
    if path_python:
        return path_python, f"PATH interpreter: {path_python} (no backend venv found)"
    return None, "no python interpreter available"


def infer_suites(changed_paths: list, python_exe: str | None, config=None) -> list:
    """Changed paths -> suites, driven by `config.test_suites`.

    Each rule fires when any changed path starts with its `when_touched`
    prefix (or any prefix in `when_touched_any`). The `{py}` placeholder in a
    command is replaced with the resolved interpreter; when none was resolved
    the slot is left empty so run_suites SKIPS python suites honestly instead
    of failing with a bogus 127.

    `config` defaults to the built-in RelayConfig, so callers that pass only
    (changed_paths, python_exe) get this repo's canonical, CI-matching
    suites unchanged.
    """
    from orchestration.coding_relay.config import PY_PLACEHOLDER, default_config

    if config is None:
        config = default_config()
    paths = [p.replace("\\", "/") for p in changed_paths]
    py = python_exe or ""

    def touched(prefix: str) -> bool:
        return any(p.startswith(prefix) for p in paths)

    def rule_fires(rule: dict) -> bool:
        prefixes = rule.get("when_touched_any")
        if prefixes is not None:
            return any(touched(prefix) for prefix in prefixes)
        return touched(rule["when_touched"])

    def resolve_cmd(cmd: list) -> list:
        return [py if part == PY_PLACEHOLDER else part for part in cmd]

    suites: list = []
    for rule in config.test_suites:
        if not rule_fires(rule):
            continue
        suites.append(
            Suite(
                rule["name"],
                rule["cwd"],
                resolve_cmd(rule["cmd"]),
                rule["timeout"],
                rule["runner"],
            )
        )
    return suites


def run_suites(
    worktree: Path,
    suites: list,
    tests_rel: str,
    python_desc: str = "",
    write=None,
) -> list:
    """Execute suites in the worktree. `write(relpath, text)` is the run
    folder's redacting writer; log_relpath values are run-folder relative
    with forward slashes."""
    results: list = []
    for suite in suites:
        cwd = worktree / suite.cwd_rel
        log_rel = f"{tests_rel}/{suite.name}.log"
        display_cmd = " ".join(c or "python" for c in suite.command)
        manual = f"run manually: cd {cwd} && {display_cmd}"
        skip_reason = None
        if not cwd.is_dir():
            skip_reason = f"missing directory {suite.cwd_rel}; {manual}"
        elif suite.requires == "npm":
            if shutil.which("npm") is None:
                skip_reason = f"npm not on PATH; {manual}"
            elif not (cwd / "node_modules").exists():
                skip_reason = (
                    "node_modules missing in the worktree (junction failed); "
                    f"run manually: cd {cwd} && npm ci && {display_cmd}"
                )
        elif suite.requires == "python" and not suite.command[0]:
            skip_reason = f"no python interpreter available; {manual}"
        if skip_reason:
            results.append(SuiteResult(suite.name, suite.command, skipped=True, reason=skip_reason))
            continue

        exe = suite.command[0]
        cmd = list(suite.command)
        if exe == "npm":
            cmd[0] = shutil.which("npm") or "npm"
        start = time.monotonic()
        try:
            proc = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                cwd=str(cwd),
                timeout=suite.timeout_s,
                env={**os.environ, "CI": "1"},
            )
            exit_code = proc.returncode
            output = (proc.stdout or "") + "\n--- stderr ---\n" + (proc.stderr or "")
        except subprocess.TimeoutExpired as exc:
            exit_code = 124
            output = (
                ((exc.stdout or "") if isinstance(exc.stdout, str) else "")
                + f"\n[test-runner] timed out after {suite.timeout_s}s"
            )
        except OSError as exc:
            exit_code = 127
            output = f"[test-runner] could not launch: {exc}"
        duration = time.monotonic() - start
        if write is not None:
            header = f"$ {' '.join(cmd)}\n(cwd {cwd}, interpreter: {python_desc})\n\n"
            write(log_rel, header + output)
        results.append(
            SuiteResult(
                suite.name, cmd, skipped=False, exit_code=exit_code,
                duration_s=duration, log_relpath=log_rel,
            )
        )
    return results


def failing_excerpt(results: list, run_root: Path, limit: int = 4000) -> str:
    """Tail of each failing suite's log, for the next builder prompt."""
    chunks: list = []
    for r in results:
        if r.skipped or r.ok:
            continue
        log = run_root / r.log_relpath
        tail = ""
        if log.is_file():
            text = log.read_text(encoding="utf-8", errors="replace")
            tail = text[-(limit // max(1, len([x for x in results if not x.skipped and not x.ok]))):]
        chunks.append(f"### {r.name} (exit {r.exit_code})\n{tail}")
    return "\n\n".join(chunks)[:limit]
