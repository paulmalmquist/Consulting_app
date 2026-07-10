"""Wave scheduling and concurrency batching."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from orchestration.relay_coordinator.graph import (  # noqa: E402
    CoordinatorError,
    DependencyGraph,
    Workstream,
)
from orchestration.relay_coordinator.waves import schedule_waves  # noqa: E402


def ws(wid, deps=None, owned=None):
    return Workstream(
        workstream_id=wid,
        title=wid,
        depends_on=deps or [],
        owned_paths=owned or [f"src/{wid}.py"],
        acceptance_criteria=[f"do {wid}"],
    )


def test_wave_indices_match_topological_levels():
    a = ws("A")
    b = ws("B", deps=["A"])
    c = ws("C", deps=["A"])
    d = ws("D", deps=["B", "C"])
    graph = DependencyGraph.build([a, b, c, d])
    sched = schedule_waves(graph, concurrency=3)
    idx = {wave.index: [m.workstream_id for m in wave.members] for wave in sched.waves}
    assert idx[0] == ["A"]
    assert sorted(idx[1]) == ["B", "C"]
    assert idx[2] == ["D"]


def test_serial_and_parallel_labels():
    a = ws("A")
    b = ws("B", deps=["A"])
    c = ws("C", deps=["A"])
    graph = DependencyGraph.build([a, b, c])
    sched = schedule_waves(graph, concurrency=3)
    assert sched.waves[0].is_serial
    assert sched.waves[0].label == "serial"
    assert not sched.waves[1].is_serial
    assert sched.waves[1].label == "parallel, max 3"


def test_concurrency_batching_5_with_cap_3():
    # Five independent (wave 0) workstreams, cap 3 -> batches of 3 then 2.
    members = [ws(f"W{i}", owned=[f"src/w{i}.py"]) for i in range(5)]
    graph = DependencyGraph.build(members)
    sched = schedule_waves(graph, concurrency=3)
    assert len(sched.waves) == 1
    batches = sched.waves[0].batches
    assert [len(b) for b in batches] == [3, 2]
    # Every member appears exactly once across batches.
    flat = [m.workstream_id for b in batches for m in b]
    assert sorted(flat) == [f"W{i}" for i in range(5)]


def test_concurrency_cap_one_is_fully_serial_batches():
    members = [ws(f"W{i}", owned=[f"src/w{i}.py"]) for i in range(3)]
    graph = DependencyGraph.build(members)
    sched = schedule_waves(graph, concurrency=1)
    assert [len(b) for b in sched.waves[0].batches] == [1, 1, 1]


def test_same_wave_owned_overlap_raises_at_schedule():
    a = ws("A", owned=["src/shared.py"])
    b = ws("B", owned=["src/shared.py"])
    graph = DependencyGraph.build([a, b])
    with pytest.raises(CoordinatorError) as exc:
        schedule_waves(graph, concurrency=3)
    assert "same wave" in str(exc.value).lower()


def test_bad_concurrency_raises():
    graph = DependencyGraph.build([ws("A")])
    with pytest.raises(CoordinatorError):
        schedule_waves(graph, concurrency=0)


def test_parent_strictly_before_child():
    a = ws("A")
    b = ws("B", deps=["A"])
    graph = DependencyGraph.build([a, b])
    sched = schedule_waves(graph, concurrency=3)
    waves_by_id = {m.workstream_id: m.wave for wave in sched.waves for m in wave.members}
    assert waves_by_id["A"] < waves_by_id["B"]
