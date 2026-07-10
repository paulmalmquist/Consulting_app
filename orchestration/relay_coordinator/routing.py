"""Model routing: task classes, default policy, registry, and evidence.

The relay hard-wires the builder to the `claude` CLI and the reviewer to the
`codex` CLI. So an orientation is executable only when the builder model
runs on the claude CLI and the reviewer model runs on the codex CLI. The
reverse (a codex-family builder, a claude-family reviewer) cannot run
without editing the relay, which is out of scope. The coordinator records
that orientation as `unsupported_by_current_worker` rather than faking a run.

Routing is data:
- MODEL_REGISTRY maps a model name to its provider, CLI, and capabilities.
- ROUTING_POLICY maps a task class to a default (builder, reviewer) pair.
Both are operator-overridable. A plan-level model assignment wins over the
policy default.

Run outcomes are appended to a JSONL evidence store, one record per run,
keyed by (model, task_class). `recommend()` reads that store and returns
suggestions. It never rewrites the policy file.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from orchestration.relay_coordinator.graph import Workstream

# Roles a CLI can fill. The relay's claude CLI builds; its codex CLI reviews.
BUILDER = "builder"
REVIEWER = "reviewer"


@dataclass(frozen=True)
class ModelSpec:
    """One model in the registry: which CLI runs it and what it can do."""

    name: str
    model_id: str
    cli: str  # "claude" or "codex"
    builder_capable: bool
    reviewer_capable: bool


# Registry is data, operator-overridable. Fable runs on the claude CLI and
# can build; Sol runs on the codex CLI and can review.
DEFAULT_MODEL_REGISTRY: dict[str, ModelSpec] = {
    "fable": ModelSpec(
        name="fable", model_id="claude-fable-5", cli="claude",
        builder_capable=True, reviewer_capable=False,
    ),
    "sol": ModelSpec(
        name="sol", model_id="gpt-5.6", cli="codex",
        builder_capable=False, reviewer_capable=True,
    ),
}


# Task classes. Repo-wide / ambiguous / architecture-sensitive / foundation
# work routes to Fable as builder; bounded implementation and test work
# routes to Sol as builder. The reviewer is the opposite model when the
# orientation is executable.
TASK_CLASSES = (
    "foundation",
    "architecture_sensitive",
    "repo_wide",
    "ambiguous",
    "bounded_implementation",
    "test",
)

# (builder, reviewer) per task class. Data, operator-overridable.
DEFAULT_ROUTING_POLICY: dict[str, tuple[str, str]] = {
    "foundation": ("fable", "sol"),
    "architecture_sensitive": ("fable", "sol"),
    "repo_wide": ("fable", "sol"),
    "ambiguous": ("fable", "sol"),
    "bounded_implementation": ("sol", "fable"),
    "test": ("sol", "fable"),
}

# Fallback when a workstream names no task class and none can be inferred.
DEFAULT_TASK_CLASS = "ambiguous"


UNSUPPORTED = "unsupported_by_current_worker"
EXECUTABLE = "executable"


@dataclass
class ExecutionPlan:
    """The resolved builder/reviewer for one workstream and its status.

    `status` is EXECUTABLE when the builder runs on the claude CLI and the
    reviewer on the codex CLI, UNSUPPORTED otherwise. `reason` explains an
    unsupported orientation. `builder_model_id` / `reviewer_model_id` are the
    concrete ids passed to the relay's --claude-model / --codex-model flags.
    """

    workstream_id: str
    task_class: str
    builder_model: str
    reviewer_model: str
    builder_model_id: str
    reviewer_model_id: str
    status: str
    reason: str = ""

    @property
    def executable(self) -> bool:
        return self.status == EXECUTABLE

    def to_dict(self) -> dict[str, Any]:
        return {
            "workstream_id": self.workstream_id,
            "task_class": self.task_class,
            "builder_model": self.builder_model,
            "reviewer_model": self.reviewer_model,
            "builder_model_id": self.builder_model_id,
            "reviewer_model_id": self.reviewer_model_id,
            "status": self.status,
            "reason": self.reason,
        }


def classify_task(ws: Workstream) -> str:
    """Return the workstream's task class.

    An explicit `task_class` on the workstream wins. Otherwise infer: a
    shared contract or a migration is foundation; a high-risk or many-path
    workstream is architecture-sensitive; a workstream whose only tests are
    named and whose owned paths are all test paths is a test class; a
    single-owned-path low-risk workstream is bounded implementation;
    everything else is ambiguous.
    """
    if ws.task_class:
        return ws.task_class
    if ws.is_shared_contract or ws.migration:
        return "foundation"
    if ws.risk == "high" or len(ws.owned_paths) >= 4:
        return "architecture_sensitive"
    owned = ws.owned_paths or []
    if owned and all(_looks_like_test_path(p) for p in owned):
        return "test"
    if len(owned) <= 1 and ws.risk == "low":
        return "bounded_implementation"
    return DEFAULT_TASK_CLASS


def _looks_like_test_path(path: str) -> bool:
    low = path.lower()
    return "/tests/" in low or low.endswith("_test.py") or "/test_" in low or low.startswith("tests/")


def resolve_execution(
    ws: Workstream,
    policy: dict[str, tuple[str, str]] | None = None,
    registry: dict[str, ModelSpec] | None = None,
) -> ExecutionPlan:
    """Resolve the builder/reviewer for a workstream and classify the run.

    Precedence: an explicit builder_model / reviewer_model on the workstream
    wins over the policy default for the task class. The result is EXECUTABLE
    only when the builder model's CLI is `claude` and the reviewer model's
    CLI is `codex`; any other orientation is UNSUPPORTED with a reason.
    """
    policy = policy or DEFAULT_ROUTING_POLICY
    registry = registry or DEFAULT_MODEL_REGISTRY
    task_class = classify_task(ws)
    default_builder, default_reviewer = policy.get(
        task_class, policy.get(DEFAULT_TASK_CLASS, ("fable", "sol"))
    )
    builder = ws.builder_model or default_builder
    reviewer = ws.reviewer_model or default_reviewer

    reasons: list[str] = []
    b_spec = registry.get(builder)
    r_spec = registry.get(reviewer)
    if b_spec is None:
        reasons.append(f"builder model {builder!r} is not in the registry")
    if r_spec is None:
        reasons.append(f"reviewer model {reviewer!r} is not in the registry")

    b_id = b_spec.model_id if b_spec else builder
    r_id = r_spec.model_id if r_spec else reviewer

    if not reasons:
        # The relay's builder is always the claude CLI, reviewer always codex.
        if b_spec.cli != "claude":
            reasons.append(
                f"builder {builder!r} runs on the {b_spec.cli} CLI, but the relay's "
                "builder is always the claude CLI"
            )
        if r_spec.cli != "codex":
            reasons.append(
                f"reviewer {reviewer!r} runs on the {r_spec.cli} CLI, but the relay's "
                "reviewer is always the codex CLI"
            )
        if b_spec.cli == "claude" and not b_spec.builder_capable:
            reasons.append(f"builder {builder!r} is not builder-capable")
        if r_spec.cli == "codex" and not r_spec.reviewer_capable:
            reasons.append(f"reviewer {reviewer!r} is not reviewer-capable")

    status = EXECUTABLE if not reasons else UNSUPPORTED
    return ExecutionPlan(
        workstream_id=ws.workstream_id,
        task_class=task_class,
        builder_model=builder,
        reviewer_model=reviewer,
        builder_model_id=b_id,
        reviewer_model_id=r_id,
        status=status,
        reason="; ".join(reasons),
    )


# --- outcome evidence store ---------------------------------------------

OUTCOMES_FILENAME = "routing-outcomes.jsonl"


@dataclass
class RunOutcome:
    """One recorded relay run outcome, keyed by (model, task_class).

    `model` is the builder model (the model whose behavior the evidence is
    about). Fields mirror what the relay's run.json and verdict expose;
    token/cost are optional because the relay records them only when the CLI
    reports them.
    """

    model: str
    task_class: str
    workstream_id: str
    iterations: int
    first_pass_tests: bool | None
    final_status: str
    reviewer_findings: int
    elapsed_s: float
    tokens: int | None = None
    cost: float | None = None
    extra: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        d = {
            "model": self.model,
            "task_class": self.task_class,
            "workstream_id": self.workstream_id,
            "iterations": self.iterations,
            "first_pass_tests": self.first_pass_tests,
            "final_status": self.final_status,
            "reviewer_findings": self.reviewer_findings,
            "elapsed_s": self.elapsed_s,
        }
        if self.tokens is not None:
            d["tokens"] = self.tokens
        if self.cost is not None:
            d["cost"] = self.cost
        if self.extra:
            d["extra"] = self.extra
        return d


class OutcomeRecorder:
    """Append-only JSONL evidence store under the run/output directory.

    Records are appended, never rewritten. `recommend()` reads the store and
    returns suggestions; it does not touch any policy file.
    """

    def __init__(self, store_path: Path):
        self.store_path = Path(store_path)

    def record(self, outcome: RunOutcome) -> None:
        self.store_path.parent.mkdir(parents=True, exist_ok=True)
        with self.store_path.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(outcome.to_dict(), default=str) + "\n")

    def read(self) -> list[dict[str, Any]]:
        if not self.store_path.is_file():
            return []
        rows: list[dict[str, Any]] = []
        for line in self.store_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError:
                continue
        return rows

    def recommend(self) -> list[dict[str, Any]]:
        """Summarize evidence per (task_class, model) and suggest a builder.

        For each task class this aggregates pass rate, mean iterations, and
        mean reviewer findings per model, then names the model with the best
        pass rate (ties broken by fewer mean iterations) as the suggestion.
        This returns data only; it never rewrites DEFAULT_ROUTING_POLICY or
        any policy file. An operator reads the suggestion and decides.
        """
        rows = self.read()
        groups: dict[tuple[str, str], list[dict[str, Any]]] = {}
        for r in rows:
            key = (r.get("task_class", ""), r.get("model", ""))
            groups.setdefault(key, []).append(r)

        per_class: dict[str, list[dict[str, Any]]] = {}
        for (task_class, model), recs in groups.items():
            n = len(recs)
            passes = sum(1 for r in recs if r.get("final_status") == "pass")
            mean_iter = sum(r.get("iterations", 0) for r in recs) / n if n else 0.0
            mean_find = sum(r.get("reviewer_findings", 0) for r in recs) / n if n else 0.0
            first_pass = sum(1 for r in recs if r.get("first_pass_tests") is True)
            per_class.setdefault(task_class, []).append(
                {
                    "model": model,
                    "runs": n,
                    "pass_rate": passes / n if n else 0.0,
                    "mean_iterations": round(mean_iter, 3),
                    "mean_reviewer_findings": round(mean_find, 3),
                    "first_pass_test_rate": round(first_pass / n, 3) if n else 0.0,
                }
            )

        suggestions: list[dict[str, Any]] = []
        for task_class, models in sorted(per_class.items()):
            ranked = sorted(
                models, key=lambda m: (-m["pass_rate"], m["mean_iterations"])
            )
            suggestions.append(
                {
                    "task_class": task_class,
                    "suggested_builder": ranked[0]["model"] if ranked else None,
                    "evidence": ranked,
                    "note": "suggestion only; policy is not rewritten",
                }
            )
        return suggestions


def record_run_outcome(
    store_path: Path,
    execution: ExecutionPlan,
    *,
    iterations: int,
    first_pass_tests: bool | None,
    final_status: str,
    reviewer_findings: int,
    elapsed_s: float,
    tokens: int | None = None,
    cost: float | None = None,
) -> RunOutcome:
    """Build and append a RunOutcome for a completed relay run."""
    outcome = RunOutcome(
        model=execution.builder_model,
        task_class=execution.task_class,
        workstream_id=execution.workstream_id,
        iterations=iterations,
        first_pass_tests=first_pass_tests,
        final_status=final_status,
        reviewer_findings=reviewer_findings,
        elapsed_s=elapsed_s,
        tokens=tokens,
        cost=cost,
    )
    OutcomeRecorder(store_path).record(outcome)
    return outcome
