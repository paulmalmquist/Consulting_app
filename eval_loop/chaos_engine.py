from __future__ import annotations

import asyncio
import random
from contextlib import ExitStack
from copy import deepcopy
from dataclasses import dataclass
from typing import Any
from unittest.mock import patch


@dataclass(frozen=True)
class ChaosPlan:
    scenario_id: str
    seed: int
    profile: str
    injections: list[str]
    event_delay_ms: int = 0


_PROFILES = {
    "light": (1, 1),
    "medium": (1, 2),
    "brutal": (2, 3),
}


def _stable_rng(seed: int, scenario_id: str) -> random.Random:
    return random.Random(f"{seed}:{scenario_id}")


def available_injections_for(scenario: dict[str, Any]) -> list[str]:
    kind = scenario.get("kind", "assistant_turn")
    injections = [
        "missing_environment_context",
        "missing_entity_context",
        "ambiguous_entity_context",
        "stale_route_context",
        "retrieval_forced_empty",
        "retrieval_wrong_scope_simulation",
        "retrieval_duplicate_noise",
        "missing_receipt_field",
        "slow_stream",
    ]
    if kind in {"tool_engine", "assistant_turn"}:
        injections += [
            "tool_timeout",
            "tool_failure",
            "malformed_tool_result",
            "invalid_confirmation_state",
        ]
    if kind == "frontend_contract":
        injections += ["missing_receipt_field", "malformed_tool_result", "slow_stream"]
    return list(dict.fromkeys(injections))


def build_chaos_plan(*, scenario: dict[str, Any], seed: int, profile: str) -> ChaosPlan:
    min_count, max_count = _PROFILES.get(profile, (1, 1))
    rng = _stable_rng(seed, scenario["id"])
    candidates = available_injections_for(scenario)
    if not candidates:
        return ChaosPlan(scenario_id=scenario["id"], seed=seed, profile=profile, injections=[])
    count = min(len(candidates), rng.randint(min_count, max_count))
    injections = sorted(rng.sample(candidates, count))
    event_delay_ms = 350 if "slow_stream" in injections else 0
    return ChaosPlan(
        scenario_id=scenario["id"],
        seed=seed,
        profile=profile,
        injections=injections,
        event_delay_ms=event_delay_ms,
    )


def apply_pre_run_chaos(scenario: dict[str, Any], plan: ChaosPlan) -> dict[str, Any]:
    mutated = deepcopy(scenario)
    if "missing_environment_context" in plan.injections:
        mutated["omit_environment"] = True
    if "missing_entity_context" in plan.injections:
        mutated["selected_entities"] = []
    if "ambiguous_entity_context" in plan.injections:
        selected = deepcopy(mutated.get("selected_entities") or [])
        if len(selected) <= 1:
            selected.append(
                {"entity_type": "fund", "entity_id": "fund_2", "name": "Fund Two", "source": "chaos"}
            )
        mutated["selected_entities"] = selected
    if "stale_route_context" in plan.injections:
        route = mutated.get("route") or ""
        mutated["route"] = route.replace("/re", "/consulting") if "/re" in route else "/lab/env/stale/consulting"
    return mutated


def runtime_patch_stack(plan: ChaosPlan) -> ExitStack:
    from app.assistant_runtime import request_lifecycle as lifecycle
    from app.assistant_runtime.execution_engine import ExecutedToolCall
    from app.assistant_runtime.turn_receipts import (
        PermissionMode,
        RetrievalReceipt,
        RetrievalStatus,
        ToolReceipt,
        ToolStatus,
    )
    from app.assistant_runtime.retrieval_orchestrator import RetrievalExecution

    stack = ExitStack()

    if "retrieval_forced_empty" in plan.injections:
        async def _forced_empty(**_: Any):
            return RetrievalExecution(
                chunks=[],
                context_text="",
                receipt=RetrievalReceipt(used=True, result_count=0, status=RetrievalStatus.EMPTY),
            )
        stack.enter_context(patch.object(lifecycle, "execute_retrieval", _forced_empty))

    if "tool_failure" in plan.injections or "tool_timeout" in plan.injections or "malformed_tool_result" in plan.injections:
        async def _chaos_tools(**_: Any):
            if "tool_timeout" in plan.injections:
                await asyncio.sleep(0.25)
                error = "tool timeout"
                status = ToolStatus.FAILED
                output: Any = None
            elif "tool_failure" in plan.injections:
                error = "simulated tool failure"
                status = ToolStatus.FAILED
                output = None
            else:
                error = None
                status = ToolStatus.SUCCESS
                output = {"malformed": ["nested", {"odd": object.__name__}]}
            receipt = ToolReceipt(
                tool_name="chaos.synthetic_tool",
                status=status,
                permission_mode=PermissionMode.ANALYZE,
                input={"chaos": True},
                output=output,
                error=error,
            )
            return [
                ExecutedToolCall(
                    receipt=receipt,
                    tool_message={"role": "tool", "tool_call_id": "chaos_tool", "content": str(output or error)},
                    event_payload={
                        "tool_name": "chaos.synthetic_tool",
                        "args": {"chaos": True},
                        "result": output or {"error": error},
                        "success": status == ToolStatus.SUCCESS,
                        "error": error,
                    },
                )
            ]
        stack.enter_context(patch.object(lifecycle, "execute_tool_calls", _chaos_tools))

    return stack


def apply_post_run_chaos(
    *,
    result: dict[str, Any],
    scenario: dict[str, Any],
    plan: ChaosPlan,
    bindings: dict[str, Any],
) -> dict[str, Any]:
    mutated = deepcopy(result)
    mutated["chaos_details"] = {name: True for name in plan.injections}
    mutated["chaos_profile"] = plan.profile
    mutated["chaos_seed"] = plan.seed

    if "retrieval_wrong_scope_simulation" in plan.injections:
        receipt = deepcopy(mutated.get("turn_receipt") or {})
        context = deepcopy(receipt.get("context") or {})
        if scenario.get("environment") and bindings:
            for env_name, binding in bindings.items():
                if env_name != scenario.get("environment"):
                    context["environment_id"] = binding.env_id
                    break
        receipt["context"] = context
        mutated["turn_receipt"] = receipt

    if "retrieval_duplicate_noise" in plan.injections:
        blocks = deepcopy(mutated.get("response_blocks") or [])
        if blocks:
            blocks.append(deepcopy(blocks[-1]))
        mutated["response_blocks"] = blocks

    if "missing_receipt_field" in plan.injections:
        receipt = deepcopy(mutated.get("turn_receipt") or {})
        if "lane" in receipt:
            receipt.pop("lane", None)
        mutated["turn_receipt"] = receipt

    if "invalid_confirmation_state" in plan.injections:
        mutated["response_blocks"] = deepcopy(mutated.get("response_blocks") or [])
        mutated["response_blocks"].append(
            {
                "type": "confirmation",
                "block_id": "chaos_confirmation",
                "action": None,
                "summary": "Invalid confirmation state injected by chaos mode",
            }
        )
    return mutated

