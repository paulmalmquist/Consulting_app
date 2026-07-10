"""Coordinator safety: hard stops and the forbidden-command guard."""
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
from orchestration.relay_coordinator.safety import (  # noqa: E402
    CoordinatorSafetyError,
    assert_command_safe,
    contains_forbidden_command,
    preflight_stops,
)


def ws(wid, deps=None, owned=None, criteria=None, **kw):
    return Workstream(
        workstream_id=wid, title=wid, depends_on=deps or [],
        owned_paths=owned or [f"src/{wid}.py"],
        acceptance_criteria=criteria if criteria is not None else [f"do {wid}"],
        **kw,
    )


# --- forbidden command guard --------------------------------------------

FORBIDDEN = [
    "gh pr merge 123",
    "gh pr merge --squash 45",
    "git push origin main",
    "git push origin HEAD:main",
    "git push --force origin relay/x",
    "git push -f origin relay/x",
    "git push origin +relay/x:refs/heads/main",
    "vercel deploy --prod",
    "railway up --service authentic-sparkle",
    "supabase db push --linked",
    "python -m orchestration.coding_relay --plan p --draft-pr",
]


@pytest.mark.parametrize("command", FORBIDDEN)
def test_forbidden_commands_are_detected(command):
    assert contains_forbidden_command(command)
    with pytest.raises(CoordinatorSafetyError):
        assert_command_safe(command)


ALLOWED = [
    "python -m orchestration.coding_relay --plan p --base sha --no-pr --max-iterations 3",
    "python -m orchestration.coding_relay --plan p --allow-migrations --no-pr",
    "git -C /repo fetch origin",
    "git -C /repo checkout relay/x",
    "git -C /repo rebase origin/main",
]


@pytest.mark.parametrize("command", ALLOWED)
def test_allowed_relay_commands_pass_the_guard(command):
    assert contains_forbidden_command(command) == []
    assert_command_safe(command)  # must not raise


def test_relay_worker_command_is_never_a_push_to_main():
    # A relay invocation that merely rebases onto main is fine; pushing to
    # main is the forbidden shape. `git rebase origin/main` must pass.
    assert_command_safe("git rebase origin/main")
    with pytest.raises(CoordinatorSafetyError):
        assert_command_safe("git push origin main")


# --- preflight hard stops ------------------------------------------------

def test_cycle_is_a_stop():
    graph = DependencyGraph.__new__(DependencyGraph)  # bypass build() validation
    graph.workstreams = {"A": ws("A", deps=["B"]), "B": ws("B", deps=["A"])}
    graph.order = ["A", "B"]
    stops = preflight_stops(graph)
    assert any(s.rule == "cycle" for s in stops)


def test_missing_criteria_is_a_stop():
    graph = DependencyGraph.__new__(DependencyGraph)
    graph.workstreams = {"A": ws("A", criteria=[])}
    graph.order = ["A"]
    stops = preflight_stops(graph)
    assert any(s.rule == "missing_criteria" for s in stops)


def test_owned_path_overlap_is_a_stop():
    graph = DependencyGraph.build([
        ws("A", owned=["src/shared.py"]),
        ws("B", owned=["src/shared.py"]),
    ])
    stops = preflight_stops(graph)
    assert any(s.rule == "owned_path_overlap" for s in stops)


def test_unordered_migration_is_a_stop():
    graph = DependencyGraph.__new__(DependencyGraph)
    graph.workstreams = {
        "A": ws("A", migration=True, migration_order=1),
        "B": ws("B", migration=True, migration_order=1),
    }
    graph.order = ["A", "B"]
    stops = preflight_stops(graph)
    assert any(s.rule == "unordered_migration" for s in stops)


def test_shared_contract_edit_by_parallel_dependent_is_a_stop():
    contract = ws("C", owned=["src/contract.py"], is_shared_contract=True)
    reader = ws("R", owned=["src/reader.py"], criteria=["read"])
    reader.read_only_paths = ["src/contract.py"]  # reads contract, no depends_on
    graph = DependencyGraph.__new__(DependencyGraph)
    graph.workstreams = {"C": contract, "R": reader}
    graph.order = ["C", "R"]
    stops = preflight_stops(graph)
    assert any(s.rule == "shared_contract_edit" for s in stops)


def test_clean_graph_has_no_stops():
    graph = DependencyGraph.build([
        ws("A"),
        ws("B", deps=["A"]),
    ])
    assert preflight_stops(graph) == []


def test_build_raises_on_each_violation_before_launch():
    # graph.build refuses to construct an invalid graph, so no worker can be
    # scheduled against a cycle, an undefined dep, or a missing criterion.
    with pytest.raises(CoordinatorError):
        DependencyGraph.build([ws("A", deps=["A"])])
    with pytest.raises(CoordinatorError):
        DependencyGraph.build([ws("A", criteria=[])])
