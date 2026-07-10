"""Roadmap intake, wave rendering, dry-run, and the approval gate.

Intake reads a workstreams manifest (a JSON file, or a fenced ```json block
inside a markdown roadmap) into the graph, validates it, schedules waves, and
routes models. The operator sees the wave preview in the documented text form
before anything launches. `--dry-run` prints the validated graph, the waves,
the assignments, and every relay command that would run, and creates nothing.
A real run needs explicit operator approval (`--yes` non-interactively;
without a TTY and without `--yes`, it prints and launches nothing).

The wave preview format is fixed and asserted by a test:

    Wave 0 - serial
      SUS-T1 Contracts       Fable builds / Sol reviews

    Wave 1 - parallel, max 3
      SUS-T4 Factor registry Fable builds / Sol reviews
      SUS-T5 Seed generator  Sol builds / Fable reviews

(The dash between wave index and label is an em dash in the rendered output.)
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from orchestration.relay_coordinator.graph import (
    CoordinatorError,
    DependencyGraph,
    Workstream,
)
from orchestration.relay_coordinator.routing import (
    UNSUPPORTED,
    ExecutionPlan,
    resolve_execution,
)
from orchestration.relay_coordinator.safety import preflight_stops
from orchestration.relay_coordinator.waves import (
    DEFAULT_CONCURRENCY,
    WaveSchedule,
    schedule_waves,
)
from orchestration.relay_coordinator.workers import WorkerCommand, build_worker_command
from orchestration.relay_coordinator.child_plans import render_child_plan

WAVE_DASH = "—"  # em dash, matching the documented preview format
JSON_FENCE_RE = re.compile(r"```json\s*\n(.*?)\n```", re.DOTALL | re.IGNORECASE)


class RoadmapError(CoordinatorError):
    """The roadmap manifest could not be read or parsed."""


# --- intake --------------------------------------------------------------

def _extract_manifest_text(raw: str, source: str) -> str:
    """Return the JSON text: the whole file if it is JSON, else a fenced block."""
    stripped = raw.strip()
    if stripped.startswith("{") or stripped.startswith("["):
        return stripped
    match = JSON_FENCE_RE.search(raw)
    if match:
        return match.group(1).strip()
    raise RoadmapError(
        f"{source}: no JSON manifest found. Provide a .json manifest or a "
        "```json fenced block inside the markdown roadmap."
    )


def load_roadmap(path: Path) -> list[Workstream]:
    """Load workstreams from a JSON manifest or a markdown roadmap.

    The manifest is either a JSON list of workstream objects, or an object
    with a `workstreams` key, or the same shape inside a fenced ```json block
    in a markdown file. Every object is turned into a Workstream via
    `Workstream.from_dict`, which rejects unknown fields.
    """
    path = Path(path)
    if not path.is_file():
        raise RoadmapError(f"roadmap not found: {path}")
    raw = path.read_text(encoding="utf-8", errors="replace")
    text = _extract_manifest_text(raw, str(path))
    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        raise RoadmapError(f"{path}: manifest is not valid JSON: {exc}") from exc

    if isinstance(data, dict):
        items = data.get("workstreams")
        if items is None:
            raise RoadmapError(f"{path}: manifest object has no 'workstreams' key")
    elif isinstance(data, list):
        items = data
    else:
        raise RoadmapError(f"{path}: manifest must be a list or an object with 'workstreams'")

    if not items:
        raise RoadmapError(f"{path}: manifest defines no workstreams")
    return [Workstream.from_dict(obj) for obj in items]


def scaffold_from_plan_tickets(tickets: list[tuple[str, str]]) -> list[Workstream]:
    """Seed a manifest skeleton from a plan's (ticket_id, title) list.

    The operator fills owned/forbidden paths and criteria afterward. Each
    ticket becomes a Workstream with a placeholder acceptance criterion so the
    skeleton is inspectable; it will not pass validation until the operator
    replaces the placeholder with real criteria.
    """
    out: list[Workstream] = []
    for tid, title in tickets:
        out.append(
            Workstream(
                workstream_id=tid,
                title=title,
                acceptance_criteria=[f"TODO: define judgeable criteria for {tid}"],
            )
        )
    return out


# --- model display -------------------------------------------------------

def _display_model(name: str) -> str:
    """Human display name for a model: capitalize the registry key."""
    return name[:1].upper() + name[1:] if name else name


def _orientation_phrase(execution: ExecutionPlan) -> str:
    """`Fable builds / Sol reviews`.

    The wave preview shows the routed orientation exactly. Whether an
    orientation is executable is surfaced in the model-assignments detail and
    in the dry-run command list (an unsupported one prints as NOT RUN), not in
    this row, so the preview format stays fixed.
    """
    return (
        f"{_display_model(execution.builder_model)} builds / "
        f"{_display_model(execution.reviewer_model)} reviews"
    )


# --- wave preview (exact format) ----------------------------------------

@dataclass
class CoordinatorPlan:
    """Everything a dry-run or a launch needs: graph, waves, executions."""

    graph: DependencyGraph
    schedule: WaveSchedule
    executions: dict[str, ExecutionPlan]


def build_plan(
    workstreams: list[Workstream],
    concurrency: int = DEFAULT_CONCURRENCY,
    policy: dict[str, tuple[str, str]] | None = None,
) -> CoordinatorPlan:
    """Validate, schedule, and route a set of workstreams.

    Raises CoordinatorError on any graph violation before returning, so a
    plan that reaches the caller is always launch-safe (modulo unsupported
    orientations, which are recorded per workstream, not raised).
    """
    graph = DependencyGraph.build(workstreams)
    schedule = schedule_waves(graph, concurrency)
    executions = {
        ws.workstream_id: resolve_execution(ws, policy) for ws in schedule.all_members()
    }
    return CoordinatorPlan(graph=graph, schedule=schedule, executions=executions)


def render_waves(plan: CoordinatorPlan) -> str:
    """Render the operator wave preview in the documented text form.

    Row columns: `<id> <title>` left-padded to a shared width, then the
    orientation phrase. The width is the longest `<id> <title>` across all
    rows, so the orientation column lines up. A test asserts this exact
    string, so the format is stable.
    """
    rows: list[tuple[int, str, str]] = []  # (wave_index, left, phrase)
    left_texts: list[str] = []
    for wave in plan.schedule.waves:
        for ws in wave.members:
            left = f"{ws.workstream_id} {ws.title}".rstrip()
            phrase = _orientation_phrase(plan.executions[ws.workstream_id])
            rows.append((wave.index, left, phrase))
            left_texts.append(left)

    width = max((len(t) for t in left_texts), default=0)

    lines: list[str] = []
    for wave in plan.schedule.waves:
        if lines:
            lines.append("")
        lines.append(f"Wave {wave.index} {WAVE_DASH} {wave.label}")
        for ws in wave.members:
            left = f"{ws.workstream_id} {ws.title}".rstrip()
            phrase = _orientation_phrase(plan.executions[ws.workstream_id])
            lines.append(f"  {left.ljust(width)} {phrase}")
    return "\n".join(lines)


# --- commands the coordinator would run ---------------------------------

def worker_commands(
    plan: CoordinatorPlan,
    base_commit: str,
    worktree_root_for: Any,
    child_plan_path_for: Any,
    max_iterations: int = 3,
) -> list[WorkerCommand]:
    """Build the relay command for every workstream, in wave/batch order.

    `worktree_root_for(ws)` and `child_plan_path_for(ws)` are callables the
    caller supplies so each workstream gets its own worktree root and child
    plan path. Every returned command is already safety-guarded (see
    build_worker_command).
    """
    commands: list[WorkerCommand] = []
    for wave in plan.schedule.waves:
        for batch in wave.batches:
            for ws in batch:
                execution = plan.executions[ws.workstream_id]
                commands.append(
                    build_worker_command(
                        ws,
                        execution,
                        Path(child_plan_path_for(ws)),
                        base_commit,
                        Path(worktree_root_for(ws)),
                        max_iterations=max_iterations,
                    )
                )
    return commands


# --- dry run -------------------------------------------------------------

def render_dry_run(
    plan: CoordinatorPlan,
    base_commit: str,
    worktree_root: Path,
    max_iterations: int = 3,
) -> str:
    """Full mutation-free dry-run text: graph, waves, assignments, commands.

    Creates nothing. Child plans are rendered in memory only, to a synthetic
    path under `worktree_root`, purely so the printed command line is real.
    """
    out: list[str] = []
    out.append(f"[dry-run] {len(plan.graph.workstreams)} workstreams, "
               f"{len(plan.schedule.waves)} waves, concurrency {plan.schedule.concurrency}")
    out.append(f"[dry-run] base commit: {base_commit}")
    out.append("")
    out.append("Waves:")
    out.append(render_waves(plan))
    out.append("")

    migs = plan.graph.migration_plan()
    if migs:
        out.append("Migration order (planned, applied by nobody): " + " -> ".join(migs))
        out.append("")

    out.append("Model assignments:")
    for ws in plan.schedule.all_members():
        ex = plan.executions[ws.workstream_id]
        line = (f"  {ws.workstream_id}: class={ex.task_class} "
                f"builder={ex.builder_model_id} reviewer={ex.reviewer_model_id} [{ex.status}]")
        if ex.status == UNSUPPORTED:
            line += f" reason: {ex.reason}"
        out.append(line)
    out.append("")

    out.append("Relay commands a real run would execute:")

    def wt_for(ws: Workstream) -> Path:
        return Path(worktree_root) / ws.workstream_id

    def plan_for(ws: Workstream) -> Path:
        return Path(worktree_root) / ws.workstream_id / "child-plan.md"

    commands = worker_commands(plan, base_commit, wt_for, plan_for, max_iterations)
    for cmd in commands:
        if cmd.executable:
            out.append(f"  {cmd.command_str}")
        else:
            out.append(f"  # {cmd.workstream_id}: NOT RUN ({UNSUPPORTED}): {cmd.unsupported_reason}")
    out.append("")
    out.append("[dry-run] created nothing: no worktree, no branch, no run folder, no file.")
    return "\n".join(out)


def validate_child_plans(plan: CoordinatorPlan, base_commit: str) -> list[str]:
    """Render every child plan in memory to confirm criteria pass relay intake.

    Returns the list of workstream ids whose child plan validated. Raises
    CoordinatorError (from render_child_plan) if any workstream's generated
    criteria would be refused by the relay. Writes nothing.
    """
    ok: list[str] = []
    for ws in plan.schedule.all_members():
        render_child_plan(ws, base_commit)
        ok.append(ws.workstream_id)
    return ok


# --- approval gate -------------------------------------------------------

def approval_ok(yes: bool, is_tty: bool) -> bool:
    """Whether a real run may launch.

    `--yes` always approves (non-interactive). On a TTY without `--yes` this
    returns False here; interactive prompting is the caller's job. Without a
    TTY and without `--yes`, launching is refused: print the plan and stop.
    """
    if yes:
        return True
    return False


def coordinator_stops(plan_or_graph: Any, concurrency: int = DEFAULT_CONCURRENCY) -> list[str]:
    """Return coordinator hard-stop descriptions, or [] when clear."""
    graph = plan_or_graph.graph if isinstance(plan_or_graph, CoordinatorPlan) else plan_or_graph
    return [f"{s.rule}: {s.detail}" for s in preflight_stops(graph, concurrency)]
