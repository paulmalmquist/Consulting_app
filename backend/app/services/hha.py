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
    HhaCohortCell,
    HhaCohorts,
    HhaFunnel,
    HhaFunnelChannel,
    HhaFunnelStage,
    HhaHealth,
    HhaKpi,
    HhaMaskedCohort,
    HhaMetricDefinition,
    HhaOperations,
    HhaOperationsDomain,
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
    "funnel_conversion": HhaMetricDefinition(
        key="funnel_conversion", label="Stage Conversion",
        formula="converted_count / entered_count for the lifecycle stage and acquisition channel",
        grain="as_of_date x stage x channel", owner="Growth",
        source="hha_funnel_metrics.conversion_pct"),
    "channel_cac": HhaMetricDefinition(
        key="channel_cac", label="Channel CAC",
        formula="acquisition spend / new paid subscribers for the acquisition channel",
        grain="as_of_date x channel", owner="Growth",
        source="hha_funnel_metrics.cac_minor_units"),
    "cohort_retention": HhaMetricDefinition(
        key="cohort_retention", label="Cohort Retention",
        formula="retained_count / locked cohort_size at months_since_signup",
        grain="signup_cohort_month x months_since_signup", owner="Retention",
        source="hha_cohort_metrics.retention_pct"),
    "cohort_ltv": HhaMetricDefinition(
        key="cohort_ltv", label="Cohort LTV",
        formula="cumulative subscription revenue / locked cohort_size at the observed tenure",
        grain="signup_cohort_month x months_since_signup", owner="Finance",
        source="hha_cohort_metrics.ltv_minor_units"),
    "ops_turnaround": HhaMetricDefinition(
        key="ops_turnaround", label="SLA Turnaround",
        formula="median and 90th-percentile elapsed hours for the operations domain",
        grain="as_of_date x ops_domain", owner="Care Ops",
        source="hha_operational_metrics.sla_actual_p50_hours,sla_actual_p90_hours"),
    "ops_breach": HhaMetricDefinition(
        key="ops_breach", label="SLA Breach Rate",
        formula="volume breaching the domain SLA target / total domain volume",
        grain="as_of_date x ops_domain", owner="Care Ops",
        source="hha_operational_metrics.sla_breach_pct"),
    "ops_backlog": HhaMetricDefinition(
        key="ops_backlog", label="Operations Backlog",
        formula="open items awaiting completion in the operations domain",
        grain="as_of_date x ops_domain", owner="Care Ops",
        source="hha_operational_metrics.backlog_count"),
}

_FUNNEL_CHANNELS = ["paid_search", "organic", "referral"]
_OPS_DOMAINS = ["labs", "consults", "fulfillment", "support"]
_MASKED_REASON = "< 11 members - suppressed"
_LTV_CAC_GAP = (
    "Channel-specific LTV is not seeded; only blended LTV and channel CAC are available."
)


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


def _surface_meta(cur: Any, env_id: str) -> dict[str, Any]:
    cur.execute(
        """
        SELECT as_of_date, source_freshness_at, provenance_label
          FROM hha_overview_metrics
         WHERE env_id = %s
         ORDER BY as_of_date DESC
         LIMIT 1
        """,
        (env_id,),
    )
    return dict(cur.fetchone() or {})


def _surface_fields(env_id: str, meta: dict[str, Any]) -> dict[str, Any]:
    return {
        "env_id": env_id,
        "as_of_date": _iso(meta.get("as_of_date")),
        "source_freshness_at": _iso(meta.get("source_freshness_at")),
        "provenance_label": meta.get("provenance_label"),
        "disclaimer": DISCLAIMER,
    }


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


def _funnel_stage(row: dict[str, Any]) -> HhaFunnelStage:
    return HhaFunnelStage(
        stage_key=str(row.get("stage_key")),
        stage_label=str(row.get("stage_label")),
        stage_order=int(row.get("stage_order")),
        entered_count=row.get("entered_count"),
        converted_count=row.get("converted_count"),
        conversion_pct=_num(row.get("conversion_pct")),
    )


def get_funnel(env_id: str) -> HhaFunnel:
    """Latest blended and per-channel acquisition funnel."""
    with get_cursor() as cur:
        cur.execute("SELECT set_config('app.env_id', %s, true)", (env_id,))
        meta = _surface_meta(cur, env_id)
        cur.execute(
            """
            SELECT as_of_date, stage_key, stage_label, stage_order,
                   acquisition_channel, entered_count, converted_count,
                   conversion_pct, cac_minor_units
              FROM hha_funnel_metrics
             WHERE env_id = %s
               AND as_of_date = (
                    SELECT max(as_of_date)
                      FROM hha_funnel_metrics
                     WHERE env_id = %s
               )
             ORDER BY stage_order, acquisition_channel
            """,
            (env_id, env_id),
        )
        rows = [dict(row) for row in cur.fetchall()]

    blended_rows = sorted(
        (row for row in rows if row.get("acquisition_channel") == "all"),
        key=lambda row: int(row.get("stage_order", 0)),
    )
    channels: list[HhaFunnelChannel] = []
    for channel in _FUNNEL_CHANNELS:
        channel_rows = sorted(
            (row for row in rows if row.get("acquisition_channel") == channel),
            key=lambda row: int(row.get("stage_order", 0)),
        )
        cac_minor = next(
            (
                row.get("cac_minor_units")
                for row in channel_rows
                if row.get("cac_minor_units") is not None
            ),
            None,
        )
        channels.append(HhaFunnelChannel(
            channel=channel,
            cac_dollars=_dollars(cac_minor),
            stages=[_funnel_stage(row) for row in channel_rows],
        ))

    fields = _surface_fields(env_id, meta)
    if rows:
        fields["as_of_date"] = _iso(rows[0].get("as_of_date"))
    return HhaFunnel(
        **fields,
        definitions=[_DEFS["funnel_conversion"], _DEFS["channel_cac"]],
        blended_stages=[_funnel_stage(row) for row in blended_rows],
        channels=channels,
    )


def get_cohorts(env_id: str) -> HhaCohorts:
    """Retention triangle plus non-disclosing masked cohort markers."""
    with get_cursor() as cur:
        cur.execute("SELECT set_config('app.env_id', %s, true)", (env_id,))
        meta = _surface_meta(cur, env_id)
        cur.execute(
            """
            SELECT signup_cohort_month, months_since_signup, cohort_size,
                   retained_count, retention_pct, ltv_minor_units
              FROM hha_cohort_metrics
             WHERE env_id = %s
               AND acquisition_channel = 'all'
               AND is_suppressed = false
             ORDER BY signup_cohort_month, months_since_signup
            """,
            (env_id,),
        )
        visible_rows = [dict(row) for row in cur.fetchall()]

        # Select no protected measures for suppressed segments.
        cur.execute(
            """
            SELECT signup_cohort_month, acquisition_channel
              FROM hha_cohort_metrics
             WHERE env_id = %s
               AND acquisition_channel = 'womens_pilot'
               AND is_suppressed = true
             ORDER BY signup_cohort_month
            """,
            (env_id,),
        )
        masked_rows = [dict(row) for row in cur.fetchall()]

    cells = [
        HhaCohortCell(
            signup_cohort_month=_iso(row.get("signup_cohort_month")) or "",
            months_since_signup=int(row.get("months_since_signup")),
            cohort_size=int(row.get("cohort_size")),
            retained_count=row.get("retained_count"),
            retention_pct=_num(row.get("retention_pct")),
            ltv_dollars=_dollars(row.get("ltv_minor_units")),
        )
        for row in visible_rows
    ]
    masked = [
        HhaMaskedCohort(
            signup_cohort_month=_iso(row.get("signup_cohort_month")) or "",
            channel=str(row.get("acquisition_channel")),
            reason=_MASKED_REASON,
        )
        for row in masked_rows
    ]
    return HhaCohorts(
        **_surface_fields(env_id, meta),
        definitions=[_DEFS["cohort_retention"], _DEFS["cohort_ltv"]],
        cells=cells,
        masked_cohorts=masked,
        ltv_cac_by_channel=[],
        ltv_cac_unavailable_reason=_LTV_CAC_GAP,
    )


def get_operations(env_id: str) -> HhaOperations:
    """Latest care-operations SLA metrics in a fixed domain order."""
    with get_cursor() as cur:
        cur.execute("SELECT set_config('app.env_id', %s, true)", (env_id,))
        meta = _surface_meta(cur, env_id)
        cur.execute(
            """
            SELECT as_of_date, ops_domain, metric_label, volume,
                   sla_target_hours, sla_actual_p50_hours, sla_actual_p90_hours,
                   sla_breach_pct, backlog_count
              FROM hha_operational_metrics
             WHERE env_id = %s
               AND as_of_date = (
                    SELECT max(as_of_date)
                      FROM hha_operational_metrics
                     WHERE env_id = %s
               )
            """,
            (env_id, env_id),
        )
        rows = [dict(row) for row in cur.fetchall()]

    rows_by_domain = {str(row.get("ops_domain")): row for row in rows}
    domains: list[HhaOperationsDomain] = []
    for ops_domain in _OPS_DOMAINS:
        row = rows_by_domain.get(ops_domain, {})
        target = _num(row.get("sla_target_hours"))
        p90 = _num(row.get("sla_actual_p90_hours"))
        over_sla = None if target is None or p90 is None else p90 > target
        domains.append(HhaOperationsDomain(
            ops_domain=ops_domain,
            metric_label=row.get("metric_label"),
            volume=row.get("volume"),
            sla_target_hours=target,
            sla_actual_p50_hours=_num(row.get("sla_actual_p50_hours")),
            sla_actual_p90_hours=p90,
            sla_breach_pct=_num(row.get("sla_breach_pct")),
            backlog_count=row.get("backlog_count"),
            over_sla=over_sla,
        ))

    fields = _surface_fields(env_id, meta)
    if rows:
        fields["as_of_date"] = _iso(rows[0].get("as_of_date"))
    return HhaOperations(
        **fields,
        definitions=[
            _DEFS["ops_turnaround"],
            _DEFS["ops_breach"],
            _DEFS["ops_backlog"],
        ],
        domains=domains,
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
