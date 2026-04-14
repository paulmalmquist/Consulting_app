"""Canonical compute functions for PDS Executive metrics.

HARD RULE 1: Every metric in the PDS Executive surface flows through exactly one
function in this module. Orchestrator, overview endpoint, command router, driver
engine, and reconciliation service must all obtain metric values by calling these
functions via the registry — no duplicate metric SQL is allowed anywhere else in
backend/app/services/pds_executive/.
"""
from __future__ import annotations

from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from app.services.pds_executive.filter_normalizer import NormalizedFilters


PROJECT_STATUS_ACTIVE: tuple[str, ...] = ("active",)
AT_RISK_STATES: tuple[str, ...] = ("yellow", "red")


@dataclass
class MetricReceipt:
    sql: str
    params: list[Any]
    filters: dict[str, Any]
    timestamp: str
    grain: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class MetricResult:
    metric: str
    value: Any
    grain: str
    receipt: MetricReceipt
    suppressed_count: int = 0
    suppressed_sample: list[dict[str, Any]] = field(default_factory=list)
    suppression_reasons: list[str] = field(default_factory=list)
    breakdown: list[dict[str, Any]] = field(default_factory=list)
    trend: dict[str, Any] | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "metric": self.metric,
            "value": self.value,
            "grain": self.grain,
            "receipt": self.receipt.to_dict(),
            "suppressed_count": self.suppressed_count,
            "suppressed_sample": self.suppressed_sample,
            "suppression_reasons": self.suppression_reasons,
            "breakdown": self.breakdown,
            "trend": self.trend,
        }


def _now_iso() -> str:
    return datetime.now(tz=timezone.utc).isoformat()


def _group_clause(grain: str) -> tuple[str, str]:
    """Return (select_expression_for_key, group_by_expression) for a grain."""
    if grain == "portfolio":
        return ("'portfolio'::text", "1")
    if grain == "account":
        return ("program_id::text", "program_id")
    if grain == "project":
        return ("project_id::text", "project_id")
    if grain == "issue":
        return ("project_id::text", "project_id")
    raise ValueError(f"Unsupported grain for metric_functions: {grain}")


def _decimal_to_float(value: Any) -> float:
    if value is None:
        return 0.0
    if isinstance(value, Decimal):
        return float(value)
    return float(value)


def _base_where(nf: NormalizedFilters) -> tuple[str, list[Any]]:
    where = ["env_id = %s::uuid", "business_id = %s::uuid"]
    params: list[Any] = [str(nf.env_id), str(nf.business_id)]

    statuses = nf.status_filters or PROJECT_STATUS_ACTIVE
    where.append("status = ANY(%s)")
    params.append(list(statuses))

    if nf.grain == "account" and nf.entity_ids:
        where.append("program_id = ANY(%s::uuid[])")
        params.append([str(e) for e in nf.entity_ids])
    elif nf.grain == "project" and nf.entity_ids:
        where.append("project_id = ANY(%s::uuid[])")
        params.append([str(e) for e in nf.entity_ids])

    return " AND ".join(where), params


def _fetch_grouped_sum(
    cur,
    *,
    nf: NormalizedFilters,
    expr: str,
) -> tuple[list[dict[str, Any]], str, list[Any]]:
    key_expr, group_by = _group_clause(nf.grain)
    where_sql, where_params = _base_where(nf)
    sql = (
        f"SELECT {key_expr} AS group_key, "
        f"       SUM({expr}) AS metric_value, "
        "        COUNT(*) AS row_count "
        "   FROM pds_projects "
        f"  WHERE {where_sql} "
        f"  GROUP BY {group_by} "
        "   ORDER BY metric_value DESC NULLS LAST"
    )
    cur.execute(sql, tuple(where_params))
    rows = cur.fetchall() or []
    return rows, sql, where_params


def _count_suppressed(
    cur, nf: NormalizedFilters
) -> tuple[int, list[dict[str, Any]], list[str]]:
    """Return (count, sample_rows, reasons) of rows excluded by this metric.

    We union two sources:
      - projects filtered out by status (soft exclusion done by the metric itself)
      - rows flagged in pds_exception against pds_projects (data-quality exceptions)

    Failing to open pds_exception (for example: DB missing the table in dev)
    degrades gracefully — the metric still returns the status-excluded count.
    """
    if nf.include_suppressed:
        return 0, [], []

    reasons: list[str] = []
    sample: list[dict[str, Any]] = []

    cur.execute(
        """
        SELECT project_id, name, status, approved_budget
          FROM pds_projects
         WHERE env_id = %s::uuid
           AND business_id = %s::uuid
           AND status <> ALL(%s)
         LIMIT 5
        """,
        (str(nf.env_id), str(nf.business_id), list(PROJECT_STATUS_ACTIVE)),
    )
    status_sample = cur.fetchall() or []
    if status_sample:
        sample.extend(dict(r) for r in status_sample)
        reasons.append("project status excluded (not 'active')")

    cur.execute(
        """
        SELECT COUNT(*) AS suppressed
          FROM pds_projects
         WHERE env_id = %s::uuid
           AND business_id = %s::uuid
           AND status <> ALL(%s)
        """,
        (str(nf.env_id), str(nf.business_id), list(PROJECT_STATUS_ACTIVE)),
    )
    count_row = cur.fetchone() or {}
    status_suppressed = int(count_row.get("suppressed") or 0)

    exception_suppressed = 0
    try:
        cur.execute(
            """
            SELECT COUNT(*) AS n
              FROM pds_exception
             WHERE env_id = %s::uuid
               AND business_id = %s::uuid
               AND source_table = 'pds_projects'
            """,
            (str(nf.env_id), str(nf.business_id)),
        )
        exc_row = cur.fetchone() or {}
        exception_suppressed = int(exc_row.get("n") or 0)
        if exception_suppressed:
            reasons.append("rows flagged in pds_exception")
            cur.execute(
                """
                SELECT exception_id, source_table, error_type, sample_row_json
                  FROM pds_exception
                 WHERE env_id = %s::uuid
                   AND business_id = %s::uuid
                   AND source_table = 'pds_projects'
                 ORDER BY created_at DESC
                 LIMIT 5
                """,
                (str(nf.env_id), str(nf.business_id)),
            )
            sample.extend(dict(r) for r in (cur.fetchall() or []))
    except Exception:  # noqa: BLE001
        # pds_exception not present (early env); degrade gracefully.
        pass

    return status_suppressed + exception_suppressed, sample[:10], reasons


def _make_receipt(sql: str, params: list[Any], nf: NormalizedFilters) -> MetricReceipt:
    return MetricReceipt(
        sql=sql,
        params=[str(p) if hasattr(p, "hex") else p for p in params],
        filters=nf.as_receipt_filters(),
        timestamp=_now_iso(),
        grain=nf.grain,
    )


def _result_from_grouped_sum(
    *,
    cur,
    nf: NormalizedFilters,
    metric_name: str,
    expr: str,
) -> MetricResult:
    rows, sql, params = _fetch_grouped_sum(cur, nf=nf, expr=expr)
    breakdown = [
        {
            "group_key": r.get("group_key"),
            "value": _decimal_to_float(r.get("metric_value")),
            "row_count": int(r.get("row_count") or 0),
        }
        for r in rows
    ]
    total = sum(item["value"] for item in breakdown)

    suppressed_count, suppressed_sample, suppression_reasons = _count_suppressed(cur, nf)

    return MetricResult(
        metric=metric_name,
        value=total if nf.grain == "portfolio" else breakdown,
        grain=nf.grain,
        receipt=_make_receipt(sql, params, nf),
        suppressed_count=suppressed_count,
        suppressed_sample=suppressed_sample,
        suppression_reasons=suppression_reasons,
        breakdown=breakdown,
    )


def compute_total_managed(cur, nf: NormalizedFilters) -> MetricResult:
    """Sum of approved budget for in-scope projects."""
    return _result_from_grouped_sum(
        cur=cur,
        nf=nf,
        metric_name="total_managed",
        expr="COALESCE(approved_budget, 0)",
    )


def compute_net_variance(cur, nf: NormalizedFilters) -> MetricResult:
    """Net variance = approved_budget - forecast_at_completion.

    Negative value = over budget / under-pressure. Sign convention matches UI tone.
    """
    return _result_from_grouped_sum(
        cur=cur,
        nf=nf,
        metric_name="net_variance",
        expr="COALESCE(approved_budget, 0) - COALESCE(forecast_at_completion, 0)",
    )


def compute_directional_delta(cur, nf: NormalizedFilters) -> MetricResult:
    """Directional delta = forecast minus spent, as leading indicator of pressure.

    Positive = headroom remaining, negative = burning past forecast.
    """
    return _result_from_grouped_sum(
        cur=cur,
        nf=nf,
        metric_name="directional_delta",
        expr="COALESCE(forecast_at_completion, 0) - COALESCE(spent_amount, 0)",
    )


def compute_accounts_at_risk(cur, nf: NormalizedFilters) -> MetricResult:
    """Count of in-scope entities with intervention_state in yellow/red."""
    key_expr, group_by = _group_clause(nf.grain)
    where_sql, where_params = _base_where(nf)
    sql = (
        f"SELECT {key_expr} AS group_key, "
        "        COUNT(*) AS metric_value, "
        "        SUM(CASE WHEN intervention_state = ANY(%s) THEN 1 ELSE 0 END) AS at_risk "
        "   FROM pds_projects "
        f"  WHERE {where_sql} "
        f"  GROUP BY {group_by} "
        "   ORDER BY at_risk DESC NULLS LAST"
    )
    params = [list(AT_RISK_STATES), *where_params]
    cur.execute(sql, tuple(params))
    rows = cur.fetchall() or []

    breakdown = [
        {
            "group_key": r.get("group_key"),
            "value": int(r.get("at_risk") or 0),
            "row_count": int(r.get("metric_value") or 0),
        }
        for r in rows
    ]
    total = sum(item["value"] for item in breakdown)

    suppressed_count, suppressed_sample, suppression_reasons = _count_suppressed(cur, nf)

    return MetricResult(
        metric="accounts_at_risk",
        value=total if nf.grain == "portfolio" else breakdown,
        grain=nf.grain,
        receipt=_make_receipt(sql, params, nf),
        suppressed_count=suppressed_count,
        suppressed_sample=suppressed_sample,
        suppression_reasons=suppression_reasons,
        breakdown=breakdown,
    )


def compute_posture(cur, nf: NormalizedFilters) -> MetricResult:
    """Portfolio posture derived from at-risk ratio.

    stable < watching < pressured < critical based on share of at-risk accounts.
    """
    at_risk_result = compute_accounts_at_risk(cur, nf)
    totals_result = _result_from_grouped_sum(
        cur=cur,
        nf=nf,
        metric_name="_project_count",
        expr="1",
    )

    at_risk_count = (
        at_risk_result.value
        if isinstance(at_risk_result.value, int)
        else sum(row["value"] for row in at_risk_result.breakdown)
    )
    total_count = (
        totals_result.value
        if isinstance(totals_result.value, (int, float))
        else sum(row["value"] for row in totals_result.breakdown)
    )
    total_count = int(total_count) if total_count else 0

    ratio = (at_risk_count / total_count) if total_count else 0.0
    if ratio >= 0.5:
        posture = "critical"
    elif ratio >= 0.25:
        posture = "pressured"
    elif ratio > 0:
        posture = "watching"
    else:
        posture = "stable"

    return MetricResult(
        metric="posture",
        value=posture,
        grain=nf.grain,
        receipt=at_risk_result.receipt,
        suppressed_count=at_risk_result.suppressed_count,
        suppressed_sample=at_risk_result.suppressed_sample,
        suppression_reasons=at_risk_result.suppression_reasons,
        breakdown=[
            {"at_risk_count": at_risk_count, "total_count": total_count, "ratio": ratio}
        ],
    )
