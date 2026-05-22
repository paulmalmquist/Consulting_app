#!/usr/bin/env python3
"""session.py — winston-plan-relay session launcher (Ticket 3A: review launcher).

Picks an active implementation plan, optionally creates an isolated git
worktree, and runs `relay.py` against it. Writes a session receipt.

Ticket 3A scope: **review-class runs only.** `--execution-class coding` is
rejected — coding mode arrives in Ticket 3B with an explicit permission
posture. 3A builds and exercises the full worktree create→run→report→leave
lifecycle so 3B inherits a proven mechanism.

Hard no's (3A): no coding permissions, no auto-editing, no auto-commit, no
auto-merge, no git push, no worktree removal.

Run with --help for the full argument list. See SKILL.md.
"""
from __future__ import annotations

import argparse
import datetime as _dt
import subprocess
import sys
from pathlib import Path
from typing import Optional


MODES = ("plan-review", "route-and-plan", "handoff-only", "two-agent-loop")
TARGET_AGENTS = ("claude-code", "codex", "human")
EXECUTION_CLASSES = ("review", "coding")
ACTIVE_PLANS_DIR_REL = "docs/plans/03-implementation-plans/active"
SESSIONS_OUT_REL = "tmp/relay-sessions"
RELAY_REL = "skills/winston-plan-relay/scripts/relay.py"


def err(msg: str) -> None:
    sys.stderr.write(f"session.py: error: {msg}\n")


def warn(msg: str) -> None:
    sys.stderr.write(f"session.py: warning: {msg}\n")


def parse_args(argv: Optional[list[str]] = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        prog="session.py",
        description="winston-plan-relay session launcher (Ticket 3A — review launcher).",
    )
    p.add_argument("--repo-root", type=Path, default=Path.cwd())
    p.add_argument("--plan", default=None, help="Plan number (0006) or filename; omitted → interactive picker")
    p.add_argument("--mode", default="handoff-only", choices=MODES)
    p.add_argument("--target-agent", default="claude-code", choices=TARGET_AGENTS)
    p.add_argument(
        "--execution-class",
        default="review",
        choices=EXECUTION_CLASSES,
        help="3A accepts 'review' only; 'coding' is rejected (arrives in Ticket 3B).",
    )
    p.add_argument("--headless", action="store_true", help="run the reviewer CLI; off → dry-run bundle for manual paste")
    p.add_argument("--dry-run", action="store_true", help="force relay dry-run; never invokes a model")
    p.add_argument("--worktree-root", type=Path, default=None,
                   help="parent dir for session worktrees (default: <repo-root>/../Consulting_app_sessions)")
    p.add_argument("--worktree", action="store_true",
                   help="run inside an isolated git worktree. Review needs no isolation, so this "
                        "is opt-in for 3A; Ticket 3B makes it mandatory for coding runs.")
    p.add_argument("--adapter-timeout", type=int, default=600)
    return p.parse_args(argv)


def validate_repo_root(repo_root: Path) -> bool:
    markers = ["CLAUDE.md", "AGENTS.md", ".git"]
    if any((repo_root / m).exists() for m in markers):
        return True
    err(f"--repo-root {repo_root} does not look like a repo root (no CLAUDE.md / AGENTS.md / .git).")
    return False


def list_active_plans(repo_root: Path) -> list[Path]:
    adir = repo_root / ACTIVE_PLANS_DIR_REL
    if not adir.is_dir():
        return []
    return sorted(
        p for p in adir.iterdir()
        if p.is_file() and p.suffix == ".md" and not p.name.startswith("_")
    )


def resolve_plan(repo_root: Path, plan_arg: Optional[str]) -> Optional[Path]:
    """Resolve --plan to a file, or run the interactive picker if omitted."""
    plans = list_active_plans(repo_root)
    if not plans:
        err(f"no active plans found in {repo_root / ACTIVE_PLANS_DIR_REL}")
        return None

    if plan_arg:
        # Match by exact filename, by stem, or by leading NNNN number.
        for p in plans:
            if p.name == plan_arg or p.stem == plan_arg:
                return p
        norm = plan_arg.lstrip("0") or "0"
        for p in plans:
            num = p.name.split("-", 1)[0]
            if num == plan_arg or (num.isdigit() and num.lstrip("0") == norm):
                return p
        err(f"--plan {plan_arg!r} matched no active plan. Available:")
        for p in plans:
            sys.stderr.write(f"  {p.name}\n")
        return None

    # Interactive picker.
    sys.stdout.write("\nActive implementation plans:\n")
    for i, p in enumerate(plans, 1):
        sys.stdout.write(f"  {i:2d}. {p.name}\n")
    sys.stdout.write(f"\nSelect a plan [1-{len(plans)}]: ")
    sys.stdout.flush()
    try:
        choice = input().strip()
    except EOFError:
        err("no selection received (stdin closed). Pass --plan to run non-interactively.")
        return None
    if not choice.isdigit() or not (1 <= int(choice) <= len(plans)):
        err(f"invalid selection {choice!r}.")
        return None
    return plans[int(choice) - 1]


def git(repo_root: Path, *args: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["git", "-C", str(repo_root), *args],
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )


def base_branch_clean(repo_root: Path) -> tuple[bool, str]:
    """Clean = no *tracked* modifications. Untracked files are ignored —
    they neither block `git worktree add` nor get carried into the worktree,
    so they are not a reason to refuse a session run."""
    r = git(repo_root, "status", "--porcelain", "--untracked-files=no")
    if r.returncode != 0:
        return False, f"git status failed: {r.stderr.strip()}"
    dirty = r.stdout.strip()
    return (dirty == ""), dirty


def current_branch(repo_root: Path) -> str:
    r = git(repo_root, "branch", "--show-current")
    return r.stdout.strip() if r.returncode == 0 else "(unknown)"


def plan_short_id(stem: str) -> str:
    """Leading NNNN number of a plan stem, or a truncated stem if unnumbered.
    Keeps worktree paths short — Windows MAX_PATH (260) is unforgiving and the
    repo has ~200-char file paths under verification/receipts/."""
    head = stem.split("-", 1)[0]
    if head.isdigit():
        return head
    return stem[:12]


def create_worktree(repo_root: Path, worktree_root: Path, stem: str) -> tuple[Optional[Path], str]:
    """Create a named git worktree on a fresh session branch. Returns
    (worktree_path, branch_name) or (None, error).

    The worktree name uses only the plan's short id + timestamp, not the full
    stem — a long worktree path plus the repo's deep file paths overflows
    Windows MAX_PATH. `core.longpaths=true` is set per-invocation so the
    checkout itself survives the long paths it still contains."""
    ts = _dt.datetime.now(_dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    sid = plan_short_id(stem)
    name = f"session-{sid}-{ts}"
    branch = f"session/{sid}-{ts}"
    wt_path = worktree_root / name
    worktree_root.mkdir(parents=True, exist_ok=True)
    r = git(repo_root, "-c", "core.longpaths=true", "worktree", "add", str(wt_path), "-b", branch)
    if r.returncode != 0:
        return None, r.stderr.strip() or r.stdout.strip()
    return wt_path, branch


def build_relay_command(
    repo_root_for_relay: Path,
    relay_script: Path,
    plan_path: Path,
    args: argparse.Namespace,
    out_path: Path,
) -> list[str]:
    cmd = [
        sys.executable, str(relay_script),
        "--repo-root", str(repo_root_for_relay),
        "--input", str(plan_path),
        "--mode", args.mode,
        "--target-agent", args.target_agent,
        "--out", str(out_path),
        "--adapter-timeout", str(args.adapter_timeout),
    ]
    # Dry-run unless an explicit headless run was requested. `human` is
    # always dry-run (no CLI to invoke).
    if args.dry_run or not args.headless or args.target_agent == "human":
        cmd.append("--dry-run")
    return cmd


def write_session_receipt(
    receipt_path: Path,
    args: argparse.Namespace,
    plan_path: Path,
    base_branch: str,
    worktree_path: Optional[Path],
    worktree_branch: Optional[str],
    relay_cmd: list[str],
    relay_rc: int,
    out_path: Path,
    git_status_summary: str,
) -> None:
    headless = args.headless and not args.dry_run and args.target_agent != "human"
    lines = [
        "# Winston Plan Relay — Session Receipt\n",
        f"**Status:** {'SUCCESS' if relay_rc == 0 else 'FAILURE (relay exit ' + str(relay_rc) + ')'}\n",
        f"- **Plan:** `{plan_path}`",
        f"- **Execution class:** `{args.execution_class}`",
        f"- **Relay mode:** `{args.mode}`",
        f"- **Target agent:** `{args.target_agent}`",
        f"- **Run type:** {'headless adapter run' if headless else 'dry-run (bundle only)'}",
        f"- **Base branch:** `{base_branch}`",
    ]
    if worktree_path is not None:
        lines += [
            f"- **Worktree:** `{worktree_path}`",
            f"- **Worktree branch:** `{worktree_branch}`",
        ]
    else:
        lines.append("- **Worktree:** none (review default — pass --worktree to isolate)")
    lines += [
        f"- **Relay command:** `{' '.join(relay_cmd)}`",
        f"- **Relay exit code:** `{relay_rc}`",
        f"- **Output:** `{out_path}`",
        f"- **Relay receipt:** `{out_path.parent / (out_path.name + '.receipt.md')}`",
        "",
        "## Worktree git status\n",
        "```",
        git_status_summary if git_status_summary.strip() else "(clean — review runs make no edits)",
        "```",
        "",
        "## Review commands\n",
    ]
    if worktree_path is not None:
        lines += [
            "```",
            f"git -C {worktree_path} status",
            f"git -C {worktree_path} diff --stat",
            f"git -C {worktree_path} diff",
            "```",
            "",
            f"The worktree is left intact for review. session.py never commits, merges, "
            f"pushes, or removes it. To clean up: `git worktree remove {worktree_path}`.",
        ]
    else:
        lines.append(f"```\ncat {out_path}\n```")
    receipt_path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main(argv: Optional[list[str]] = None) -> int:
    args = parse_args(argv)

    # --- Ticket 3A gate: coding mode is not built here.
    if args.execution_class == "coding":
        err("--execution-class coding is not available - coding mode arrives in Ticket 3B. "
            "Ticket 3A is a review launcher only.")
        return 2

    repo_root: Path = args.repo_root.resolve()
    if not repo_root.is_dir():
        err(f"--repo-root {repo_root} is not a directory.")
        return 2
    if not validate_repo_root(repo_root):
        return 2

    relay_script = repo_root / RELAY_REL
    if not relay_script.is_file():
        err(f"relay.py not found at {relay_script}.")
        return 2

    plan_path = resolve_plan(repo_root, args.plan)
    if plan_path is None:
        return 2
    plan_path = plan_path.resolve()
    stem = plan_path.stem

    worktree_root = args.worktree_root
    if worktree_root is None:
        worktree_root = (repo_root.parent / "Consulting_app_sessions")
    worktree_root = worktree_root.resolve()

    # Worktree is opt-in for 3A review runs (review edits nothing, so
    # isolation buys nothing and a full second checkout is pure overhead).
    # Dry-run never uses one. Ticket 3B makes it mandatory for coding.
    use_worktree = args.worktree and not args.dry_run

    worktree_path: Optional[Path] = None
    worktree_branch: Optional[str] = None
    base_branch = current_branch(repo_root)

    if use_worktree:
        clean, dirty = base_branch_clean(repo_root)
        if not clean:
            err(f"base branch '{base_branch}' has tracked modifications - a worktree run needs a clean base.\n"
                f"  dirty paths:\n    " + "\n    ".join(dirty.splitlines()) + "\n"
                f"  commit or stash these, or drop --worktree to run in the repo directly.")
            return 2
        worktree_path, info = create_worktree(repo_root, worktree_root, stem)
        if worktree_path is None:
            err(f"git worktree add failed: {info}")
            return 3
        sys.stdout.write(f"Created worktree: {worktree_path}\n")
        sys.stdout.write(f"Worktree branch:  {info}\n")
        worktree_branch = info

    # Output dir for session artifacts — always under the MAIN repo so the
    # operator reads results without cd-ing into the worktree.
    out_dir = repo_root / SESSIONS_OUT_REL / stem
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{stem}.out.md"
    session_receipt_path = out_dir / f"{stem}.session.md"

    relay_repo_root = worktree_path if worktree_path is not None else repo_root
    relay_cmd = build_relay_command(relay_repo_root, relay_script, plan_path, args, out_path)

    sys.stdout.write(f"\nRunning relay:\n  {' '.join(relay_cmd)}\n\n")
    relay = subprocess.run(relay_cmd, text=True)
    relay_rc = relay.returncode

    # Worktree git status (a review run should leave it clean).
    git_status_summary = ""
    if worktree_path is not None:
        st = git(worktree_path, "status", "--porcelain")
        git_status_summary = st.stdout

    write_session_receipt(
        session_receipt_path, args, plan_path, base_branch,
        worktree_path, worktree_branch, relay_cmd, relay_rc,
        out_path, git_status_summary,
    )

    sys.stdout.write(f"\nSession receipt: {session_receipt_path}\n")
    if relay_rc != 0:
        err(f"relay exited {relay_rc} — see {session_receipt_path}.")
        return 1

    sys.stdout.write("Session complete.\n")
    if worktree_path is not None:
        sys.stdout.write(f"\nReview the worktree:\n"
                         f"  git -C {worktree_path} status\n"
                         f"  git -C {worktree_path} diff --stat\n"
                         f"Worktree left intact - session.py never commits/merges/pushes/removes it.\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
