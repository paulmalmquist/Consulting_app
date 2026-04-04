from __future__ import annotations

from typing import Any

from eval_loop.failure_taxonomy import is_critical_failure, primary_failure_category


WEIGHTS = {
    "context": 25,
    "skill": 15,
    "lane": 10,
    "degraded": 15,
    "retrieval": 10,
    "tool_safety": 10,
    "contamination": 5,
    "answer": 10,
}


def _contains_any(text: str, terms: list[str]) -> bool:
    lowered = text.lower()
    return any(term.lower() in lowered for term in terms)


def _contains_none(text: str, terms: list[str]) -> bool:
    lowered = text.lower()
    return all(term.lower() not in lowered for term in terms)


def _required_keys_present(payload: Any, keys: list[str]) -> int:
    if not isinstance(payload, dict):
        return 0
    present = 0
    for key in keys:
        if key in payload:
            present += 1
    return present


def _receipt_completeness(receipt: dict[str, Any] | None) -> float:
    if not isinstance(receipt, dict) or not receipt:
        return 0.0
    total = 0
    present = 0

    top_level = ["request_id", "lane", "dispatch", "fallback_reason", "context", "skill", "tools", "retrieval", "status"]
    total += len(top_level)
    present += _required_keys_present(receipt, top_level)

    context = receipt.get("context")
    context_keys = ["environment_id", "entity_type", "entity_id", "resolution_status", "notes"]
    total += len(context_keys)
    present += _required_keys_present(context, context_keys)

    skill = receipt.get("skill")
    skill_keys = ["skill_id", "confidence", "triggers_matched"]
    total += len(skill_keys)
    present += _required_keys_present(skill, skill_keys)

    retrieval = receipt.get("retrieval")
    retrieval_keys = ["used", "result_count", "status"]
    total += len(retrieval_keys)
    present += _required_keys_present(retrieval, retrieval_keys)

    dispatch = receipt.get("dispatch")
    dispatch_keys = ["normalized"]
    total += len(dispatch_keys)
    present += _required_keys_present(dispatch, dispatch_keys)

    dispatch_normalized = (dispatch or {}).get("normalized")
    normalized_keys = [
        "source",
        "skill_id",
        "lane",
        "needs_retrieval",
        "write_intent",
        "ambiguity_level",
        "confidence",
        "fallback_used",
        "fallback_reason",
        "notes",
    ]
    total += len(normalized_keys)
    present += _required_keys_present(dispatch_normalized, normalized_keys)

    return round(present / max(total, 1), 4)


def _tool_receipt_completeness(receipts: list[dict[str, Any]]) -> float:
    if not receipts:
        return 0.0
    total = 0
    present = 0
    keys = ["tool_name", "status", "permission_mode", "input", "output"]
    for receipt in receipts:
        total += len(keys)
        present += _required_keys_present(receipt, keys)
    return round(present / max(total, 1), 4)


def _trace_fidelity(kind: str, result: dict[str, Any]) -> float:
    if kind == "frontend_contract":
        return 1.0 if result.get("frontend_passed") else 0.0
    trace = result.get("trace") or {}
    required = ["execution_path", "lane", "resolved_scope", "runtime"]
    return round(_required_keys_present(trace, required) / len(required), 4)


def _latency_bucket(duration_ms: int | None, passed: bool, max_duration_ms: int | None) -> str:
    duration = int(duration_ms or 0)
    threshold = int(max_duration_ms or 8000)
    speed = "slow" if duration > threshold else "fast"
    correctness = "correct" if passed else "wrong"
    return f"{speed}_{correctness}"


def _append_mismatch(
    mismatches: list[dict[str, Any]],
    *,
    category: str,
    field: str,
    expected: Any,
    actual: Any,
) -> None:
    mismatches.append(
        {
            "category": category,
            "field": field,
            "expected": expected,
            "actual": actual,
        }
    )


_GENERIC_DEGRADED_PHRASES = [
    "not available in the current context",
    "context not available",
    "i cannot determine",
    "unable to determine",
    "no data available",
]


def score_product_pass(
    *,
    scenario: dict[str, Any],
    result: dict[str, Any],
    runtime_passed: bool,
) -> dict[str, Any]:
    """Score whether the response was actually useful as a product answer.

    A scenario can pass the runtime (no hallucination, safe degradation) but
    still fail the product (the page should have supported the request).
    """
    product_expected = scenario.get("product_expected")
    if not product_expected:
        return {"product_pass": None, "product_score": None, "product_mismatches": []}

    response_text = (result.get("response_text") or "").strip()
    receipt = result.get("turn_receipt") or {}
    status = receipt.get("status")
    mismatches: list[dict[str, Any]] = []
    score = 100.0

    # Check: should_answer — if true, a degraded response is a product failure
    should_answer = product_expected.get("should_answer", True)
    if should_answer and status == "degraded":
        score -= 40.0
        _append_mismatch(
            mismatches,
            category="product_degraded_on_supported_page",
            field="should_answer",
            expected=True,
            actual=f"status={status}, degraded_reason={receipt.get('degraded_reason')}",
        )

    # Check: forbidden_generic_degraded — generic "not available" phrases are product failures
    if product_expected.get("forbidden_generic_degraded") and response_text:
        lowered = response_text.lower()
        for phrase in _GENERIC_DEGRADED_PHRASES:
            if phrase in lowered:
                score -= 30.0
                _append_mismatch(
                    mismatches,
                    category="product_generic_degraded",
                    field="forbidden_generic_degraded",
                    expected="specific answer or specific degradation reason",
                    actual=phrase,
                )
                break

    # Check: usefulness_keywords — response should contain domain-relevant terms
    usefulness_keywords = product_expected.get("usefulness_keywords", [])
    if usefulness_keywords and response_text:
        if not _contains_any(response_text, usefulness_keywords):
            score -= 20.0
            _append_mismatch(
                mismatches,
                category="product_missing_usefulness",
                field="usefulness_keywords",
                expected=usefulness_keywords,
                actual=response_text[:300],
            )

    # Check: must_reference_entity — response must mention the selected entity by name
    if product_expected.get("must_reference_entity") and response_text:
        selected = scenario.get("selected_entities") or []
        # Also check page_type defaults for entity names
        entity_names = [e.get("name") for e in selected if e.get("name")]
        if not entity_names:
            # Fall back to visible_data entity names
            visible = scenario.get("visible_data") or {}
            for key in ("funds", "assets", "pipeline_items", "investments"):
                for item in visible.get(key, []):
                    if item.get("name"):
                        entity_names.append(item["name"])
        if entity_names and not _contains_any(response_text, entity_names):
            score -= 20.0
            _append_mismatch(
                mismatches,
                category="product_missing_entity_reference",
                field="must_reference_entity",
                expected=entity_names,
                actual=response_text[:300],
            )

    product_pass = score >= 70.0 and not any(
        m["category"] == "product_degraded_on_supported_page" for m in mismatches
    )

    return {
        "product_pass": product_pass,
        "product_score": round(max(0.0, score), 2),
        "product_mismatches": mismatches,
    }


def score_assistant_scenario(*, scenario: dict[str, Any], result: dict[str, Any]) -> dict[str, Any]:
    expected = scenario.get("expected", {})
    receipt = result.get("turn_receipt") or {}
    response_text = (result.get("response_text") or "").strip()
    mismatches: list[dict[str, Any]] = []
    base_score = 0.0

    context = receipt.get("context") or {}
    skill = receipt.get("skill") or {}
    retrieval = receipt.get("retrieval") or {}
    tools = receipt.get("tools") or []
    dispatch = (receipt.get("dispatch") or {}).get("normalized") or {}
    raw_dispatch = (receipt.get("dispatch") or {}).get("raw") or {}
    tool_names = [tool.get("tool_name") for tool in tools]
    tool_statuses = [tool.get("status") for tool in tools]
    response_block_types = [
        block.get("type")
        for block in (result.get("response_blocks") or [])
        if isinstance(block, dict)
    ]

    context_ok = True
    for field in ("context_status", "environment_id", "entity_type", "entity_id"):
        expected_value = expected.get(field)
        if expected_value is None:
            continue
        actual_field = "resolution_status" if field == "context_status" else field
        actual_value = context.get(actual_field)
        if actual_value != expected_value:
            context_ok = False
            _append_mismatch(
                mismatches,
                category="context_failure",
                field=field,
                expected=expected_value,
                actual=actual_value,
            )
    if context_ok:
        base_score += WEIGHTS["context"]

    skill_ok = True
    skill_id = skill.get("skill_id")
    expected_skill = expected.get("skill")
    allowed_skills = expected.get("allowed_skills") or []
    if expected_skill and skill_id != expected_skill:
        skill_ok = False
    if allowed_skills and skill_id not in allowed_skills:
        skill_ok = False
    if not skill_ok:
        _append_mismatch(
            mismatches,
            category="routing_failure",
            field="skill",
            expected=expected_skill or allowed_skills,
            actual=skill_id,
        )
    else:
        base_score += WEIGHTS["skill"]

    lane_ok = True
    lane = receipt.get("lane")
    if expected.get("lane") and lane != expected["lane"]:
        lane_ok = False
    allowed_lanes = expected.get("allowed_lanes") or []
    if allowed_lanes and lane not in allowed_lanes:
        lane_ok = False
    forbidden_lanes = expected.get("forbidden_lanes") or []
    if forbidden_lanes and lane in forbidden_lanes:
        lane_ok = False
    if not lane_ok:
        _append_mismatch(
            mismatches,
            category="lane_failure",
            field="lane",
            expected=expected.get("lane") or allowed_lanes,
            actual=lane,
        )
    else:
        base_score += WEIGHTS["lane"]

    degraded_ok = True
    if expected.get("status") and receipt.get("status") != expected["status"]:
        degraded_ok = False
    if "degraded_reason" in expected and receipt.get("degraded_reason") != expected.get("degraded_reason"):
        degraded_ok = False
    if not degraded_ok:
        _append_mismatch(
            mismatches,
            category="degraded_mode_failure",
            field="status",
            expected={"status": expected.get("status"), "degraded_reason": expected.get("degraded_reason")},
            actual={"status": receipt.get("status"), "degraded_reason": receipt.get("degraded_reason")},
        )
    else:
        base_score += WEIGHTS["degraded"]

    retrieval_ok = True
    if expected.get("retrieval_used") is not None and retrieval.get("used") != expected["retrieval_used"]:
        retrieval_ok = False
        _append_mismatch(
            mismatches,
            category="retrieval_failure",
            field="retrieval_used",
            expected=expected["retrieval_used"],
            actual=retrieval.get("used"),
        )
    if expected.get("retrieval_status") and retrieval.get("status") != expected["retrieval_status"]:
        retrieval_ok = False
        _append_mismatch(
            mismatches,
            category="retrieval_failure",
            field="retrieval_status",
            expected=expected["retrieval_status"],
            actual=retrieval.get("status"),
        )
    if expected.get("retrieval_result_count") is not None and retrieval.get("result_count") != expected["retrieval_result_count"]:
        retrieval_ok = False
        _append_mismatch(
            mismatches,
            category="retrieval_failure",
            field="retrieval_result_count",
            expected=expected["retrieval_result_count"],
            actual=retrieval.get("result_count"),
        )
    if retrieval_ok:
        base_score += WEIGHTS["retrieval"]

    pending_action = receipt.get("pending_action") or {}
    expected_pending_status = expected.get("pending_action_status")
    if expected_pending_status and pending_action.get("status") != expected_pending_status:
        tool_ok = False
        _append_mismatch(
            mismatches,
            category="tool_policy_failure",
            field="pending_action_status",
            expected=expected_pending_status,
            actual=pending_action.get("status"),
        )
    expected_pending_action = expected.get("pending_action_action")
    if expected_pending_action and pending_action.get("action_type") != expected_pending_action:
        tool_ok = False
        _append_mismatch(
            mismatches,
            category="tool_policy_failure",
            field="pending_action_action",
            expected=expected_pending_action,
            actual=pending_action.get("action_type"),
        )

    tool_ok = True
    if expected.get("tool_names") is not None and tool_names != expected.get("tool_names"):
        tool_ok = False
        _append_mismatch(
            mismatches,
            category="tool_policy_failure",
            field="tool_names",
            expected=expected.get("tool_names"),
            actual=tool_names,
        )
    if expected.get("forbidden_tool_names") and any(name in tool_names for name in expected["forbidden_tool_names"]):
        tool_ok = False
        _append_mismatch(
            mismatches,
            category="tool_policy_failure",
            field="forbidden_tool_names",
            expected=expected.get("forbidden_tool_names"),
            actual=tool_names,
        )
    if expected.get("tool_statuses") and tool_statuses != expected["tool_statuses"]:
        tool_ok = False
        _append_mismatch(
            mismatches,
            category="tool_execution_failure",
            field="tool_statuses",
            expected=expected["tool_statuses"],
            actual=tool_statuses,
        )
    if tool_ok:
        base_score += WEIGHTS["tool_safety"]

    expected_block_types = expected.get("response_block_types") or []
    if expected_block_types and any(block_type not in response_block_types for block_type in expected_block_types):
        _append_mismatch(
            mismatches,
            category="rendering_failure",
            field="response_block_types",
            expected=expected_block_types,
            actual=response_block_types,
        )

    contamination_details = result.get("contamination_details") or {}
    contamination_ok = not contamination_details.get("contaminated")
    if contamination_ok:
        base_score += WEIGHTS["contamination"]
    else:
        _append_mismatch(
            mismatches,
            category="retrieval_contamination",
            field="contamination",
            expected={"contaminated": False},
            actual=contamination_details,
        )

    answer_ok = True
    must_include = expected.get("answer_must_include", [])
    if must_include and not _contains_any(response_text, must_include):
        answer_ok = False
    must_not = expected.get("answer_must_not_include", [])
    if must_not and not _contains_none(response_text, must_not):
        answer_ok = False
    if not answer_ok:
        _append_mismatch(
            mismatches,
            category="routing_failure",
            field="answer_content",
            expected={"include": must_include, "exclude": must_not},
            actual=response_text[:500],
        )
    else:
        base_score += WEIGHTS["answer"]

    if expected.get("max_duration_ms") and (result.get("duration_ms") or 0) > expected["max_duration_ms"]:
        _append_mismatch(
            mismatches,
            category="performance_failure",
            field="duration_ms",
            expected=expected["max_duration_ms"],
            actual=result.get("duration_ms"),
        )
    if expected.get("max_first_token_ms") and (result.get("first_token_ms") or 10**9) > expected["max_first_token_ms"]:
        _append_mismatch(
            mismatches,
            category="performance_failure",
            field="first_token_ms",
            expected=expected["max_first_token_ms"],
            actual=result.get("first_token_ms"),
        )

    receipt_completeness = _receipt_completeness(receipt if isinstance(receipt, dict) else None)
    trace_fidelity = _trace_fidelity("assistant_turn", result)
    if receipt_completeness < 1.0:
        _append_mismatch(
            mismatches,
            category="regression_failure",
            field="receipt_completeness",
            expected=1.0,
            actual=receipt_completeness,
        )

    failure_category = primary_failure_category(mismatches)
    final_score = max(0.0, base_score - ((1.0 - receipt_completeness) * 20.0) - ((1.0 - trace_fidelity) * 10.0))
    hallucination_proxy = 1 if must_not and not _contains_none(response_text, must_not) else 0
    anti_smoothness_failed = bool(response_text and answer_ok and (receipt_completeness < 1.0 or failure_category))
    critical_failure = any(is_critical_failure(mismatch.get("category")) for mismatch in mismatches)
    fallback_reason = receipt.get("fallback_reason") or dispatch.get("fallback_reason")
    fallback_used = bool(dispatch.get("fallback_used"))
    low_confidence_dispatch = fallback_reason == "low_confidence_dispatch"
    invalid_dispatch = bool(fallback_reason) and (
        fallback_reason.startswith("dispatcher_error:")
        or fallback_reason in {
            "dispatcher_invalid_json",
            "dispatcher_invalid_schema",
            "dispatcher_invalid_response",
            "dispatcher_empty_output",
            "dispatcher_truncated",
            "dispatcher_no_choices",
        }
    )
    disagreement_fields = [
        field
        for field in ("skill", "lane", "needs_retrieval", "write_intent", "ambiguity_level")
        if raw_dispatch and raw_dispatch.get(field) != dispatch.get("skill_id" if field == "skill" else field)
    ]
    dispatch_code_disagreement = bool(disagreement_fields)

    passed = (
        final_score >= 85.0
        and not critical_failure
        and not anti_smoothness_failed
        and receipt_completeness >= 1.0
    )

    product_result = score_product_pass(
        scenario=scenario, result=result, runtime_passed=passed,
    )

    return {
        "score": round(final_score, 2),
        "passed": passed,
        "product_pass": product_result["product_pass"],
        "product_score": product_result["product_score"],
        "product_mismatches": product_result["product_mismatches"],
        "failure_category": failure_category,
        "mismatches": mismatches,
        "tool_count": len(tool_names),
        "retrieval_count": retrieval.get("result_count", 0) or 0,
        "hallucination_proxy": hallucination_proxy,
        "cross_environment_contamination": 1 if contamination_details.get("contaminated") else 0,
        "receipt_completeness": receipt_completeness,
        "trace_fidelity": trace_fidelity,
        "latency_bucket": _latency_bucket(result.get("duration_ms"), passed, expected.get("max_duration_ms")),
        "trace_summary": {"execution_path": (result.get("trace") or {}).get("execution_path"), "lane": (result.get("trace") or {}).get("lane")},
        "anti_smoothness_failed": anti_smoothness_failed,
        "fallback_used": fallback_used,
        "fallback_reason": fallback_reason,
        "low_confidence_dispatch": low_confidence_dispatch,
        "invalid_dispatch": invalid_dispatch,
        "dispatch_code_disagreement": dispatch_code_disagreement,
        "dispatch_code_disagreement_fields": disagreement_fields,
    }


def score_tool_engine_scenario(*, scenario: dict[str, Any], result: dict[str, Any]) -> dict[str, Any]:
    expected = scenario.get("expected", {})
    receipts = result.get("tool_receipts", [])
    response_text = (result.get("response_text") or "").strip()
    mismatches: list[dict[str, Any]] = []
    base_score = 0.0

    tool_names = [receipt.get("tool_name") for receipt in receipts]
    tool_statuses = [receipt.get("status") for receipt in receipts]
    if receipts:
        base_score += WEIGHTS["context"]
    else:
        _append_mismatch(
            mismatches,
            category="tool_execution_failure",
            field="tool_receipt",
            expected="at least one receipt",
            actual=receipts,
        )

    if expected.get("tool_names") and tool_names != expected["tool_names"]:
        _append_mismatch(
            mismatches,
            category="tool_execution_failure",
            field="tool_names",
            expected=expected["tool_names"],
            actual=tool_names,
        )
    else:
        base_score += WEIGHTS["skill"]

    if expected.get("tool_statuses") and tool_statuses != expected["tool_statuses"]:
        _append_mismatch(
            mismatches,
            category="tool_execution_failure" if "failed" in tool_statuses else "tool_policy_failure",
            field="tool_statuses",
            expected=expected["tool_statuses"],
            actual=tool_statuses,
        )
    else:
        base_score += WEIGHTS["tool_safety"] + WEIGHTS["degraded"]

    must_include = expected.get("answer_must_include", [])
    if not must_include or _contains_any(response_text, must_include):
        base_score += WEIGHTS["answer"] + WEIGHTS["lane"] + WEIGHTS["retrieval"]
    else:
        _append_mismatch(
            mismatches,
            category="tool_execution_failure",
            field="answer_content",
            expected=must_include,
            actual=response_text[:500],
        )

    receipt_completeness = _tool_receipt_completeness(receipts)
    trace_fidelity = 1.0
    if receipt_completeness < 1.0:
        _append_mismatch(
            mismatches,
            category="regression_failure",
            field="receipt_completeness",
            expected=1.0,
            actual=receipt_completeness,
        )
    failure_category = primary_failure_category(mismatches)
    final_score = max(0.0, base_score - ((1.0 - receipt_completeness) * 20.0))
    passed = final_score >= 85.0 and not failure_category and receipt_completeness >= 1.0
    return {
        "score": round(min(final_score, 100.0), 2),
        "passed": passed,
        "failure_category": failure_category,
        "mismatches": mismatches,
        "tool_count": len(receipts),
        "retrieval_count": 0,
        "hallucination_proxy": 0,
        "cross_environment_contamination": 0,
        "receipt_completeness": receipt_completeness,
        "trace_fidelity": trace_fidelity,
        "latency_bucket": _latency_bucket(result.get("duration_ms"), passed, expected.get("max_duration_ms")),
        "trace_summary": {},
        "anti_smoothness_failed": False,
    }


def score_frontend_scenario(*, scenario: dict[str, Any], result: dict[str, Any]) -> dict[str, Any]:
    passed = bool(result.get("frontend_passed"))
    mismatches: list[dict[str, Any]] = []
    if not passed:
        _append_mismatch(
            mismatches,
            category="rendering_failure",
            field="frontend_command",
            expected="exit code 0",
            actual=(result.get("frontend_output") or "")[:1200],
        )
    failure_category = primary_failure_category(mismatches)
    trace_fidelity = _trace_fidelity("frontend_contract", result)
    return {
        "score": 100.0 if passed else 0.0,
        "passed": passed,
        "failure_category": failure_category,
        "mismatches": mismatches,
        "tool_count": 0,
        "retrieval_count": 0,
        "hallucination_proxy": 0,
        "cross_environment_contamination": 0,
        "receipt_completeness": 1.0,
        "trace_fidelity": trace_fidelity,
        "latency_bucket": _latency_bucket(result.get("duration_ms"), passed, scenario.get("expected", {}).get("max_duration_ms")),
        "trace_summary": {},
        "anti_smoothness_failed": False,
    }
