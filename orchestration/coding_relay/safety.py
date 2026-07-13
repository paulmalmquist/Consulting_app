"""Hard-stop safety scanner, run after every build pass and before review.

Two severities:
- "stop": the run terminates immediately (exit 4). No review, no PR.
- "escalate": the run terminates with a risk report (exit 5); a human
  decides how to proceed (inspect the worktree, adjust the plan, re-run).

Structural never-dos live in code shape, not scanning: no relay code path
invokes `gh pr merge`, `git push --force`, deploy commands, or
`git worktree remove`; PR creation always passes --draft.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path

from orchestration.coding_relay.redact import STOP_PATTERNS

STOP = "stop"
ESCALATE = "escalate"

# Mirrors .githooks/pre-commit: >100 files staged for deletion blocks.
# The snapshot counts deletions with rename detection disabled, so a mass
# move/rename counts as deletions too (the hook itself has that blind spot).
MASS_DELETION_FILES = 100

DB_MIGRATION_PREFIXES = ("supabase/", "repo-b/db/schema/", "migrations/")
# Files that execute on developer or CI machines.
WORKFLOW_PREFIXES = (".github/", ".githooks/")
HOST_EXEC_FILES = ("Makefile", "dev.sh")
AUTH_PATH_RE = re.compile(r"(^|/)(auth|security|permission|session)[^/]*(/|\.|$)", re.IGNORECASE)
AUTH_SURFACE_PREFIXES = ("backend/", "repo-b/")
SELF_PREFIX = "orchestration/coding_relay/"
SYMLINK_DIFF_RE = re.compile(r"^(?:new|old) file mode 120000", re.MULTILINE)


@dataclass
class Violation:
    rule: str
    severity: str  # stop | escalate
    detail: str
    paths: list = field(default_factory=list)


@dataclass
class DiffSnapshot:
    """What one build pass changed, gathered by the loop via git."""

    diff_text: str
    changed_paths: list
    deleted_paths: list
    numstat: list  # (added, deleted, path) strings


def added_lines(diff_text: str) -> list:
    return [
        line[1:]
        for line in diff_text.splitlines()
        if line.startswith("+") and not line.startswith("+++")
    ]


def scan(
    worktree: Path,
    snapshot: DiffSnapshot,
    plan_text: str,
    allow_migrations: bool = False,
    allow_relay_self_edit: bool = False,
    migration_prefixes: tuple | list | None = None,
    auth_prefixes: tuple | list | None = None,
) -> list:
    # Fall back to this repo's constants when a caller passes no config, so
    # existing call sites keep byte-identical behavior.
    mig_prefixes = tuple(migration_prefixes) if migration_prefixes is not None else DB_MIGRATION_PREFIXES
    surf_prefixes = tuple(auth_prefixes) if auth_prefixes is not None else AUTH_SURFACE_PREFIXES
    violations: list = []
    paths = [p.replace("\\", "/") for p in snapshot.changed_paths]

    # mass_deletion (stop) — same metric as .githooks/pre-commit.
    if len(snapshot.deleted_paths) > MASS_DELETION_FILES:
        violations.append(
            Violation(
                "mass_deletion", STOP,
                f"{len(snapshot.deleted_paths)} files deleted "
                f"(limit {MASS_DELETION_FILES}, mirroring .githooks/pre-commit).",
                snapshot.deleted_paths[:20],
            )
        )

    # outside_worktree_write (stop) — traversal, absolute, or resolve-escape.
    wt = worktree.resolve()
    escapes: list = []
    for rel in paths:
        p = Path(rel)
        if p.is_absolute() or ".." in p.parts:
            escapes.append(rel)
            continue
        try:
            real = (wt / p).resolve()
        except OSError:
            escapes.append(rel)
            continue
        try:
            real.relative_to(wt)
        except ValueError:
            escapes.append(rel)
    if escapes:
        violations.append(
            Violation(
                "outside_worktree_write", STOP,
                "Changed paths resolve outside the relay worktree "
                "(path traversal or a link escape).",
                escapes[:20],
            )
        )
    if SYMLINK_DIFF_RE.search(snapshot.diff_text):
        violations.append(
            Violation(
                "outside_worktree_write", STOP,
                "The diff creates or modifies a symlink (mode 120000). "
                "Links are forbidden inside the relay sandbox.",
            )
        )

    # db_migration (stop unless --allow-migrations).
    db_paths = [p for p in paths if p.startswith(mig_prefixes) or "/migrations/" in p]
    if db_paths and not allow_migrations:
        violations.append(
            Violation(
                "db_migration", STOP,
                "DB schema/migration paths changed without --allow-migrations.",
                db_paths[:20],
            )
        )

    # secrets_in_diff (stop). Uses the high-confidence STOP_PATTERNS tier
    # only, so ordinary code like `token = create_access_token(user)` does
    # not kill a run; redaction of receipts stays aggressive separately.
    secret_hits = []
    for line in added_lines(snapshot.diff_text):
        for label, pattern in STOP_PATTERNS:
            if pattern.search(line):
                secret_hits.append(label)
                break
    if secret_hits:
        violations.append(
            Violation(
                "secrets_in_diff", STOP,
                f"Secret-shaped content in added lines: {sorted(set(secret_hits))}. "
                "The diff itself is redacted in the run artifacts.",
            )
        )

    # workflow_hooks (escalate): CI config, git hooks, and root files that
    # execute commands on developer/CI machines.
    wf = [
        p for p in paths
        if p.startswith(WORKFLOW_PREFIXES) or p in HOST_EXEC_FILES
    ]
    if wf:
        violations.append(
            Violation(
                "workflow_hooks", ESCALATE,
                "CI workflow, git hook, or host-executable files changed; "
                "a human must approve.",
                wf[:20],
            )
        )

    # auth_security (escalate).
    auth = [
        p for p in paths
        if p.startswith(surf_prefixes) and AUTH_PATH_RE.search(p)
    ]
    if auth:
        violations.append(
            Violation(
                "auth_security", ESCALATE,
                "Auth/security-surface paths changed; a human must approve.",
                auth[:20],
            )
        )

    # orchestration_self_edit (escalate) — the builder rewriting its own
    # harness. Always escalates: plan text is author-controlled, so a
    # substring carve-out would let any plan that merely mentions the relay
    # weaken the scanner. --allow-relay-self-edit is the recorded override.
    self_edits = [p for p in paths if p.startswith(SELF_PREFIX)]
    if self_edits and not allow_relay_self_edit:
        violations.append(
            Violation(
                "orchestration_self_edit", ESCALATE,
                "The builder edited the relay's own code. Re-run with "
                "--allow-relay-self-edit (recorded) if the plan legitimately "
                "targets the relay.",
                self_edits[:20],
            )
        )

    return violations


def stops(violations: list) -> list:
    return [v for v in violations if v.severity == STOP]


def escalations(violations: list) -> list:
    return [v for v in violations if v.severity == ESCALATE]
