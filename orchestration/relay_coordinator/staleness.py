"""Staleness: what a merge invalidates downstream.

When a workstream's PR merges, everything that depends on it was built on an
older base. Their evidence (tests, verdict) no longer reflects reality, they
need a rebase onto the new base, and they should be rerun before merging.
`mark_stale_after_merge` applies those transitions to the integration
manifest.

This is a simulated dependency-merge event: the coordinator marks state, it
does not merge. The operator merges by hand, then tells the coordinator which
workstream landed.
"""
from __future__ import annotations

from orchestration.relay_coordinator.graph import DependencyGraph
from orchestration.relay_coordinator.integration import IntegrationManifest


def downstream_of(graph: DependencyGraph, merged_ws_id: str) -> set[str]:
    """Return every workstream that transitively depends on `merged_ws_id`."""
    dependents: set[str] = set()
    frontier = [merged_ws_id]
    while frontier:
        current = frontier.pop()
        for ws in graph.workstreams.values():
            if current in ws.depends_on and ws.workstream_id not in dependents:
                dependents.add(ws.workstream_id)
                frontier.append(ws.workstream_id)
    return dependents


def mark_stale_after_merge(
    manifest: IntegrationManifest,
    merged_ws_id: str,
    graph: DependencyGraph,
) -> list[str]:
    """Mark every downstream record stale + rebase-needed + rerun-needed.

    Returns the list of workstream ids transitioned. The merged workstream's
    own record is marked as merged-clean (its dependency state is clean, no
    rebase, no rerun). Downstream records get `stale=True`,
    `rebase_needed=True`, `rerun_needed=True`, and `dependency_state="stale"`,
    because their base moved under them. The coordinator never merges; this
    only records the consequence of a merge the operator performed.
    """
    merged = manifest.by_id(merged_ws_id)
    if merged is not None:
        merged.dependency_state = "clean"
        merged.rebase_needed = False
        merged.rerun_needed = False
        merged.stale = False

    affected = downstream_of(graph, merged_ws_id)
    transitioned: list[str] = []
    for wid in affected:
        rec = manifest.by_id(wid)
        if rec is None:
            continue
        rec.stale = True
        rec.rebase_needed = True
        rec.rerun_needed = True
        rec.dependency_state = "stale"
        transitioned.append(wid)
    return sorted(transitioned)
