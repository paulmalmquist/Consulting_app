"""FastAPI routes for the Vultr Cloud Intelligence OS surface.

All endpoints are env-scoped via a required `env_id` query param and return a
`VultrEnvelope`-shaped payload (or a typed sub-shape for graph/bridge endpoints).
The service layer holds all business logic; this module is wiring + DTO mapping.
"""
from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from typing import Any
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, Request

from app.routes.domain_common import classify_domain_error, domain_error_response
from app.schemas.vultr import (
    CustomerDetailOut,
    CustomerSummary,
    GpuCommandGraphOut,
    IncidentOut,
    MetricBlock,
    MetricDefinition,
    PipelineOpportunity,
    ReconciliationException,
    SupportTicketOut,
    VultrContextOut,
    VultrEnvelope,
)
from app.services import env_context
from app.services import (
    vultr_cloud_dataset as ds,
    vultr_cloud_freshness,
    vultr_cloud_gpu_economics,
    vultr_cloud_metrics as metrics,
    vultr_cloud_reconciliation as recon,
)


router = APIRouter(prefix="/api/vultr", tags=["vultr-cloud-intelligence-os"])


@router.get("/context", response_model=VultrContextOut)
def get_context(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
):
    """Resolve env + business context for the Vultr workspace shell."""
    try:
        ctx = env_context.resolve_env_business_context(
            request=request,
            env_id=env_id,
            business_id=str(business_id) if business_id else None,
            allow_create=True,
            create_slug_prefix="cloud_infra",
        )
        return VultrContextOut(
            env_id=UUID(ctx.env_id),
            business_id=UUID(ctx.business_id),
            created=ctx.created,
            source=ctx.source,
            diagnostics=ctx.diagnostics,
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request, status_code=status, code=code,
            detail=str(exc), action="vultr.context.failed",
        )


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _exc(row: dict[str, Any]) -> ReconciliationException:
    return ReconciliationException(
        exception_id=row["exception_id"],
        customer_id=row["customer_id"],
        customer_name=row.get("customer_name"),
        exception_type=row["exception_type"],
        severity=row["severity"],
        period_start=row["period_start"],
        period_end=row["period_end"],
        amount_usd=Decimal(str(row["amount_usd"])),
        detected_at=row.get("detected_at"),
        resolved_at=row.get("resolved_at"),
        notes=row.get("notes"),
    )


# ─────────────────────────────────────────────────────────────────────────────
# Summary + executive
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/summary", response_model=VultrEnvelope)
def get_summary(env_id: str = Query(...)):
    freshness = vultr_cloud_freshness.report(env_id)
    blocks = [
        metrics.gpu_utilization_pct(env_id, "30D"),
        metrics.gross_margin_per_gpu_hour(env_id, "30D"),
        metrics.realized_revenue_usd(env_id, "30D"),
    ]
    return VultrEnvelope(
        env_id=env_id, as_of=_now(), freshness=freshness,
        metric_blocks=blocks,
        data={"period": "30D"},
    )


@router.get("/executive", response_model=VultrEnvelope)
def get_executive(env_id: str = Query(...), period: str = Query("30D")):
    freshness = vultr_cloud_freshness.report(env_id)
    blocks: list[MetricBlock] = [
        metrics.gpu_utilization_pct(env_id, period),  # type: ignore[arg-type]
        metrics.gross_margin_per_gpu_hour(env_id, period),  # type: ignore[arg-type]
        metrics.realized_revenue_usd(env_id, period),  # type: ignore[arg-type]
    ]
    # Bridge defaults to the current calendar month (MTD) so live exceptions —
    # which are stamped against the latest seeded period — show up in the
    # executive view. Use /reconciliation for prior-period drill-down.
    from datetime import date as _date
    today = _date.today()
    bridge_start = today.replace(day=1)
    bridge_end = today
    bridge = recon.build_bridge(env_id, bridge_start, bridge_end)
    excs = [_exc(r) for r in ds.list_exceptions(env_id, limit=20)]
    return VultrEnvelope(
        env_id=env_id, as_of=_now(), freshness=freshness,
        metric_blocks=blocks,
        data={
            "period": period,
            "bridge": bridge.model_dump(mode="json"),
        },
        exceptions=excs,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Reconciliation
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/reconciliation", response_model=VultrEnvelope)
def get_reconciliation(
    env_id: str = Query(...),
    customer_id: str | None = Query(default=None),
    exception_type: str | None = Query(default=None),
    limit: int = Query(default=200, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
):
    freshness = vultr_cloud_freshness.report(env_id)
    from datetime import date as _date
    today = _date.today()
    period_start = today.replace(day=1)
    period_end = today
    bridge = recon.build_bridge(env_id, period_start, period_end)
    excs = [
        _exc(r)
        for r in ds.list_exceptions(
            env_id,
            customer_id=customer_id,
            exception_type=exception_type,
            limit=limit,
            offset=offset,
        )
    ]
    return VultrEnvelope(
        env_id=env_id, as_of=_now(), freshness=freshness,
        data={"bridge": bridge.model_dump(mode="json")},
        exceptions=excs,
    )


@router.get("/reconciliation/{exception_id}", response_model=VultrEnvelope)
def get_reconciliation_detail(exception_id: str, env_id: str = Query(...)):
    row = ds.get_exception(env_id, exception_id)
    if row is None:
        raise HTTPException(status_code=404, detail="exception not found")
    freshness = vultr_cloud_freshness.report(env_id)
    period_start, period_end = row["period_start"], row["period_end"]
    bridge = recon.build_bridge(env_id, period_start, period_end)
    return VultrEnvelope(
        env_id=env_id, as_of=_now(), freshness=freshness,
        data={"exception": _exc(row).model_dump(mode="json"),
              "bridge": bridge.model_dump(mode="json")},
        exceptions=[_exc(row)],
    )


# ─────────────────────────────────────────────────────────────────────────────
# GPU economics + flagship graph
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/gpu-economics", response_model=VultrEnvelope)
def get_gpu_economics(env_id: str = Query(...), period: str = Query("30D")):
    freshness = vultr_cloud_freshness.report(env_id)
    graph = vultr_cloud_gpu_economics.build_command_graph(env_id, period=period)
    return VultrEnvelope(
        env_id=env_id, as_of=_now(), freshness=freshness,
        metric_blocks=graph.kpis,
        data={
            "regions": [r.model_dump(mode="json") for r in graph.regions],
            "sku_nodes": [s.model_dump(mode="json") for s in graph.sku_nodes],
            "customer_nodes": [c.model_dump(mode="json") for c in graph.customer_nodes],
            "time_series": [t.model_dump(mode="json") for t in graph.time_series],
        },
    )


@router.get("/gpu-command-graph", response_model=GpuCommandGraphOut)
def get_gpu_command_graph(
    env_id: str = Query(...),
    period: str = Query("30D"),
    region: str | None = Query(default=None),
    sku: str | None = Query(default=None),
    segment: str | None = Query(default=None),
    metric: str = Query(default="utilization"),
):
    return vultr_cloud_gpu_economics.build_command_graph(
        env_id,
        period=period, region=region, sku=sku, segment=segment, metric=metric,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Customers
# ─────────────────────────────────────────────────────────────────────────────

def _customer_summary(env_id: str, row: dict[str, Any]) -> CustomerSummary:
    snaps = ds.get_customer_daily_snapshots(env_id, row["customer_id"], days=30)
    mtd_usage = sum((Decimal(str(s["daily_usage_revenue_usd"] or 0)) for s in snaps), start=Decimal("0"))
    mtd_recog = sum((Decimal(str(s["daily_recognized_revenue_usd"] or 0)) for s in snaps), start=Decimal("0"))
    last = snaps[0] if snaps else None
    risk = row.get("risk_flags") or []
    if isinstance(risk, str):
        # JSON column already deserialized by psycopg, but defensive
        import json
        try:
            risk = json.loads(risk)
        except Exception:
            risk = []
    return CustomerSummary(
        customer_id=row["customer_id"],
        display_name=row["display_name"],
        segment=row.get("segment"),
        contract_type=row.get("contract_type"),
        account_status=row.get("account_status"),
        support_tier=row.get("support_tier"),
        signup_date=row.get("signup_date"),
        country=row.get("country"),
        salesforce_owner_id=row.get("salesforce_owner_id"),
        risk_flags=list(risk),
        mtd_usage_revenue_usd=mtd_usage if mtd_usage > 0 else None,
        mtd_recognized_revenue_usd=mtd_recog if mtd_recog > 0 else None,
        outstanding_ar_usd=(
            Decimal(str(last["outstanding_ar_usd"])) if last and last.get("outstanding_ar_usd") is not None else None
        ),
        open_tickets=int(last["support_tickets_open"]) if last and last.get("support_tickets_open") is not None else 0,
        churn_risk_score=(
            Decimal(str(last["churn_risk_score"])) if last and last.get("churn_risk_score") is not None else None
        ),
    )


@router.get("/customers", response_model=VultrEnvelope)
def list_customers(
    env_id: str = Query(...),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
):
    freshness = vultr_cloud_freshness.report(env_id)
    rows = ds.list_customers(env_id, limit=limit, offset=offset)
    customers = [_customer_summary(env_id, r).model_dump(mode="json") for r in rows]
    return VultrEnvelope(
        env_id=env_id, as_of=_now(), freshness=freshness,
        data={"customers": customers, "limit": limit, "offset": offset},
    )


@router.get("/customers/{customer_id}", response_model=CustomerDetailOut)
def get_customer_detail(customer_id: str, env_id: str = Query(...)):
    row = ds.get_customer(env_id, customer_id)
    if row is None:
        raise HTTPException(status_code=404, detail="customer not found")

    summary = _customer_summary(env_id, row)
    contract = ds.get_customer_contract(env_id, customer_id)
    snaps = ds.get_customer_daily_snapshots(env_id, customer_id, days=60)
    invoices = ds.get_customer_invoices(env_id, customer_id, limit=12)
    payments = ds.get_customer_payments(env_id, customer_id, limit=12)
    open_excs = [_exc(r) for r in ds.list_exceptions(env_id, customer_id=customer_id, limit=20)]

    return CustomerDetailOut(
        customer=summary,
        contract=contract,
        daily_snapshots=[dict(s) for s in snaps],
        recent_invoices=[dict(i) for i in invoices],
        recent_payments=[dict(p) for p in payments],
        open_exceptions=open_excs,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Sales
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/sales", response_model=VultrEnvelope)
def get_sales(env_id: str = Query(...)):
    freshness = vultr_cloud_freshness.report(env_id)
    rows = ds.list_pipeline(env_id)
    opps = [
        PipelineOpportunity(
            opportunity_id=r["opportunity_id"],
            customer_id=r["customer_id"],
            customer_name=r.get("customer_name"),
            rep_key=r.get("rep_key"),
            stage=r["stage"],
            amount_usd=Decimal(str(r["amount_usd"])),
            close_probability=int(r["close_probability"]),
            expected_close_date=r.get("expected_close_date"),
            committed_capacity_usd=(
                Decimal(str(r["committed_capacity_usd"]))
                if r.get("committed_capacity_usd") is not None else None
            ),
            lost_reason=r.get("lost_reason"),
        ).model_dump(mode="json")
        for r in rows
    ]
    by_stage: dict[str, dict[str, Any]] = {}
    for r in rows:
        s = r["stage"]
        bucket = by_stage.setdefault(s, {"stage": s, "count": 0, "amount_usd": Decimal("0")})
        bucket["count"] += 1
        bucket["amount_usd"] += Decimal(str(r["amount_usd"]))
    funnel = [
        {"stage": v["stage"], "count": v["count"], "amount_usd": str(v["amount_usd"])}
        for v in by_stage.values()
    ]
    return VultrEnvelope(
        env_id=env_id, as_of=_now(), freshness=freshness,
        data={"opportunities": opps, "funnel": funnel},
    )


# ─────────────────────────────────────────────────────────────────────────────
# Operations
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/operations", response_model=VultrEnvelope)
def get_operations(env_id: str = Query(...)):
    freshness = vultr_cloud_freshness.report(env_id)
    tickets = ds.list_recent_tickets(env_id, days=30, limit=200)
    incidents = ds.list_incidents(env_id, days=90)
    ticket_payload = [
        SupportTicketOut(
            ticket_id=t["ticket_id"],
            customer_id=t["customer_id"],
            category_key=t["category_key"],
            opened_at=t["opened_at"],
            resolved_at=t.get("resolved_at"),
            severity=t["severity"],
            sla_breached=bool(t["sla_breached"]),
            region_key=t.get("region_key"),
            sku_key=t.get("sku_key"),
            customer_satisfaction=(
                Decimal(str(t["customer_satisfaction"]))
                if t.get("customer_satisfaction") is not None else None
            ),
        ).model_dump(mode="json")
        for t in tickets
    ]
    incident_payload = [
        IncidentOut(
            incident_id=i["incident_id"],
            region_key=i["region_key"],
            sku_key=i.get("sku_key"),
            started_at=i["started_at"],
            resolved_at=i.get("resolved_at"),
            severity=i["severity"],
            customers_impacted=int(i["customers_impacted"]),
            root_cause=i.get("root_cause"),
        ).model_dump(mode="json")
        for i in incidents
    ]
    open_tickets = sum(1 for t in tickets if t.get("resolved_at") is None)
    sla_breaches_30d = sum(1 for t in tickets if t.get("sla_breached"))
    return VultrEnvelope(
        env_id=env_id, as_of=_now(), freshness=freshness,
        data={
            "tickets": ticket_payload,
            "incidents": incident_payload,
            "open_tickets": open_tickets,
            "sla_breaches_30d": sla_breaches_30d,
        },
    )


# ─────────────────────────────────────────────────────────────────────────────
# Data model + quality
# ─────────────────────────────────────────────────────────────────────────────

_METRIC_CATALOG: list[MetricDefinition] = [
    MetricDefinition(
        key="gpu_utilization_pct",
        label="GPU Utilization %",
        formula="SUM(utilized_gpu_hours) / SUM(available_gpu_hours) * 100",
        primary_source="fact_cloud_gpu_utilization",
        joined_with=[],
        null_rules=["null when SUM(available_gpu_hours) = 0"],
        refresh_cadence="hourly (demo: frozen at apply)",
    ),
    MetricDefinition(
        key="gross_margin_per_gpu_hour",
        label="Gross Margin / GPU-Hour",
        formula="(SUM(realized_price * utilized_hours) - SUM(cost * utilized_hours)) / SUM(utilized_hours)",
        primary_source="fact_cloud_gpu_utilization",
        joined_with=[],
        null_rules=["null when SUM(utilized_hours) = 0"],
        refresh_cadence="hourly (demo: frozen at apply)",
    ),
    MetricDefinition(
        key="recognized_revenue_usd",
        label="Recognized Revenue",
        formula="SUM(recognized_revenue_usd) where period_month in window",
        primary_source="fact_cloud_revenue_recognition",
        joined_with=[],
        null_rules=["null when no revrec rows in window"],
        refresh_cadence="monthly (demo: frozen at apply)",
    ),
    MetricDefinition(
        key="capacity_exhaustion_forecast_days",
        label="Forecast Exhaustion Days",
        formula="linear regression on 30d daily utilization → days until >=95%",
        primary_source="fact_cloud_capacity_daily",
        joined_with=[],
        null_rules=[
            "null when <14 days of history",
            "null when slope <= 0 (utilization not growing)",
            "null when degenerate regression",
        ],
        refresh_cadence="daily (demo: frozen at apply)",
    ),
    MetricDefinition(
        key="churn_risk_score",
        label="Churn Risk",
        formula=(
            "weighted: declining_usage(30%) + open_tickets(15%) + sla_breach_90d(15%) "
            "+ payment_delinquency(15%) + days_to_renewal(10%) + low_activation(10%) "
            "+ negative_margin(5%)"
        ),
        primary_source="vultr_cloud_metrics.churn_risk_score (derived)",
        joined_with=[
            "fact_cloud_customer_daily_snapshot",
            "fact_cloud_support_ticket",
            "fact_cloud_invoice",
            "dim_cloud_contract",
            "fact_cloud_product_activation",
        ],
        null_rules=["each component is independently null-safe; weighted sum"],
        refresh_cadence="on-demand",
    ),
]


@router.get("/data-model", response_model=VultrEnvelope)
def get_data_model(env_id: str = Query(...)):
    freshness = vultr_cloud_freshness.report(env_id)
    return VultrEnvelope(
        env_id=env_id, as_of=_now(), freshness=freshness,
        data={
            "metric_definitions": [m.model_dump(mode="json") for m in _METRIC_CATALOG],
            "regions": ds.list_regions(env_id),
            "skus": ds.list_skus(env_id),
            "products": ds.list_products(env_id),
        },
    )


@router.get("/quality", response_model=VultrEnvelope)
def get_quality(env_id: str = Query(...)):
    """Run a small suite of structural data-quality checks."""
    freshness = vultr_cloud_freshness.report(env_id)
    from app.db import get_cursor

    checks: list[dict[str, Any]] = []

    def _add(name: str, ok: bool, detail: str = ""):
        checks.append({"name": name, "ok": ok, "detail": detail})

    with get_cursor() as cur:
        # Orphan customers in usage
        cur.execute(
            """
            SELECT COUNT(*) AS n FROM fact_cloud_resource_usage_hourly u
             WHERE u.env_id = %s
               AND NOT EXISTS (
                 SELECT 1 FROM dim_cloud_customer c
                  WHERE c.env_id = u.env_id AND c.customer_id = u.customer_id
               )
            """,
            (env_id,),
        )
        n = (cur.fetchone() or {}).get("n", 0)
        _add("usage_customer_join", n == 0, f"{n} orphans")

        cur.execute(
            """
            SELECT COUNT(*) AS n FROM fact_cloud_invoice i
             WHERE i.env_id = %s AND i.invoice_amount_usd <= 0
            """,
            (env_id,),
        )
        n = (cur.fetchone() or {}).get("n", 0)
        _add("invoice_amount_positive", n == 0, f"{n} non-positive invoices")

        cur.execute(
            """
            SELECT COUNT(*) AS n FROM fact_cloud_gpu_utilization
             WHERE env_id = %s AND utilized_gpu_hours > available_gpu_hours
            """,
            (env_id,),
        )
        n = (cur.fetchone() or {}).get("n", 0)
        _add("util_lte_available", n == 0, f"{n} over-utilized rows")

        cur.execute(
            """
            SELECT COUNT(DISTINCT exception_type) AS n
              FROM fact_cloud_reconciliation_exception
             WHERE env_id = %s
            """,
            (env_id,),
        )
        n = (cur.fetchone() or {}).get("n", 0)
        _add("reconciliation_exception_coverage", n >= 4,
             f"{n} distinct exception types observed (expect >=4)")

    overall_ok = all(c["ok"] for c in checks)
    return VultrEnvelope(
        env_id=env_id, as_of=_now(), freshness=freshness,
        data={"checks": checks, "overall_ok": overall_ok},
    )
