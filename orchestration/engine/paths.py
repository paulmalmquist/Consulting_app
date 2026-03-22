from __future__ import annotations

from pathlib import Path


def repo_root() -> Path:
    cur = Path(__file__).resolve()
    for p in [cur, *cur.parents]:
        if (p / ".git").exists():
            return p
    return Path.cwd()


ROOT = repo_root()
ORCH_DIR = ROOT / "orchestration"
ENGINE_DIR = ORCH_DIR / "engine"
RUNTIME_DIR = ROOT / ".orchestration"
SESSIONS_DIR = RUNTIME_DIR / "sessions"
LOGS_DIR = RUNTIME_DIR / "logs"
LOCKS_DIR = RUNTIME_DIR / "locks"
WORKTREES_DIR = RUNTIME_DIR / "worktrees"
GITHOOKS_DIR = ROOT / ".githooks"


def ensure_runtime_dirs() -> None:
    for d in (SESSIONS_DIR, LOGS_DIR, LOCKS_DIR, WORKTREES_DIR):
        d.mkdir(parents=True, exist_ok=True)
