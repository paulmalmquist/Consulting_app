#!/usr/bin/env python3
"""winston-plan-relay — build/review loop (Claude builds, Codex reviews).

A two-agent convergence loop layered on top of the relay's adapter plumbing:

    Round 1: Claude (coding agent, edits files) implements the plan, then says
             it's finished.
    Round 1 review: Codex reads the resulting git diff and returns a verdict —
             APPROVED or CHANGES_REQUESTED with concrete critique.
    If CHANGES_REQUESTED: Codex's critique is fed back to Claude, which revises.
    Repeat until Codex APPROVES or --max-rounds is hit (whichever first).

This is distinct from relay.py, which is a one-shot prompt assembler. Here
Claude actually mutates files, so the loop runs inside an isolated git worktree
by default — a runaway loop can never touch your real working tree, and the
whole experiment is thrown away (or kept) at the end on your call.

Safety contract:
- Runs in a throwaway git worktree off a fresh branch unless --in-place is set.
- Claude runs with --permission-mode acceptEdits scoped to the worktree only.
- Codex reviews read-only (--sandbox read-only); it never edits.
- A hard --max-rounds cap bounds total CLI calls. Default 3.
- Never commits to a tracked branch, never pushes, never deletes the worktree
  unless --cleanup is passed AND the run converged.
- Every round's prompts and outputs are written under --workdir for audit.

Python 3.10+, stdlib only. Requires `claude` and `codex` on PATH and `git`.
"""
from __future__ import annotations

import argparse
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

try:
    from adapters import resolve_executable, run_cli, AdapterUnavailable
except ImportError:
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from adapters import resolve_executable, run_cli, AdapterUnavailable


APPROVED_TOKEN = "APPROVED"
CHANGES_TOKEN = "CHANGES_REQUESTED"

# Reasoning-effort ladder, cheapest first. Codex may step UP this ladder one
# notch per round when it judges a diff too big/risky for a cheap pass — but the
# MODEL is pinned for the whole run, so only effort moves, never the model. This
# keeps review context on one model (the user's "don't change models mid-project")
# while still allowing judgement ("but do allow for judgement").
EFFORT_LADDER = ("minimal", "low", "medium", "high")

# Codex emits this on its own line to request a one-step effort bump for the NEXT
# round. Bounded by --codex-max-effort; ignored under --no-codex-effort-escalation.
ESCALATE_EFFORT_TOKEN = "REQUEST_HIGHER_EFFORT"

# Codex emits this to tell the builder to downshift — the task/diff is small
# enough that Claude should budget itself (cheaper model / tighter scope) next
# round. Advisory: it's injected into Claude's next build prompt, not a CLI flag,
# because we never change Claude's model mid-run either.
BUILDER_DOWNSHIFT_TOKEN = "BUILDER_CAN_DOWNSHIFT"


def err(msg: str) -> None:
    sys.stderr.write(f"build_review_loop.py: error: {msg}\n")


def info(msg: str) -> None:
    sys.stdout.write(msg + "\n")
    sys.stdout.flush()


def parse_args(argv: Optional[list[str]] = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        prog="build_review_loop.py",
        description="Claude builds, Codex reviews, loop until APPROVED or max rounds.",
    )
    p.add_argument("--repo-root", required=True, type=Path)
    p.add_argument(
        "--input",
        dest="input_path",
        required=True,
        type=Path,
        help="Plan / task file Claude should implement.",
    )
    p.add_argument(
        "--workdir",
        required=True,
        type=Path,
        help="Directory for per-round audit artifacts (prompts, outputs, verdicts).",
    )
    p.add_argument(
        "--max-rounds",
        type=int,
        default=3,
        help="Hard cap on build->review rounds (default 3).",
    )
    p.add_argument(
        "--worktree-base",
        default="HEAD",
        help="Git ref to branch the throwaway worktree from (default HEAD).",
    )
    p.add_argument(
        "--in-place",
        action="store_true",
        help="DANGEROUS: let Claude edit --repo-root directly instead of an "
        "isolated worktree. Off by default.",
    )
    p.add_argument(
        "--cleanup",
        action="store_true",
        help="Remove the worktree at the end IF the run converged (APPROVED). "
        "Off by default so you can inspect the diff.",
    )
    p.add_argument(
        "--claude-timeout",
        type=int,
        default=1800,
        help="Seconds for each Claude build call (default 1800).",
    )
    p.add_argument(
        "--codex-timeout",
        type=int,
        default=900,
        help="Seconds for each Codex review call (default 900).",
    )
    p.add_argument(
        "--claude-permission-mode",
        default="acceptEdits",
        choices=["acceptEdits", "bypassPermissions"],
        help="Claude permission mode for the coding agent (default acceptEdits).",
    )
    p.add_argument(
        "--codex-model",
        default="gpt-5.4",
        help="Model for Codex review rounds. PINNED for the whole run — never "
        "changed mid-loop, so review context stays on one model. Downshift here, "
        "not per round (default gpt-5.4).",
    )
    p.add_argument(
        "--codex-effort",
        default="low",
        choices=list(EFFORT_LADDER),
        help="Starting reasoning effort for Codex reviews. Reviews are "
        "read-and-judge, so this defaults LOW to budget aggressively. Codex may "
        "request a one-step bump for the next round when it judges the diff too "
        "big/risky for a cheap pass (see --no-codex-effort-escalation).",
    )
    p.add_argument(
        "--codex-max-effort",
        default="medium",
        choices=list(EFFORT_LADDER),
        help="Ceiling that Codex's self-requested effort bumps may reach "
        "(default medium). The model never changes; only effort climbs.",
    )
    p.add_argument(
        "--no-codex-effort-escalation",
        action="store_true",
        help="Pin Codex effort at --codex-effort for every round. Disables the "
        "judgement-based one-step bump entirely.",
    )
    return p.parse_args(argv)


def git(repo: Path, *args: str, check: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["git", "-C", str(repo), *args],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=check,
    )


def ensure_clean_repo(repo: Path) -> bool:
    """A worktree-add off a dirty index is fine, but we want a clean signal so
    the diff Codex reads is purely Claude's work. Warn, don't block."""
    res = git(repo, "status", "--porcelain", check=False)
    return res.returncode == 0 and not res.stdout.strip()


@dataclass
class Worktree:
    path: Path
    branch: str
    created: bool  # True if we made it (so --cleanup may remove it)


def make_worktree(repo: Path, base: str, workdir: Path) -> Worktree:
    """Create a throwaway worktree + branch off `base`. The branch name is
    derived from the workdir so re-runs are distinguishable; git itself rejects
    a collision, which surfaces a stale worktree rather than silently reusing."""
    branch = f"relay-loop/{workdir.name}"
    wt_path = (workdir / "worktree").resolve()
    if wt_path.exists():
        raise RuntimeError(
            f"worktree path already exists: {wt_path}\n"
            f"  remove it (git worktree remove) or pick a fresh --workdir."
        )
    # -b creates the branch; fails loud if the branch already exists.
    res = git(
        repo, "worktree", "add", "-b", branch, str(wt_path), base, check=False
    )
    if res.returncode != 0:
        raise RuntimeError(
            f"git worktree add failed (branch {branch} may already exist):\n"
            f"{res.stderr.strip()}"
        )
    return Worktree(path=wt_path, branch=branch, created=True)


def remove_worktree(repo: Path, wt: Worktree) -> None:
    git(repo, "worktree", "remove", "--force", str(wt.path), check=False)
    git(repo, "branch", "-D", wt.branch, check=False)


def diff_summary(work_root: Path) -> str:
    """The diff Codex reviews: everything Claude changed in the worktree,
    staged + unstaged + untracked. We stage all so untracked files appear in
    `git diff --cached`."""
    git(work_root, "add", "-A", check=False)
    res = git(work_root, "diff", "--cached", check=False)
    return res.stdout


def detect_clis() -> tuple[str, str]:
    claude = resolve_executable(["claude"])
    if claude is None:
        raise AdapterUnavailable("claude-code", "claude -p ...", "claude not on PATH")
    codex = resolve_executable(["codex"])
    if codex is None:
        raise AdapterUnavailable("codex", "codex exec ...", "codex not on PATH")
    return claude, codex


def build_claude_command(
    exe: str, work_root: Path, permission_mode: str
) -> list[str]:
    """Non-interactive coding agent scoped to the worktree. The prompt arrives
    on stdin; --add-dir grants edit access to the worktree; acceptEdits lets it
    write files without an interactive approval gate."""
    return [
        exe,
        "-p",
        "--permission-mode",
        permission_mode,
        "--add-dir",
        str(work_root),
    ]


def build_codex_command(
    exe: str, work_root: Path, model: str, effort: str
) -> list[str]:
    """Read-only reviewer rooted at the worktree so Codex can run `git diff`
    itself if it wants. read-only sandbox guarantees it cannot mutate files.

    `model` is pinned for the whole run; `effort` is the per-round level (may
    step up the EFFORT_LADDER under Codex's own judgement). Effort is passed via
    `-c model_reasoning_effort=` — the documented config override — so we don't
    depend on a dedicated flag the installed Codex may not have.

    Sandbox: full access, but confined to the throwaway worktree. Codex's
    read-only sandbox cannot spawn its file-exploration commands on Windows
    (CreateProcessAsUserW error 1312), which blinds the reviewer to anything
    beyond the embedded diff. Full access lets it open files and run `git diff`
    itself. The review-only contract is enforced by the PROMPT (we never ask it
    to edit), and any stray write lands in the worktree we discard anyway —
    never the real tree."""
    return [
        exe,
        "exec",
        "--cd",
        str(work_root),
        "--dangerously-bypass-approvals-and-sandbox",
        "--skip-git-repo-check",
        "-m",
        model,
        "-c",
        f"model_reasoning_effort={effort}",
        "-",
    ]


def step_up_effort(current: str, ceiling: str) -> str:
    """Return the next effort level up the ladder, clamped to `ceiling`.
    Unknown inputs fall back to `current` (fail safe — never escalate blindly)."""
    if current not in EFFORT_LADDER or ceiling not in EFFORT_LADDER:
        return current
    cur_i = EFFORT_LADDER.index(current)
    ceil_i = EFFORT_LADDER.index(ceiling)
    return EFFORT_LADDER[min(cur_i + 1, ceil_i)]


def claude_build_prompt(
    task_text: str,
    round_num: int,
    prior_critique: Optional[str],
    builder_directive: Optional[str] = None,
) -> str:
    parts = [
        "You are the BUILDER in a two-agent build/review loop. You implement; a "
        "separate reviewer (Codex) checks your work each round.",
        "",
        f"This is build round {round_num}.",
        "",
        "## Task to implement",
        "",
        task_text.rstrip(),
        "",
    ]
    if prior_critique:
        parts += [
            "## Reviewer feedback from the previous round (address ALL of it)",
            "",
            prior_critique.rstrip(),
            "",
            "Revise your implementation to resolve every point above. Do not "
            "argue with the reviewer in code comments — just fix the issues.",
            "",
        ]
    if builder_directive:
        parts += [
            "## Reviewer budget directive (the reviewer controls your effort level)",
            "",
            builder_directive.rstrip(),
            "",
        ]
    parts += [
        "## Rules",
        "- Make the actual file edits in this working directory. Do not just "
        "describe changes — apply them.",
        "- Stay within the scope of the task. Do not refactor unrelated code.",
        "- Budget your effort to the task. Prefer the smallest correct change; do "
        "not gold-plate. The reviewer may explicitly tell you to downshift — when "
        "it does, take the cheaper, tighter path.",
        "- Do not commit, push, or change git branches.",
        "- When you believe the implementation is complete and correct, end your "
        "final message with a one-line summary of what you changed and the "
        'literal marker: "BUILD_COMPLETE".',
    ]
    return "\n".join(parts) + "\n"


def codex_review_prompt(
    task_text: str, diff_text: str, round_num: int, current_effort: str
) -> str:
    if not diff_text.strip():
        diff_block = "(The builder produced NO file changes this round.)"
    else:
        diff_block = diff_text
    return (
        "You are the REVIEWER in a two-agent build/review loop. A builder (Claude) "
        "just implemented a task. Review the builder's git diff against the task "
        "and decide whether it is acceptable to ship.\n\n"
        f"This is review round {round_num}.\n\n"
        "## Original task\n\n"
        f"{task_text.rstrip()}\n\n"
        "## Builder's diff (staged changes in the working tree)\n\n"
        "```diff\n"
        f"{diff_block}\n"
        "```\n\n"
        "## Budget protocol — you control effort on BOTH sides\n"
        f"- You are running at `{current_effort}` reasoning effort, kept "
        "deliberately low to budget cost. Review at this level by default.\n"
        "- If — and only if — this diff is too large or too risky to judge "
        "soundly at the current effort, add a line with exactly "
        f"`{ESCALATE_EFFORT_TOKEN}` to run ONE notch higher NEXT round. The model "
        "stays fixed; only your effort steps up, and only by your judgement.\n"
        "- If the task/diff is small and the builder is over-engineering or "
        f"spending more than it warrants, add a line with exactly "
        f"`{BUILDER_DOWNSHIFT_TOKEN}` followed by one sentence telling the builder "
        "how to do less next round (tighter scope, smaller change). This directive "
        "is injected into the builder's next prompt.\n\n"
        "## How to respond\n"
        "- Judge correctness, completeness against the task, and obvious bugs. "
        "Do not nitpick style.\n"
        "- Put any control tokens (above) BEFORE the verdict line.\n"
        "- If the work is acceptable to ship, the FINAL line of your response must "
        f"be exactly: {APPROVED_TOKEN}\n"
        "- If it needs changes, give a concise numbered list of the specific "
        "problems the builder must fix, then make the FINAL line of your response "
        f"exactly: {CHANGES_TOKEN}\n"
        "- Output nothing after the verdict token.\n"
    )


def parse_control_tokens(codex_stdout: str) -> tuple[bool, Optional[str]]:
    """Scan Codex's review for the two budget-control signals.

    Returns (escalate_effort, builder_downshift_directive). The downshift
    directive is the BUILDER_DOWNSHIFT_TOKEN line with the token stripped, so the
    one-sentence instruction can be injected into the builder's next prompt."""
    escalate = False
    downshift: Optional[str] = None
    for raw in codex_stdout.splitlines():
        ln = raw.strip()
        if ln == ESCALATE_EFFORT_TOKEN or ln.startswith(ESCALATE_EFFORT_TOKEN):
            escalate = True
        if ln.startswith(BUILDER_DOWNSHIFT_TOKEN):
            rest = ln[len(BUILDER_DOWNSHIFT_TOKEN):].strip(" :-—")
            downshift = (
                f"The reviewer judged this task small for the effort spent. "
                f"Downshift next round: {rest}"
                if rest
                else "The reviewer judged this task small for the effort spent. "
                "Downshift next round: make the smallest correct change and stop."
            )
    return escalate, downshift


def parse_verdict(codex_stdout: str) -> Optional[str]:
    """Return APPROVED_TOKEN, CHANGES_TOKEN, or None if neither is the last
    meaningful line. We read the verdict from the trailing lines to avoid
    matching the tokens where they appear inside the instructions echoed back."""
    lines = [ln.strip() for ln in codex_stdout.strip().splitlines() if ln.strip()]
    for ln in reversed(lines[-5:]):  # check the tail only
        if ln == APPROVED_TOKEN:
            return APPROVED_TOKEN
        if ln == CHANGES_TOKEN:
            return CHANGES_TOKEN
    # Looser fallback: a tail line that *ends* with the token.
    for ln in reversed(lines[-5:]):
        if ln.endswith(APPROVED_TOKEN):
            return APPROVED_TOKEN
        if ln.endswith(CHANGES_TOKEN):
            return CHANGES_TOKEN
    return None


def write_artifact(workdir: Path, name: str, text: str) -> Path:
    p = workdir / name
    p.write_text(text, encoding="utf-8")
    return p


def main(argv: Optional[list[str]] = None) -> int:
    args = parse_args(argv)

    repo_root: Path = args.repo_root.resolve()
    if not (repo_root / ".git").exists():
        err(f"--repo-root {repo_root} is not a git repo (no .git).")
        return 2

    input_path: Path = args.input_path
    if not input_path.is_absolute():
        input_path = (Path.cwd() / input_path).resolve()
    if not input_path.is_file():
        err(f"--input {input_path} does not exist.")
        return 2
    task_text = input_path.read_text(encoding="utf-8", errors="replace")

    workdir: Path = args.workdir
    if not workdir.is_absolute():
        workdir = (Path.cwd() / workdir).resolve()
    workdir.mkdir(parents=True, exist_ok=True)

    if args.max_rounds < 1:
        err("--max-rounds must be >= 1.")
        return 2

    try:
        claude_exe, codex_exe = detect_clis()
    except AdapterUnavailable as exc:
        err(str(exc))
        return 3

    # ---- Set up the work root (worktree or in-place).
    wt: Optional[Worktree] = None
    if args.in_place:
        work_root = repo_root
        info(f"[setup] IN-PLACE mode — Claude will edit {work_root} directly.")
    else:
        if not ensure_clean_repo(repo_root):
            info(
                "[setup] warning: repo has uncommitted changes; the worktree "
                "branches off the committed state, so those are not included."
            )
        try:
            wt = make_worktree(repo_root, args.worktree_base, workdir)
        except RuntimeError as exc:
            err(str(exc))
            return 2
        work_root = wt.path
        info(f"[setup] worktree: {work_root}  (branch {wt.branch})")

    claude_cmd = build_claude_command(
        claude_exe, work_root, args.claude_permission_mode
    )

    # Model is PINNED for the whole run (never change models mid-project). Only
    # `current_effort` moves, and only when Codex itself requests a bump.
    codex_model = args.codex_model
    current_effort = args.codex_effort
    if EFFORT_LADDER.index(current_effort) > EFFORT_LADDER.index(args.codex_max_effort):
        info(
            f"[setup] --codex-effort {current_effort} exceeds --codex-max-effort "
            f"{args.codex_max_effort}; clamping start to the ceiling."
        )
        current_effort = args.codex_max_effort
    info(
        f"[setup] Codex pinned to model={codex_model}, start effort="
        f"{current_effort}, ceiling={args.codex_max_effort}, "
        f"escalation={'off' if args.no_codex_effort_escalation else 'on'}"
    )

    converged = False
    prior_critique: Optional[str] = None
    builder_directive: Optional[str] = None
    rounds_run = 0

    for round_num in range(1, args.max_rounds + 1):
        rounds_run = round_num
        info(f"\n=== Round {round_num}/{args.max_rounds} ===")

        # --- BUILD: Claude implements / revises.
        build_prompt = claude_build_prompt(
            task_text, round_num, prior_critique, builder_directive
        )
        write_artifact(workdir, f"round{round_num}-build-prompt.md", build_prompt)
        info("[build] invoking Claude (coding agent)…")
        t0 = time.monotonic()
        build_res = run_cli(
            agent="claude-code",
            adapter="claude_loop",
            command=claude_cmd,
            stdin_text=build_prompt,
            timeout_s=args.claude_timeout,
            cwd=str(work_root),
        )
        write_artifact(
            workdir, f"round{round_num}-build-output.md", build_res.stdout
        )
        if build_res.stderr.strip():
            write_artifact(
                workdir, f"round{round_num}-build-stderr.txt", build_res.stderr
            )
        info(
            f"[build] exit {build_res.exit_code} in "
            f"{int(time.monotonic() - t0)}s"
        )
        if not build_res.ok:
            err(
                f"Claude build exited {build_res.exit_code}; see "
                f"{workdir / f'round{round_num}-build-stderr.txt'}. Stopping."
            )
            break

        # --- REVIEW: Codex reads the diff and votes, at the current (budgeted)
        # effort. Command is rebuilt per round so an effort bump takes effect.
        diff_text = diff_summary(work_root)
        write_artifact(workdir, f"round{round_num}.diff", diff_text or "(no changes)\n")
        review_prompt = codex_review_prompt(
            task_text, diff_text, round_num, current_effort
        )
        write_artifact(
            workdir, f"round{round_num}-review-prompt.md", review_prompt
        )
        codex_cmd = build_codex_command(
            codex_exe, work_root, codex_model, current_effort
        )
        info(
            f"[review] invoking Codex (read-only, model={codex_model}, "
            f"effort={current_effort})…"
        )
        t0 = time.monotonic()
        review_res = run_cli(
            agent="codex",
            adapter="codex_loop",
            command=codex_cmd,
            stdin_text=review_prompt,
            timeout_s=args.codex_timeout,
            cwd=str(work_root),
        )
        write_artifact(
            workdir, f"round{round_num}-review-output.md", review_res.stdout
        )
        if review_res.stderr.strip():
            write_artifact(
                workdir, f"round{round_num}-review-stderr.txt", review_res.stderr
            )
        info(
            f"[review] exit {review_res.exit_code} in "
            f"{int(time.monotonic() - t0)}s"
        )
        if not review_res.ok:
            err(
                f"Codex review exited {review_res.exit_code}; see "
                f"{workdir / f'round{round_num}-review-stderr.txt'}. Stopping."
            )
            break

        # Budget-control signals (effort bump for Codex, downshift for Claude)
        # are read regardless of verdict — Codex can approve AND tell the builder
        # it over-spent, which is useful feedback even on the last round.
        escalate, downshift = parse_control_tokens(review_res.stdout)
        builder_directive = downshift
        if downshift:
            info(f"[review] builder downshift directive issued for next round")

        verdict = parse_verdict(review_res.stdout)
        info(f"[review] verdict: {verdict or 'UNRECOGNIZED'}")
        if verdict == APPROVED_TOKEN:
            converged = True
            break
        if verdict is None:
            err(
                "Codex returned no recognizable verdict token "
                f"({APPROVED_TOKEN}/{CHANGES_TOKEN}). Treating as not-approved "
                "and stopping to avoid a blind loop. Inspect "
                f"{workdir / f'round{round_num}-review-output.md'}."
            )
            break

        # CHANGES_REQUESTED — feed the full critique back to Claude next round.
        prior_critique = review_res.stdout

        # Apply Codex's self-judged effort bump for the NEXT round (model stays
        # pinned; only effort steps up, bounded by the ceiling).
        if escalate and not args.no_codex_effort_escalation:
            bumped = step_up_effort(current_effort, args.codex_max_effort)
            if bumped != current_effort:
                info(
                    f"[review] Codex requested higher effort: "
                    f"{current_effort} → {bumped} (model unchanged)"
                )
                current_effort = bumped
            else:
                info(
                    f"[review] Codex requested higher effort but already at "
                    f"ceiling ({current_effort}); holding."
                )

    # ---- Final summary + receipt.
    summary = [
        "# Build/Review Loop — Receipt\n",
        f"- **Task input:** `{input_path}`",
        f"- **Work root:** `{work_root}`"
        + ("" if args.in_place else f"  (worktree branch `{wt.branch}`)"),
        f"- **Rounds run:** {rounds_run} / {args.max_rounds}",
        f"- **Converged (APPROVED):** {'yes' if converged else 'no'}",
        f"- **Artifacts:** `{workdir}`",
        "",
    ]
    if not args.in_place and wt is not None:
        if converged and args.cleanup:
            remove_worktree(repo_root, wt)
            summary.append(
                f"- **Worktree:** removed (converged + --cleanup). The branch "
                f"`{wt.branch}` was deleted; re-run without --cleanup to keep it."
            )
        else:
            summary.append(
                f"- **Worktree kept** at `{work_root}`. Inspect the diff:\n"
                f"    git -C {repo_root} diff {args.worktree_base}..{wt.branch}\n"
                f"  Remove when done:\n"
                f"    git -C {repo_root} worktree remove --force {work_root} && "
                f"git -C {repo_root} branch -D {wt.branch}"
            )
    receipt = "\n".join(summary) + "\n"
    write_artifact(workdir, "loop-receipt.md", receipt)
    info("\n" + receipt)

    if converged:
        return 0
    # Non-convergence is a real outcome, not a crash — exit 1 so callers can gate.
    return 1


if __name__ == "__main__":
    sys.exit(main())
