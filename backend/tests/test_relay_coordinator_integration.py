"""Integration manifest construction, merge order, and stale-on-merge."""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from orchestration.relay_coordinator.graph import (  # noqa: E402
    DependencyGraph,
    Workstream,
)
from orchestration.relay_coordinator.integration import (  # noqa: E402
    IntegrationManifest,
    IntegrationRecord,
    build_manifest,
    prepare_commands,
    recommend_merge_order,
)
from orchestration.relay_coordinator.staleness import (  # noqa: E402
    downstream_of,
    mark_stale_after_merge,
)
from orchestration.relay_coordinator.waves import schedule_waves  # noqa: E402


def ws(wid, deps=None):
    return Workstream(
        workstream_id=wid, title=wid, depends_on=deps or [],
        owned_paths=[f"src/{wid}.py"], acceptance_criteria=[f"do {wid}"],
    )


def _graph():
    a = ws("A")
    b = ws("B", deps=["A"])
    c = ws("C", deps=["A"])
    d = ws("D", deps=["B", "C"])
    g = DependencyGraph.build([a, b, c, d])
    schedule_waves(g, concurrency=3)  # stamp waves
    return g


def _records():
    return [
        IntegrationRecord("D", wave=2, depends_on=["B", "C"], branch="relay/d", tests="pass", verdict="pass"),
        IntegrationRecord("A", wave=0, depends_on=[], branch="relay/a", tests="pass", verdict="pass"),
        IntegrationRecord("C", wave=1, depends_on=["A"], branch="relay/c", tests="pass", verdict="pass"),
        IntegrationRecord("B", wave=1, depends_on=["A"], branch="relay/b", tests="pass", verdict="pass"),
    ]


def test_manifest_orders_parents_before_children():
    manifest = build_manifest(_graph(), _records())
    order = recommend_merge_order(manifest)
    # A first (wave 0), then B/C (wave 1, input order), then D (wave 2).
    assert order[0] == "A"
    assert order[-1] == "D"
    assert order.index("B") < order.index("D")
    assert order.index("C") < order.index("D")


def test_downstream_of_is_transitive():
    g = _graph()
    assert downstream_of(g, "A") == {"B", "C", "D"}
    assert downstream_of(g, "B") == {"D"}
    assert downstream_of(g, "D") == set()


def test_mark_stale_after_merge_transitions_downstream():
    g = _graph()
    manifest = build_manifest(g, _records())
    transitioned = mark_stale_after_merge(manifest, "A", g)
    assert transitioned == ["B", "C", "D"]
    # Merged record is clean; downstream records are stale + rebase + rerun.
    a = manifest.by_id("A")
    assert a.dependency_state == "clean" and not a.rebase_needed
    for wid in ("B", "C", "D"):
        r = manifest.by_id(wid)
        assert r.stale and r.rebase_needed and r.rerun_needed
        assert r.dependency_state == "stale"


def test_prepare_commands_returns_strings_and_flags_rebase():
    g = _graph()
    manifest = build_manifest(g, _records())
    mark_stale_after_merge(manifest, "A", g)
    plans = prepare_commands(manifest, repo_root="/repo", base_branch="main")
    by_id = {p["workstream_id"]: p for p in plans}
    # B was downstream of merged A -> rebase step present.
    b_steps = "\n".join(by_id["B"]["steps"])
    assert "rebase origin/main" in b_steps
    assert by_id["B"]["rebase_needed"] is True
    # Everything is a string; nothing executes.
    for p in plans:
        assert all(isinstance(s, str) for s in p["steps"])


def test_manifest_to_dict_round_trips_fields():
    manifest = IntegrationManifest(records=[
        IntegrationRecord("A", wave=0, pr="https://example/pr/1", tests="pass"),
    ])
    d = manifest.to_dict()
    assert d["records"][0]["pr"] == "https://example/pr/1"
    assert d["records"][0]["workstream_id"] == "A"
