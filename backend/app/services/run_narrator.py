"""RunNarrator — maps raw MCP tool names to human-readable execution steps.

Deduplicates repeated calls to the same logical step, suppresses retry noise,
and surfaces clean error messages. Used by ai_gateway.py to emit narrated
tool_activity response_blocks instead of raw tool call names.
"""
from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field
from typing import Any


# ── Tool → Step mapping ─────────────────────────────────────────────────────
# Multiple tool names can map to the same step label. This groups related calls
# into a single user-visible step (e.g., 10 repe.get_asset calls → 1 "Fetching assets" step).

TOOL_STEP_MAP: dict[str, str] = {
    # Asset tools
    "repe.get_asset": "Fetching assets",
    "repe.get_assets_batch": "Fetching assets",
    "repe.list_assets": "Fetching assets",
    "repe.create_asset": "Creating asset",
    # Fund tools
    "repe.get_fund": "Loading fund data",
    "repe.list_funds": "Loading fund data",
    "repe.create_fund": "Creating fund",
    # Deal / pipeline
    "repe.list_deals": "Fetching pipeline",
    "repe.get_deal": "Fetching pipeline",
    "repe.create_deal": "Creating deal",
    # Finance tools
    "finance.fund_metrics": "Computing fund metrics",
    "finance.lp_summary": "Preparing LP summary",
    "finance.run_waterfall": "Running waterfall",
    "finance.stress_cap_rate": "Running stress test",
    "finance.sensitivity_matrix": "Running sensitivity analysis",
    "finance.compare_scenarios": "Comparing scenarios",
    "finance.capital_activity": "Loading capital activity",
    "finance.nav_rollforward": "Computing NAV rollforward",
    "finance.generate_waterfall_memo": "Generating waterfall memo",
    # RAG / documents
    "rag.search": "Searching documents",
    "documents.list": "Fetching documents",
    "documents.get": "Fetching documents",
    # Metrics / analytics
    "metrics.query": "Querying metrics",
    "analytics.query": "Querying analytics",
    # Reports
    "reports.list": "Loading reports",
    "reports.get": "Loading reports",
    # Scenarios
    "scenarios.create": "Creating scenario",
    "scenarios.set_overrides": "Setting overrides",
}

# Fallback label when tool_name is not in the map
_DEFAULT_STEP_LABEL = "Processing"

# Clean error message shown to users (never expose raw validation text)
CLEAN_ERROR_MESSAGE = "Some data could not be retrieved"


def _label_to_step_id(label: str) -> str:
    """Deterministic step ID from label."""
    return label.lower().replace(" ", "_")


@dataclass
class ExecutionStep:
    """A single narrated execution step visible to the user."""
    id: str
    label: str
    status: str = "running"  # "pending" | "running" | "completed" | "failed"
    message: str | None = None
    duration_ms: int | None = None
    tool_count: int = 0
    started_at: float = field(default_factory=time.time)


class RunNarrator:
    """Stateful narrator that deduplicates tool calls into human-readable steps.

    Usage in ai_gateway.py tool loop:
        narrator = RunNarrator()
        # Before executing tool:
        step = narrator.on_tool_call("repe.get_asset")
        if step: yield _sse("response_block", {"block": step})
        # After tool completes:
        step = narrator.on_tool_result("repe.get_asset", success=True, duration_ms=120)
        if step: yield _sse("response_block", {"block": step})
    """

    def __init__(self) -> None:
        self._steps: dict[str, ExecutionStep] = {}  # step_id -> step
        self._tool_to_step_id: dict[str, str] = {}  # tool_name -> step_id
        self._step_order: list[str] = []  # ordered step IDs

    def on_tool_call(self, tool_name: str) -> dict[str, Any] | None:
        """Register a tool call. Returns a tool_activity block to emit, or None if deduplicated."""
        label = TOOL_STEP_MAP.get(tool_name, _DEFAULT_STEP_LABEL)
        step_id = _label_to_step_id(label)
        self._tool_to_step_id[tool_name] = step_id

        if step_id in self._steps:
            # Deduplicate: same logical step, just increment count
            self._steps[step_id].tool_count += 1
            return None

        step = ExecutionStep(id=step_id, label=label, tool_count=1)
        self._steps[step_id] = step
        self._step_order.append(step_id)
        return self._build_activity_block()

    def on_tool_result(
        self,
        tool_name: str,
        *,
        success: bool,
        duration_ms: int = 0,
        error_msg: str | None = None,
        is_retry: bool = False,
        is_final_retry: bool = False,
    ) -> dict[str, Any] | None:
        """Register a tool result. Returns updated block or None if suppressed."""
        step_id = self._tool_to_step_id.get(tool_name)
        if not step_id or step_id not in self._steps:
            return None

        step = self._steps[step_id]

        if success:
            step.status = "completed"
            step.duration_ms = (step.duration_ms or 0) + duration_ms
            return self._build_activity_block()

        # Failure path
        if is_retry and not is_final_retry:
            # Retry in progress — suppress error from user
            return None

        # Final failure
        step.status = "failed"
        step.message = CLEAN_ERROR_MESSAGE
        step.duration_ms = (step.duration_ms or 0) + duration_ms
        return self._build_activity_block()

    def get_all_steps(self) -> list[dict[str, Any]]:
        """Return all steps as serializable dicts (for trace/debug)."""
        return [self._step_to_item(self._steps[sid]) for sid in self._step_order if sid in self._steps]

    def _build_activity_block(self) -> dict[str, Any]:
        """Build a tool_activity response_block with all current steps."""
        items = []
        for step_id in self._step_order:
            step = self._steps.get(step_id)
            if step:
                items.append(self._step_to_item(step))

        return {
            "type": "tool_activity",
            "block_id": f"narrated_steps_{uuid.uuid4().hex[:8]}",
            "items": items,
        }

    @staticmethod
    def _step_to_item(step: ExecutionStep) -> dict[str, Any]:
        """Convert an ExecutionStep to an AssistantToolActivityItem dict."""
        item: dict[str, Any] = {
            "tool_name": step.id,  # kept for debug
            "label": step.label,
            "status": step.status,
            "summary": step.message or step.label,
        }
        if step.duration_ms is not None:
            item["duration_ms"] = step.duration_ms
        return item
