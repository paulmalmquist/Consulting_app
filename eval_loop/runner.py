from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
import time
import uuid
from contextlib import ExitStack
from pathlib import Path
from typing import Any

from eval_loop.chaos_engine import (
    ChaosPlan,
    apply_post_run_chaos,
    apply_pre_run_chaos,
    build_chaos_plan,
    runtime_patch_stack,
)
from eval_loop.comparator import compare_result_sets
from eval_loop.contamination_checks import (
    build_contamination_clusters,
    build_contamination_summary,
    evaluate_scenario_contamination,
)
from eval_loop.environment_matrix import build_context_envelope, discover_environment_bindings
from eval_loop.environment_scorecards import build_environment_scorecards
from eval_loop.failure_taxonomy import is_critical_failure, normalize_failure
from eval_loop.patch_planner import build_patch_plan, safe_autofix_actions
from eval_loop.receipt_diff import diff_records
from eval_loop.receipt_parser import collect_runtime_turn
from eval_loop.regression_store import RegressionStore
from eval_loop.reporters import summarize_run, write_reports
from eval_loop.retest_scheduler import schedule_retests
from eval_loop.scenario_loader import load_scenarios
from eval_loop.scorers import score_assistant_scenario, score_frontend_scenario, score_tool_engine_scenario
from eval_loop.suspect_mapper import build_suspect_heatmap, map_suspects
from eval_loop.forever_controller import ForeverConfig, run_forever


ROOT = Path(__file__).resolve().parent.parent
BACKEND_DIR = ROOT / "backend"
ARTIFACTS_DIR = ROOT / "artifacts" / "eval-loop"


def load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text().splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        value = value.strip().strip("'").strip('"')
        os.environ.setdefault(key.strip(), value)


def bootstrap_backend_imports() -> None:
    load_env_file(ROOT / ".env.local")
    load_env_file(BACKEND_DIR / ".env")
    if str(BACKEND_DIR) not in sys.path:
        sys.path.insert(0, str(BACKEND_DIR))


def _response_text_from_done(done_payload: dict[str, Any] | None) -> str:
    payload = done_payload or {}
    blocks = payload.get("response_blocks") or []
    parts = [block.get("markdown", "") for block in blocks if isinstance(block, dict)]
    return "\n".join(part for part in parts if part).strip()


def _latency_breakdown(events: list[dict[str, Any]], raw_result: dict[str, Any]) -> dict[str, Any]:
    event_times: dict[str, list[int]] = {}
    for event in events:
        event_times.setdefault(event.get("event", ""), []).append(int(event.get("event_time_ms") or 0))

    context_resolution_ms = event_times.get("context", [0])[0] if event_times.get("context") else None
    retrieval_time_ms = None
    if raw_result.get("turn_receipt", {}).get("retrieval", {}).get("used"):
        if event_times.get("response_block") and context_resolution_ms is not None:
            retrieval_time_ms = max(0, event_times["response_block"][0] - context_resolution_ms)
        else:
            retrieval_time_ms = int(raw_result.get("duration_ms") or 0)

    tool_time_ms = None
    if event_times.get("tool_call") and event_times.get("tool_result"):
        tool_time_ms = max(0, event_times["tool_result"][-1] - event_times["tool_call"][0])

    done_times = event_times.get("done") or []
    render_completion_ms = done_times[-1] if done_times else raw_result.get("duration_ms")
    return {
        "total_duration_ms": raw_result.get("duration_ms"),
        "time_to_first_token_ms": raw_result.get("first_token_ms"),
        "context_resolution_ms": context_resolution_ms,
        "retrieval_time_ms": retrieval_time_ms,
        "tool_time_ms": tool_time_ms,
        "render_completion_ms": render_completion_ms,
    }


def _chaos_exit_stack(plan: ChaosPlan | None) -> ExitStack:
    if plan is None or not plan.injections:
        return ExitStack()
    return runtime_patch_stack(plan)


async def run_assistant_turn(
    scenario: dict[str, Any],
    bindings: dict[str, Any],
    *,
    chaos_plan: ChaosPlan | None = None,
) -> dict[str, Any]:
    from app.assistant_runtime.request_lifecycle import run_request_lifecycle

    active = apply_pre_run_chaos(scenario, chaos_plan) if chaos_plan else scenario
    envelope = build_context_envelope(
        environment=active.get("environment"),
        bindings=bindings,
        route=active.get("route"),
        surface=active.get("surface"),
        selected_entities=active.get("selected_entities"),
        visible_data=active.get("visible_data"),
        active_environment_name=active.get("active_environment_name"),
        active_business_name=active.get("active_business_name"),
        omit_environment=active.get("omit_environment", False),
        thread=active.get("thread"),
    )

    with _chaos_exit_stack(chaos_plan):
        parsed = await collect_runtime_turn(
            run_request_lifecycle(
                message=active["message"],
                actor="eval_loop",
                context_envelope=envelope,
            )
        )

    result = {
        "response_text": parsed.response_text or _response_text_from_done(parsed.done_payload),
        "response_blocks": parsed.response_blocks,
        "turn_receipt": parsed.turn_receipt,
        "trace": parsed.trace,
        "events": parsed.events,
        "duration_ms": parsed.duration_ms,
        "first_token_ms": parsed.first_token_ms,
        "frontend_result": None,
    }
    result["latency_breakdown"] = _latency_breakdown(parsed.events, result)
    if isinstance(result.get("trace"), dict):
        result["trace"]["latency_breakdown"] = result["latency_breakdown"]
    if chaos_plan:
        result = apply_post_run_chaos(result=result, scenario=scenario, plan=chaos_plan, bindings=bindings)
    return result


async def run_tool_engine_case(
    scenario: dict[str, Any],
    *,
    chaos_plan: ChaosPlan | None = None,
) -> dict[str, Any]:
    from app.assistant_runtime.execution_engine import ExecutedToolCall, PreparedTools, execute_tool_calls
    from app.assistant_runtime.turn_receipts import PermissionMode, SideEffectClass
    from app.mcp.auth import McpContext
    from app.mcp.registry import ToolDef, registry
    from pydantic import BaseModel

    class _Input(BaseModel):
        name: str | None = None

    fixture = dict(scenario.get("tool_fixture", {}))
    if chaos_plan and "tool_timeout" in chaos_plan.injections:
        fixture["type"] = "timeout"
    if chaos_plan and "tool_failure" in chaos_plan.injections:
        fixture["type"] = "failure"
    if chaos_plan and "invalid_confirmation_state" in chaos_plan.injections:
        fixture["type"] = "denied"

    tool_name = fixture.get("tool_name", "eval.tool")
    safe_name = tool_name.replace(".", "__")
    temporary_tool = None

    if fixture.get("type") in {"denied", "failure", "timeout"}:

        def _raise_or_return(_ctx: Any, _validated: Any):
            if fixture["type"] == "timeout":
                time.sleep(0.3)
                raise TimeoutError("simulated tool timeout")
            if fixture["type"] == "failure":
                raise RuntimeError("simulated tool failure")
            return {"ok": True}

        temporary_tool = ToolDef(
            name=tool_name,
            description="Eval loop synthetic tool",
            module="bm",
            permission="write" if fixture["type"] == "denied" else "read",
            input_model=_Input,
            handler=_raise_or_return,
            tags=frozenset({"eval"}),
            side_effect_class=SideEffectClass.WRITE if fixture["type"] == "denied" else SideEffectClass.READ,
            permission_required=PermissionMode.WRITE_CONFIRMED if fixture["type"] == "denied" else PermissionMode.READ,
            lane_tags=("A_FAST", "B_LOOKUP", "C_ANALYSIS", "D_DEEP"),
            skill_tags=("eval",),
            confirmation_required=fixture["type"] == "denied",
        )
        try:
            registry.register(temporary_tool)
        except ValueError:
            pass

    prepared = PreparedTools(
        openai_tools=[],
        name_map={safe_name: tool_name} if fixture.get("type") != "unknown" else {},
        active_permission_mode=PermissionMode.READ if fixture.get("type") == "denied" else PermissionMode.ANALYZE,
        tool_defs=[temporary_tool] if temporary_tool else [],
    )
    collected = {
        0: {
            "id": "call_eval_1",
            "name": safe_name if fixture.get("type") != "unknown" else "missing__tool",
            "args": json.dumps(fixture.get("args", {"name": "test"})),
        }
    }
    resolved_scope = {"environment_id": "env-eval", "business_id": "biz-eval", "entity_type": None, "entity_id": None}
    started_at = time.perf_counter()
    executed: list[ExecutedToolCall] = await execute_tool_calls(
        collected_tool_calls=collected,
        prepared_tools=prepared,
        ctx=McpContext(actor="eval_loop", token_valid=True, resolved_scope=resolved_scope),
        resolved_scope=resolved_scope,
    )
    duration_ms = int((time.perf_counter() - started_at) * 1000)

    if temporary_tool:
        registry._tools.pop(tool_name, None)  # type: ignore[attr-defined]

    tool_receipts = [call.receipt.model_dump(mode="json") for call in executed]
    response_text = "; ".join(receipt.get("error") or json.dumps(receipt.get("output"), default=str) for receipt in tool_receipts)
    result = {
        "response_text": response_text,
        "tool_receipts": tool_receipts,
        "turn_receipt": None,
        "trace": None,
        "events": [],
        "duration_ms": duration_ms,
        "first_token_ms": None,
        "frontend_result": None,
        "latency_breakdown": {
            "total_duration_ms": duration_ms,
            "time_to_first_token_ms": None,
            "context_resolution_ms": None,
            "retrieval_time_ms": None,
            "tool_time_ms": duration_ms,
            "render_completion_ms": duration_ms,
        },
    }
    if chaos_plan:
        result = apply_post_run_chaos(result=result, scenario=scenario, plan=chaos_plan, bindings={})
    return result


async def run_frontend_contract_case(
    scenario: dict[str, Any],
    *,
    chaos_plan: ChaosPlan | None = None,
) -> dict[str, Any]:
    command = scenario.get("frontend_command")
    if not command:
        raise ValueError(f"Frontend contract scenario {scenario['id']} is missing frontend_command")
    env = os.environ.copy()
    if chaos_plan:
        env["WINSTON_EVAL_CHAOS"] = ",".join(chaos_plan.injections)
    started_at = time.perf_counter()
    proc = await asyncio.create_subprocess_shell(
        command,
        cwd=str(ROOT / "repo-b"),
        env=env,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
    )
    stdout, _ = await proc.communicate()
    duration_ms = int((time.perf_counter() - started_at) * 1000)
    output = (stdout or b"").decode("utf-8", errors="replace")
    result = {
        "response_text": output,
        "tool_receipts": [],
        "turn_receipt": None,
        "trace": None,
        "events": [],
        "duration_ms": duration_ms,
        "first_token_ms": None,
        "frontend_result": {"command": command, "exit_code": proc.returncode, "output": output},
        "frontend_passed": proc.returncode == 0,
        "frontend_output": output,
        "latency_breakdown": {
            "total_duration_ms": duration_ms,
            "time_to_first_token_ms": None,
            "context_resolution_ms": None,
            "retrieval_time_ms": None,
            "tool_time_ms": None,
            "render_completion_ms": duration_ms,
        },
    }
    if chaos_plan:
        result = apply_post_run_chaos(result=result, scenario=scenario, plan=chaos_plan, bindings={})
    return result


async def execute_scenario(
    scenario: dict[str, Any],
    bindings: dict[str, Any],
    *,
    chaos_plan: ChaosPlan | None = None,
) -> dict[str, Any]:
    kind = scenario.get("kind", "assistant_turn")
    if kind == "assistant_turn":
        return await run_assistant_turn(scenario, bindings, chaos_plan=chaos_plan)
    if kind == "tool_engine":
        return await run_tool_engine_case(scenario, chaos_plan=chaos_plan)
    if kind == "frontend_contract":
        return await run_frontend_contract_case(scenario, chaos_plan=chaos_plan)
    raise ValueError(f"Unknown scenario kind: {kind}")


def score_result(scenario: dict[str, Any], raw_result: dict[str, Any]) -> dict[str, Any]:
    kind = scenario.get("kind", "assistant_turn")
    if kind == "assistant_turn":
        scoring = score_assistant_scenario(scenario=scenario, result=raw_result)
    elif kind == "tool_engine":
        scoring = score_tool_engine_scenario(scenario=scenario, result=raw_result)
    else:
        scoring = score_frontend_scenario(scenario=scenario, result=raw_result)
    if scoring.get("passed"):
        scoring["failure_category"] = None
    return {**raw_result, **scoring}


def _comparison_target_records(
    *,
    store: RegressionStore,
    current_run_id: str | None,
    suite: str,
    compare_baseline: str | None,
    compare_last_good: bool,
) -> tuple[str | None, list[dict[str, Any]]]:
    baseline_source: str | None = None
    if compare_baseline:
        candidate = Path(compare_baseline)
        if candidate.exists():
            payload = json.loads(candidate.read_text())
            if isinstance(payload, list):
                return str(candidate), payload
            if isinstance(payload, dict):
                return str(candidate), payload.get("results", [])
        baseline_source = compare_baseline
    elif compare_last_good:
        baseline_source = store.last_good_run_id(suite=suite, exclude_run_id=current_run_id)
    else:
        latest = store.latest_run_id(suite=suite)
        if latest and latest != current_run_id:
            baseline_source = latest

    if not baseline_source:
        return None, []
    return baseline_source, store.run_records(baseline_source, suite=suite)


def _failure_clusters(results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    clusters: dict[str, dict[str, Any]] = {}
    for result in results:
        category = result.get("failure_category")
        if not category:
            continue
        cluster = clusters.setdefault(
            category,
            {
                "category": category,
                "count": 0,
                "scenario_ids": [],
                "suspects": {},
            },
        )
        cluster["count"] += 1
        cluster["scenario_ids"].append(result["scenario_id"])
        for suspect in result.get("suspected_files", []):
            cluster["suspects"][suspect["path"]] = cluster["suspects"].get(suspect["path"], 0) + 1
    ordered = sorted(clusters.values(), key=lambda item: (-item["count"], item["category"]))
    for cluster in ordered:
        suspects = cluster.pop("suspects")
        cluster["top_suspects"] = sorted(suspects.items(), key=lambda item: (-item[1], item[0]))[:5]
    return ordered


def _mutated_high_value_scenarios(scenarios: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        scenario for scenario in scenarios
        if scenario.get("derived_from") and (scenario.get("golden") or scenario.get("high_value") or scenario.get("family", "").startswith("golden"))
    ]


def _contamination_suite_scenarios(scenarios: list[dict[str, Any]]) -> list[dict[str, Any]]:
    family_counts: dict[str, set[str]] = {}
    for scenario in scenarios:
        family = scenario.get("family")
        environment = scenario.get("environment")
        if not family or not environment:
            continue
        family_counts.setdefault(family, set()).add(environment)
    valid_families = {family for family, environments in family_counts.items() if len(environments) > 1}
    return [
        scenario for scenario in scenarios
        if scenario.get("kind", "assistant_turn") == "assistant_turn"
        and scenario.get("family") in valid_families
        and not scenario.get("derived_from")
    ]


def _chaos_suite_scenarios(scenarios: list[dict[str, Any]]) -> list[dict[str, Any]]:
    selected: list[dict[str, Any]] = []
    for scenario in scenarios:
        if scenario.get("derived_from"):
            continue
        if scenario.get("golden") or scenario.get("high_value") or "smoke" in set(scenario.get("suite", ["full"])):
            selected.append(scenario)
    return selected


async def run_suite(
    *,
    scenarios: list[dict[str, Any]],
    suite: str,
    bindings: dict[str, Any],
    store: RegressionStore,
    run_id: str,
    cycle: int,
    chaos_enabled: bool = False,
    chaos_seed: int = 0,
    chaos_profile: str = "light",
) -> tuple[list[dict[str, Any]], dict[str, Any], list[dict[str, Any]], list[dict[str, Any]]]:
    results: list[dict[str, Any]] = []
    regressions: list[dict[str, Any]] = []
    receipt_diffs: list[dict[str, Any]] = []
    for index, scenario in enumerate(scenarios):
        plan = build_chaos_plan(scenario=scenario, seed=chaos_seed + index, profile=chaos_profile) if chaos_enabled else None
        try:
            raw = await execute_scenario(scenario, bindings, chaos_plan=plan)
            contamination_details = evaluate_scenario_contamination(scenario=scenario, result=raw, bindings=bindings)
            raw["contamination_details"] = contamination_details
            raw["cross_environment_contamination"] = 1 if contamination_details.get("contaminated") else 0
            scored = score_result(scenario, raw)
        except Exception as exc:
            scored = {
                "response_text": "",
                "turn_receipt": None,
                "trace": None,
                "frontend_result": None,
                "duration_ms": 0,
                "first_token_ms": None,
                "score": 0.0,
                "passed": False,
                "failure_category": "regression_failure",
                "mismatches": [
                    {
                        "category": "regression_failure",
                        "field": "scenario_execution",
                        "expected": "scenario should complete",
                        "actual": str(exc),
                    }
                ],
                "retrieval_count": 0,
                "tool_count": 0,
                "hallucination_proxy": 0,
                "cross_environment_contamination": 0,
                "contamination_details": {},
                "receipt_completeness": 0.0,
                "trace_fidelity": 0.0,
                "latency_bucket": "fast_wrong",
                "fallback_used": False,
                "fallback_reason": None,
                "low_confidence_dispatch": False,
                "invalid_dispatch": False,
                "dispatch_code_disagreement": False,
                "dispatch_code_disagreement_fields": [],
                "latency_breakdown": {
                    "total_duration_ms": 0,
                    "time_to_first_token_ms": None,
                    "context_resolution_ms": None,
                    "retrieval_time_ms": None,
                    "tool_time_ms": None,
                    "render_completion_ms": 0,
                },
            }

        previous = store.last_run_for_scenario(scenario["id"], exclude_run_id=run_id)
        receipt_diff = diff_records(scored, previous)
        failure_category = scored.get("failure_category")
        scored["failure_category"] = None if scored.get("passed") else failure_category
        suspects = map_suspects(scored.get("failure_category"))
        if scored.get("failure_category") and not suspects:
            suspects = map_suspects("regression_failure")
        scored["suspected_files"] = suspects
        scored["receipt_diff"] = receipt_diff
        scored["chaos_profile"] = plan.profile if plan else None
        scored["chaos_seed"] = plan.seed if plan else None
        scored["chaos_injections"] = plan.injections if plan else []

        record = {
            "run_id": run_id,
            "cycle": cycle,
            "scenario_id": scenario["id"],
            "suite": suite,
            "environment": scenario.get("environment"),
            "kind": scenario.get("kind", "assistant_turn"),
            "prompt": scenario.get("message"),
            "raw_response": scored.get("response_text"),
            "turn_receipt": scored.get("turn_receipt"),
            "trace": scored.get("trace"),
            "frontend_result": scored.get("frontend_result"),
            "score": scored["score"],
            "passed": scored["passed"],
            "failure_category": scored.get("failure_category"),
            "mismatches": scored.get("mismatches", []),
            "duration_ms": scored.get("duration_ms"),
            "first_token_ms": scored.get("first_token_ms"),
            "retrieval_count": scored.get("retrieval_count", 0),
            "tool_count": scored.get("tool_count", 0),
            "hallucination_proxy": scored.get("hallucination_proxy", 0),
            "cross_environment_contamination": scored.get("cross_environment_contamination", 0),
            "family": scenario.get("family"),
            "parent_scenario_id": scenario.get("derived_from"),
            "mutation_family": scenario.get("mutation_family"),
            "mutation_label": scenario.get("mutation_label"),
            "golden": bool(scenario.get("golden")),
            "high_value": bool(scenario.get("high_value")),
            "chaos_profile": scored.get("chaos_profile"),
            "chaos_seed": scored.get("chaos_seed"),
            "chaos_injections": scored.get("chaos_injections", []),
            "contamination_details": scored.get("contamination_details", {}),
            "suspected_files": suspects,
            "receipt_diff": receipt_diff,
            "receipt_completeness": scored.get("receipt_completeness"),
            "trace_fidelity": scored.get("trace_fidelity"),
            "latency_bucket": scored.get("latency_bucket"),
            "fallback_used": scored.get("fallback_used", False),
            "fallback_reason": scored.get("fallback_reason"),
            "low_confidence_dispatch": scored.get("low_confidence_dispatch", False),
            "invalid_dispatch": scored.get("invalid_dispatch", False),
            "dispatch_code_disagreement": scored.get("dispatch_code_disagreement", False),
            "expected": scenario.get("expected", {}),
        }
        results.append(record)
        store.insert_run(record)

        if receipt_diff.get("changed"):
            diff_record = {
                "run_id": run_id,
                "cycle": cycle,
                "scenario_id": scenario["id"],
                **receipt_diff,
            }
            receipt_diffs.append(diff_record)
            store.insert_receipt_diff(diff_record)

        if previous is not None:
            previous_score = float(previous["score"])
            regression_type = None
            if record["score"] < previous_score - 5:
                regression_type = "score_drop"
            elif bool(previous["passed"]) and not record["passed"]:
                regression_type = "pass_to_fail"
            elif previous.get("cross_environment_contamination", 0) == 0 and record.get("cross_environment_contamination", 0) == 1:
                regression_type = "contamination_regression"
            if regression_type:
                regression = {
                    "run_id": run_id,
                    "cycle": cycle,
                    "scenario_id": scenario["id"],
                    "previous_score": previous_score,
                    "current_score": record["score"],
                    "regression_type": regression_type,
                    "details": {
                        "previous_failure_category": previous.get("failure_category"),
                        "current_failure_category": record.get("failure_category"),
                        "receipt_diff": receipt_diff.get("diffs", []),
                    },
                }
                regressions.append(regression)
                store.insert_regression(regression)

    summary = summarize_run(run_id=run_id, cycle=cycle, suite=suite, results=results)
    store.insert_summary(summary)
    return results, summary, regressions, receipt_diffs


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Continuous local validation loop for Winston.")
    parser.add_argument("--smoke", action="store_true", help="Run the smoke suite.")
    parser.add_argument("--full", action="store_true", help="Run the full suite.")
    parser.add_argument("--watch", action="store_true", help="Repeat smoke cycles until interrupted.")
    parser.add_argument("--forever", action="store_true", help="Run the forever controller.")
    parser.add_argument("--chaos", action="store_true", help="Run a dedicated chaos suite.")
    parser.add_argument("--chaos-seed", type=int, default=42, help="Seed for reproducible chaos runs.")
    parser.add_argument("--chaos-profile", choices=["light", "medium", "brutal"], default="light", help="Chaos injection profile.")
    parser.add_argument("--mutations", choices=["enabled", "disabled", "auto"], default="disabled", help="Mutation expansion mode.")
    parser.add_argument("--mutation-limit", type=int, default=0, help="Cap mutation count per base scenario.")
    parser.add_argument("--compare-baseline", default=None, help="Compare current run against a run id or JSON artifact path.")
    parser.add_argument("--compare-safe-mode", action="store_true", help="Compare against a freshly executed safe-mode baseline.")
    parser.add_argument("--compare-last-good", action="store_true", help="Compare against the best-known prior run.")
    parser.add_argument("--autofix-dry-run", action="store_true", help="Generate conservative patch plans.")
    parser.add_argument("--autofix-apply", action="store_true", help="Attempt only registered safe autofixes.")
    parser.add_argument("--backend-origin", default=os.environ.get("BOS_API_ORIGIN", "http://127.0.0.1:8000"), help="Backend origin for environment discovery.")
    parser.add_argument("--pause-seconds", type=float, default=15.0, help="Pause between repeated watch cycles.")
    parser.add_argument("--max-cycles", type=int, default=0, help="Optional cycle cap for watch mode.")
    parser.add_argument("--max-hours", type=float, default=0.0, help="Optional forever-loop max hours.")
    parser.add_argument("--cycle-limit", type=int, default=0, help="Optional forever-loop cycle cap.")
    parser.add_argument("--sleep-seconds", type=int, default=15, help="Pause between forever-loop cycles.")
    parser.add_argument("--include-chaos", action="store_true", help="Include chaos suite inside forever mode.")
    parser.add_argument("--include-mutations", action="store_true", help="Include mutated high-value suite inside forever mode.")
    parser.add_argument("--include-comparisons", action="store_true", help="Include comparison reports inside forever mode.")
    return parser.parse_args()


def _mode_from_args(args: argparse.Namespace) -> str:
    if args.full or args.forever or args.chaos:
        return "full"
    return "smoke"


def _mutation_limit(args: argparse.Namespace) -> int | None:
    return args.mutation_limit if args.mutation_limit > 0 else None


def _should_compare(args: argparse.Namespace) -> bool:
    return bool(args.compare_baseline or args.compare_last_good or args.compare_safe_mode or args.include_comparisons)


async def _run_cycle(
    *,
    cycle: int,
    args: argparse.Namespace,
    bindings: dict[str, Any],
    store: RegressionStore,
) -> dict[str, Any]:
    run_id = f"eval_{uuid.uuid4().hex[:10]}"
    mode = _mode_from_args(args)
    active_mutations_mode = args.mutations
    if args.include_mutations and active_mutations_mode == "disabled":
        active_mutations_mode = "auto"
    base_smoke = load_scenarios(mode="smoke", mutations_mode="disabled", mutation_limit=None)
    base_full = load_scenarios(mode="full", mutations_mode="disabled", mutation_limit=None)
    expanded_full = load_scenarios(mode="full", mutations_mode=active_mutations_mode, mutation_limit=_mutation_limit(args))

    suites_to_run: list[tuple[str, list[dict[str, Any]], bool]] = [("smoke", base_smoke, False)]
    if mode == "full":
        suites_to_run.append(("full", expanded_full, False))
    if args.include_mutations or (active_mutations_mode != "disabled" and mode == "full"):
        mutated = _mutated_high_value_scenarios(expanded_full)
        if mutated:
            suites_to_run.append(("mutations", mutated, False))
    if args.chaos or args.include_chaos:
        chaos_candidates = _chaos_suite_scenarios(base_full)
        if chaos_candidates:
            suites_to_run.append(("chaos", chaos_candidates, True))
    contamination_candidates = _contamination_suite_scenarios(base_full)
    if contamination_candidates and (args.full or args.forever or args.include_comparisons or args.chaos):
        suites_to_run.append(("contamination", contamination_candidates, False))

    all_results: list[dict[str, Any]] = []
    all_regressions: list[dict[str, Any]] = []
    all_receipt_diffs: list[dict[str, Any]] = []
    final_summary: dict[str, Any] | None = None

    for suite_name, suite_scenarios, use_chaos in suites_to_run:
        if not suite_scenarios:
            continue
        results, summary, regressions, receipt_diffs = await run_suite(
            scenarios=suite_scenarios,
            suite=suite_name,
            bindings=bindings,
            store=store,
            run_id=run_id,
            cycle=cycle,
            chaos_enabled=use_chaos,
            chaos_seed=args.chaos_seed,
            chaos_profile=args.chaos_profile,
        )
        all_results.extend(results)
        all_regressions.extend(regressions)
        all_receipt_diffs.extend(receipt_diffs)
        final_summary = summary

    if final_summary is None:
        raise RuntimeError("No suites executed for this cycle.")

    comparison: dict[str, Any] | None = None
    if _should_compare(args):
        baseline_label, baseline_records = _comparison_target_records(
            store=store,
            current_run_id=run_id,
            suite=final_summary["suite"],
            compare_baseline=args.compare_baseline,
            compare_last_good=args.compare_last_good or args.include_comparisons,
        )
        if args.compare_safe_mode:
            safe_results, _, _, _ = await run_suite(
                scenarios=base_full if mode == "full" else base_smoke,
                suite="safe_mode",
                bindings=bindings,
                store=store,
                run_id=run_id,
                cycle=cycle,
                chaos_enabled=False,
                chaos_seed=args.chaos_seed,
                chaos_profile="light",
            )
            comparison = compare_result_sets(
                current_results=all_results,
                baseline_results=safe_results,
                current_label=run_id,
                baseline_label="safe_mode",
            )
        elif baseline_records:
            comparison = compare_result_sets(
                current_results=all_results,
                baseline_results=baseline_records,
                current_label=run_id,
                baseline_label=baseline_label or "baseline",
            )

    recommendations = build_patch_plan(all_results)
    actions = safe_autofix_actions(recommendations, apply=args.autofix_apply)
    (ARTIFACTS_DIR / "autofix_actions.json").write_text(json.dumps(actions, indent=2) + "\n")

    retest_ids = schedule_retests(all_results, expanded_full)
    (ARTIFACTS_DIR / "retest_queue.json").write_text(json.dumps({"scenario_ids": retest_ids}, indent=2) + "\n")

    contamination_summary = build_contamination_summary(all_results)
    contamination_clusters = build_contamination_clusters(all_results)
    scorecards = build_environment_scorecards(all_results)
    store.insert_environment_scorecards(run_id=run_id, cycle=cycle, suite=final_summary["suite"], scorecards=scorecards)
    suspect_heatmap = build_suspect_heatmap(all_results)
    failure_clusters = _failure_clusters(all_results)
    normalized_failures = [
        normalize_failure(
            scenario_id=result["scenario_id"],
            request_id=((result.get("turn_receipt") or {}).get("request_id") if result.get("turn_receipt") else None),
            category=result["failure_category"],
            evidence={
                "mismatches": result.get("mismatches", []),
                "receipt_diff": result.get("receipt_diff", {}),
                "contamination_details": result.get("contamination_details", {}),
            },
            suspected_files=result.get("suspected_files", []),
            newly_introduced=any(regression["scenario_id"] == result["scenario_id"] for regression in all_regressions),
        )
        for result in all_results
        if result.get("failure_category")
    ]
    (ARTIFACTS_DIR / "normalized_failures.json").write_text(json.dumps(normalized_failures, indent=2) + "\n")
    (ARTIFACTS_DIR / "contamination_clusters.json").write_text(json.dumps(contamination_clusters, indent=2) + "\n")

    write_reports(
        out_dir=ARTIFACTS_DIR,
        summary=final_summary,
        results=all_results,
        regressions=all_regressions,
        recommendations=recommendations,
        recent_summaries=store.recent_summaries(),
        scorecards=scorecards,
        comparison=comparison,
        contamination_summary=contamination_summary,
        failure_clusters=failure_clusters,
        suspect_heatmap=suspect_heatmap,
        receipt_diffs=all_receipt_diffs,
    )

    critical_regression = any(
        regression.get("regression_type") == "contamination_regression"
        or is_critical_failure((regression.get("details") or {}).get("current_failure_category"))
        for regression in all_regressions
    )
    print(
        json.dumps(
            {
                "run_id": run_id,
                "cycle": cycle,
                "suite": final_summary["suite"],
                "passed": final_summary["passed_count"],
                "failed": final_summary["failed_count"],
                "median_latency_ms": final_summary["median_latency_ms"],
                "p95_latency_ms": final_summary["p95_latency_ms"],
                "top_failure_category": recommendations[0]["category"] if recommendations else None,
                "critical_regression": critical_regression,
            }
        )
    )
    return {
        "run_id": run_id,
        "failed_count": final_summary["failed_count"],
        "critical_regression": critical_regression,
        "summary": final_summary,
        "results": all_results,
        "comparison": comparison,
    }


async def _run_compare_only(args: argparse.Namespace, store: RegressionStore) -> int:
    suite = "full" if store.latest_run_id(suite="full") else "smoke"
    current_run_id = store.latest_run_id(suite=suite)
    if not current_run_id:
        raise SystemExit("No prior runs available to compare.")
    current_records = store.run_records(current_run_id, suite=suite)
    baseline_label, baseline_records = _comparison_target_records(
        store=store,
        current_run_id=current_run_id,
        suite=suite,
        compare_baseline=args.compare_baseline,
        compare_last_good=args.compare_last_good,
    )
    if not baseline_records and args.compare_last_good:
        baseline_label = store.last_good_run_id(exclude_run_id=current_run_id)
        if baseline_label:
            baseline_records = store.run_records(baseline_label)
    if not baseline_records:
        raise SystemExit("No baseline run available for comparison.")
    comparison = compare_result_sets(
        current_results=current_records,
        baseline_results=baseline_records,
        current_label=current_run_id,
        baseline_label=baseline_label or "baseline",
    )
    from eval_loop.comparator import write_comparison_report

    write_comparison_report(ARTIFACTS_DIR, comparison)
    print(json.dumps({"current_run_id": current_run_id, "baseline": baseline_label, "scenario_count": comparison["scenario_count"]}))
    return 0


async def main() -> int:
    args = parse_args()
    bootstrap_backend_imports()
    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    bindings = discover_environment_bindings(args.backend_origin)
    store = RegressionStore(ARTIFACTS_DIR / "eval_loop.db")

    compare_only = bool((args.compare_last_good or args.compare_baseline) and not (args.smoke or args.full or args.forever or args.watch or args.chaos))
    try:
        if compare_only:
            return await _run_compare_only(args, store)

        if args.watch:
            cycle = 0
            no_improvement_cycles = 0
            previous_failed: int | None = None
            while True:
                cycle += 1
                cycle_result = await _run_cycle(cycle=cycle, args=args, bindings=bindings, store=store)
                failed_count = int(cycle_result["failed_count"])
                if previous_failed is not None and failed_count >= previous_failed:
                    no_improvement_cycles += 1
                else:
                    no_improvement_cycles = 0
                previous_failed = failed_count
                if no_improvement_cycles >= 3:
                    print("No material improvement after 3 cycles. Top blockers written to artifacts/eval-loop/patch_recommendations.md")
                    return 2
                if args.max_cycles and cycle >= args.max_cycles:
                    break
                await asyncio.sleep(args.pause_seconds)
            return 0

        if args.forever:
            config = ForeverConfig(
                max_hours=args.max_hours,
                cycle_limit=args.cycle_limit,
                sleep_seconds=args.sleep_seconds,
                no_improvement_limit=3,
            )
            forever_summary = await run_forever(
                config=config,
                cycle_runner=lambda cycle: _run_cycle(cycle=cycle, args=args, bindings=bindings, store=store),
            )
            (ARTIFACTS_DIR / "forever_summary.json").write_text(json.dumps(forever_summary, indent=2) + "\n")
            print(json.dumps({"stop_reason": forever_summary["stop_reason"], "elapsed_hours": forever_summary["elapsed_hours"], "cycles": len(forever_summary["cycles"])}))
            return 0

        await _run_cycle(cycle=1, args=args, bindings=bindings, store=store)
        return 0
    finally:
        store.close()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
