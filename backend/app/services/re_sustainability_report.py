"""Governed sustainability report bundle (T9 of plan 0018).

Reads governed sustainability metrics exclusively through
``re_sustainability_authoritative.get_authoritative_state`` — the same single
fetch layer the T7 dashboard uses. Because the report and the dashboard obtain
every value from the identical governed reader, they cannot disagree.

This service performs no SQL of its own and no arithmetic on metric values.
When the reader returns ``null_reason='snapshot_unavailable'``, the bundle is
returned with that ``null_reason``, an empty ``metrics`` list, and no
fabricated totals. There is no fallback to the legacy tables
(``sus_utility_monthly``, ``sus_portfolio_footprint_v``, ``re_sustainability``).

The legacy fund-scoped report path in ``re_sustainability_reporting.py`` is
untouched; it continues to serve the legacy REPE surface.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from app.services import re_sustainability_authoritative


def build_governed_report(
    *,
    business_id: UUID | str,
    env_id: str,
    entity_scope: str,
    period_key: str,
    metric_family: str,
    snapshot_version: str | None = None,
) -> dict[str, Any]:
    """Return the governed report bundle for a scope+period+family.

    Every metric value comes from the T4 authoritative reader. The service
    does not read any ``sus_*`` table directly and does not compute totals.
    """
    generated_at = datetime.now(timezone.utc).isoformat()

    try:
        state = re_sustainability_authoritative.get_authoritative_state(
            business_id=business_id,
            env_id=env_id,
            entity_scope=entity_scope,
            period_key=period_key,
            metric_family=metric_family,
            snapshot_version=snapshot_version,
        )
    except Exception:
        # Fail closed: never fabricate a value if the governed reader raises.
        return {
            "entity_scope": entity_scope,
            "period_key": period_key,
            "requested_period_key": period_key,
            "period_exact": False,
            "metric_family": metric_family,
            "state_origin": "authoritative",
            "snapshot_version": None,
            "promotion_state": None,
            "trust_status": "missing_source",
            "null_reason": re_sustainability_authoritative.SNAPSHOT_UNAVAILABLE,
            "metrics": [],
            "evidence": [],
            "generated_at": generated_at,
        }

    if state.get("null_reason") == re_sustainability_authoritative.SNAPSHOT_UNAVAILABLE:
        return {
            "entity_scope": state.get("entity_scope") or entity_scope,
            "period_key": state.get("period_key") or period_key,
            "requested_period_key": period_key,
            "period_exact": False,
            "metric_family": metric_family,
            "state_origin": state.get("state_origin") or "authoritative",
            "snapshot_version": None,
            "promotion_state": None,
            "trust_status": state.get("trust_status") or "missing_source",
            "null_reason": re_sustainability_authoritative.SNAPSHOT_UNAVAILABLE,
            "metrics": [],
            "evidence": [],
            "generated_at": generated_at,
        }

    return {
        "entity_scope": state.get("entity_scope"),
        "period_key": state.get("period_key"),
        "requested_period_key": state.get("requested_period_key") or period_key,
        "period_exact": state.get("period_exact"),
        "metric_family": metric_family,
        "state_origin": state.get("state_origin"),
        "snapshot_version": state.get("snapshot_version"),
        "promotion_state": state.get("promotion_state"),
        "trust_status": state.get("trust_status"),
        "null_reason": state.get("null_reason"),
        "metrics": list(state.get("metrics", [])),
        "evidence": list(state.get("evidence", [])),
        "generated_at": generated_at,
    }
