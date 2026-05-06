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


def _contract_mismatches(
    *,
    scenario: dict[str, Any],
    result: dict[str, Any],
) -> list[dict[str, Any]]:
    try:
        from eval_loop.canonical_assertions import detect_canonical_failures

        failures = detect_canonical_failures(scenario=scenario, result=result, baseline=None)
    except Exception as exc:  # noqa: BLE001
        failures = [
            {
                "category": "regression_failure",
                "evidence": {
                    "reason": "contract_validation_unavailable",
                    "error_type": type(exc).__name__,
                    "error": str(exc),
                },
            }
        ]
    return [
        {
            "category": failure.get("category") or "regression_failure",
            "field": "response_contract",
            "expected": "valid canonical Winston turn",
            "actual": failure.get("evidence", failure),
        }
        for failure in failures
    ]


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

    contract_mismatches = _contract_mismatches(scenario=scenario, result=result)
    mismatches.extend(contract_mismatches)

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
    contract_failed = bool(contract_mismatches)
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
        and not contract_failed
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
        "contract_failures": contract_mismatches,
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


def score_operator_readiness_scenario(*, scenario: dict[str, Any], result: dict[str, Any]) -> dict[str, Any]:
    expected = scenario.get("expected", {})
    status = result.get("operator_status")
    health = result.get("operator_health") or {}
    allowed_statuses = expected.get("allowed_statuses") or []
    mismatches: list[dict[str, Any]] = []

    if allowed_statuses and status not in allowed_statuses:
        _append_mismatch(
            mismatches,
            category="operator_unavailable",
            field="operator_status",
            expected=allowed_statuses,
            actual=status,
        )

    if "enabled" in expected and bool(health.get("enabled")) != bool(expected["enabled"]):
        _append_mismatch(
            mismatches,
            category="operator_unavailable",
            field="enabled",
            expected=bool(expected["enabled"]),
            actual=bool(health.get("enabled")),
        )

    runtime_identity = (result.get("trace") or {}).get("runtime_identity") or {}
    expected_path = expected.get("runtime_path")
    if expected_path and runtime_identity.get("path") != expected_path:
        _append_mismatch(
            mismatches,
            category="runtime_path_mismatch",
            field="runtime_identity.path",
            expected=expected_path,
            actual=runtime_identity.get("path"),
        )

    if health.get("fallback_used"):
        _append_mismatch(
            mismatches,
            category="contract_enforced_fallback",
            field="fallback_used",
            expected=False,
            actual=True,
        )

    failure_category = primary_failure_category(mismatches)
    passed = failure_category is None
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
        "trace_fidelity": 1.0 if runtime_identity else 0.0,
        "latency_bucket": _latency_bucket(result.get("duration_ms"), passed, expected.get("max_duration_ms")),
        "trace_summary": {
            "runtime_path": runtime_identity.get("path"),
            "operator_status": status,
        },
        "anti_smoothness_failed": False,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Concept-aware scoring (PR 3)
#
# Each scorer returns a dict with at least:
#   {"score": float, "applicable": bool, "mismatches": list[dict]}
# `applicable=False` means the scorer skipped because its inputs weren't
# present (e.g., source_discipline scorers when receipt fields are None).
# Skipped scorers do NOT count as failures and are tracked via score_coverage.
#
# `score_concept_scenario` runs all scorers, aggregates, and returns the same
# top-level shape as score_assistant_scenario so the runner can append to
# raw_result without knowing the kind.
# ─────────────────────────────────────────────────────────────────────────────


_GENERIC_FILLER_PHRASES = (
    "i don't have enough information",
    "i'm not sure",
    "could you clarify",
    "as an ai",
    "i cannot",
    "happy to help",
    "let me know if",
    "in general",
    "typically,",
    "it depends",
    "various factors",
    "many reasons",
)


def _concept_receipt(result: dict[str, Any]) -> dict[str, Any]:
    """Pull the ConceptReceipt sub-block off a turn receipt."""
    receipt = result.get("turn_receipt") or {}
    concept = receipt.get("concept")
    return concept if isinstance(concept, dict) else {}


def _source_discipline_receipt(result: dict[str, Any]) -> dict[str, Any]:
    receipt = result.get("turn_receipt") or {}
    sd = receipt.get("source_discipline")
    return sd if isinstance(sd, dict) else {}


def concept_match_score(
    *, scenario: dict[str, Any], result: dict[str, Any]
) -> dict[str, Any]:
    """expected.concept_id == actual.concept_id. Always applicable."""
    expected = scenario.get("concept_expected", {}) or {}
    expected_id = expected.get("concept_id")
    actual = _concept_receipt(result)
    actual_id = actual.get("concept_id")
    mismatches: list[dict[str, Any]] = []
    if not expected_id:
        # Scenario didn't declare a target — nothing to grade.
        return {"score": 0.0, "applicable": False, "mismatches": [],
                "passed": True, "name": "concept_match_score"}
    passed = actual_id == expected_id
    if not passed:
        mismatches.append({
            "category": "wrong_concept_id",
            "field": "concept_id",
            "expected": expected_id,
            "actual": actual_id,
        })
    return {
        "score": 100.0 if passed else 0.0,
        "applicable": True,
        "passed": passed,
        "mismatches": mismatches,
        "name": "concept_match_score",
    }


def alias_normalization_score(
    *, scenario: dict[str, Any], result: dict[str, Any]
) -> dict[str, Any]:
    """matched_alias is in the scenario's allowlist. Applicable when the
    scenario declares `matched_alias_must_be_in`. If a concept matched but
    the scenario didn't pin an alias, the scorer is informational only."""
    expected = scenario.get("concept_expected", {}) or {}
    allowed = expected.get("matched_alias_must_be_in")
    if not allowed:
        return {"score": 0.0, "applicable": False, "mismatches": [],
                "passed": True, "name": "alias_normalization_score"}
    actual = _concept_receipt(result)
    matched = actual.get("matched_alias")
    if matched is None:
        return {"score": 0.0, "applicable": True, "passed": False,
                "mismatches": [{
                    "category": "alias_not_resolved",
                    "field": "matched_alias",
                    "expected": allowed,
                    "actual": None,
                }],
                "name": "alias_normalization_score"}
    matched_low = matched.lower()
    passed = any(a.lower() == matched_low for a in allowed)
    return {
        "score": 100.0 if passed else 0.0,
        "applicable": True,
        "passed": passed,
        "mismatches": [] if passed else [{
            "category": "alias_normalization_failed",
            "field": "matched_alias",
            "expected": allowed,
            "actual": matched,
        }],
        "name": "alias_normalization_score",
    }


def context_completeness_score(
    *, scenario: dict[str, Any], result: dict[str, Any]
) -> dict[str, Any]:
    """All scenario-declared `required_context_present` fields are present in
    the receipt's required_context_present list. Source-discipline fields
    (sources, basis, currency, comparison_set) are NOT graded — those stay
    missing until the data layer plumbs them, by design.

    Applicable: when scenario declares `required_context_present`, OR when
    a concept matched (in which case we grade against the receipt's own
    present/missing split for the entity/period/scope fields only).
    """
    expected = scenario.get("concept_expected", {}) or {}
    required = expected.get("required_context_present")
    actual = _concept_receipt(result)
    if not actual:
        # No concept matched — context_completeness has nothing to grade.
        return {"score": 0.0, "applicable": False, "mismatches": [],
                "passed": True, "name": "context_completeness_score"}
    actual_present = set(actual.get("required_context_present") or [])
    if required:
        missing_required = [f for f in required if f not in actual_present]
        passed = not missing_required
        return {
            "score": 100.0 if passed else 0.0,
            "applicable": True,
            "passed": passed,
            "mismatches": [] if passed else [{
                "category": "required_context_missing",
                "field": "required_context_present",
                "expected": required,
                "actual": list(actual_present),
            }],
            "name": "context_completeness_score",
        }
    # Concept matched but scenario didn't pin specific fields. Grade the
    # subset we can know today (entity, period, scope) — anything missing
    # there counts. Source-discipline fields explicitly excluded.
    KNOWABLE = {"entity", "period", "scope"}
    missing_knowable = [
        f for f in (actual.get("required_context_missing") or [])
        if f in KNOWABLE
    ]
    passed = not missing_knowable
    return {
        "score": 100.0 if passed else 50.0,
        "applicable": True,
        "passed": passed,
        "mismatches": [] if passed else [{
            "category": "knowable_context_missing",
            "field": "required_context_missing",
            "expected": "no knowable fields missing",
            "actual": missing_knowable,
        }],
        "name": "context_completeness_score",
    }


def output_contract_score(
    *, scenario: dict[str, Any], result: dict[str, Any]
) -> dict[str, Any]:
    """The answer mentions the required output sections from the concept.
    Applicable when a concept matched. Uses simple keyword presence — a
    smarter section-detector is a PR 4 problem.
    """
    expected = scenario.get("concept_expected", {}) or {}
    required_sections = expected.get("required_output_sections") or []
    actual = _concept_receipt(result)
    if not actual or not required_sections:
        return {"score": 0.0, "applicable": False, "mismatches": [],
                "passed": True, "name": "output_contract_score"}
    response = (result.get("response_text") or "").lower()
    if not response:
        return {"score": 0.0, "applicable": True, "passed": False,
                "mismatches": [{"category": "empty_answer",
                                "field": "response_text",
                                "expected": "non-empty answer",
                                "actual": ""}],
                "name": "output_contract_score"}
    # Match section names tolerant of underscore-vs-space + plural.
    missing = []
    for section in required_sections:
        section_low = section.lower()
        variants = [section_low, section_low.replace("_", " "),
                    section_low.replace("_", "-")]
        if not any(v in response for v in variants):
            missing.append(section)
    passed = not missing
    return {
        "score": 100.0 if passed else max(0.0, 100.0 * (1 - len(missing) / len(required_sections))),
        "applicable": True,
        "passed": passed,
        "mismatches": [] if passed else [{
            "category": "output_contract_violation",
            "field": "answer_sections",
            "expected": required_sections,
            "actual_missing": missing,
        }],
        "name": "output_contract_score",
    }


def missing_data_failure_mode_score(
    *, scenario: dict[str, Any], result: dict[str, Any]
) -> dict[str, Any]:
    """For scenarios where data is intentionally missing, the right
    failure_mode fires (i.e., the answer references the canonical failure
    code OR the receipt's failure_modes_available was actually used).

    Applicable: when scenario declares `required_failure_mode`. PR 3
    scenarios don't yet declare this — PR 4 will add the hard-fail
    scenarios that exercise this path. Until then, the scorer is
    informational and skipped.
    """
    expected = scenario.get("concept_expected", {}) or {}
    required_mode = expected.get("required_failure_mode")
    if not required_mode:
        return {"score": 0.0, "applicable": False, "mismatches": [],
                "passed": True, "name": "missing_data_failure_mode_score"}
    actual = _concept_receipt(result)
    available = set(actual.get("failure_modes_available") or [])
    response = (result.get("response_text") or "").lower()
    fired = required_mode in available and required_mode.lower().replace("_", " ") in response
    return {
        "score": 100.0 if fired else 0.0,
        "applicable": True,
        "passed": fired,
        "mismatches": [] if fired else [{
            "category": "wrong_failure_mode",
            "field": "failure_mode",
            "expected": required_mode,
            "actual": list(available),
        }],
        "name": "missing_data_failure_mode_score",
    }


def generic_filler_penalty(
    *, scenario: dict[str, Any], result: dict[str, Any]
) -> dict[str, Any]:
    """Penalize answers without numbers/sources when fixture provides them.
    Applicable when fixture declares `expected_numeric_data: true` (none of
    the PR 3 scenarios do — PR 4 will add fixtures with numbers). Until
    then, applies as a generic-phrase check only when the response is
    clearly answer-shaped (>50 chars).
    """
    expected = scenario.get("concept_expected", {}) or {}
    fixture_has_numbers = expected.get("expected_numeric_data")
    response = (result.get("response_text") or "").strip()
    if not response:
        return {"score": 0.0, "applicable": False, "mismatches": [],
                "passed": True, "name": "generic_filler_penalty"}
    if not fixture_has_numbers and len(response) <= 50:
        # Too short to grade meaningfully and no numeric fixture.
        return {"score": 0.0, "applicable": False, "mismatches": [],
                "passed": True, "name": "generic_filler_penalty"}
    response_low = response.lower()
    has_filler = any(p in response_low for p in _GENERIC_FILLER_PHRASES)
    has_digits = any(c.isdigit() for c in response)
    # If fixture has numbers but the answer has no digits, that's a failure.
    if fixture_has_numbers and not has_digits:
        return {"score": 0.0, "applicable": True, "passed": False,
                "mismatches": [{
                    "category": "generic_filler_no_numbers",
                    "field": "response_text",
                    "expected": "answer with numeric values",
                    "actual": "no digits in answer",
                }],
                "name": "generic_filler_penalty"}
    if has_filler and not has_digits:
        return {"score": 25.0, "applicable": True, "passed": False,
                "mismatches": [{
                    "category": "generic_filler",
                    "field": "response_text",
                    "expected": "specific answer",
                    "actual": "filler phrasing without numbers",
                }],
                "name": "generic_filler_penalty"}
    return {"score": 100.0, "applicable": True, "passed": True,
            "mismatches": [], "name": "generic_filler_penalty"}


def unsupported_claim_penalty(
    *, scenario: dict[str, Any], result: dict[str, Any]
) -> dict[str, Any]:
    """Penalize claims with no source attribution. Applicable when the
    receipt's source_inventory is populated. v1 source_inventory is None
    by design (data layer hasn't plumbed it), so this scorer skips today.
    PR 4 (S15-S17) and the data-layer work that follows will activate it.
    """
    sd = _source_discipline_receipt(result)
    inventory = sd.get("source_inventory")
    if inventory is None:
        return {"score": 0.0, "applicable": False, "mismatches": [],
                "passed": True, "name": "unsupported_claim_penalty"}
    response = (result.get("response_text") or "").strip()
    if not response:
        return {"score": 0.0, "applicable": True, "passed": False,
                "mismatches": [{"category": "empty_answer",
                                "field": "response_text",
                                "expected": "non-empty answer",
                                "actual": ""}],
                "name": "unsupported_claim_penalty"}
    response_low = response.lower()
    inventory_referenced = any(s.lower() in response_low for s in inventory)
    return {
        "score": 100.0 if inventory_referenced else 0.0,
        "applicable": True,
        "passed": inventory_referenced,
        "mismatches": [] if inventory_referenced else [{
            "category": "unsupported_claim",
            "field": "response_text",
            "expected": "answer references at least one source from inventory",
            "actual": inventory,
        }],
        "name": "unsupported_claim_penalty",
    }


# ─────────────────────────────────────────────────────────────────────────────
# Second-wave scorers (PR 4)
#
# These scorers depend on receipt fields that are intentionally None in v1:
# source_inventory, source_as_of_dates, conflict_summary, basis_rule_applied,
# scope_rule_applied. Until the data layer plumbs them, these scorers will
# be `applicable: false` on real runs — the unit tests fabricate populated
# receipts to verify the activation path works.
# ─────────────────────────────────────────────────────────────────────────────


import re as _re
from datetime import date as _date, datetime as _datetime, timezone as _timezone


# Broker-tier sources that are not allowed to be primary citations for
# REPE financial reads. Lowercased for matching.
_BROKER_TIER_SOURCES = (
    "costar",
    "co-star",
    "real capital analytics",
    "rca",
    "cushman & wakefield broker brief",
    "jll mid-cycle preview",
    "broker comp",
    "press release",
)

# Primary-tier source patterns (also lowercased). Receipt source_inventory
# entries are evaluated against these to confirm primary discipline.
_PRIMARY_TIER_PATTERNS = (
    "property_pnl", "property p&l", "property pnl",
    "rent_roll", "rent roll",
    "fund_accounting", "fund accounting",
    "underwriting",
    "loan_servicer", "loan servicer",
    "audited_financials", "audited financials",
    "operator_statement", "operator statement",
    "operating_statement", "operating statement",
    "trial_balance", "trial balance",
)


def _parse_source_date(value: Any) -> _date | None:
    if not value:
        return None
    if isinstance(value, _date):
        return value
    try:
        # Accept "YYYY-MM-DD" and ISO datetimes.
        s = str(value)
        if "T" in s:
            return _datetime.fromisoformat(s.replace("Z", "+00:00")).date()
        return _date.fromisoformat(s)
    except (ValueError, TypeError):
        return None


def source_discipline_score(
    *, scenario: dict[str, Any], result: dict[str, Any]
) -> dict[str, Any]:
    """Primary sources used; no broker-tier sources cited as authoritative.

    Applicable: when `source_discipline.source_inventory` is populated. The
    scorer flags any broker-tier source as a discipline failure and warns
    when no primary-tier pattern matches the inventory.
    """
    sd = _source_discipline_receipt(result)
    inventory = sd.get("source_inventory")
    if inventory is None:
        return {"score": 0.0, "applicable": False, "passed": True,
                "mismatches": [], "name": "source_discipline_score"}
    if not inventory:
        return {"score": 0.0, "applicable": True, "passed": False,
                "mismatches": [{
                    "category": "no_sources_cited",
                    "field": "source_inventory",
                    "expected": "at least one primary source",
                    "actual": [],
                }],
                "name": "source_discipline_score"}
    inventory_low = [str(s).lower() for s in inventory]
    broker_hits = [s for s in inventory_low if any(b in s for b in _BROKER_TIER_SOURCES)]
    primary_hits = [s for s in inventory_low if any(p in s for p in _PRIMARY_TIER_PATTERNS)]
    mismatches: list[dict[str, Any]] = []
    if broker_hits:
        mismatches.append({
            "category": "broker_tier_source_used",
            "field": "source_inventory",
            "expected": "primary-tier sources only",
            "actual": broker_hits,
        })
    if not primary_hits:
        mismatches.append({
            "category": "no_primary_source",
            "field": "source_inventory",
            "expected": "at least one primary-tier source",
            "actual": list(inventory),
        })
    passed = not mismatches
    return {
        "score": 100.0 if passed else 0.0,
        "applicable": True,
        "passed": passed,
        "mismatches": mismatches,
        "name": "source_discipline_score",
    }


def freshness_score(
    *, scenario: dict[str, Any], result: dict[str, Any]
) -> dict[str, Any]:
    """All cited sources within the freshness policy. Applicable when
    `source_discipline.source_as_of_dates` is populated. The scenario can
    pin a `freshness_max_age_days` override; otherwise defaults to 90.

    When a scenario declares `must_surface_freshness_caveat: true` and any
    source is past the threshold, the response text must mention freshness
    explicitly (substring "stale", "as of", or "freshness").
    """
    sd = _source_discipline_receipt(result)
    as_of = sd.get("source_as_of_dates")
    if as_of is None:
        return {"score": 0.0, "applicable": False, "passed": True,
                "mismatches": [], "name": "freshness_score"}
    expected = scenario.get("concept_expected", {}) or {}
    max_age_days = int(expected.get("freshness_max_age_days") or 90)
    today = _date.today()
    stale: list[dict[str, Any]] = []
    for source, date_value in as_of.items():
        d = _parse_source_date(date_value)
        if d is None:
            continue
        age = (today - d).days
        if age > max_age_days:
            stale.append({"source": source, "age_days": age, "as_of": str(date_value)})
    if not stale:
        return {"score": 100.0, "applicable": True, "passed": True,
                "mismatches": [], "name": "freshness_score"}
    # Stale sources exist. If the scenario requires a caveat, check the response.
    response_low = (result.get("response_text") or "").lower()
    must_caveat = bool(expected.get("must_surface_freshness_caveat"))
    caveat_present = any(p in response_low for p in ("stale", "as of", "freshness"))
    mismatches: list[dict[str, Any]] = [{
        "category": "stale_primary_source",
        "field": "source_as_of_dates",
        "expected": f"all sources within {max_age_days} days",
        "actual": stale,
    }]
    if must_caveat and not caveat_present:
        mismatches.append({
            "category": "stale_primary_source",
            "field": "response_text",
            "expected": "answer mentions freshness/stale/as-of",
            "actual": "no freshness caveat in response",
        })
    return {
        "score": 0.0,
        "applicable": True,
        "passed": False,
        "mismatches": mismatches,
        "name": "freshness_score",
    }


def conflict_handling_score(
    *, scenario: dict[str, Any], result: dict[str, Any]
) -> dict[str, Any]:
    """Conflicts surfaced explicitly. Applicable when scenario declares
    `expected_conflict`. The response must mention both conflicting source
    names; if `must_not_silently_pick` is set, the response must NOT pick a
    single value without flagging the disagreement.
    """
    expected = scenario.get("concept_expected", {}) or {}
    expected_conflict = expected.get("expected_conflict")
    if not expected_conflict:
        return {"score": 0.0, "applicable": False, "passed": True,
                "mismatches": [], "name": "conflict_handling_score"}
    response_low = (result.get("response_text") or "").lower()
    if not response_low:
        return {"score": 0.0, "applicable": True, "passed": False,
                "mismatches": [{"category": "conflict_ignored",
                                "field": "response_text",
                                "expected": "answer references conflicting sources",
                                "actual": ""}],
                "name": "conflict_handling_score"}
    sources = [str(s).lower() for s in (expected_conflict.get("sources") or [])]
    sources_mentioned = sum(1 for s in sources if any(t in response_low for t in (s, s.replace("_", " "))))
    must_surface = bool(expected.get("must_surface_conflict"))
    must_not_silently_pick = bool(expected.get("must_not_silently_pick"))
    surfaced = (
        sources_mentioned >= 2
        or "conflict" in response_low
        or "disagree" in response_low
        or "two sources" in response_low
        or "different value" in response_low
        or "differ" in response_low
    )
    mismatches: list[dict[str, Any]] = []
    if must_surface and not surfaced:
        mismatches.append({
            "category": "conflict_ignored",
            "field": "response_text",
            "expected": "answer surfaces the conflict between sources",
            "actual": f"sources_mentioned={sources_mentioned}, no conflict-language",
        })
    # Detect silent picking: response cites a single value with no qualifier.
    if must_not_silently_pick and not surfaced:
        values = expected_conflict.get("values") or []
        cited_values = [v for v in values if str(v) in response_low or _format_value_variants(v, response_low)]
        if cited_values:
            mismatches.append({
                "category": "conflict_ignored",
                "field": "response_text",
                "expected": "answer flags disagreement before quoting either value",
                "actual": f"silently cited {cited_values}",
            })
    passed = not mismatches
    return {
        "score": 100.0 if passed else 0.0,
        "applicable": True,
        "passed": passed,
        "mismatches": mismatches,
        "name": "conflict_handling_score",
    }


def _format_value_variants(value: Any, haystack_low: str) -> bool:
    """Tolerant numeric matcher for conflict detection. Catches "$4.25M"
    style abbreviations alongside the raw number."""
    try:
        f = float(value)
    except (TypeError, ValueError):
        return False
    raw = f"{f:,.0f}".replace(",", "")
    abbrev_m = f"{f / 1_000_000:.2f}m"
    abbrev_k = f"{f / 1_000:.0f}k"
    return any(v in haystack_low for v in (raw, abbrev_m, abbrev_k))


def basis_fidelity_score(
    *, scenario: dict[str, Any], result: dict[str, Any]
) -> dict[str, Any]:
    """Answer respects the requested basis (cash vs GAAP). Applicable when
    scenario declares `required_basis`. When `must_reject_silent_basis_mixing`
    is set and the response mentions both bases without an explicit
    reconciliation, that's a failure.
    """
    expected = scenario.get("concept_expected", {}) or {}
    required = expected.get("required_basis")
    if not required:
        return {"score": 0.0, "applicable": False, "passed": True,
                "mismatches": [], "name": "basis_fidelity_score"}
    response_low = (result.get("response_text") or "").lower()
    if not response_low:
        return {"score": 0.0, "applicable": True, "passed": False,
                "mismatches": [{"category": "mixed_basis",
                                "field": "response_text",
                                "expected": f"answer on {required} basis",
                                "actual": ""}],
                "name": "basis_fidelity_score"}
    required_low = required.lower()
    mismatches: list[dict[str, Any]] = []
    if required_low not in response_low:
        mismatches.append({
            "category": "mixed_basis",
            "field": "response_text",
            "expected": f"answer explicitly identifies {required} basis",
            "actual": "no basis declaration in response",
        })
    if expected.get("must_reject_silent_basis_mixing"):
        # Both bases present without reconciliation language → silent mix.
        bases_present = sum(1 for b in ("cash", "gaap") if b in response_low)
        reconciliation_words = ("reconcile", "bridge", "convert", "translate",
                                "to/from", "basis difference", "differ on",
                                "cannot directly compare")
        has_reconciliation = any(w in response_low for w in reconciliation_words)
        if bases_present >= 2 and not has_reconciliation:
            mismatches.append({
                "category": "mixed_basis",
                "field": "response_text",
                "expected": "explicit reconciliation when both bases present",
                "actual": "both bases mentioned without reconciliation",
            })
    passed = not mismatches
    return {
        "score": 100.0 if passed else 0.0,
        "applicable": True,
        "passed": passed,
        "mismatches": mismatches,
        "name": "basis_fidelity_score",
    }


def scope_fidelity_score(
    *, scenario: dict[str, Any], result: dict[str, Any]
) -> dict[str, Any]:
    """Same-store / total / stabilized / fund / market scope respected.
    Applicable when scenario declares `required_scope`.
    """
    expected = scenario.get("concept_expected", {}) or {}
    required = expected.get("required_scope")
    if not required:
        return {"score": 0.0, "applicable": False, "passed": True,
                "mismatches": [], "name": "scope_fidelity_score"}
    response_low = (result.get("response_text") or "").lower()
    if not response_low:
        return {"score": 0.0, "applicable": True, "passed": False,
                "mismatches": [{"category": "scope_failure",
                                "field": "response_text",
                                "expected": f"{required}-scope answer",
                                "actual": ""}],
                "name": "scope_fidelity_score"}
    # Tolerant matching for common scope synonyms.
    SCOPE_ALIASES = {
        "same_store": ("same-store", "same store", "ssnoi", "spnoi", "same-property", "same property"),
        "total": ("total", "all properties", "all assets"),
        "stabilized": ("stabilized", "stabilised"),
        "fund": ("fund", "fund-level", "fund level", "portfolio"),
        "market": ("market", "metro"),
    }
    aliases = SCOPE_ALIASES.get(required.lower(), (required.lower(),))
    present = any(a in response_low for a in aliases)
    return {
        "score": 100.0 if present else 0.0,
        "applicable": True,
        "passed": present,
        "mismatches": [] if present else [{
            "category": "scope_failure",
            "field": "response_text",
            "expected": f"{required}-scope language",
            "actual": "no scope declaration",
        }],
        "name": "scope_fidelity_score",
    }


# Currency-y number pattern: $1,234,567 or 1,234,567 or 1.2M or -$120k.
# The M/K/B suffix must be immediately adjacent to the digit (no whitespace)
# AND followed by a non-letter (so "$100, B contributed" does NOT match
# "$100, B" as a single token where B is interpreted as billion).
_NUMBER_PATTERN = _re.compile(
    r"-?\$?\d[\d,]*(?:\.\d+)?(?:[mMkKbB](?![a-zA-Z]))?", _re.IGNORECASE
)


def _parse_currency_token(token: str) -> float | None:
    s = token.strip().lower().replace("$", "").replace(",", "").replace(" ", "")
    if not s:
        return None
    multiplier = 1.0
    if s.endswith("m"):
        multiplier = 1_000_000
        s = s[:-1]
    elif s.endswith("k"):
        multiplier = 1_000
        s = s[:-1]
    elif s.endswith("b"):
        multiplier = 1_000_000_000
        s = s[:-1]
    try:
        return float(s) * multiplier
    except ValueError:
        return None


def arithmetic_closure_score(
    *, scenario: dict[str, Any], result: dict[str, Any]
) -> dict[str, Any]:
    """Bridge components sum to total variance within tolerance.

    Applicable when scenario provides BOTH `expected_bridge_components`
    (dict of driver → component value) and `expected_total_variance`
    (signed scalar). The scorer checks the response text for numbers that
    plausibly correspond to the components and the total, then verifies
    that the sum of cited components matches the cited (or expected) total
    within tolerance.

    Tolerance: pass if either
      |delta| <= $1,000 absolute, OR
      |delta| <= 2% relative to total variance.

    Real operator data has rounding, missing components, and timing
    mismatches — tight equality fails correct answers.
    """
    expected = scenario.get("concept_expected", {}) or {}
    components = expected.get("expected_bridge_components")
    total = expected.get("expected_total_variance")
    if not components or total is None:
        return {"score": 0.0, "applicable": False, "passed": True,
                "mismatches": [], "name": "arithmetic_closure_score"}
    response = result.get("response_text") or ""
    if not response.strip():
        return {"score": 0.0, "applicable": True, "passed": False,
                "mismatches": [{"category": "arithmetic_closure_failure",
                                "field": "response_text",
                                "expected": "numeric bridge",
                                "actual": ""}],
                "name": "arithmetic_closure_score"}
    # Extract every plausible currency value from the response.
    raw_tokens = _NUMBER_PATTERN.findall(response)
    extracted = [_parse_currency_token(t) for t in raw_tokens]
    extracted = [v for v in extracted if v is not None]
    # Find cited components: for each expected component, pick the value
    # in `extracted` closest to it (greedy by absolute distance, not first
    # within tolerance). Each value can be matched by at most one component.
    cited_components: dict[str, float] = {}
    used_value_idxs: set[int] = set()
    for driver, expected_val in components.items():
        ev = float(expected_val)
        best_idx: int | None = None
        best_dist: float | None = None
        for i, v in enumerate(extracted):
            if i in used_value_idxs:
                continue
            dist = abs(abs(v) - abs(ev))
            in_abs_tol = (abs(ev) < 1_000) and dist <= 1_000
            in_rel_tol = (abs(ev) >= 1_000) and (dist / abs(ev) <= 0.05)
            if not (in_abs_tol or in_rel_tol):
                continue
            if best_dist is None or dist < best_dist:
                best_idx = i
                best_dist = dist
        if best_idx is not None:
            v = extracted[best_idx]
            cited_components[driver] = v if (v < 0) == (ev < 0) else -v
            used_value_idxs.add(best_idx)
    if not cited_components:
        return {"score": 0.0, "applicable": True, "passed": False,
                "mismatches": [{"category": "arithmetic_closure_failure",
                                "field": "response_text",
                                "expected": list(components.keys()),
                                "actual": "no driver components found in response"}],
                "name": "arithmetic_closure_score"}
    # The response's claimed total: the largest-absolute-value number that
    # wasn't used as a component. This catches mismatches where the response
    # asserts a total that doesn't match its own component sum.
    leftover = [v for i, v in enumerate(extracted) if i not in used_value_idxs]
    cited_total: float | None = None
    if leftover:
        cited_total = max(leftover, key=lambda x: abs(x))
        # Sign-correct: if expected total is negative and the largest
        # absolute leftover is positive, treat it as the negative value
        # (operators often write "off by $300k" without a minus sign).
        if total < 0 and cited_total > 0:
            cited_total = -cited_total
    component_sum = sum(cited_components.values())
    # Grade against the response's own claimed total when present. Falling
    # back to the fixture's expected total would mask cases where the
    # response cites a total that disagrees with its own bridge.
    target = cited_total if cited_total is not None else float(total)
    delta = component_sum - target
    abs_target = abs(target)
    abs_tol_pass = abs(delta) <= 1_000.0
    rel_tol_pass = (abs_target > 0) and (abs(delta) / abs_target <= 0.02)
    passed = abs_tol_pass or rel_tol_pass
    return {
        "score": 100.0 if passed else 0.0,
        "applicable": True,
        "passed": passed,
        "mismatches": [] if passed else [{
            "category": "arithmetic_closure_failure",
            "field": "response_text",
            "expected": f"sum within $1k OR 2% of {target}",
            "actual": {
                "cited_components": cited_components,
                "component_sum": component_sum,
                "delta": delta,
                "cited_total": cited_total,
            },
        }],
        "name": "arithmetic_closure_score",
        "extras": {
            "cited_total": cited_total,
            "component_sum": component_sum,
            "delta": delta,
        },
    }


def driver_attribution_score(
    *, scenario: dict[str, Any], result: dict[str, Any]
) -> dict[str, Any]:
    """All material drivers covered; no invented drivers when fixture caps
    them. Applicable when scenario provides `expected_material_drivers`.

    Two checks:
      1. coverage — every expected driver appears in the response (tolerant
         lowercasing, allows underscore↔space).
      2. invention guard — when `must_not_invent_drivers: true` AND the
         fixture lists `data_unavailable` containing driver-detail entries,
         the response must NOT name drivers outside the expected list.
    """
    expected = scenario.get("concept_expected", {}) or {}
    expected_drivers = expected.get("expected_material_drivers")
    if not expected_drivers:
        return {"score": 0.0, "applicable": False, "passed": True,
                "mismatches": [], "name": "driver_attribution_score"}
    response_low = (result.get("response_text") or "").lower()
    if not response_low:
        return {"score": 0.0, "applicable": True, "passed": False,
                "mismatches": [{"category": "driver_attribution_failure",
                                "field": "response_text",
                                "expected": expected_drivers,
                                "actual": ""}],
                "name": "driver_attribution_score"}

    def _present(driver: str) -> bool:
        d = driver.lower()
        return d in response_low or d.replace("_", " ") in response_low or d.replace(" ", "_") in response_low

    missing = [d for d in expected_drivers if not _present(d)]
    mismatches: list[dict[str, Any]] = []
    if missing:
        mismatches.append({
            "category": "driver_attribution_failure",
            "field": "response_text",
            "expected": expected_drivers,
            "actual_missing": missing,
        })
    if expected.get("must_not_invent_drivers"):
        # Common driver vocabulary the matcher can scan for. If the response
        # mentions drivers outside the expected list, that's invention.
        DRIVER_VOCAB = (
            "rate", "occupancy", "concessions", "vacancy", "bad debt",
            "recoveries", "taxes", "insurance", "payroll", "r&m",
            "rm", "repairs", "marketing", "utilities", "mix",
        )
        invented = [
            d for d in DRIVER_VOCAB
            if d in response_low and not any(d == ed.lower() or d == ed.lower().replace("_", " ") for ed in expected_drivers)
        ]
        if invented:
            mismatches.append({
                "category": "driver_attribution_failure",
                "field": "response_text",
                "expected": f"only drivers in {expected_drivers}",
                "actual_invented": invented,
            })
    passed = not mismatches
    return {
        "score": 100.0 if passed else 0.0,
        "applicable": True,
        "passed": passed,
        "mismatches": mismatches,
        "name": "driver_attribution_score",
    }


_CONCEPT_SCORERS = (
    concept_match_score,
    alias_normalization_score,
    context_completeness_score,
    output_contract_score,
    missing_data_failure_mode_score,
    generic_filler_penalty,
    unsupported_claim_penalty,
    # PR 4 second-wave scorers
    source_discipline_score,
    freshness_score,
    conflict_handling_score,
    basis_fidelity_score,
    scope_fidelity_score,
    arithmetic_closure_score,
    driver_attribution_score,
)


def score_concept_scenario(
    *, scenario: dict[str, Any], result: dict[str, Any]
) -> dict[str, Any]:
    """Run all concept-aware scorers and aggregate. Mirrors the top-level
    shape of score_assistant_scenario so the runner can merge into raw_result.

    Aggregation:
    - `score`: average of applicable scorers' scores (skipped scorers don't drag the mean)
    - `passed`: every applicable scorer passed AND concept_match_score is True
    - `score_coverage`: ratio of applicable to total scorers
    - `concept_scores`: per-scorer breakdown with applicable/passed/score
    """
    per_scorer: list[dict[str, Any]] = [
        scorer(scenario=scenario, result=result) for scorer in _CONCEPT_SCORERS
    ]
    applicable = [s for s in per_scorer if s.get("applicable")]
    skipped = [s for s in per_scorer if not s.get("applicable")]
    score_coverage = (len(applicable) / len(per_scorer)) if per_scorer else 0.0

    if applicable:
        avg_score = sum(s["score"] for s in applicable) / len(applicable)
    else:
        avg_score = 0.0

    # Mandatory check: concept_match_score must be applicable AND passed.
    cms = next((s for s in per_scorer if s["name"] == "concept_match_score"), None)
    concept_match_ok = bool(cms and cms.get("applicable") and cms.get("passed"))

    all_applicable_passed = all(s.get("passed") for s in applicable)
    passed = concept_match_ok and all_applicable_passed

    mismatches: list[dict[str, Any]] = []
    for s in per_scorer:
        for m in s.get("mismatches", []):
            mismatches.append({**m, "scorer": s["name"]})

    failure_category: str | None = None
    if not concept_match_ok and cms is not None:
        failure_category = "wrong_concept_id"
    elif mismatches:
        # Pick the first scorer's category as primary.
        failure_category = mismatches[0].get("category")

    # Source-discipline coverage: ratio of applicable source-discipline
    # scorers (currently only unsupported_claim_penalty in PR 3) to the
    # total source-discipline scorer set. Tracks when the data layer
    # transitions from aspirational to real.
    source_discipline_names = {
        "unsupported_claim_penalty",
        "source_discipline_score",
        "freshness_score",
    }
    sd_total = sum(1 for s in per_scorer if s["name"] in source_discipline_names)
    sd_applicable = sum(
        1 for s in per_scorer if s["name"] in source_discipline_names and s.get("applicable")
    )
    sd_coverage = (sd_applicable / sd_total) if sd_total else 0.0

    return {
        "score": round(avg_score, 2),
        "passed": passed,
        "failure_category": failure_category,
        "mismatches": mismatches,
        "tool_count": 0,
        "retrieval_count": 0,
        "hallucination_proxy": 0,
        "cross_environment_contamination": 0,
        "receipt_completeness": 1.0 if _concept_receipt(result) else 0.0,
        "trace_fidelity": 1.0,
        "latency_bucket": _latency_bucket(
            result.get("duration_ms"), passed, (scenario.get("expected") or {}).get("max_duration_ms")
        ),
        "trace_summary": {
            "concept_id": (_concept_receipt(result) or {}).get("concept_id"),
            "match_reason": (_concept_receipt(result) or {}).get("match_reason"),
            "behavior_tier": (_concept_receipt(result) or {}).get("behavior_tier"),
        },
        "anti_smoothness_failed": False,
        # Concept-specific aggregates exposed to the report writer:
        "concept_scores": {
            s["name"]: {
                "score": s["score"],
                "applicable": s["applicable"],
                "passed": s.get("passed", False),
            }
            for s in per_scorer
        },
        "score_coverage": round(score_coverage, 3),
        "source_discipline_coverage": round(sd_coverage, 3),
    }


# ─────────────────────────────────────────────────────────────────────────────
# Release gates (PR 4 — full set)
#
# Each gate measures the pass rate of a specific scorer (or aggregate signal)
# across applicable concept_eval scenarios. A gate is vacuous (passes) when
# no scenarios are applicable — this prevents smoke runs without the
# relevant scenarios from blocking promotion.
#
# Gates are reported, not enforced via sys.exit yet. The runner / cycle
# controller can read `gates["all_passed"]` and decide what to do.
# ─────────────────────────────────────────────────────────────────────────────


CONCEPT_MATCH_GATE_THRESHOLD = 0.95
OUTPUT_CONTRACT_GATE_THRESHOLD = 0.95
ARITHMETIC_CLOSURE_GATE_THRESHOLD = 0.98
BRIDGE_CLOSURE_GATE_THRESHOLD = 0.95
RECEIPT_COMPLETENESS_GATE_THRESHOLD = 1.0

_HARD_GATE_CATEGORIES = {
    "wrong_concept_id",
    "hallucinated_number",
    "mixed_basis",
    "stale_primary_source",
    "conflict_ignored",
}


def _is_concept_eval_result(result: dict[str, Any]) -> bool:
    return result.get("kind") == "concept_eval" or "concept_scores" in result


def _scorer_pass_rate(
    concept_results: list[dict[str, Any]], scorer_name: str
) -> tuple[float | None, int, int]:
    """Pass rate for a named scorer across applicable concept results.

    Returns (pass_rate, applicable_count, passed_count). pass_rate is None
    when no result was applicable (vacuous gate).
    """
    applicable = 0
    passed = 0
    for r in concept_results:
        entry = (r.get("concept_scores") or {}).get(scorer_name) or {}
        if entry.get("applicable"):
            applicable += 1
            if entry.get("passed"):
                passed += 1
    if applicable == 0:
        return None, 0, 0
    return passed / applicable, applicable, passed


def _gate(
    name: str,
    threshold: float,
    pass_rate: float | None,
    applicable: int,
    passed: int,
) -> dict[str, Any]:
    """Build a single gate report. Vacuous (applicable=0) gates pass."""
    if pass_rate is None:
        return {
            "name": name,
            "threshold": threshold,
            "actual": None,
            "applicable_count": 0,
            "passed_count": 0,
            "passed": True,  # vacuous
        }
    return {
        "name": name,
        "threshold": threshold,
        "actual": round(pass_rate, 3),
        "applicable_count": applicable,
        "passed_count": passed,
        "passed": pass_rate >= threshold,
    }


def _hard_gate_failures(concept_results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    failures: list[dict[str, Any]] = []
    for r in concept_results:
        for m in r.get("mismatches") or []:
            cat = m.get("category")
            if cat in _HARD_GATE_CATEGORIES:
                failures.append({
                    "scenario_id": r.get("scenario_id") or r.get("id"),
                    "category": cat,
                    "scorer": m.get("scorer"),
                })
    return failures


def evaluate_concept_release_gates(
    results: list[dict[str, Any]],
) -> dict[str, Any]:
    """Evaluate the full set of concept-eval release gates.

    PR 4 gates:
      - concept_match_score >= 95%
      - output_contract_score >= 95%
      - arithmetic_closure_score >= 98% (numeric scenarios only)
      - bridge_closure (same scorer, looser 95% gate) — measures whether the
        bridge sums even when individual line items aren't all extractable
      - hard_gate_failures = 0 (any wrong_concept_id, hallucinated_number,
        mixed_basis, stale_primary_source, conflict_ignored)
      - receipt_completeness = 100% (every concept-matched result has a
        ConceptReceipt)

    score_coverage and source_discipline_coverage are reported in the run
    summary but NOT gated — they're informational signals that v1 source
    plumbing hasn't fully matured. They become enforceable after PR 4
    when source-discipline scenarios carry real fixture data.

    Each gate is vacuous (passes) when its scorer was applicable to zero
    scenarios in the run. This prevents smoke runs without source-discipline
    scenarios from blocking on freshness / conflict / basis gates that
    have no scenarios to grade.
    """
    concept_results = [r for r in results if _is_concept_eval_result(r)]

    # Per-scorer pass rates
    cms_rate, cms_app, cms_pass = _scorer_pass_rate(concept_results, "concept_match_score")
    oc_rate, oc_app, oc_pass = _scorer_pass_rate(concept_results, "output_contract_score")
    ac_rate, ac_app, ac_pass = _scorer_pass_rate(concept_results, "arithmetic_closure_score")

    # Receipt completeness: a concept-matched result must have a ConceptReceipt.
    rc_applicable = 0
    rc_passed = 0
    for r in concept_results:
        cms_entry = (r.get("concept_scores") or {}).get("concept_match_score") or {}
        if cms_entry.get("applicable") and cms_entry.get("passed"):
            rc_applicable += 1
            if (r.get("receipt_completeness") or 0) >= 1.0:
                rc_passed += 1
    rc_rate = (rc_passed / rc_applicable) if rc_applicable else None

    hard_failures = _hard_gate_failures(concept_results)

    gates = [
        _gate("concept_match_score", CONCEPT_MATCH_GATE_THRESHOLD, cms_rate, cms_app, cms_pass),
        _gate("output_contract_score", OUTPUT_CONTRACT_GATE_THRESHOLD, oc_rate, oc_app, oc_pass),
        _gate("arithmetic_closure_score", ARITHMETIC_CLOSURE_GATE_THRESHOLD, ac_rate, ac_app, ac_pass),
        # Bridge closure reads the same scorer at a looser threshold.
        _gate("bridge_closure", BRIDGE_CLOSURE_GATE_THRESHOLD, ac_rate, ac_app, ac_pass),
        _gate("receipt_completeness", RECEIPT_COMPLETENESS_GATE_THRESHOLD, rc_rate, rc_applicable, rc_passed),
        {
            "name": "hard_gate_failures",
            "threshold": 0,
            "actual": len(hard_failures),
            "applicable_count": len(concept_results),
            "passed_count": len(concept_results) - len({f["scenario_id"] for f in hard_failures}),
            "passed": len(hard_failures) == 0,
        },
    ]

    return {
        "all_passed": all(g["passed"] for g in gates),
        "gates": gates,
        "concept_eval_total": len(concept_results),
        "hard_gate_failures": hard_failures,
    }
