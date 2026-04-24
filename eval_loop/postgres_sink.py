"""
Thin adapter that mirrors a completed eval cycle's results into the
Postgres durable store (winston_eval_runs / _results / _baselines).

Keeps the main runner lean: the SQLite RegressionStore stays the
rich local telemetry surface; Postgres is the authoritative
pass/fail + baseline record for the autonomous workflow.
"""
from __future__ import annotations

import subprocess
from typing import Any

from eval_loop.canonical_assertions import (
    CANONICAL_LANES,
    LEGACY_LANE,
    detect_canonical_failures,
)
from eval_loop.regression_store import PostgresRegressionStore, _response_shape_hash


def _git_sha() -> str | None:
    try:
        out = subprocess.check_output(
            ["git", "rev-parse", "HEAD"], stderr=subprocess.DEVNULL, timeout=3
        )
        return out.decode().strip() or None
    except Exception:
        return None


def _observed_lane(result: dict[str, Any]) -> str | None:
    trace = result.get("trace") or {}
    lane = trace.get("lane") or trace.get("route_lane")
    if lane:
        return str(lane)
    receipt = result.get("turn_receipt") or {}
    return receipt.get("lane") or receipt.get("route_lane")


def _classify_status(
    result: dict[str, Any], canonical_failures: list[dict[str, Any]]
) -> str:
    """
    Map a scenario result + canonical-contract failures to a Postgres
    status value: pass | fail | error | unavailable | skipped.
    """
    if result.get("skipped"):
        return "skipped"

    # Any canonical-contract failure is a hard fail, period.
    if canonical_failures:
        # unavailable_masquerade and no_terminal_state should surface as 'unavailable'
        # so we can distinguish "Winston said nothing useful" from "assertion failed".
        cats = {f["category"] for f in canonical_failures}
        if "unavailable_masquerade" in cats or "no_terminal_state" in cats:
            return "unavailable"
        return "fail"

    # Fall through to the runner's pass/fail signal.
    if result.get("passed"):
        return "pass"

    # Scoring failed but no canonical-contract category hit: treat as fail.
    if result.get("failure_category"):
        return "fail"

    # Runner raised an error capturing the result.
    if result.get("error") or result.get("exception"):
        return "error"

    return "fail"


def _pick_failure_category(
    result: dict[str, Any], canonical_failures: list[dict[str, Any]]
) -> str | None:
    """Prefer a canonical-contract category over the scoring-derived one."""
    if canonical_failures:
        return canonical_failures[0]["category"]
    return result.get("failure_category")


def _expected_lane(scenario: dict[str, Any]) -> str | None:
    expected = scenario.get("expected") or {}
    lane = expected.get("lane")
    return str(lane) if lane else None


def _contract_version(scenario: dict[str, Any]) -> int:
    # Scenarios may declare `contract_version`; default to 1.
    return int(scenario.get("contract_version") or 1)


def _response_excerpt(result: dict[str, Any]) -> str | None:
    text = result.get("response_text") or ""
    if not text:
        return None
    return text[:500]


def _trace_summary(result: dict[str, Any]) -> dict[str, Any]:
    trace = result.get("trace") or {}
    summary = {
        "lane": trace.get("lane") or trace.get("route_lane"),
        "duration_ms": result.get("duration_ms"),
        "first_token_ms": result.get("first_token_ms"),
        "tool_count": result.get("tool_count") or len(trace.get("tools") or []),
        "retrieval_count": result.get("retrieval_count") or trace.get("retrieval_count"),
        "event_types": [
            str(e.get("event") or e.get("type") or "")
            for e in (result.get("events") or [])
        ][:40],
    }
    return {k: v for k, v in summary.items() if v is not None}


def _ai_gateway_log_id(result: dict[str, Any]) -> str | None:
    receipt = result.get("turn_receipt") or {}
    # Known receipt fields that carry the gateway log row id.
    for key in ("ai_gateway_log_id", "gateway_log_id", "request_id"):
        val = receipt.get(key)
        if val:
            return str(val)
    return None


def _build_baseline_delta(
    baseline: dict[str, Any], result: dict[str, Any], canonical_failures: list[dict[str, Any]]
) -> dict[str, Any]:
    return {
        "baseline_run_id": str(baseline.get("last_pass_run_id") or ""),
        "baseline_latency_ms": baseline.get("last_pass_latency_ms"),
        "current_latency_ms": result.get("duration_ms"),
        "baseline_shape_hash": baseline.get("last_pass_response_shape_hash"),
        "current_shape_hash": _response_shape_hash(result),
        "canonical_failures": [f["category"] for f in canonical_failures],
    }


def persist_cycle_to_postgres(
    *,
    cycle_run_id: str,
    trigger: str,
    suite: str,
    scenarios: list[dict[str, Any]],
    results: list[dict[str, Any]],
    business_id: str,
    env_id: str | None,
    dsn: str | None = None,
) -> dict[str, Any]:
    """
    Mirror a completed cycle into Postgres.

    Returns a summary dict: {run_id, total, passed, failed, errored, regressions, status}.
    Raises on DB failure — the caller (GH Actions workflow) should treat a
    DB write failure as a loud run failure, per the plan's guardrails.
    """
    store = PostgresRegressionStore(dsn=dsn, business_id=business_id, env_id=env_id)
    try:
        run_id = store.create_run(
            trigger=trigger,
            suite=suite,
            git_sha=_git_sha(),
            run_id=cycle_run_id,  # keep SQLite↔Postgres run_id alignment
        )
    except Exception:
        # Fallback: let Postgres generate a fresh uuid if reuse fails.
        run_id = store.create_run(trigger=trigger, suite=suite, git_sha=_git_sha())

    scenarios_by_id = {str(s.get("id")): s for s in scenarios}

    total = 0
    passed = 0
    failed = 0
    errored = 0
    regressions = 0

    for result in results:
        scenario_id = str(result.get("scenario_id") or "")
        scenario = scenarios_by_id.get(scenario_id, {})
        if not scenario_id:
            continue

        contract_version = _contract_version(scenario)
        expected_lane = _expected_lane(scenario)
        observed_lane = _observed_lane(result)

        baseline = store.get_baseline(
            case_id=scenario_id,
            contract_version=contract_version,
            expected_lane=expected_lane,
        )

        canonical_failures = detect_canonical_failures(
            scenario=scenario, result=result, baseline=baseline
        )

        status = _classify_status(result, canonical_failures)
        failure_category = _pick_failure_category(result, canonical_failures)

        # Regression = we have a passing baseline and current is not pass.
        is_regression = bool(baseline) and status != "pass"
        baseline_delta = (
            _build_baseline_delta(baseline, result, canonical_failures)
            if is_regression
            else None
        )

        result_id = store.insert_result(
            run_id=run_id,
            case_id=scenario_id,
            contract_version=contract_version,
            expected_lane=expected_lane,
            observed_lane=observed_lane,
            status=status,
            failure_category=failure_category,
            latency_ms=result.get("duration_ms"),
            ttft_ms=result.get("first_token_ms"),
            tool_count=result.get("tool_count"),
            token_count=result.get("token_count"),
            response_excerpt=_response_excerpt(result),
            assertion_failures=(
                canonical_failures
                or [{"mismatches": result.get("mismatches", [])}]
                if result.get("mismatches")
                else canonical_failures
            ),
            trace_summary=_trace_summary(result),
            ai_gateway_log_id=_ai_gateway_log_id(result),
            is_regression=is_regression,
            baseline_delta=baseline_delta,
        )

        total += 1
        if status == "pass":
            passed += 1
            store.upsert_baseline_on_pass(
                case_id=scenario_id,
                contract_version=contract_version,
                expected_lane=expected_lane,
                run_id=run_id,
                result_id=result_id,
                latency_ms=result.get("duration_ms"),
                ttft_ms=result.get("first_token_ms"),
                response_shape_hash=_response_shape_hash(result),
            )
        elif status == "error":
            errored += 1
        elif status == "skipped":
            total -= 1  # don't count skipped toward totals
        else:
            failed += 1
        if is_regression:
            regressions += 1

    # Run-level status: pass if zero fail/error; errored if any error with no fail;
    # failed otherwise.
    if failed == 0 and errored == 0:
        run_status = "passed"
    elif failed == 0 and errored > 0:
        run_status = "errored"
    else:
        run_status = "failed"

    store.finalize_run(
        run_id=run_id,
        status=run_status,
        total=total,
        passed=passed,
        failed=failed,
        errored=errored,
        regressions=regressions,
        summary={
            "trigger": trigger,
            "suite": suite,
            "canonical_lanes": sorted(CANONICAL_LANES),
            "legacy_lane": LEGACY_LANE,
        },
    )
    store.close()

    return {
        "run_id": run_id,
        "status": run_status,
        "total": total,
        "passed": passed,
        "failed": failed,
        "errored": errored,
        "regressions": regressions,
    }


__all__ = ["persist_cycle_to_postgres"]
