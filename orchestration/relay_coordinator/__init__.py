"""Relay Coordinator: a planning and scheduling layer over the Coding Relay.

The coordinator turns a roadmap of workstreams into a dependency-aware,
wave-scheduled, model-routed plan and launches each workstream through the
relay as an isolated parallel worker. It only plans, schedules, launches
workers, and records evidence. It never merges a PR, never pushes to main,
never force-pushes, never deploys, and never applies a migration.

The relay package `orchestration.coding_relay` is imported and invoked but
never modified. The coordinator is a sibling package.

Entry point:
    python -m orchestration.relay_coordinator --roadmap <manifest> --dry-run

Reference: docs/plans/03-implementation-plans/active/0021-relay-parallel-coordinator.md
"""
from __future__ import annotations

from orchestration.relay_coordinator.graph import (
    CoordinatorError,
    DependencyGraph,
    Workstream,
)
from orchestration.relay_coordinator.routing import (
    DEFAULT_MODEL_REGISTRY,
    DEFAULT_ROUTING_POLICY,
    ExecutionPlan,
    resolve_execution,
)
from orchestration.relay_coordinator.waves import WaveSchedule, schedule_waves

COORDINATOR_VERSION = "0.1.0"

__all__ = [
    "COORDINATOR_VERSION",
    "CoordinatorError",
    "DependencyGraph",
    "Workstream",
    "DEFAULT_MODEL_REGISTRY",
    "DEFAULT_ROUTING_POLICY",
    "ExecutionPlan",
    "resolve_execution",
    "WaveSchedule",
    "schedule_waves",
]
