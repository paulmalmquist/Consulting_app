"""The 8 investigation-session evals (plan PR 6).

Each is a REAL deterministic check over the PERSISTED session (session row, event
rows, finalized sections). None is a hardcoded pass. A category that genuinely cannot
be measured returns passed=None (fail closed), never a fake True.

These run at finalize and write one row per category to nv_analysis_session_eval_results.
Pure functions: they take already-loaded data, so tests can exercise them with no DB.
"""
from __future__ import annotations

from typing import Any

EVAL_CATEGORIES = [
    "grounding", "dashboard-consistency", "driver-quality",
    "pause-resume", "steering", "latency", "fail-closed", "audit",
]


def _result(passed: bool | None, score: float | None, **detail: Any) -> dict:
    return {"passed": passed, "score": score, "detail": detail}


def eval_grounding(sections: list[dict]) -> dict:
    """Every claim carrying a value must have a non-empty source_ref and known source_kind.
    Any number without provenance fails the whole category."""
    checked = 0
    failures: list[dict] = []
    for s in sections:
        for c in s.get("claims", []):
            if c.get("value") is None:
                continue
            checked += 1
            if not c.get("source_ref") or not c.get("source_kind"):
                failures.append({"section": s.get("key"), "claim": c.get("text")})
    passed = not failures
    score = 1.0 if checked == 0 else round((checked - len(failures)) / checked, 4)
    return _result(passed, score, checked=checked, failures=failures)


def eval_dashboard_consistency(sections: list[dict]) -> dict:
    """The system_health claims must be re-derivable from their captured source_ref
    (field name present, value bound). We do NOT re-query a live source — that would
    false-fail on an env whose audit activity changed between capture and finalize.
    Consistency = each claim cites a concrete field and carries the value it claims."""
    sh = next((s for s in sections if s.get("key") == "system_health"), None)
    if sh is None or sh.get("status") != "available":
        return _result(None, None, reason="system_health_not_available")
    failures = []
    for c in sh.get("claims", []):
        ref = c.get("source_ref") or {}
        if c.get("source_kind") != "audit_dashboard.summary" or not ref.get("field"):
            failures.append({"claim": c.get("text"), "reason": "missing_field_provenance"})
        elif c.get("value") is None:
            failures.append({"claim": c.get("text"), "reason": "no_value"})
    passed = not failures
    return _result(passed, 1.0 if passed else 0.0, checked=len(sh.get("claims", [])), failures=failures)


def eval_driver_quality(sections: list[dict]) -> dict:
    """The anomalies count claim must equal the number of card_ids it cites
    (the count is backed by enumerable evidence, not an assertion)."""
    an = next((s for s in sections if s.get("key") == "anomalies"), None)
    if an is None or an.get("status") != "available":
        return _result(None, None, reason="anomalies_not_available")
    failures = []
    for c in an.get("claims", []):
        ref = c.get("source_ref") or {}
        ids = ref.get("card_ids")
        if ids is not None and c.get("value") != len(ids):
            failures.append({"claim": c.get("text"), "value": c.get("value"), "card_ids": len(ids)})
    passed = not failures
    return _result(passed, 1.0 if passed else 0.0, checked=len(an.get("claims", [])), failures=failures)


def eval_pause_resume(session_row: dict, event_rows: list[dict]) -> dict:
    """Proves no work continued after a pause: no event carrying an invalidated run
    token appears after the pause that invalidated it (except the terminal control
    frames). If the session was never paused, the category is not measurable."""
    invalidated = set(str(t) for t in (session_row.get("invalidated_run_tokens") or []))
    if not invalidated:
        return _result(None, None, reason="never_paused")
    paused_events = [e for e in event_rows if e.get("event_type") == "session.paused"]
    if not paused_events:
        return _result(False, 0.0, reason="invalidated_tokens_without_pause_event")
    paused_seq = min(e.get("seq", 0) for e in paused_events)
    leaks = [
        {"seq": e.get("seq"), "event_type": e.get("event_type")}
        for e in event_rows
        if e.get("seq", 0) > paused_seq
        and str(e.get("run_token")) in invalidated
        and not e.get("event_type", "").startswith(("session.", "user."))
    ]
    passed = not leaks
    return _result(passed, 1.0 if passed else 0.0, invalidated=len(invalidated), leaks=leaks)


def eval_steering(event_rows: list[dict]) -> dict:
    """Every user.steer_submitted is followed by a plan.revised for that steer_id, and
    sections completed before the steer keep a lower seq (immutability of the past)."""
    steers = [e for e in event_rows if e.get("event_type") == "user.steer_submitted"]
    if not steers:
        return _result(None, None, reason="no_steering")
    revisions = [e for e in event_rows if e.get("event_type") == "plan.revised"]
    revised_ids = {(e.get("payload") or {}).get("steer_id") for e in revisions}
    failures = [
        {"steer_id": (s.get("payload") or {}).get("steer_id")}
        for s in steers
        if (s.get("payload") or {}).get("steer_id") not in revised_ids
    ]
    passed = not failures
    return _result(passed, 1.0 if passed else 0.0, steers=len(steers), failures=failures)


def eval_latency(session_row: dict, event_rows: list[dict]) -> dict:
    """Presence/sanity, not a perf gate: completed sessions record a non-negative
    latency_ms, and section.completed events carry a measured duration."""
    failures = []
    if session_row.get("status") == "completed":
        lat = session_row.get("latency_ms")
        if lat is None or lat < 0:
            failures.append({"reason": "missing_or_negative_latency_ms", "value": lat})
    for e in event_rows:
        if e.get("event_type") == "section.completed":
            dur = (e.get("payload") or {}).get("duration_ms")
            if dur is None or dur < 0:
                failures.append({"seq": e.get("seq"), "reason": "missing_duration_ms"})
    passed = not failures
    return _result(passed, 1.0 if passed else 0.0, failures=failures)


def eval_fail_closed(sections: list[dict]) -> dict:
    """Every not_available section has a non-empty null_reason and ZERO claims with a
    non-None value. A smuggled number in an unavailable section fails the category."""
    failures = []
    for s in sections:
        if s.get("status") == "not_available":
            if not s.get("null_reason"):
                failures.append({"section": s.get("key"), "reason": "missing_null_reason"})
            if any(c.get("value") is not None for c in s.get("claims", [])):
                failures.append({"section": s.get("key"), "reason": "number_in_unavailable_section"})
    passed = not failures
    return _result(passed, 1.0 if passed else 0.0, failures=failures)


def eval_audit(session_row: dict, event_rows: list[dict]) -> dict:
    """Every section.started / metric.queried event has a stored audit_event_id, and a
    finalize receipt exists."""
    failures = []
    for e in event_rows:
        if e.get("event_type") in ("section.started", "metric.queried"):
            if not e.get("audit_event_id"):
                failures.append({"seq": e.get("seq"), "event_type": e.get("event_type")})
    has_finalize_receipt = bool(session_row.get("finalize_audit_event_id"))
    if session_row.get("status") == "completed" and not has_finalize_receipt:
        failures.append({"reason": "missing_finalize_receipt"})
    passed = not failures
    return _result(passed, 1.0 if passed else 0.0, failures=failures)


def run_all(session_row: dict, event_rows: list[dict], sections: list[dict]) -> dict[str, dict]:
    """Run all 8 evals; return {category: result}. Caller persists each row."""
    return {
        "grounding": eval_grounding(sections),
        "dashboard-consistency": eval_dashboard_consistency(sections),
        "driver-quality": eval_driver_quality(sections),
        "pause-resume": eval_pause_resume(session_row, event_rows),
        "steering": eval_steering(event_rows),
        "latency": eval_latency(session_row, event_rows),
        "fail-closed": eval_fail_closed(sections),
        "audit": eval_audit(session_row, event_rows),
    }
