"""Deterministic metric calculators for the Vultr Cloud Intelligence OS.

No LLMs, no fuzzy logic. Every public function returns a `MetricBlock` with
provenance + status. Missing-input cases return `null` + a `null_reason`
rather than coercing to zero (fail-closed pattern, adapted from the REPE
authoritative-state contract).
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

from app.db import get_cursor
from app.schemas.vultr import MetricBlock, MetricPeriod, Provenance
from app.services import vultr_cloud_dataset as ds


_ZERO = Decimal("0")
_ONE = Decimal("1")
_ONE_HUNDRED = Decimal("100")


def _q(value: Decimal | float | int | None) -> Decimal | None:
    if value is None:
        return None
    return Decimal(str(value))


def _ok(
    *, key: str, label: str, value: Decimal, unit: str, period: MetricPeriod | None,
    provenance: Provenance,
) -> MetricBlock:
    return MetricBlock(
        key=key, label=label, value=value, unit=unit,  # type: ignore[arg-type]
        period=period, status="ok", null_reason=None, provenance=provenance,
    )


def _null(
    *, key: str, label: str, unit: str, period: MetricPeriod | None,
    null_reason: str, provenance: Provenance,
) -> MetricBlock:
    return MetricBlock(
        key=key, label=label, value=None, unit=unit,  # type: ignore[arg-type]
        period=period, status="unavailable",
        null_reason=null_reason, provenance=provenance,
    )


# ─────────────────────────────────────────────────────────────────────────────
# GPU utilization & margin
# ─────────────────────────────────────────────────────────────────────────────

def gpu_utilization_pct(env_id: str, period: MetricPeriod = "30D") -> MetricBlock:
    start, end = ds.period_bounds(period)
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT COALESCE(SUM(utilized_gpu_hours), 0) AS u,
                   COALESCE(SUM(available_gpu_hours), 0) AS a,
                   COUNT(*) AS n
              FROM fact_cloud_gpu_utilization
             WHERE env_id = %s
               AND usage_hour >= %s::timestamptz
               AND usage_hour <  (%s::date + INTERVAL '1 day')
            """,
            (env_id, start, end),
        )
        row = cur.fetchone()
    used = Decimal(str(row["u"] or 0))
    avail = Decimal(str(row["a"] or 0))
    prov = Provenance(
        source="fact_cloud_gpu_utilization",
        source_system="platform_telemetry_demo",
        source_record_count=int(row["n"] or 0),
    )
    if avail == _ZERO:
        return _null(
            key="gpu_utilization_pct", label="GPU Utilization %",
            unit="pct", period=period,
            null_reason="no_capacity_rows_for_period", provenance=prov,
        )
    return _ok(
        key="gpu_utilization_pct", label="GPU Utilization %",
        value=(used / avail * _ONE_HUNDRED).quantize(Decimal("0.01")),
        unit="pct", period=period, provenance=prov,
    )


def gross_margin_per_gpu_hour(env_id: str, period: MetricPeriod = "30D") -> MetricBlock:
    start, end = ds.period_bounds(period)
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT
              SUM(utilized_gpu_hours * realized_price_per_hour_usd) AS rev,
              SUM(utilized_gpu_hours * cost_per_hour_usd)            AS cost,
              SUM(utilized_gpu_hours)                                 AS hrs,
              COUNT(*)                                                AS n
              FROM fact_cloud_gpu_utilization
             WHERE env_id = %s
               AND usage_hour >= %s::timestamptz
               AND usage_hour <  (%s::date + INTERVAL '1 day')
            """,
            (env_id, start, end),
        )
        row = cur.fetchone()
    rev = Decimal(str(row["rev"] or 0))
    cost = Decimal(str(row["cost"] or 0))
    hrs = Decimal(str(row["hrs"] or 0))
    prov = Provenance(
        source="fact_cloud_gpu_utilization",
        source_system="platform_telemetry_demo",
        source_record_count=int(row["n"] or 0),
    )
    if hrs == _ZERO:
        return _null(
            key="gross_margin_per_gpu_hour", label="Gross Margin / GPU-Hour",
            unit="usd_per_hour", period=period,
            null_reason="no_utilized_hours_for_period", provenance=prov,
        )
    return _ok(
        key="gross_margin_per_gpu_hour", label="Gross Margin / GPU-Hour",
        value=((rev - cost) / hrs).quantize(Decimal("0.0001")),
        unit="usd_per_hour", period=period, provenance=prov,
    )


def realized_revenue_usd(env_id: str, period: MetricPeriod = "30D") -> MetricBlock:
    start, end = ds.period_bounds(period)
    amt, n = ds.total_recognized_revenue_usd(env_id, start, end)
    prov = Provenance(
        source="fact_cloud_revenue_recognition",
        source_system="netsuite_demo",
        source_record_count=n,
    )
    if n == 0:
        return _null(
            key="recognized_revenue_usd", label="Recognized Revenue",
            unit="usd", period=period,
            null_reason="no_revrec_rows_for_period", provenance=prov,
        )
    return _ok(
        key="recognized_revenue_usd", label="Recognized Revenue",
        value=amt.quantize(Decimal("0.01")),
        unit="usd", period=period, provenance=prov,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Capacity exhaustion forecast
# ─────────────────────────────────────────────────────────────────────────────

def capacity_exhaustion_forecast_days(env_id: str, region_key: str) -> MetricBlock:
    """Linear regression on trailing 30 days of utilization.

    Returns days until utilized/available >= 95%. Fails closed if <14 days of
    data, if regression slope <= 0, or if region already exhausted.
    """
    today = date.today()
    start = today - timedelta(days=29)
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT capacity_date,
                   SUM(utilized_units)  AS u,
                   SUM(available_units) AS a
              FROM fact_cloud_capacity_daily
             WHERE env_id = %s
               AND region_key = %s
               AND capacity_date BETWEEN %s AND %s
             GROUP BY capacity_date
             ORDER BY capacity_date
            """,
            (env_id, region_key, start, today),
        )
        rows = cur.fetchall()
    prov = Provenance(
        source="fact_cloud_capacity_daily",
        source_system="platform_telemetry_demo",
        source_record_count=len(rows),
    )
    if len(rows) < 14:
        return _null(
            key="capacity_exhaustion_forecast_days",
            label=f"Forecast Exhaustion ({region_key.upper()})",
            unit="days", period="30D",
            null_reason="insufficient_history_under_14_days", provenance=prov,
        )
    pts = [(i, float(r["u"] or 0) / float(r["a"] or 1)) for i, r in enumerate(rows)]
    n = len(pts)
    sx = sum(p[0] for p in pts)
    sy = sum(p[1] for p in pts)
    sxx = sum(p[0] ** 2 for p in pts)
    sxy = sum(p[0] * p[1] for p in pts)
    denom = n * sxx - sx * sx
    if denom == 0:
        return _null(
            key="capacity_exhaustion_forecast_days",
            label=f"Forecast Exhaustion ({region_key.upper()})",
            unit="days", period="30D",
            null_reason="degenerate_regression", provenance=prov,
        )
    slope = (n * sxy - sx * sy) / denom
    intercept = (sy - slope * sx) / n
    last_x = pts[-1][0]
    cur_util = slope * last_x + intercept
    if cur_util >= 0.95:
        return _ok(
            key="capacity_exhaustion_forecast_days",
            label=f"Forecast Exhaustion ({region_key.upper()})",
            value=Decimal("0"), unit="days", period="30D", provenance=prov,
        )
    if slope <= 0:
        return _null(
            key="capacity_exhaustion_forecast_days",
            label=f"Forecast Exhaustion ({region_key.upper()})",
            unit="days", period="30D",
            null_reason="utilization_not_growing", provenance=prov,
        )
    days_to_95 = (0.95 - cur_util) / slope
    return _ok(
        key="capacity_exhaustion_forecast_days",
        label=f"Forecast Exhaustion ({region_key.upper()})",
        value=Decimal(str(round(days_to_95, 0))),
        unit="days", period="30D", provenance=prov,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Churn risk
# ─────────────────────────────────────────────────────────────────────────────

# Component weights documented in §4.4 of docs/plans/vultr-cloud-intelligence-os.md
_CHURN_WEIGHTS = {
    "declining_usage_trend": Decimal("30"),
    "open_unresolved_tickets": Decimal("15"),
    "sla_breach_count_90d": Decimal("15"),
    "payment_delinquency_days": Decimal("15"),
    "days_to_renewal": Decimal("10"),
    "low_activation": Decimal("10"),
    "negative_margin_flag": Decimal("5"),
}


def churn_risk_components(env_id: str, customer_id: str) -> dict[str, Decimal]:
    """Compute each 0-100 component score for a customer.

    Each component returns a normalized 0-100 score; the weighted total is the
    final churn risk. Pure SQL aggregates — no randomness.
    """
    components: dict[str, Decimal] = {k: _ZERO for k in _CHURN_WEIGHTS}
    today = date.today()

    with get_cursor() as cur:
        cur.execute(
            """
            SELECT
              SUM(CASE WHEN snapshot_date >= %(today)s::date - 14 THEN daily_usage_revenue_usd ELSE 0 END) AS recent_rev,
              SUM(CASE WHEN snapshot_date <  %(today)s::date - 14
                        AND snapshot_date >= %(today)s::date - 28 THEN daily_usage_revenue_usd ELSE 0 END) AS prior_rev
              FROM fact_cloud_customer_daily_snapshot
             WHERE env_id = %(e)s AND customer_id = %(c)s
            """,
            {"e": env_id, "c": customer_id, "today": today},
        )
        r = cur.fetchone() or {}
        recent = Decimal(str(r.get("recent_rev") or 0))
        prior = Decimal(str(r.get("prior_rev") or 0))
        if prior > 0 and recent < prior:
            drop = (prior - recent) / prior
            components["declining_usage_trend"] = min(_ONE_HUNDRED, drop * _ONE_HUNDRED)

        cur.execute(
            """
            SELECT COUNT(*) FILTER (WHERE resolved_at IS NULL)               AS open_n,
                   COUNT(*) FILTER (WHERE sla_breached AND opened_at >= now() - INTERVAL '90 days') AS sla_n
              FROM fact_cloud_support_ticket
             WHERE env_id = %s AND customer_id = %s
            """,
            (env_id, customer_id),
        )
        r = cur.fetchone() or {}
        open_n = Decimal(str(r.get("open_n") or 0))
        sla_n = Decimal(str(r.get("sla_n") or 0))
        components["open_unresolved_tickets"] = min(_ONE_HUNDRED, open_n * Decimal("20"))
        components["sla_breach_count_90d"] = min(_ONE_HUNDRED, sla_n * Decimal("25"))

        cur.execute(
            """
            SELECT MIN(issued_at) AS oldest_unpaid
              FROM fact_cloud_invoice
             WHERE env_id = %s AND customer_id = %s AND paid_at IS NULL
            """,
            (env_id, customer_id),
        )
        r = cur.fetchone() or {}
        oldest = r.get("oldest_unpaid")
        if oldest is not None:
            days = (datetime.now(timezone.utc) - oldest).days
            components["payment_delinquency_days"] = min(_ONE_HUNDRED, Decimal(max(0, days)) * Decimal("2"))

        cur.execute(
            """
            SELECT MIN(end_date) AS earliest_end
              FROM dim_cloud_contract
             WHERE env_id = %s AND customer_id = %s AND end_date >= %s
            """,
            (env_id, customer_id, today),
        )
        r = cur.fetchone() or {}
        end = r.get("earliest_end")
        if end is not None:
            d_to_renew = (end - today).days
            if d_to_renew <= 30:
                components["days_to_renewal"] = _ONE_HUNDRED
            elif d_to_renew <= 90:
                components["days_to_renewal"] = Decimal("60")
            elif d_to_renew <= 180:
                components["days_to_renewal"] = Decimal("30")

        cur.execute(
            """
            SELECT MAX(days_to_activation) AS slowest
              FROM fact_cloud_product_activation
             WHERE env_id = %s AND customer_id = %s
            """,
            (env_id, customer_id),
        )
        r = cur.fetchone() or {}
        slowest = r.get("slowest")
        if slowest is not None and slowest >= 14:
            components["low_activation"] = min(_ONE_HUNDRED, Decimal(int(slowest)) * Decimal("4"))

    return components


def churn_risk_score(env_id: str, customer_id: str) -> MetricBlock:
    components = churn_risk_components(env_id, customer_id)
    total = sum(components[k] * w for k, w in _CHURN_WEIGHTS.items()) / _ONE_HUNDRED
    prov = Provenance(
        source="vultr_cloud_metrics.churn_risk_score",
        source_system="derived",
        joined_with=[
            "fact_cloud_customer_daily_snapshot",
            "fact_cloud_support_ticket",
            "fact_cloud_invoice",
            "dim_cloud_contract",
            "fact_cloud_product_activation",
        ],
    )
    return _ok(
        key="churn_risk_score", label="Churn Risk",
        value=total.quantize(Decimal("0.01")),
        unit="pct", period=None, provenance=prov,
    )
