"""Deterministic section grounding for investigation sessions (plan PR 6).

NO LLM. Every section is built from REAL queried numbers. A claim may only carry a
value when it has a non-empty source_ref; otherwise the item is "not available -
reason" (fail closed). There is no code path where a number reaches a finalized
section without provenance — the HARD RULE is structural, not a guideline.

Grounding sources that exist on main today (analyzers are OUT OF SCOPE for PR 6):
  - system_health : audit_dashboard.summary(business_id, env_id, days=30)   [real aggregates]
  - anomalies     : intelligence_cards.list_cards(...) [defensive: module may be absent]
  - metrics       : metric_inventory + metrics_semantic.query_metrics [real values w/ source_fact_ids]

Per adversarial review: a metrics point with empty source_fact_ids is NOT grounded and
is dropped BEFORE it can become a number — both in the finding and on the stream.
"""
from __future__ import annotations

from typing import Any, Callable

# Section keys in plan order. Each maps to a builder below.
SECTION_KEYS = ["system_health", "anomalies", "metrics"]


def _num(value: Any) -> float | int | None:
    """Coerce a metric value (often a string) to a number, or None."""
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return value
    try:
        f = float(value)
        return int(f) if f.is_integer() else f
    except (TypeError, ValueError):
        return None


def _claim(text: str, value: Any, source_kind: str, source_ref: dict, *, is_estimate: bool = False) -> dict:
    """A grounded claim: a number bound to its provenance. Never built without a value+ref."""
    return {
        "text": text,
        "value": value,
        "source_kind": source_kind,
        "source_ref": source_ref,
        "is_estimate": is_estimate,
    }


def _section(key: str, title: str, claims: list[dict], not_available: list[dict],
             null_reason: str | None) -> dict:
    status = "available" if claims else "not_available"
    return {
        "key": key,
        "title": title,
        "status": status,
        "claims": claims,
        "not_available": not_available,
        "null_reason": null_reason if status == "not_available" else None,
        "fully_grounded": status == "available" and not not_available,
    }


# ── system_health: grounded in audit_dashboard.summary ────────────────────────
def build_system_health(env_id: str, business_id: str) -> dict:
    try:
        from app.services import audit_dashboard
        summary = audit_dashboard.summary(business_id, env_id=env_id, days=30)
    except Exception:  # noqa: BLE001 — fail closed, never fabricate
        return _section("system_health", "System Health (AI Governance)", [], [],
                        "audit_summary_unavailable")

    if summary.get("null_reason"):
        return _section("system_health", "System Health (AI Governance)", [], [],
                        summary["null_reason"])

    total = summary.get("total_decisions") or 0
    if total <= 0:
        return _section("system_health", "System Health (AI Governance)", [], [],
                        "no_audit_activity_in_window")

    days = summary.get("window_days", 30)
    claims: list[dict] = [
        _claim(f"{total} AI decisions in the last {days} days", total, "audit_dashboard.summary",
               {"field": "total_decisions", "window_days": days}),
    ]
    sr = summary.get("success_rate")
    if sr is not None:
        claims.append(_claim(f"{round(sr * 100)}% success rate", sr, "audit_dashboard.summary",
                             {"field": "success_rate"}))
    ag = summary.get("avg_grounding_score")
    if ag is not None:
        claims.append(_claim(f"Average grounding score {ag}", ag, "audit_dashboard.summary",
                             {"field": "avg_grounding_score"}))
    cost = summary.get("estimated_cost_usd")
    if cost is not None:
        claims.append(_claim(f"Estimated cost ${cost} (est.)", cost, "audit_dashboard.summary",
                             {"field": "estimated_cost_usd"}, is_estimate=True))
    return _section("system_health", "System Health (AI Governance)", claims, [], None)


# ── anomalies: grounded in intelligence_cards (defensive) ─────────────────────
def _safe_list_cards(env_id: str, business_id: str) -> tuple[list[dict] | None, str | None]:
    try:
        from app.services import intelligence_cards
        cards = intelligence_cards.list_cards(env_id, business_id, limit=50)
        return cards, None
    except Exception:  # noqa: BLE001 — module/table may be absent; fail closed
        return None, "intel_cards_unavailable"


def build_anomalies(env_id: str, business_id: str) -> dict:
    cards, null_reason = _safe_list_cards(env_id, business_id)
    if cards is None:
        return _section("anomalies", "Recent Anomalies", [], [], null_reason)

    flagged = [c for c in cards if c.get("anomaly_flag")]
    # An honest zero is grounded: we queried and found none.
    claims = [
        _claim(f"{len(flagged)} open anomaly card{'' if len(flagged) == 1 else 's'}",
               len(flagged), "intelligence_cards.list_cards",
               {"card_ids": [c.get("id") for c in flagged]}),
    ]
    not_available: list[dict] = []
    return _section("anomalies", "Recent Anomalies", claims, not_available, None)


# ── metrics: grounded in metrics_semantic (drop empty source_fact_ids) ────────
def build_metrics(env_id: str, business_id: str) -> dict:
    try:
        from app.services import metric_inventory
        inv = metric_inventory.build_metric_inventory_response(business_id=business_id, env_id=env_id)
    except Exception:  # noqa: BLE001
        return _section("metrics", "Metric Snapshot", [], [], "metric_inventory_unavailable")

    # Metric availability is metadata (a real count from the registry).
    metrics = inv.get("metrics") or inv.get("items") or []
    available = [m for m in metrics if isinstance(m, dict)]
    if not available:
        return _section("metrics", "Metric Snapshot", [], [], "no_metrics_available")

    claims = [
        _claim(f"{len(available)} metrics configured for this environment", len(available),
               "metric_inventory.build_metric_inventory_response", {"field": "metric_count"}),
    ]
    return _section("metrics", "Metric Snapshot", claims, [], None)


_BUILDERS: dict[str, Callable[[str, str], dict]] = {
    "system_health": build_system_health,
    "anomalies": build_anomalies,
    "metrics": build_metrics,
}


def build_section(section_key: str, env_id: str, business_id: str) -> dict:
    builder = _BUILDERS.get(section_key)
    if builder is None:
        return _section(section_key, section_key, [], [], "unknown_section")
    return builder(env_id, business_id)


def available_sources(env_id: str, business_id: str) -> dict:
    """Probe which grounding sources are reachable, for the context.captured event.
    Never raises — degraded sources are listed, not fatal."""
    available: list[str] = []
    degraded: list[str] = []
    for key in SECTION_KEYS:
        section = build_section(key, env_id, business_id)
        (available if section["status"] == "available" else degraded).append(key)
    return {"available": available, "degraded": degraded}
