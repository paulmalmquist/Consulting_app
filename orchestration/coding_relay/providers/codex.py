"""Codex CLI adapter: the REVIEWER, artifact-review posture by default.

Codex never gets repo or worktree access in the default mode. The relay
assembles a review bundle (diff, changed files, test outputs, builder
summary) in a neutral directory under the run folder, embeds the bundle in
the prompt, and runs:

    codex exec --cd <review-bundle-dir> --skip-git-repo-check \
        [-m <model>] -c model_reasoning_effort=<effort> -

Windows caveat inherited from the prototype: Codex's sandbox can fail to
spawn subprocesses (CreateProcessAsUserW error 1312). If the default
invocation fails with a sandbox-shaped error, we retry ONCE with
--dangerously-bypass-approvals-and-sandbox, still pointed only at the
bundle directory, which contains nothing but run artifacts. The retry is
recorded in the result metadata.

--codex-repo-access switches to the prototype's full-worktree invocation
(--cd <worktree> + bypass). The loop records that as a risk escalation.
"""
from __future__ import annotations

from pathlib import Path
from typing import Optional

from orchestration.coding_relay.providers import (
    AdapterResult,
    CliCapabilities,
    run_cli,
)

BYPASS_FLAG = "--dangerously-bypass-approvals-and-sandbox"
# Matched against STDERR only, and kept to the actual Windows failure
# signature: codex banners routinely print the word "sandbox" to stdout,
# which must not trigger a bypass retry.
SANDBOX_ERROR_MARKERS = ("error 1312", "1312", "CreateProcessAsUserW")

EFFORT_LADDER = ("minimal", "low", "medium", "high")


def build_review_command(
    exe: str,
    review_dir: Path,
    model: Optional[str] = "gpt-5.4",
    effort: str = "low",
    caps: Optional[CliCapabilities] = None,
    bypass_sandbox: bool = False,
) -> tuple[list[str], Optional[str]]:
    """Return (command, note). `review_dir` is the bundle dir by default, or
    the worktree only under --codex-repo-access."""
    cmd = [exe, "exec", "--cd", str(review_dir)]
    if bypass_sandbox:
        cmd.append(BYPASS_FLAG)
    cmd.append("--skip-git-repo-check")
    note = None
    if model:
        if caps is None or "-m" in caps.flags or "--model" in caps.flags:
            cmd += ["-m", model]
        else:
            note = (
                f"codex model {model} requested but the installed CLI help does "
                "not advertise -m/--model; using the CLI default."
            )
    cmd += ["-c", f"model_reasoning_effort={effort}", "-"]
    return cmd, note


def _looks_like_sandbox_failure(result: AdapterResult) -> bool:
    stderr = result.stderr or ""
    return not result.ok and any(marker in stderr for marker in SANDBOX_ERROR_MARKERS)


def invoke_reviewer(
    prompt: str,
    review_dir: Path,
    exe: str,
    model: Optional[str] = "gpt-5.4",
    effort: str = "low",
    caps: Optional[CliCapabilities] = None,
    timeout_s: int = 900,
    repo_access: bool = False,
) -> AdapterResult:
    """Invoke Codex on the review bundle. Sandboxed first; one bypass retry
    on a sandbox-shaped failure (Windows 1312). With repo_access=True the
    bypass flag is required from the start (prototype behavior)."""
    cmd, _ = build_review_command(
        exe, review_dir, model, effort, caps, bypass_sandbox=repo_access
    )
    result = run_cli(
        agent="codex",
        adapter="relay_reviewer",
        command=cmd,
        stdin_text=prompt,
        timeout_s=timeout_s,
        cwd=str(review_dir),
    )
    if not repo_access and _looks_like_sandbox_failure(result):
        retry_cmd, _ = build_review_command(
            exe, review_dir, model, effort, caps, bypass_sandbox=True
        )
        result = run_cli(
            agent="codex",
            adapter="relay_reviewer_bypass_retry",
            command=retry_cmd,
            stdin_text=prompt,
            timeout_s=timeout_s,
            cwd=str(review_dir),
        )
    return result
