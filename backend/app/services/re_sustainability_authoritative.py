"""Sustainability authoritative-state reader (single fetch layer).

Mirrors ``re_authoritative_snapshots.get_authoritative_state`` for the
sustainability authoritative tables introduced by
``repo-b/db/schema/618_sus_authoritative.sql`` (T3 of plan 0018):

- ``sus_authoritative_snapshots`` — the snapshot header, keyed by
  ``snapshot_version`` and scoped by
  ``(business_id, env_id, entity_scope, period_key, metric_family)``.
- ``sus_authoritative_metric_value`` — per-metric numeric values keyed by
  ``(snapshot_version, metric_key)``. A row whose ``value_numeric`` is NULL
  carries a stored ``null_reason``; the reader never substitutes zero.
- ``sus_authoritative_evidence`` — per-metric provenance rows.

Every sustainability read that surfaces a governed ESG metric MUST go through
``get_authoritative_state`` / ``get_metric`` in this module. The reader is
fail-closed: a missing released snapshot returns
``null_reason="snapshot_unavailable"`` with empty metrics and no exception; a
metric row with NULL value returns its stored ``null_reason`` (see T2 fail-closed
vocabulary in ``docs/plans/03-implementation-plans/active/0018-...``).

The reader is read-only: only SELECTs against ``sus_authoritative_*`` tables.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from app.db import get_cursor


def _uuid_to_str(value: Any) -> str | None:
    if value is None:
        return None
    return str(value)


SNAPSHOT_UNAVAILABLE = "snapshot_unavailable"
METRIC_DEFINITION_MISSING = "metric_definition_missing"


def get_authoritative_state(
    *,
    business_id: UUID | str,
    env_id: str,
    entity_scope: str,
    period_key: str,
    metric_family: str,
    snapshot_version: str | None = None,
) -> dict[str, Any]:
    """Return the authoritative sustainability state for a scope+period+family.

    Selects the latest matching row from ``sus_authoritative_snapshots``,
    defaulting to ``promotion_state = 'released'`` when no explicit
    ``snapshot_version`` is supplied (mirroring the REPE reader). On a hit,
    also loads the associated metric-value and evidence rows.

    Fail-closed contract:
      - No matching snapshot → ``null_reason="snapshot_unavailable"``,
        ``trust_status="missing_source"``, empty ``metrics`` and ``evidence``.
      - A metric row with NULL ``value_numeric`` → ``value=None`` plus its
        stored ``null_reason``. Zero is never substituted.
    """
    filters = [
        "business_id = %s::uuid",
        "env_id = %s",
        "entity_scope = %s",
        "period_key = %s",
        "metric_family = %s",
    ]
    params: list[Any] = [
        str(business_id),
        env_id,
        entity_scope,
        period_key,
        metric_family,
    ]
    if snapshot_version:
        filters.append("snapshot_version = %s")
        params.append(snapshot_version)
    else:
        filters.append("promotion_state = 'released'")

    where_sql = " AND ".join(filters)

    with get_cursor() as cur:
        cur.execute(
            f"""
            SELECT snapshot_version, promotion_state, trust_status,
                   period_key, entity_scope, metric_family
            FROM sus_authoritative_snapshots
            WHERE {where_sql}
            ORDER BY created_at DESC
            LIMIT 1
            """,
            params,
        )
        header = cur.fetchone()

    if not header:
        return {
            "entity_scope": entity_scope,
            "period_key": period_key,
            "requested_period_key": period_key,
            "period_exact": False,
            "state_origin": "authoritative",
            "snapshot_version": None,
            "promotion_state": None,
            "trust_status": "missing_source",
            "null_reason": SNAPSHOT_UNAVAILABLE,
            "metrics": [],
            "evidence": [],
        }

    resolved_version = header["snapshot_version"]

    with get_cursor() as cur:
        cur.execute(
            """
            SELECT metric_key, value_numeric, unit, null_reason, trust_status
            FROM sus_authoritative_metric_value
            WHERE snapshot_version = %s
            ORDER BY metric_key ASC
            """,
            (resolved_version,),
        )
        metric_rows = cur.fetchall() or []

    with get_cursor() as cur:
        cur.execute(
            """
            SELECT metric_key, source_table, source_row_ref,
                   emission_factor_set_id, ingestion_run_id, formula_id
            FROM sus_authoritative_evidence
            WHERE snapshot_version = %s
            ORDER BY metric_key ASC, created_at ASC
            """,
            (resolved_version,),
        )
        evidence_rows = cur.fetchall() or []

    metrics = [
        {
            "metric_key": row["metric_key"],
            "value": row.get("value_numeric"),
            "unit": row.get("unit"),
            "null_reason": row.get("null_reason"),
            "trust_status": row.get("trust_status"),
        }
        for row in metric_rows
    ]

    evidence = [
        {
            "metric_key": row["metric_key"],
            "source_table": row.get("source_table"),
            "source_row_ref": row.get("source_row_ref"),
            "emission_factor_set_id": _uuid_to_str(row.get("emission_factor_set_id")),
            "ingestion_run_id": _uuid_to_str(row.get("ingestion_run_id")),
            "formula_id": row.get("formula_id"),
        }
        for row in evidence_rows
    ]

    returned_period_key = str(header["period_key"])
    return {
        "entity_scope": header.get("entity_scope") or entity_scope,
        "period_key": returned_period_key,
        "requested_period_key": period_key,
        "period_exact": returned_period_key == period_key,
        "state_origin": "authoritative",
        "snapshot_version": resolved_version,
        "promotion_state": header["promotion_state"],
        "trust_status": header["trust_status"],
        "null_reason": None,
        "metrics": metrics,
        "evidence": evidence,
    }


def get_metric(
    *,
    business_id: UUID | str,
    env_id: str,
    entity_scope: str,
    period_key: str,
    metric_family: str,
    metric_key: str,
    snapshot_version: str | None = None,
) -> dict[str, Any]:
    """Return a single governed metric from the authoritative snapshot.

    Contract:
      - Snapshot missing → ``null_reason="snapshot_unavailable"``, ``value=None``,
        ``trust_status="missing_source"``.
      - ``metric_key`` not present in the snapshot's value rows →
        ``null_reason="metric_definition_missing"``, ``value=None``.
      - Metric row present with NULL ``value_numeric`` → ``value=None`` plus its
        stored ``null_reason`` (never 0).
    """
    state = get_authoritative_state(
        business_id=business_id,
        env_id=env_id,
        entity_scope=entity_scope,
        period_key=period_key,
        metric_family=metric_family,
        snapshot_version=snapshot_version,
    )

    if state.get("null_reason") == SNAPSHOT_UNAVAILABLE:
        return {
            "value": None,
            "unit": None,
            "null_reason": SNAPSHOT_UNAVAILABLE,
            "trust_status": "missing_source",
            "snapshot_version": None,
            "state_origin": "authoritative",
        }

    for metric in state.get("metrics", []):
        if metric.get("metric_key") == metric_key:
            return {
                "value": metric.get("value"),
                "unit": metric.get("unit"),
                "null_reason": metric.get("null_reason"),
                "trust_status": metric.get("trust_status"),
                "snapshot_version": state.get("snapshot_version"),
                "state_origin": "authoritative",
            }

    return {
        "value": None,
        "unit": None,
        "null_reason": METRIC_DEFINITION_MISSING,
        "trust_status": "missing_source",
        "snapshot_version": state.get("snapshot_version"),
        "state_origin": "authoritative",
    }
