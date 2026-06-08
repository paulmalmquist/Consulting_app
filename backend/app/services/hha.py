"""Healthcare Subscription Analytics (hha) — read-only serving layer.

SYNTHETIC / NO-PHI. Serves the exec overview KPI strip and a health probe from the
hha_* gold-rollup tables. Reads are scoped by env_id (globally unique per environment);
`SET LOCAL app.env_id` is issued so RLS WITH CHECK/USING passes even when row-level
security is enforced on the connection, and an explicit `WHERE env_id = %s` guarantees
correct scoping regardless. Money is cast from integer minor units to decimal dollars at
this edge — never earlier.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from app.db import get_cursor
from app.schemas.hha import (
    HhaHealth,
    HhaKpi,
    HhaMetricDefinition,
    HhaOverview,
)

DISCLAIMER = (
    "Synthetic demo data — no real patients and no PHI. Business analytics only: "
    "this environment does not provide medical advice, diagnosis, or treatment."
)

_TABLES = [
    "hha_overview_metrics",
    "hha_plans",
    "hha_funnel_metrics",
    "hha_cohort_metrics",
    "hha_operational_metrics",
]

# One governed definition per metric (the "one definition per metric" contract).
_DEFS: dict[str, HhaMetricDefinition] = {
    "active_members": HhaMetricDefinition(
        key="active_members", label="Active Members",
        formula="count(distinct members with an active paid subscription on as_of_date)",
        grain="as_of_date", owner="Growth", source="hha_overview_metrics"),
    "mrr": HhaMetricDefinition(
        key="mrr", label="MRR",
        formula="sum(active subscription monthly price) on as_of_date",
        grain="as_of_date", owner="Finance", source="hha_overview_metrics.mrr_minor_units"),
    "arr": HhaMetricDefinition(
        key="arr", label="ARR", formula="MRR × 12",
        grain="as_of_date", owner="Finance", source="hha_overview_metrics.arr_minor_units"),
    "new_members_mtd": HhaMetricDefinition(
        key="new_members_mtd", label="New Members (MTD)",
        formula="count(first paid subscription started in current month)",
        grain="month-to-date", owner="Growth", source="hha_overview_metrics"),
    "arpu": HhaMetricDefinition(
        key="arpu", label="ARPU", formula="MRR ÷ active_members",
        grain="as_of_date", owner="Finance", source="hha_overview_metrics.arpu_minor_units"),
    "nrr": HhaMetricDefinition(
        key="nrr", label="Net Revenue Retention",
        formula="(starting MRR + expansion − contraction − churn) ÷ starting MRR, trailing 12m cohort",
        grain="trailing 12m", owner="Finance", source="hha_overview_metrics.nrr_pct"),
    "grr": HhaMetricDefinition(
        key="grr", label="Gross Revenue Retention",
        formula="(starting MRR − contraction − churn) ÷ starting MRR, trailing 12m cohort",
        grain="trailing 12m", owner="Finance", source="hha_overview_metrics.grr_pct"),
    "gross_churn": HhaMetricDefinition(
        key="gross_churn", label="Gross Churn (mo)",
        formula="churned MRR ÷ starting MRR for the month",
        grain="monthly", owner="Retention", source="hha_overview_metrics.gross_churn_pct"),
    "net_churn": HhaMetricDefinition(
        key="net_churn", label="Net Churn (mo)",
        formula="(churned − expansion) MRR ÷ starting MRR; negative = net expansion",
        grain="monthly", owner="Retention", source="hha_overview_metrics.net_churn_pct"),
    "trial_to_paid": HhaMetricDefinition(
        key="trial_to_paid", label="Trial → Paid",
        formula="paid conversions ÷ trial starts in the cohort window",
        grain="cohort", owner="Growth", source="hha_overview_metrics.trial_to_paid_pct"),
    "activation_rate": HhaMetricDefinition(
        key="activation_rate", label="Activation Rate",
        formula="members reaching first activation milestone ÷ new paid members",
        grain="cohort", owner="Onboarding", source="hha_overview_metrics.activation_rate_pct"),
    "month3_retention": HhaMetricDefinition(
        key="month3_retention", label="Month-3 Retention",
        formula="members still active 3 months after signup ÷ cohort size",
        grain="cohort", owner="Retention", source="hha_overview_metrics.month3_retention_pct"),
    "ltv": HhaMetricDefinition(
        key="ltv", label="LTV",
        formula="ARPU × gross margin ÷ monthly logo churn (blended)",
        grain="blended", owner="Finance", source="hha_overview_metrics.ltv_minor_units"),
    "blended_cac": HhaMetricDefinition(
        key="blended_cac", label="Blended CAC",
        formula="total acquisition spend ÷ new paid members (all channels)",
        grain="monthly", owner="Growth", source="hha_overview_metrics.blended_cac_minor_units"),
    "ltv_cac": HhaMetricDefinition(
        key="ltv_cac", label="LTV : CAC", formula="LTV ÷ blended CAC",
        grain="blended", owner="Finance", source="hha_overview_metrics.ltv_cac_ratio"),
    "payback_months": HhaMetricDefinition(
        key="payback_months", label="CAC Payback",
        formula="blended CAC ÷ (ARPU × gross margin), in months",
        grain="blended", owner="Finance", source="hha_overview_metrics.payback_months"),
    "lab_sla": HhaMetricDefinition(
        key="lab_sla", label="Lab SLA",
        formula="lab orders completed within target turnaround ÷ total lab orders",
        grain="as_of_date", owner="Care Ops", source="hha_overview_metrics.lab_sla_pct"),
    "consult_sla": HhaMetricDefinition(
        key="consult_sla", label="Consult SLA",
        formula="consults completed within target window ÷ scheduled consults",
        grain="as_of_date", owner="Care Ops", source="hha_overview_metrics.consult_sla_pct"),
}


def _dollars(minor: Any) -> float | None:
    if minor is None:
        return None
    return round(int(minor) / 100.0, 2)


def _num(v: Any) -> float | None:
    if v is None:
        return None
    if isinstance(v, Decimal):
        return float(v)
    return float(v)


def _kpi(key: str, value: float | int | None, unit: str, fmt: str) -> HhaKpi:
    return HhaKpi(key=key, label=_DEFS[key].label, value=value, unit=unit, fmt=fmt,
                  definition=_DEFS[key])


def _iso(v: Any) -> str | None:
    if v is None:
        return None
    return v.isoformat() if hasattr(v, "isoformat") else str(v)


def get_overview(env_id: str) -> HhaOverview:
    """Exec KPI strip for the environment's latest as-of row."""
    with get_cursor() as cur:
        cur.execute("SELECT set_config('app.env_id', %s, true)", (env_id,))
        cur.execute(
            """
            SELECT * FROM hha_overview_metrics
             WHERE env_id = %s
             ORDER BY as_of_date DESC
             LIMIT 1
            """,
            (env_id,),
        )
        row = cur.fetchone()

    if not row:
        return HhaOverview(
            env_id=env_id, as_of_date=None, source_freshness_at=None,
            provenance_label=None, disclaimer=DISCLAIMER, kpis=[],
        )

    r = dict(row)
    kpis = [
        _kpi("active_members", r.get("active_members"), "count", "count"),
        _kpi("mrr", _dollars(r.get("mrr_minor_units")), "usd", "currency"),
        _kpi("arr", _dollars(r.get("arr_minor_units")), "usd", "currency"),
        _kpi("new_members_mtd", r.get("new_members_mtd"), "count", "count"),
        _kpi("arpu", _dollars(r.get("arpu_minor_units")), "usd", "currency"),
        _kpi("nrr", _num(r.get("nrr_pct")), "fraction", "percent"),
        _kpi("grr", _num(r.get("grr_pct")), "fraction", "percent"),
        _kpi("gross_churn", _num(r.get("gross_churn_pct")), "fraction", "percent"),
        _kpi("net_churn", _num(r.get("net_churn_pct")), "fraction", "percent"),
        _kpi("trial_to_paid", _num(r.get("trial_to_paid_pct")), "fraction", "percent"),
        _kpi("activation_rate", _num(r.get("activation_rate_pct")), "fraction", "percent"),
        _kpi("month3_retention", _num(r.get("month3_retention_pct")), "fraction", "percent"),
        _kpi("ltv", _dollars(r.get("ltv_minor_units")), "usd", "currency"),
        _kpi("blended_cac", _dollars(r.get("blended_cac_minor_units")), "usd", "currency"),
        _kpi("ltv_cac", _num(r.get("ltv_cac_ratio")), "ratio", "ratio"),
        _kpi("payback_months", _num(r.get("payback_months")), "months", "months"),
        _kpi("lab_sla", _num(r.get("lab_sla_pct")), "fraction", "percent"),
        _kpi("consult_sla", _num(r.get("consult_sla_pct")), "fraction", "percent"),
    ]

    return HhaOverview(
        env_id=env_id,
        as_of_date=_iso(r.get("as_of_date")),
        source_freshness_at=_iso(r.get("source_freshness_at")),
        provenance_label=r.get("provenance_label"),
        disclaimer=DISCLAIMER,
        kpis=kpis,
    )


def get_health(env_id: str) -> HhaHealth:
    """Liveness + row counts for the env's hha_ serving tables."""
    counts: dict[str, int] = {}
    freshness = None
    provenance = None
    with get_cursor() as cur:
        cur.execute("SELECT set_config('app.env_id', %s, true)", (env_id,))
        for table in _TABLES:
            # table names come from a fixed allowlist above — safe to inline.
            cur.execute(
                f"SELECT count(*) AS n FROM {table} WHERE env_id = %s", (env_id,)
            )
            counts[table] = int((cur.fetchone() or {}).get("n", 0))
        cur.execute(
            """
            SELECT source_freshness_at, provenance_label
              FROM hha_overview_metrics
             WHERE env_id = %s
             ORDER BY as_of_date DESC LIMIT 1
            """,
            (env_id,),
        )
        meta = cur.fetchone()
        if meta:
            freshness = _iso(meta.get("source_freshness_at"))
            provenance = meta.get("provenance_label")

    ok = counts.get("hha_overview_metrics", 0) > 0
    return HhaHealth(
        ok=ok, env_id=env_id, row_counts=counts,
        source_freshness_at=freshness, provenance_label=provenance,
    )
