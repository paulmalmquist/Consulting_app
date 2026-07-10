"""Workstream dataclass and the dependency graph with its validation rules.

A roadmap is a set of Workstreams. Each Workstream is one unit of work the
relay can run: it owns a set of paths, may read others, must not touch a
forbidden set, carries judgeable acceptance criteria, and names a builder
and reviewer model. Workstreams depend on each other; the graph turns those
dependencies into ordered waves.

Every validation failure raises CoordinatorError with a clear message. The
coordinator refuses to schedule an invalid graph; it never launches a worker
against a graph that broke a rule.
"""
from __future__ import annotations

from dataclasses import dataclass, field, fields
from typing import Any

RISK_LEVELS = ("low", "medium", "high")


class CoordinatorError(Exception):
    """A coordinator hard stop. Message is operator-facing.

    Raised for cycles, same-wave owned-path overlap, undefined dependencies,
    non-deterministic migration order, parent-not-before-child wave order,
    a shared contract that a parallel dependent would edit, and missing
    acceptance criteria. The coordinator never launches a worker after one
    of these.
    """


@dataclass
class Workstream:
    """One unit of relay-launchable work.

    Fields match the machine-readable graph schema exactly. `wave` is filled
    in by wave scheduling; a hand-authored manifest may leave it at 0.

    `is_shared_contract` marks a workstream that publishes an interface other
    workstreams read (a schema, a set of types, a service contract). A shared
    contract must complete before any dependent that reads it starts, so
    every such dependent must list it in `depends_on`. This is not one of the
    JSON schema's required fields; it is coordinator metadata that defaults to
    False and is carried through to_dict/from_dict when set.
    """

    workstream_id: str
    title: str
    depends_on: list[str] = field(default_factory=list)
    owned_paths: list[str] = field(default_factory=list)
    read_only_paths: list[str] = field(default_factory=list)
    forbidden_paths: list[str] = field(default_factory=list)
    acceptance_criteria: list[str] = field(default_factory=list)
    required_tests: list[str] = field(default_factory=list)
    risk: str = "low"
    builder_model: str = ""
    reviewer_model: str = ""
    wave: int = 0
    # Coordinator metadata (not part of the six required schema fields).
    is_shared_contract: bool = False
    migration: bool = False
    migration_order: int | None = None
    task_class: str = ""

    def __post_init__(self) -> None:
        if not self.workstream_id:
            raise CoordinatorError("a workstream is missing workstream_id")
        if self.risk not in RISK_LEVELS:
            raise CoordinatorError(
                f"workstream {self.workstream_id}: risk {self.risk!r} is not one of "
                f"{', '.join(RISK_LEVELS)}"
            )

    def to_dict(self) -> dict[str, Any]:
        """Serialize to the JSON graph shape.

        The six required schema fields are always emitted. Coordinator
        metadata is emitted only when set to a non-default, so a round-trip
        of a plain manifest stays plain.
        """
        out: dict[str, Any] = {
            "workstream_id": self.workstream_id,
            "title": self.title,
            "depends_on": list(self.depends_on),
            "owned_paths": list(self.owned_paths),
            "read_only_paths": list(self.read_only_paths),
            "forbidden_paths": list(self.forbidden_paths),
            "acceptance_criteria": list(self.acceptance_criteria),
            "required_tests": list(self.required_tests),
            "risk": self.risk,
            "builder_model": self.builder_model,
            "reviewer_model": self.reviewer_model,
            "wave": self.wave,
        }
        if self.is_shared_contract:
            out["is_shared_contract"] = True
        if self.migration:
            out["migration"] = True
        if self.migration_order is not None:
            out["migration_order"] = self.migration_order
        if self.task_class:
            out["task_class"] = self.task_class
        return out

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Workstream":
        known = {f.name for f in fields(cls)}
        unknown = set(data) - known
        if unknown:
            raise CoordinatorError(
                f"workstream {data.get('workstream_id', '?')}: unknown fields "
                f"{', '.join(sorted(unknown))}"
            )
        return cls(**{k: v for k, v in data.items() if k in known})


def _first_overlap(a: list[str], b: list[str]) -> str | None:
    """Return a path that is owned-prefix-shared between two path lists.

    Two owned paths conflict when one is a filesystem prefix of the other
    (same file, or one directory contains the other). Exact string equality
    is the common case; prefix containment catches "src/pkg" vs "src/pkg/mod".
    """
    for x in a:
        for y in b:
            if x == y or _is_path_prefix(x, y) or _is_path_prefix(y, x):
                return x if len(x) <= len(y) else y
    return None


def _is_path_prefix(parent: str, child: str) -> bool:
    """True when `parent` is a path-segment prefix of `child`."""
    p = parent.rstrip("/")
    c = child.rstrip("/")
    if p == c:
        return True
    return c.startswith(p + "/")


@dataclass
class DependencyGraph:
    """A validated set of workstreams keyed by id.

    Build with `DependencyGraph.build(workstreams)`. Construction validates
    the whole graph and raises CoordinatorError on the first violated rule.
    `topo_levels()` returns the topological level of each workstream, which
    wave scheduling uses directly.
    """

    workstreams: dict[str, Workstream]
    order: list[str]  # stable input order, used to break ties deterministically

    @classmethod
    def build(cls, workstreams: list[Workstream]) -> "DependencyGraph":
        by_id: dict[str, Workstream] = {}
        order: list[str] = []
        for ws in workstreams:
            if ws.workstream_id in by_id:
                raise CoordinatorError(f"duplicate workstream_id: {ws.workstream_id}")
            by_id[ws.workstream_id] = ws
            order.append(ws.workstream_id)
        graph = cls(workstreams=by_id, order=order)
        graph.validate()
        return graph

    # -- validation ------------------------------------------------------
    def validate(self) -> None:
        self._check_dependencies_defined()
        self._check_acceptance_criteria()
        self._check_no_cycle()
        self._check_migration_total_order()
        self._check_shared_contract_dependents()

    def _check_dependencies_defined(self) -> None:
        for ws in self.workstreams.values():
            for dep in ws.depends_on:
                if dep == ws.workstream_id:
                    raise CoordinatorError(
                        f"workstream {ws.workstream_id} depends on itself"
                    )
                if dep not in self.workstreams:
                    raise CoordinatorError(
                        f"workstream {ws.workstream_id} depends on undefined "
                        f"workstream {dep!r}"
                    )

    def _check_acceptance_criteria(self) -> None:
        for ws in self.workstreams.values():
            if not [c for c in ws.acceptance_criteria if str(c).strip()]:
                raise CoordinatorError(
                    f"workstream {ws.workstream_id} has no acceptance criteria; "
                    "the relay refuses vague work and so does the coordinator"
                )

    def _check_no_cycle(self) -> None:
        """Kahn's algorithm. If not every node is emitted, a cycle remains."""
        indegree = {wid: 0 for wid in self.workstreams}
        for ws in self.workstreams.values():
            for dep in ws.depends_on:
                indegree[ws.workstream_id] += 1
        ready = [wid for wid in self.order if indegree[wid] == 0]
        seen = 0
        while ready:
            wid = ready.pop()
            seen += 1
            for other in self.workstreams.values():
                if wid in other.depends_on:
                    indegree[other.workstream_id] -= 1
                    if indegree[other.workstream_id] == 0:
                        ready.append(other.workstream_id)
        if seen != len(self.workstreams):
            stuck = sorted(w for w, d in indegree.items() if d > 0)
            raise CoordinatorError(
                "dependency cycle detected among workstreams: " + ", ".join(stuck)
            )

    def _check_migration_total_order(self) -> None:
        """Migrations must have a deterministic total order.

        Every workstream flagged `migration=True` must carry a distinct
        `migration_order` integer, so the coordinator can plan a single
        deterministic application sequence. Two migrations sharing an order,
        or a migration missing its order, is a hard stop.
        """
        migs = [ws for ws in self.workstreams.values() if ws.migration]
        orders: dict[int, str] = {}
        for ws in migs:
            if ws.migration_order is None:
                raise CoordinatorError(
                    f"migration workstream {ws.workstream_id} has no migration_order; "
                    "migrations need a deterministic total order"
                )
            if ws.migration_order in orders:
                raise CoordinatorError(
                    f"migration order {ws.migration_order} is shared by "
                    f"{orders[ws.migration_order]} and {ws.workstream_id}; "
                    "migration order must be a total order"
                )
            orders[ws.migration_order] = ws.workstream_id

    def _check_shared_contract_dependents(self) -> None:
        """A shared contract must precede everything that reads it.

        A workstream that reads a shared-contract workstream's owned paths
        must depend on it, so scheduling places the contract in an earlier
        wave. If a workstream reads or would touch a shared contract's owned
        path without depending on it, that is a freeze violation.
        """
        contracts = [ws for ws in self.workstreams.values() if ws.is_shared_contract]
        for contract in contracts:
            for ws in self.workstreams.values():
                if ws.workstream_id == contract.workstream_id:
                    continue
                reads_contract = _paths_touch(
                    ws.read_only_paths + ws.owned_paths, contract.owned_paths
                )
                if reads_contract and contract.workstream_id not in ws.depends_on:
                    raise CoordinatorError(
                        f"workstream {ws.workstream_id} reads shared contract "
                        f"{contract.workstream_id}'s paths but does not depend on it; "
                        "a shared contract must complete before its dependents start"
                    )

    def migration_plan(self) -> list[str]:
        """Return migration workstream ids in their deterministic total order."""
        migs = [ws for ws in self.workstreams.values() if ws.migration]
        return [ws.workstream_id for ws in sorted(migs, key=lambda w: w.migration_order or 0)]

    # -- traversal -------------------------------------------------------
    def topo_levels(self) -> dict[str, int]:
        """Longest-path level per workstream (0 = no dependencies).

        A workstream's level is one greater than the maximum level of its
        dependencies. This is the wave index: a parent always lands in a
        strictly lower wave than its children.
        """
        levels: dict[str, int] = {}

        def level_of(wid: str, stack: tuple[str, ...] = ()) -> int:
            if wid in levels:
                return levels[wid]
            if wid in stack:  # defensive; validate() already caught cycles
                raise CoordinatorError("cycle during level computation: " + wid)
            deps = self.workstreams[wid].depends_on
            lvl = 0 if not deps else 1 + max(level_of(d, stack + (wid,)) for d in deps)
            levels[wid] = lvl
            return lvl

        for wid in self.order:
            level_of(wid)
        return levels


def _paths_touch(a: list[str], b: list[str]) -> bool:
    return _first_overlap(a, b) is not None


def same_wave_owned_path_conflicts(
    workstreams: list[Workstream],
) -> list[tuple[str, str, str]]:
    """Return (id_a, id_b, path) for every pair in the same wave that shares
    an owned path. Two workstreams that run at once must not write the same
    file; that is a merge collision waiting to happen.
    """
    conflicts: list[tuple[str, str, str]] = []
    by_wave: dict[int, list[Workstream]] = {}
    for ws in workstreams:
        by_wave.setdefault(ws.wave, []).append(ws)
    for members in by_wave.values():
        for i in range(len(members)):
            for j in range(i + 1, len(members)):
                path = _first_overlap(members[i].owned_paths, members[j].owned_paths)
                if path is not None:
                    conflicts.append(
                        (members[i].workstream_id, members[j].workstream_id, path)
                    )
    return conflicts
