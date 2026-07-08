"""Preflight checks: everything the relay verifies before touching git.

Fail-closed rules:
- `git fetch origin main` failure is a hard stop; a stale local base
  requires the explicit --allow-stale-base flag.
- Missing `claude` or `codex` CLI is a hard stop (exit 3 downstream).
- `gh` problems only degrade PR creation to a manual-instructions file.

No check ever prints environment variable values; details are names,
paths, and booleans only.
"""
from __future__ import annotations

import shutil
import subprocess
from dataclasses import dataclass, field
from pathlib import Path

OK, WARN, FAIL, INFO = "ok", "warn", "fail", "info"


@dataclass
class Check:
    name: str
    status: str  # ok | warn | fail | info
    detail: str


@dataclass
class PreflightConfig:
    repo_root: Path
    base_ref: str = "origin/main"
    allow_stale_base: bool = False
    pr_requested: bool = True
    plan_path: Path | None = None
    worktree_root: Path | None = None
    fixture_mode: bool = False  # fixture runs skip the CLI checks
    fixture_dir: Path | None = None  # validated before any mutation
    read_only: bool = False  # strict --dry-run: no fetch, no write probes


@dataclass
class PreflightResult:
    checks: list[Check] = field(default_factory=list)

    def add(self, name: str, status: str, detail: str) -> None:
        self.checks.append(Check(name, status, detail))

    @property
    def failed(self) -> bool:
        return any(c.status == FAIL for c in self.checks)

    def failures(self) -> list[Check]:
        return [c for c in self.checks if c.status == FAIL]

    def to_payload(self) -> list[dict]:
        return [c.__dict__ for c in self.checks]


def _run(cmd: list[str], cwd: Path | None = None, timeout: int = 120) -> subprocess.CompletedProcess:
    """Run a check command. A hang degrades to returncode 124 instead of an
    uncaught TimeoutExpired crashing preflight (exit-code table integrity)."""
    try:
        return subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            cwd=str(cwd) if cwd else None,
            timeout=timeout,
        )
    except subprocess.TimeoutExpired:
        return subprocess.CompletedProcess(
            cmd, 124, stdout="", stderr=f"timed out after {timeout}s"
        )
    except OSError as exc:
        return subprocess.CompletedProcess(cmd, 127, stdout="", stderr=str(exc))


def run_preflight(cfg: PreflightConfig) -> PreflightResult:
    r = PreflightResult()
    root = cfg.repo_root

    # Git repo present.
    if not (root / ".git").exists():
        r.add("git-repo", FAIL, f"{root} is not a git repository (no .git).")
        return r
    r.add("git-repo", OK, str(root))

    # Branch / detached state is informational: the relay works in its own worktree.
    branch = _run(["git", "-C", str(root), "branch", "--show-current"])
    branch_name = branch.stdout.strip() or "(detached HEAD)"
    r.add("current-branch", INFO, branch_name)

    # Dirty primary checkout: warn only. Untracked scratch never blocks.
    dirty = _run(["git", "-C", str(root), "status", "--porcelain", "--untracked-files=no"])
    if dirty.stdout.strip():
        n = len(dirty.stdout.strip().splitlines())
        r.add(
            "primary-dirty", WARN,
            f"{n} tracked file(s) modified in the primary checkout. The relay "
            "works in its own worktree and never touches these.",
        )
    else:
        r.add("primary-dirty", OK, "primary checkout clean (tracked files)")

    # Base freshness: fetch is mandatory unless explicitly waived.
    if cfg.read_only:
        r.add("base-fetch", INFO, "skipped in --dry-run (a real run fetches, and a fetch failure is a hard stop)")
    elif cfg.base_ref.startswith("origin/"):
        remote_branch = cfg.base_ref.split("/", 1)[1]
        fetch = _run(["git", "-C", str(root), "fetch", "origin", remote_branch], timeout=180)
        if fetch.returncode == 0:
            r.add("base-fetch", OK, f"fetched origin/{remote_branch}")
        elif cfg.allow_stale_base:
            r.add(
                "base-fetch", WARN,
                "git fetch failed; proceeding on the STALE local ref because "
                "--allow-stale-base was passed. This is recorded in run.json.",
            )
        else:
            r.add(
                "base-fetch", FAIL,
                f"git fetch origin {remote_branch} failed: {fetch.stderr.strip()[:300]}\n"
                "Fix connectivity/auth, or re-run with --allow-stale-base to "
                "accept a stale local base (recorded as a warning).",
            )
    else:
        r.add(
            "base-fetch", WARN,
            f"non-remote base ref {cfg.base_ref!r}: no fetch performed, "
            "freshness not verified.",
        )
    verify = _run(["git", "-C", str(root), "rev-parse", "--verify", cfg.base_ref])
    if verify.returncode == 0:
        r.add("base-ref", OK, f"{cfg.base_ref} = {verify.stdout.strip()[:12]}")
    else:
        r.add("base-ref", FAIL, f"base ref {cfg.base_ref} does not resolve.")

    # Provider CLIs. Fixture mode replaces them with fakes.
    if cfg.fixture_mode:
        r.add("claude-cli", INFO, "fixture mode: real CLI not required")
        r.add("codex-cli", INFO, "fixture mode: real CLI not required")
    else:
        for name in ("claude", "codex"):
            path = shutil.which(name)
            if path:
                r.add(f"{name}-cli", OK, path)
            else:
                r.add(
                    f"{name}-cli", FAIL,
                    f"`{name}` not found on PATH. Install it, or run with "
                    "--fixture for a no-CLI dry exercise.",
                )

    # gh: degrades PR creation, never blocks the loop. Short timeout: `gh
    # auth status` does network I/O and a hang must not stall preflight.
    gh = shutil.which("gh")
    if not gh:
        r.add("gh-cli", WARN, "gh not on PATH; PR creation will fall back to MANUAL_PR.md")
    else:
        auth = _run([gh, "auth", "status"], timeout=20)
        if auth.returncode == 0:
            r.add("gh-cli", OK, "gh present and authenticated")
        else:
            r.add(
                "gh-cli", WARN,
                "gh is installed but not authenticated or not responding "
                "(`gh auth login`). PR creation will fall back to MANUAL_PR.md.",
            )

    # Fixture dir must exist before any mutation happens.
    if cfg.fixture_dir is not None and not cfg.fixture_dir.is_dir():
        r.add("fixture-dir", FAIL, f"--fixture {cfg.fixture_dir} is not a directory")

    # Toolchains that affect which test suites can run (warn only).
    for name in ("node", "npm"):
        r.add(f"{name}", OK if shutil.which(name) else WARN,
              shutil.which(name) or f"{name} not on PATH; frontend suites will be skipped honestly")
    venv = root / "backend" / ".venv"
    r.add(
        "backend-venv",
        OK if venv.is_dir() else WARN,
        str(venv) if venv.is_dir() else
        "backend/.venv not found; backend suites use the PATH interpreter (recorded)",
    )

    # Plan path (when given as a file).
    if cfg.plan_path is not None:
        if cfg.plan_path.is_file():
            r.add("plan-path", OK, str(cfg.plan_path))
        else:
            r.add("plan-path", FAIL, f"plan file {cfg.plan_path} does not exist")

    # Writability of the two directories the relay needs.
    if cfg.read_only:
        r.add("runs-dir", INFO, "write probe skipped in --dry-run")
        r.add("worktree-root", INFO, "write probe skipped in --dry-run")
        return r
    for label, target in (
        ("runs-dir", root / ".orchestration" / "runs"),
        ("worktree-root", cfg.worktree_root or root.parent),
    ):
        try:
            target.mkdir(parents=True, exist_ok=True)
            probe = target / ".relay-write-probe"
            probe.write_text("ok", encoding="utf-8")
            probe.unlink()
            r.add(label, OK, str(target))
        except OSError as exc:
            r.add(label, FAIL, f"cannot write {target}: {exc}")

    return r
