"""GPU Capacity Command Graph data shaping.

Produces the `GpuCommandGraphOut` payload for `/api/vultr/gpu-command-graph`
and supports `/api/vultr/gpu-economics` aggregates. Pure SQL aggregation —
no LLMs, no random fudge.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

from app.db import get_cursor
from app.schemas.vultr import (
    FreshnessReport,
    GpuCommandGraphFilters,
    GpuCommandGraphOut,
    GpuCustomerNode,
    GpuFlow,
    GpuRegionNode,
    GpuSkuNode,
    GpuTimePoint,
    MetricBlock,
    Provenance,
    ReconciliationException,
)
from app.services import (
    vultr_cloud_dataset as ds,
    vultr_cloud_freshness,
    vultr_cloud_metrics as metrics,
)


_ZERO = Decimal("0")
_ONE = Decimal("1")
_HUNDRED = Decimal("100")


def _capacity_risk(util_pct: Decimal | None) -> str:
    if util_pct is None:
        return "low"
    if util_pct >= Decimal("95"):
        return "critical"
    if util_pct >= Decimal("85"):
        return "high"
    if util_pct >= Decimal("70"):
        return "medium"
    return "low"


def build_command_graph(
    env_id: str,
    *,
    period: str = "30D",
    region: str | None = None,
    sku: str | None = None,
    segment: str | None = None,
    metric: str = "utilization",
) -> GpuCommandGraphOut:
    period_start, period_end = ds.period_bounds(period)  # type: ignore[arg-type]
    start_ts_clause = (
        "u.usage_hour >= %(s)s::timestamptz "
        "AND u.usage_hour <  (%(e)s::date + INTERVAL '1 day')"
    )
    params: dict[str, Any] = {"env": env_id, "s": period_start, "e": period_end}

    extra_filters = ""
    if region:
        extra_filters += " AND u.region_key = %(rk)s"
        params["rk"] = region
    if sku:
        extra_filters += " AND u.sku_key = %(sk)s"
        params["sk"] = sku

    # Region rollup
    with get_cursor() as cur:
        cur.execute(
            f"""
            SELECT u.region_key,
                   r.region_name,
                   SUM(u.available_gpu_hours) AS avail,
                   SUM(u.utilized_gpu_hours)  AS util
              FROM fact_cloud_gpu_utilization u
              JOIN dim_cloud_region r
                ON r.env_id = u.env_id AND r.region_key = u.region_key
             WHERE u.env_id = %(env)s
               AND {start_ts_clause}
               {extra_filters}
             GROUP BY u.region_key, r.region_name
             ORDER BY util DESC
            """,
            params,
        )
        region_rows = cur.fetchall()

        cur.execute(
            f"""
            SELECT u.sku_key,
                   sk.gpu_model,
                   SUM(u.utilized_gpu_hours)                              AS util,
                   AVG(u.realized_price_per_hour_usd)                      AS realized,
                   AVG(u.cost_per_hour_usd)                                AS cost
              FROM fact_cloud_gpu_utilization u
              JOIN dim_cloud_sku sk
                ON sk.env_id = u.env_id AND sk.sku_key = u.sku_key
             WHERE u.env_id = %(env)s
               AND {start_ts_clause}
               {extra_filters}
             GROUP BY u.sku_key, sk.gpu_model
             ORDER BY util DESC
            """,
            params,
        )
        sku_rows = cur.fetchall()

        # Customer consumption from resource usage (filtered by segment if requested)
        cust_filter = ""
        if segment:
            cust_filter = " AND c.segment = %(seg)s"
            params["seg"] = segment
        if region:
            extra_cust = " AND uu.region_key = %(rk)s"
        else:
            extra_cust = ""
        if sku:
            extra_cust += " AND uu.sku_key = %(sk)s"
        cur.execute(
            f"""
            SELECT uu.customer_id, c.display_name, c.segment,
                   SUM(uu.usage_quantity) AS hrs
              FROM fact_cloud_resource_usage_hourly uu
              JOIN dim_cloud_customer c
                ON c.env_id = uu.env_id AND c.customer_id = uu.customer_id
             WHERE uu.env_id = %(env)s
               AND uu.usage_hour >= %(s)s::timestamptz
               AND uu.usage_hour <  (%(e)s::date + INTERVAL '1 day')
               {extra_cust}{cust_filter}
             GROUP BY uu.customer_id, c.display_name, c.segment
             ORDER BY hrs DESC
             LIMIT 25
            """,
            params,
        )
        customer_rows = cur.fetchall()

        cur.execute(
            f"""
            SELECT u.usage_hour::date AS d,
                   SUM(u.utilized_gpu_hours)   AS util,
                   SUM(u.available_gpu_hours)  AS avail,
                   AVG(u.realized_price_per_hour_usd - u.cost_per_hour_usd) AS margin
              FROM fact_cloud_gpu_utilization u
             WHERE u.env_id = %(env)s
               AND {start_ts_clause}
               {extra_filters}
             GROUP BY u.usage_hour::date
             ORDER BY d
            """,
            params,
        )
        ts_rows = cur.fetchall()

    # Build region nodes
    regions: list[GpuRegionNode] = []
    total_customer_hours = sum((Decimal(str(r["hrs"] or 0)) for r in customer_rows), start=_ZERO)

    for r in region_rows:
        avail = Decimal(str(r["avail"] or 0))
        util = Decimal(str(r["util"] or 0))
        util_pct = (util / avail * _HUNDRED).quantize(Decimal("0.01")) if avail > 0 else None

        # Capacity exhaustion via metrics service
        forecast_block = metrics.capacity_exhaustion_forecast_days(env_id, r["region_key"])
        forecast_days = (
            int(forecast_block.value) if forecast_block.value is not None else None
        )

        regions.append(
            GpuRegionNode(
                region_key=r["region_key"],
                region_name=r["region_name"],
                available_gpu_hours=avail,
                utilized_gpu_hours=util,
                utilization_pct=util_pct,
                capacity_risk=_capacity_risk(util_pct),  # type: ignore[arg-type]
                exhaustion_forecast_days=forecast_days,
                exhaustion_null_reason=forecast_block.null_reason,
            )
        )

    # Build SKU nodes
    sku_nodes: list[GpuSkuNode] = []
    for row in sku_rows:
        realized = Decimal(str(row["realized"])) if row["realized"] is not None else None
        cost = Decimal(str(row["cost"])) if row["cost"] is not None else None
        margin: Decimal | None = None
        margin_null: str | None = None
        if realized is None or cost is None:
            margin_null = "cost_or_price_unavailable"
        else:
            margin = (realized - cost).quantize(Decimal("0.0001"))
        sku_nodes.append(
            GpuSkuNode(
                sku_key=row["sku_key"],
                gpu_model=row["gpu_model"],
                utilized_gpu_hours=Decimal(str(row["util"] or 0)),
                realized_price_per_hour_usd=realized,
                cost_per_hour_usd=cost,
                gross_margin_per_hour_usd=margin,
                margin_null_reason=margin_null,
            )
        )

    # Build customer nodes
    customer_nodes: list[GpuCustomerNode] = []
    for row in customer_rows:
        hrs = Decimal(str(row["hrs"] or 0))
        conc = (hrs / total_customer_hours * _HUNDRED).quantize(Decimal("0.01")) if total_customer_hours > 0 else None
        customer_nodes.append(
            GpuCustomerNode(
                customer_id=row["customer_id"],
                name=row["display_name"],
                segment=row["segment"],
                consumed_gpu_hours=hrs,
                concentration_pct=conc,
            )
        )

    # Flows: region → sku (utilized hours), then sku → customer (proportional split)
    flows: list[GpuFlow] = []
    region_total = sum((rn.utilized_gpu_hours for rn in regions), start=_ZERO)
    sku_total = sum((sn.utilized_gpu_hours for sn in sku_nodes), start=_ZERO)

    if region_total > 0 and sku_total > 0:
        for rn in regions:
            for sn in sku_nodes:
                share = (rn.utilized_gpu_hours / region_total) * sn.utilized_gpu_hours
                if share > 0:
                    flows.append(
                        GpuFlow.model_validate({
                            "from": rn.region_key,
                            "to": sn.sku_key,
                            "weight": share.quantize(Decimal("0.01")),
                            "metric": "utilized_gpu_hours",
                        })
                    )
        cust_total = sum((cn.consumed_gpu_hours for cn in customer_nodes), start=_ZERO)
        for sn in sku_nodes:
            for cn in customer_nodes:
                if cust_total == 0:
                    break
                share = (sn.utilized_gpu_hours * cn.consumed_gpu_hours) / cust_total
                if share > 0:
                    flows.append(
                        GpuFlow.model_validate({
                            "from": sn.sku_key,
                            "to": cn.customer_id,
                            "weight": share.quantize(Decimal("0.01")),
                            "metric": "utilized_gpu_hours",
                        })
                    )

    # Time series
    time_series: list[GpuTimePoint] = []
    for r in ts_rows:
        avail = Decimal(str(r["avail"] or 0))
        util = Decimal(str(r["util"] or 0))
        util_pct = (util / avail * _HUNDRED).quantize(Decimal("0.01")) if avail > 0 else None
        margin = (
            Decimal(str(r["margin"])).quantize(Decimal("0.0001"))
            if r["margin"] is not None
            else None
        )
        time_series.append(
            GpuTimePoint(
                ts=r["d"],
                utilization_pct=util_pct,
                realized_margin_per_hour_usd=margin,
            )
        )

    # KPIs (period-aware)
    kpis: list[MetricBlock] = [
        metrics.gpu_utilization_pct(env_id, period),  # type: ignore[arg-type]
        metrics.gross_margin_per_gpu_hour(env_id, period),  # type: ignore[arg-type]
    ]
    # Exhaustion KPI for the highest-risk region
    if regions:
        worst = sorted(
            regions,
            key=lambda rn: (rn.utilization_pct or Decimal("0")),
            reverse=True,
        )[0]
        kpis.append(metrics.capacity_exhaustion_forecast_days(env_id, worst.region_key))

    # Recent exceptions
    exc_rows = ds.list_exceptions(env_id, limit=20)
    exceptions = [
        ReconciliationException(
            exception_id=e["exception_id"],
            customer_id=e["customer_id"],
            customer_name=e.get("customer_name"),
            exception_type=e["exception_type"],
            severity=e["severity"],
            period_start=e["period_start"],
            period_end=e["period_end"],
            amount_usd=Decimal(str(e["amount_usd"])),
            detected_at=e.get("detected_at"),
            resolved_at=e.get("resolved_at"),
            notes=e.get("notes"),
        )
        for e in exc_rows
    ]

    freshness = vultr_cloud_freshness.report(env_id)

    return GpuCommandGraphOut(
        env_id=env_id,
        as_of=datetime.now(timezone.utc),
        filters=GpuCommandGraphFilters(
            period=period,  # type: ignore[arg-type]
            region=region,
            sku=sku,
            segment=segment,
            metric=metric,  # type: ignore[arg-type]
        ),
        kpis=kpis,
        regions=regions,
        sku_nodes=sku_nodes,
        customer_nodes=customer_nodes,
        flows=flows,
        time_series=time_series,
        exceptions=exceptions,
        freshness=freshness,
    )
