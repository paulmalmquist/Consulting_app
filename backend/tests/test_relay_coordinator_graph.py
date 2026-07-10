"""Graph validation: cycles, owned-path overlap, dependencies, migrations."""
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
    same_wave_owned_path_conflicts,
)


def ws(wid, deps=None, owned=None, criteria=None, **kw):
    return Workstream(
        workstream_id=wid,
        title=kw.pop("title", wid),
        depends_on=deps or [],
        owned_paths=owned or [f"src/{wid}.py"],
        # Distinguish an explicit empty list (test the missing-criteria stop)
        # from the default.
        acceptance_criteria=[f"do {wid}"] if criteria is None else criteria,
        **kw,
    )


def test_cycle_detection_raises():
    a = ws("A", deps=["B"])
    b = ws("B", deps=["A"])
    with pytest.raises(CoordinatorError) as exc:
        DependencyGraph.build([a, b])
    assert "cycle" in str(exc.value).lower()


def test_self_dependency_raises():
    with pytest.raises(CoordinatorError):
        DependencyGraph.build([ws("A", deps=["A"])])


def test_undefined_dependency_raises():
    with pytest.raises(CoordinatorError) as exc:
        DependencyGraph.build([ws("A", deps=["ghost"])])
    assert "undefined" in str(exc.value).lower()


def test_missing_criteria_raises():
    with pytest.raises(CoordinatorError) as exc:
        DependencyGraph.build([ws("A", criteria=[])])
    assert "acceptance criteria" in str(exc.value).lower()


def test_same_wave_owned_path_overlap_detected():
    # Two independent (wave 0) workstreams owning the same file.
    a = ws("A", owned=["src/shared.py"])
    b = ws("B", owned=["src/shared.py"])
    graph = DependencyGraph.build([a, b])
    for wid, lvl in graph.topo_levels().items():
        graph.workstreams[wid].wave = lvl
    conflicts = same_wave_owned_path_conflicts(list(graph.workstreams.values()))
    assert conflicts and conflicts[0][2] == "src/shared.py"


def test_owned_path_prefix_overlap_detected():
    a = ws("A", owned=["src/pkg"])
    b = ws("B", owned=["src/pkg/module.py"])
    graph = DependencyGraph.build([a, b])
    for wid, lvl in graph.topo_levels().items():
        graph.workstreams[wid].wave = lvl
    assert same_wave_owned_path_conflicts(list(graph.workstreams.values()))


def test_topo_levels_are_correct():
    # A -> B -> D, A -> C -> D. Levels: A=0, B=1, C=1, D=2.
    a = ws("A")
    b = ws("B", deps=["A"])
    c = ws("C", deps=["A"])
    d = ws("D", deps=["B", "C"])
    graph = DependencyGraph.build([a, b, c, d])
    levels = graph.topo_levels()
    assert levels == {"A": 0, "B": 1, "C": 1, "D": 2}


def test_migration_without_order_raises():
    with pytest.raises(CoordinatorError) as exc:
        DependencyGraph.build([ws("A", migration=True)])
    assert "migration_order" in str(exc.value)


def test_migration_shared_order_raises():
    a = ws("A", migration=True, migration_order=1)
    b = ws("B", migration=True, migration_order=1)
    with pytest.raises(CoordinatorError) as exc:
        DependencyGraph.build([a, b])
    assert "total order" in str(exc.value).lower()


def test_migration_plan_is_deterministic_total_order():
    a = ws("A", migration=True, migration_order=2)
    b = ws("B", migration=True, migration_order=1)
    c = ws("C")  # not a migration
    graph = DependencyGraph.build([a, b, c])
    assert graph.migration_plan() == ["B", "A"]


def test_shared_contract_reader_must_depend_on_it():
    contract = ws("C", owned=["src/contract.py"], is_shared_contract=True)
    # reader reads the contract's path but does NOT depend on it -> stop
    reader = ws("R", owned=["src/reader.py"], criteria=["read it"])
    reader.read_only_paths = ["src/contract.py"]
    with pytest.raises(CoordinatorError) as exc:
        DependencyGraph.build([contract, reader])
    assert "shared contract" in str(exc.value).lower()


def test_shared_contract_reader_with_dependency_is_ok():
    contract = ws("C", owned=["src/contract.py"], is_shared_contract=True)
    reader = ws("R", deps=["C"], owned=["src/reader.py"], criteria=["read it"])
    reader.read_only_paths = ["src/contract.py"]
    graph = DependencyGraph.build([contract, reader])  # must not raise
    assert graph.topo_levels()["R"] == 1


def test_to_dict_from_dict_round_trip():
    original = ws("A", deps=[], owned=["src/a.py"], is_shared_contract=True,
                  migration=True, migration_order=3, risk="high")
    d = original.to_dict()
    assert d["is_shared_contract"] is True
    assert d["migration_order"] == 3
    restored = Workstream.from_dict(d)
    assert restored == original


def test_from_dict_rejects_unknown_field():
    with pytest.raises(CoordinatorError):
        Workstream.from_dict({"workstream_id": "A", "title": "A", "bogus": 1})


def test_bad_risk_value_raises():
    with pytest.raises(CoordinatorError):
        Workstream(workstream_id="A", title="A", risk="critical")
