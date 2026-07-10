"""Integration manifest for completed workstreams.

Once workers finish, the coordinator records what each produced: the PR (if
one exists), the base commit, the dependency state, tests, verdict, changed
paths, conflicts, and whether a rebase is needed. The manifest is ordered by
dependency so an operator merges parents before children.

The coordinator never merges. `recommend_merge_order()` returns the order,
`prepare_commands()` returns command strings an operator can run by hand.
Neither executes anything, and neither produces a merge, deploy, force-push,
or migration-apply command (the safety guard proves it).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from orchestration.relay_coordinator.graph import DependencyGraph
from orchestration.relay_coordinator.safety import assert_command_safe


@dataclass
class IntegrationRecord:
    """One completed workstream's integration state."""

    workstream_id: str
    wave: int
    depends_on: list[str] = field(default_factory=list)
    pr: str | None = None
    branch: str = ""
    base_commit: str = ""
    dependency_state: str = "clean"  # clean | stale | blocked
    tests: str = "unknown"  # pass | fail | skipped | unknown
    verdict: str = "unknown"  # pass | continue | blocked | risk | unsupported
    changed_paths: list[str] = field(default_factory=list)
    conflicts: list[str] = field(default_factory=list)
    rebase_needed: bool = False
    rerun_needed: bool = False
    stale: bool = False

    def to_dict(self) -> dict[str, Any]:
        return {
            "workstream_id": self.workstream_id,
            "wave": self.wave,
            "depends_on": list(self.depends_on),
            "pr": self.pr,
            "branch": self.branch,
            "base_commit": self.base_commit,
            "dependency_state": self.dependency_state,
            "tests": self.tests,
            "verdict": self.verdict,
            "changed_paths": list(self.changed_paths),
            "conflicts": list(self.conflicts),
            "rebase_needed": self.rebase_needed,
            "rerun_needed": self.rerun_needed,
            "stale": self.stale,
        }


@dataclass
class IntegrationManifest:
    """Ordered integration records for a completed set of workstreams."""

    records: list[IntegrationRecord] = field(default_factory=list)

    def by_id(self, wid: str) -> IntegrationRecord | None:
        for r in self.records:
            if r.workstream_id == wid:
                return r
        return None

    def to_dict(self) -> dict[str, Any]:
        return {"records": [r.to_dict() for r in self.records]}


def build_manifest(
    graph: DependencyGraph,
    records: list[IntegrationRecord],
) -> IntegrationManifest:
    """Order the given records by dependency (parents before children).

    Records are sorted by wave, then by the graph's input order, so the
    manifest reads top-down in a safe merge order. Records for workstreams
    not in the graph sort last, in the order given.
    """
    def sort_key(r: IntegrationRecord) -> tuple[int, int]:
        ws = graph.workstreams.get(r.workstream_id)
        if ws is None:
            return (10**9, 10**9)
        try:
            idx = graph.order.index(r.workstream_id)
        except ValueError:
            idx = 10**9
        return (ws.wave, idx)

    return IntegrationManifest(records=sorted(records, key=sort_key))


def recommend_merge_order(manifest: IntegrationManifest) -> list[str]:
    """Return workstream ids in the recommended (already ordered) merge order.

    The manifest is built dependency-ordered, so this reads it back as ids.
    The coordinator recommends; it never runs a merge.
    """
    return [r.workstream_id for r in manifest.records]


def prepare_commands(
    manifest: IntegrationManifest,
    repo_root: str = ".",
    base_branch: str = "main",
) -> list[dict[str, Any]]:
    """Return per-workstream operator command strings. Never executes.

    For each record the coordinator suggests the manual steps an operator
    would take: fetch, check out the branch, rebase onto the base branch when
    a rebase is flagged, run the named tests, and open a PR for review. It
    never emits a merge, deploy, force-push, or migration-apply command;
    every produced string is checked by the safety guard.
    """
    plans: list[dict[str, Any]] = []
    for r in manifest.records:
        steps: list[str] = []
        if r.branch:
            steps.append(f"git -C {repo_root} fetch origin")
            steps.append(f"git -C {repo_root} checkout {r.branch}")
            if r.rebase_needed:
                steps.append(f"git -C {repo_root} rebase origin/{base_branch}")
        if r.tests and r.tests not in ("pass",):
            steps.append("# re-run the workstream's tests before opening a PR")
        if r.rerun_needed:
            steps.append(
                f"# rerun relay for {r.workstream_id}: its dependency changed after this run"
            )
        # A review PR is a draft the operator opens; the coordinator never
        # merges it. Kept as a comment so no automation reads it as runnable.
        steps.append(f"# open a draft PR for {r.branch or r.workstream_id} for human review")

        for s in steps:
            assert_command_safe(s)

        plans.append(
            {
                "workstream_id": r.workstream_id,
                "rebase_needed": r.rebase_needed,
                "rerun_needed": r.rerun_needed,
                "stale": r.stale,
                "steps": steps,
            }
        )
    return plans
