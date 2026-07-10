"""Wave assignment and concurrency batching.

A wave is one topological level of the dependency graph. Workstreams in the
same wave have no dependency on each other, so they can run in parallel, as
long as they do not share an owned path and the concurrency cap allows it.

Each wave is classified:
- serial: exactly one workstream, or a wave that must run one at a time.
- parallel: more than one workstream, capped at the concurrency limit by
  batching (batch 1 runs, then batch 2, and so on).

The default concurrency cap is 3. Within a wave, workstreams are split into
batches of at most N so no more than N run at once.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from orchestration.relay_coordinator.graph import (
    CoordinatorError,
    DependencyGraph,
    Workstream,
    same_wave_owned_path_conflicts,
)

DEFAULT_CONCURRENCY = 3


@dataclass
class Wave:
    """One topological level: its workstreams and how they batch.

    `batches` splits the members so no more than the concurrency cap run at
    once. A serial wave has one member per batch by definition.
    """

    index: int
    members: list[Workstream]
    concurrency: int
    batches: list[list[Workstream]] = field(default_factory=list)

    @property
    def is_serial(self) -> bool:
        return len(self.members) <= 1

    @property
    def label(self) -> str:
        if self.is_serial:
            return "serial"
        return f"parallel, max {self.concurrency}"


@dataclass
class WaveSchedule:
    """The full ordered set of waves for a validated graph."""

    waves: list[Wave]
    concurrency: int

    def all_members(self) -> list[Workstream]:
        return [ws for wave in self.waves for ws in wave.members]


def _batch(members: list[Workstream], cap: int) -> list[list[Workstream]]:
    """Split members into consecutive batches of at most `cap`."""
    if cap < 1:
        raise CoordinatorError(f"concurrency cap must be >= 1, got {cap}")
    return [members[i : i + cap] for i in range(0, len(members), cap)]


def schedule_waves(
    graph: DependencyGraph, concurrency: int = DEFAULT_CONCURRENCY
) -> WaveSchedule:
    """Assign every workstream to a wave and batch each wave by concurrency.

    Wave index is the workstream's topological level, so a parent is always
    in a strictly lower wave than its children. After assignment, this
    re-checks that no two workstreams in the same wave share an owned path
    (a parallel write collision) and raises CoordinatorError if they do.
    """
    if concurrency < 1:
        raise CoordinatorError(f"concurrency cap must be >= 1, got {concurrency}")

    levels = graph.topo_levels()
    # Stamp the level onto each workstream so downstream checks and rendering
    # read a consistent wave.
    for wid, lvl in levels.items():
        graph.workstreams[wid].wave = lvl

    # Verify parent-precedes-child explicitly (defense in depth: topo_levels
    # guarantees it, but the graph contract states it as a rule).
    for ws in graph.workstreams.values():
        for dep in ws.depends_on:
            parent = graph.workstreams[dep]
            if parent.wave >= ws.wave:
                raise CoordinatorError(
                    f"workstream {ws.workstream_id} (wave {ws.wave}) does not run "
                    f"strictly after its dependency {dep} (wave {parent.wave})"
                )

    members = list(graph.workstreams.values())
    conflicts = same_wave_owned_path_conflicts(members)
    if conflicts:
        a, b, path = conflicts[0]
        raise CoordinatorError(
            f"workstreams {a} and {b} run in the same wave and both own {path!r}; "
            "two parallel workstreams may not write the same path"
        )

    by_wave: dict[int, list[Workstream]] = {}
    for ws in members:
        by_wave.setdefault(ws.wave, []).append(ws)

    waves: list[Wave] = []
    for idx in sorted(by_wave):
        # Stable order within a wave: the graph's input order.
        wave_members = sorted(
            by_wave[idx], key=lambda w: graph.order.index(w.workstream_id)
        )
        wave = Wave(index=idx, members=wave_members, concurrency=concurrency)
        wave.batches = _batch(wave_members, concurrency)
        waves.append(wave)

    return WaveSchedule(waves=waves, concurrency=concurrency)
