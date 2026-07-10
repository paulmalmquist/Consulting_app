"""Coordinator safety: hard-stop conditions and forbidden-command guard.

These stops are the coordinator's own, distinct from the relay's diff
scanner. They fire before any worker launches:

- a dependency cycle
- two same-wave workstreams that share an owned path
- migrations without a deterministic total order
- a shared contract a parallel dependent would edit
- a workstream with no acceptance criteria

Graph construction and wave scheduling already raise CoordinatorError for
these; `preflight_stops` re-runs them as an explicit gate and returns a list
of stop descriptions so the CLI can print them together and refuse to launch.

The coordinator itself must never emit a command that merges a PR, pushes to
main, force-pushes, deploys, or applies a migration. `assert_command_safe`
and `contains_forbidden_command` enforce that on every relay command string
the coordinator builds.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

from orchestration.relay_coordinator.graph import (
    CoordinatorError,
    DependencyGraph,
    Workstream,
    same_wave_owned_path_conflicts,
)


class CoordinatorSafetyError(CoordinatorError):
    """A forbidden command was about to be produced. Never recoverable."""


# Patterns the coordinator must never produce in any command it builds.
# Each is (rule, compiled regex). Kept high-confidence so ordinary relay
# flags never trip them.
_FORBIDDEN_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("pr_merge", re.compile(r"\bgh\b.+\bpr\b.+\bmerge\b")),
    ("pr_merge", re.compile(r"\bpr\s+merge\b")),
    ("push_to_main", re.compile(r"\bgit\s+push\b.+\b(origin\s+)?(HEAD:)?main\b")),
    ("push_to_main", re.compile(r"\bgit\s+push\b.+\bmaster\b")),
    ("force_push", re.compile(r"\bgit\s+push\b.*(--force\b|--force-with-lease\b|\s-f\b)")),
    ("force_push", re.compile(r"\+[A-Za-z0-9_./-]+:refs/heads/")),
    ("deploy", re.compile(r"\b(vercel|railway)\b.+\b(deploy|up|--prod)\b")),
    ("deploy", re.compile(r"\bdeploy\s+--prod\b")),
    ("apply_migration", re.compile(r"\b(supabase\s+db\s+push|apply_migration|db\s+push)\b")),
    ("draft_pr_flag", re.compile(r"--draft-pr\b")),
]


def contains_forbidden_command(command: str) -> list[str]:
    """Return the rule names any forbidden pattern matches in `command`.

    An empty list means the command is clear of merge/deploy/force-push/
    push-to-main/migration-apply shapes.
    """
    hits: list[str] = []
    for rule, pattern in _FORBIDDEN_PATTERNS:
        if pattern.search(command):
            hits.append(rule)
    return hits


def assert_command_safe(command: str | list[str]) -> None:
    """Raise CoordinatorSafetyError if `command` contains a forbidden shape.

    Called on every relay command the coordinator builds. This is the code
    enforcement of the rule that the coordinator never merges, deploys,
    force-pushes, pushes to main, or applies a migration.
    """
    text = " ".join(command) if isinstance(command, list) else command
    hits = contains_forbidden_command(text)
    if hits:
        raise CoordinatorSafetyError(
            "refusing to produce a forbidden command "
            f"({', '.join(sorted(set(hits)))}): {text}"
        )


@dataclass
class Stop:
    """One coordinator hard stop."""

    rule: str
    detail: str


def preflight_stops(graph: DependencyGraph, concurrency: int = 3) -> list[Stop]:
    """Return every coordinator hard stop for a graph, or [] when clear.

    Runs the same checks graph construction runs, plus the wave overlap
    check, and collects them instead of raising on the first. The CLI uses
    this to print all stops together and refuse to launch. A clear list is
    the only path to launching a worker.
    """
    stops: list[Stop] = []

    # Missing criteria.
    for ws in graph.workstreams.values():
        if not [c for c in ws.acceptance_criteria if str(c).strip()]:
            stops.append(
                Stop("missing_criteria", f"{ws.workstream_id} has no acceptance criteria")
            )

    # Cycle / undefined deps / migration order / shared contract: reuse the
    # graph's own validation, surfaced as a stop.
    try:
        graph.validate()
    except CoordinatorError as exc:
        rule = _rule_for(str(exc))
        stops.append(Stop(rule, str(exc)))

    # Same-wave owned-path overlap (only meaningful once waves are stamped;
    # stamp from a scratch level map so this works pre-schedule too).
    try:
        levels = graph.topo_levels()
        members: list[Workstream] = []
        for wid, lvl in levels.items():
            ws = graph.workstreams[wid]
            ws.wave = lvl
            members.append(ws)
        for a, b, path in same_wave_owned_path_conflicts(members):
            stops.append(
                Stop(
                    "owned_path_overlap",
                    f"{a} and {b} share owned path {path!r} in the same wave",
                )
            )
    except CoordinatorError:
        # A cycle already produced a stop above; skip the level pass.
        pass

    # Concurrency floor.
    if concurrency < 1:
        stops.append(Stop("bad_concurrency", f"concurrency cap must be >= 1, got {concurrency}"))

    # De-duplicate by (rule, detail) while preserving order.
    seen: set[tuple[str, str]] = set()
    unique: list[Stop] = []
    for s in stops:
        key = (s.rule, s.detail)
        if key not in seen:
            seen.add(key)
            unique.append(s)
    return unique


def _rule_for(message: str) -> str:
    low = message.lower()
    if "cycle" in low:
        return "cycle"
    if "undefined" in low or "depends on itself" in low:
        return "undefined_dependency"
    if "migration" in low:
        return "unordered_migration"
    if "shared contract" in low:
        return "shared_contract_edit"
    if "acceptance criteria" in low:
        return "missing_criteria"
    return "invalid_graph"
