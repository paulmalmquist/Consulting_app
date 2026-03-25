from __future__ import annotations

import hashlib
import json
from datetime import date
from uuid import UUID

from app.db import get_cursor
from app.services import materialization
from app.services.reporting_common import resolve_tenant_id


def list_metric_definitions(*, business_id: UUID) -> dict:
    with get_cursor() as cur:
        tenant_id = resolve_tenant_id(cur, business_id)
        # Ensure canonical default metrics exist for a new tenant.
        materialization.materialize_business_snapshot(business_id=business_id)
        cur.execute(
            """
            SELECT metric_id, key, label, description, unit, aggregation
            FROM metric
            WHERE tenant_id = %s
            ORDER BY key
            """,
            (tenant_id,),
        )
        metrics = cur.fetchall()

    return {
        "metrics": [
            {
                "metric_id": str(m["metric_id"]),
                "key": m["key"],
                "label": m["label"],
                "description": m.get("description"),
                "unit": m.get("unit"),
                "aggregation": m.get("aggregation"),
            }
            for m in metrics
        ],
        "dimensions": [
            {"key": "scope", "label": "Scope", "source": "fact_measurement.dimension_value"},
            {"key": "date", "label": "Date", "source": "fact_measurement.date_key"},
        ],
    }


def _compute_query_hash(payload: dict) -> str:
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode()).hexdigest()


def query_metrics(
    *,
    business_id: UUID,
    metric_keys: list[str],
    dimension: str | None,
    date_from: date | None,
    date_to: date | None,
    refresh: bool,
) -> dict:
    if not metric_keys:
        raise ValueError("At least one metric key is required")

    if refresh:
        materialization.materialize_business_snapshot(business_id=business_id)

    with get_cursor() as cur:
        tenant_id = resolve_tenant_id(cur, business_id)

        cur.execute(
            """
            SELECT metric_id, key, label, unit, aggregation
            FROM metric
            WHERE tenant_id = %s
              AND key = ANY(%s)
            ORDER BY key
            """,
            (tenant_id, metric_keys),
        )
        metric_rows = cur.fetchall()
        if not metric_rows:
            raise LookupError("No matching metric definitions found")

        metric_by_id = {str(r["metric_id"]): r for r in metric_rows}
        metric_ids = [r["metric_id"] for r in metric_rows]

        where_sql = "WHERE fm.tenant_id = %s AND fm.business_id = %s AND fm.metric_id = ANY(%s)"
        params: list[object] = [tenant_id, str(business_id), metric_ids]

        if date_from:
            where_sql += " AND fm.date_key >= %s"
            params.append(int(date_from.strftime("%Y%m%d")))
        if date_to:
            where_sql += " AND fm.date_key <= %s"
            params.append(int(date_to.strftime("%Y%m%d")))

        dimension_select = "NULL::text AS dimension_value"
        dimension_group = ""
        if dimension == "date":
            dimension_select = "fm.date_key::text AS dimension_value"
            dimension_group = ", fm.date_key"
        elif dimension == "scope":
            dimension_select = "COALESCE(fm.dimension_value, 'unknown') AS dimension_value"
            dimension_group = ", fm.dimension_value"

        cur.execute(
            f"""
            SELECT
              fm.metric_id,
              {dimension_select},
              SUM(fm.value)::numeric AS value,
              ARRAY_AGG(fm.fact_measurement_id) AS source_fact_ids
            FROM fact_measurement fm
            {where_sql}
            GROUP BY fm.metric_id{dimension_group}
            ORDER BY fm.metric_id
            """,
            tuple(params),
        )
        rows = cur.fetchall()

    points = []
    for row in rows:
        metric = metric_by_id[str(row["metric_id"])]
        points.append(
            {
                "metric_id": str(metric["metric_id"]),
                "metric_key": metric["key"],
                "metric_label": metric["label"],
                "unit": metric["unit"],
                "aggregation": metric["aggregation"],
                "dimension": dimension,
                "dimension_value": row.get("dimension_value"),
                "value": str(row["value"]),
                "source_fact_ids": [str(v) for v in (row.get("source_fact_ids") or [])],
            }
        )

    query_hash = _compute_query_hash(
        {
            "business_id": str(business_id),
            "metric_keys": sorted(metric_keys),
            "dimension": dimension,
            "date_from": str(date_from) if date_from else None,
            "date_to": str(date_to) if date_to else None,
        }
    )

    return {
        "query_hash": query_hash,
        "points": points,
    }
