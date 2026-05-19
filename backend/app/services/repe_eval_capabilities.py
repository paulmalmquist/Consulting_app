"""Deterministic REPE capability handlers for Winston evals.

The service layer deliberately wraps SQL functions and canonical snapshot
tables. Finance eligibility, failure classification, and comparison windows
live in database functions seeded by the REPE eval migration.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import date
from typing import Any
from uuid import UUID

from app.db import get_cursor

LEGACY_REPE_TABLES = {"re_fund_quarter_state", "re_fund_metrics_qtr"}
COMPARISON_WINDOW_POLICY = "min_to_max_released_no_gaps"
ALLOWED_RANKING_BASIS = {"absolute_change", "pct_change"}
ALLOWED_METRICS = {"nav", "gross_irr", "net_irr", "tvpi", "dpi", "noi", "dscr", "ltv", "occupancy"}


@dataclass(frozen=True)
class ContractViolation:
    failure_category: str
    message: str
    violations: list[dict[str, Any]]

    def as_dict(self) -> dict[str, Any]:
        return {
            "ok": False,
            "failure_category": self.failure_category,
            "message": self.message,
            "violations": self.violations,
        }


def _json_default(value: Any) -> str:
    if isinstance(value, (UUID, date)):
        return str(value)
    return str(value)


def _stable_hash(payload: Any) -> str:
    encoded = json.dumps(payload, sort_keys=True, default=_json_default, separators=(",", ":")).encode()
    return hashlib.sha256(encoded).hexdigest()


def _as_uuid(value: str | UUID | None) -> UUID | None:
    if value is None:
        return None
    if isinstance(value, UUID):
        return value
    return UUID(str(value))


def _snapshot_hash(snapshot_ids: list[str], rows: list[dict[str, Any]] | None = None) -> str:
    content_versions = []
    for row in rows or []:
        content_versions.append(
            {
                "id": str(row.get("id") or row.get("snapshot_id") or ""),
                "snapshot_version": row.get("snapshot_version"),
                "inputs_hash": row.get("inputs_hash"),
                "audit_run_id": str(row.get("audit_run_id") or ""),
            }
        )
    return _stable_hash({"snapshot_ids": sorted(snapshot_ids), "content_versions": content_versions})


def resolve_repe_context(
    *,
    env_id: str,
    business_id: str | UUID,
    query: str,
    entity_type: str | None = None,
) -> dict[str, Any]:
    """Resolve canonical REPE entities in the active business/environment scope."""

    needle = f"%{query.strip()}%"
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT 'fund' AS entity_type, f.fund_id AS entity_id, f.name, false AS quarantined
            FROM repe_fund f
            WHERE f.business_id = %s AND (%s IS NULL OR %s = 'fund') AND f.name ILIKE %s
            UNION ALL
            SELECT 'entity' AS entity_type, e.entity_id AS entity_id, e.name, false AS quarantined
            FROM repe_entity e
            WHERE e.business_id = %s AND (%s IS NULL OR %s = 'entity') AND e.name ILIKE %s
            UNION ALL
            SELECT 'deal' AS entity_type, d.deal_id AS entity_id, d.name, false AS quarantined
            FROM repe_deal d
            JOIN repe_fund df ON df.fund_id = d.fund_id
            WHERE df.business_id = %s AND (%s IS NULL OR %s = 'deal') AND d.name ILIKE %s
            UNION ALL
            SELECT 'asset' AS entity_type, a.asset_id AS entity_id, a.name, false AS quarantined
            FROM repe_asset a
            JOIN repe_deal ad ON ad.deal_id = a.deal_id
            JOIN repe_fund af ON af.fund_id = ad.fund_id
            WHERE af.business_id = %s AND (%s IS NULL OR %s = 'asset') AND a.name ILIKE %s
            LIMIT 20
            """,
            (
                str(business_id),
                entity_type,
                entity_type,
                needle,
                str(business_id),
                entity_type,
                entity_type,
                needle,
                str(business_id),
                entity_type,
                entity_type,
                needle,
                str(business_id),
                entity_type,
                entity_type,
                needle,
            ),
        )
        rows = list(cur.fetchall())

    return {
        "capability_key": "repe.resolve_repe_context",
        "env_id": env_id,
        "business_id": str(business_id),
        "query": query,
        "entities": rows,
        "scope_status": "pass",
    }


def get_authoritative_fund_snapshots(
    *,
    env_id: str,
    business_id: str | UUID,
    fund_ids: list[str | UUID] | None = None,
    quarter: str | None = None,
    released_only: bool = True,
) -> dict[str, Any]:
    """Fetch authoritative fund snapshots. Draft snapshots stay excluded by default."""

    with get_cursor() as cur:
        cur.execute(
            """
            SELECT
              s.id,
              s.audit_run_id,
              s.snapshot_version,
              s.env_id,
              s.business_id,
              s.fund_id,
              f.name AS fund_name,
              s.quarter,
              s.promotion_state,
              s.canonical_metrics,
              s.null_reasons,
              s.provenance,
              s.inputs_hash,
              s.created_at
            FROM re_authoritative_fund_state_qtr s
            LEFT JOIN repe_fund f ON f.fund_id = s.fund_id
            WHERE s.env_id = %s
              AND s.business_id = %s
              AND (%s::text IS NULL OR s.quarter = %s)
              AND (NOT %s OR s.promotion_state = 'released')
              AND (%s::uuid[] IS NULL OR s.fund_id = ANY(%s::uuid[]))
            ORDER BY s.fund_id, s.quarter
            """,
            (
                env_id,
                str(business_id),
                quarter,
                quarter,
                released_only,
                [_as_uuid(v) for v in fund_ids] if fund_ids else None,
                [_as_uuid(v) for v in fund_ids] if fund_ids else None,
            ),
        )
        rows = list(cur.fetchall())

    snapshot_ids = [str(row["id"]) for row in rows]
    return {
        "capability_key": "repe.get_authoritative_fund_snapshots",
        "env_id": env_id,
        "business_id": str(business_id),
        "released_only": released_only,
        "snapshots": rows,
        "snapshot_ids_used": snapshot_ids,
        "data_snapshot_hash": _snapshot_hash(snapshot_ids, rows),
    }


def rank_funds_by_metric_change(
    *,
    env_id: str,
    business_id: str | UUID,
    metric_key: str = "nav",
    ranking_basis: str = "absolute_change",
    comparison_window_policy: str = COMPARISON_WINDOW_POLICY,
    fund_id: str | UUID | None = None,
) -> dict[str, Any]:
    """Rank funds via repe.fn_eligible_metric_history and return comparison_result."""

    if metric_key not in ALLOWED_METRICS:
        raise ValueError(f"Unsupported metric_key: {metric_key}")
    if ranking_basis not in ALLOWED_RANKING_BASIS:
        raise ValueError(f"Unsupported ranking_basis: {ranking_basis}")
    if comparison_window_policy != COMPARISON_WINDOW_POLICY:
        raise ValueError(f"Unsupported comparison_window_policy: {comparison_window_policy}")

    with get_cursor() as cur:
        cur.execute(
            """
            SELECT
              h.fund_id,
              f.name AS fund_name,
              h.eligible_periods,
              h.start_period,
              h.end_period,
              h.start_value,
              h.end_value,
              h.exclusion_reason,
              h.snapshot_ids
            FROM repe.fn_eligible_metric_history(%s, %s, %s::uuid) h
            LEFT JOIN repe_fund f ON f.fund_id = h.fund_id
            WHERE f.business_id = %s OR f.business_id IS NULL
            """,
            (env_id, metric_key, _as_uuid(fund_id), str(business_id)),
        )
        rows = list(cur.fetchall())

    included: list[dict[str, Any]] = []
    excluded: list[dict[str, Any]] = []
    snapshot_ids: list[str] = []

    for row in rows:
        ids = [str(v) for v in (row.get("snapshot_ids") or [])]
        snapshot_ids.extend(ids)
        reason = row.get("exclusion_reason")
        if reason:
            excluded.append(
                {
                    "fund_id": str(row["fund_id"]),
                    "fund_name": row.get("fund_name"),
                    "reason": reason,
                    "snapshot_ids": ids,
                }
            )
            continue

        start_value = row.get("start_value")
        end_value = row.get("end_value")
        absolute_change = None if start_value is None or end_value is None else end_value - start_value
        pct_change = None
        if start_value not in (None, 0) and end_value is not None:
            pct_change = (end_value / start_value) - 1

        included.append(
            {
                "fund_id": str(row["fund_id"]),
                "fund_name": row.get("fund_name"),
                "start_period": row.get("start_period"),
                "end_period": row.get("end_period"),
                "start_value": start_value,
                "end_value": end_value,
                "absolute_change": absolute_change,
                "pct_change": pct_change,
                "snapshot_ids": ids,
            }
        )

    included.sort(
        key=lambda row: row.get("pct_change" if ranking_basis == "pct_change" else "absolute_change") or 0,
        reverse=True,
    )

    by_reason: dict[str, int] = {}
    for row in excluded:
        reason = str(row["reason"])
        by_reason[reason] = by_reason.get(reason, 0) + 1

    comparison_result = {
        "metric_key": metric_key,
        "comparison_window_policy": comparison_window_policy,
        "ranking_basis": ranking_basis,
        "included": included,
        "excluded": excluded,
        "coverage": {
            "total": len(included) + len(excluded),
            "included": len(included),
            "excluded": len(excluded),
            "by_reason": by_reason,
        },
        "snapshot_ids_used": sorted(set(snapshot_ids)),
        "data_snapshot_hash": _snapshot_hash(snapshot_ids),
    }

    return {
        "capability_key": "repe.rank_funds_by_metric_change",
        "env_id": env_id,
        "business_id": str(business_id),
        "comparison_result": comparison_result,
        **comparison_result,
    }


def get_metric_provenance(
    *,
    env_id: str,
    business_id: str | UUID,
    metric_key: str,
    entity_type: str,
    entity_id: str | UUID,
    period: str,
) -> dict[str, Any]:
    if entity_type != "fund":
        return {
            "capability_key": "repe.get_metric_provenance",
            "reason_code": "unsupported_metric",
            "provenance": None,
        }

    with get_cursor() as cur:
        cur.execute(
            """
            SELECT
              s.id,
              s.audit_run_id,
              s.snapshot_version,
              s.quarter,
              s.promotion_state,
              s.canonical_metrics,
              s.null_reasons,
              s.provenance,
              s.inputs_hash,
              r.source_summary,
              r.released_at
            FROM re_authoritative_fund_state_qtr s
            LEFT JOIN re_authoritative_snapshot_run r ON r.audit_run_id = s.audit_run_id
            WHERE s.env_id = %s
              AND s.business_id = %s
              AND s.fund_id = %s
              AND s.quarter = %s
            ORDER BY s.created_at DESC
            LIMIT 1
            """,
            (env_id, str(business_id), _as_uuid(entity_id), period),
        )
        row = cur.fetchone()

    snapshot_ids = [str(row["id"])] if row else []
    return {
        "capability_key": "repe.get_metric_provenance",
        "metric_key": metric_key,
        "entity_type": entity_type,
        "entity_id": str(entity_id),
        "period": period,
        "provenance": row,
        "snapshot_ids_used": snapshot_ids,
        "data_snapshot_hash": _snapshot_hash(snapshot_ids, [row] if row else []),
    }


def explain_unavailable_metric(
    *,
    env_id: str,
    metric_key: str,
    entity_type: str,
    entity_id: str | UUID,
    period: str,
) -> dict[str, Any]:
    with get_cursor() as cur:
        cur.execute(
            "SELECT repe.fn_classify_unavailable_metric(%s, %s, %s, %s::uuid, %s::date) AS reason_code",
            (env_id, metric_key, entity_type, _as_uuid(entity_id), period),
        )
        row = cur.fetchone() or {}

    reason = row.get("reason_code") or "metric_available"
    return {
        "capability_key": "repe.explain_unavailable_metric",
        "env_id": env_id,
        "metric_key": metric_key,
        "entity_type": entity_type,
        "entity_id": str(entity_id),
        "period": period,
        "reason_code": reason,
        "available": reason == "metric_available",
    }


def validate_readonly_sql_contract(
    *,
    sql_text: str,
    capability: dict[str, Any] | None,
    env_id: str | None,
) -> ContractViolation | None:
    lowered = sql_text.lower()
    violations: list[dict[str, Any]] = []

    forbidden_terms = (" insert ", " update ", " delete ", " drop ", " alter ", " truncate ", " create ")
    if any(term in f" {lowered} " for term in forbidden_terms):
        violations.append({"type": "write_attempt", "message": "Only SELECT statements are allowed."})

    forbidden_tables = set(LEGACY_REPE_TABLES)
    if capability:
        forbidden_tables.update(str(v) for v in capability.get("forbidden_source_tables") or [])
    touched_legacy = sorted(table for table in forbidden_tables if table.lower() in lowered)
    if touched_legacy:
        violations.append(
            {
                "type": "legacy_source_violation",
                "tables": touched_legacy,
                "message": "Capability contract forbids legacy REPE source tables.",
            }
        )

    if env_id and "env_id" not in lowered:
        violations.append(
            {
                "type": "scope_violation",
                "message": "Contracted REPE SQL must carry an env_id scope predicate.",
            }
        )

    if violations:
        category = "legacy_source_violation" if touched_legacy else violations[0]["type"]
        return ContractViolation(category, "SQL contract validation failed.", violations)
    return None
