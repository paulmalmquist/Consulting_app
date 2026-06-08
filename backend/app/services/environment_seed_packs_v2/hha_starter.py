"""Starter seed for Healthcare Subscription Analytics environments (Hone Health demo).

SYNTHETIC, DEMO-ONLY, NO PHI. Populates the five hha_* gold-rollup tables with a
coherent, deterministic story for a subscription-led longevity business:

  - membership economics (MRR/ARR/NRR/LTV:CAC/payback) for one as-of date
  - a 4-tier plan dimension
  - a blended + per-channel acquisition funnel
  - a 12-month signup-cohort retention triangle, including one intentionally small
    cohort that trips the small-cell suppression flag
  - care-operations SLAs across labs / consults / fulfillment / support

Every value is synthetic and aggregate. There are NO names, emails, DOBs, addresses,
phone numbers, diagnoses, or exact lab values anywhere in this pack.

Determinism:
  - A fixed as-of date and freshness stamp (no wall-clock reads) so re-running produces
    byte-identical rows.
  - All inserts are idempotent (ON CONFLICT DO NOTHING on the natural keys).
  - business_id is synthesized deterministically from env_id via uuid5 — the v2 pipeline
    does not assign a business_id to fresh demo envs, but the hha_ tables require one.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timezone

from . import SeedResult


NAME = "hha_starter"
VERSION = 1

# Fixed reference points — never read the wall clock (keeps the seed deterministic).
_AS_OF = date(2026, 5, 31)
_FRESHNESS = datetime(2026, 5, 31, 6, 0, 0, tzinfo=timezone.utc)
_PROVENANCE = "synthetic gold rollup (seeded) · hha_starter v1"

# Deterministic business_id namespace for this module.
_HHA_NS = uuid.uuid5(uuid.NAMESPACE_DNS, "hha.healthcare-subscription.novendor")


def _business_id_for(env_id: str) -> str:
    return str(uuid.uuid5(_HHA_NS, f"{env_id}:hha:business"))


# --- Plans -------------------------------------------------------------------
_PLANS = [
    # plan_key, plan_name, tier, program, price_minor_units, interval
    ("hormone_optimization", "Hormone Optimization", "elite", "hormone", 19900, "monthly"),
    ("womens_longevity", "Women's Longevity", "plus", "womens", 16900, "monthly"),
    ("metabolic_health", "Metabolic Health", "plus", "metabolic", 14900, "monthly"),
    ("longevity_core", "Longevity Core", "core", "longevity", 9900, "monthly"),
]

# --- Exec overview KPIs (one as-of row) --------------------------------------
_OVERVIEW = {
    "active_members": 4250,
    "new_members_mtd": 520,
    "mrr_minor_units": 50_150_000,        # $501,500
    "arr_minor_units": 601_800_000,       # $6,018,000
    "arpu_minor_units": 11_800,           # $118.00 / member / month
    "blended_cac_minor_units": 31_000,    # $310
    "ltv_minor_units": 264_000,           # $2,640
    "ltv_cac_ratio": 8.5160,
    "payback_months": 8.60,
    "trial_to_paid_pct": 0.620000,
    "activation_rate_pct": 0.710000,
    "gross_churn_pct": 0.041000,
    "net_churn_pct": -0.012000,           # negative: expansion outpaces churn
    "nrr_pct": 1.112000,
    "grr_pct": 0.959000,
    "month3_retention_pct": 0.780000,
    "lab_sla_pct": 0.930000,
    "consult_sla_pct": 0.880000,
}

# --- Funnel ------------------------------------------------------------------
# Blended monthly funnel. stage_key, label, order, entered, converted_to_next
_FUNNEL_BLENDED = [
    ("visitor", "Site Visitors", 0, 100_000, 38_000),
    ("lead", "Quiz / Lead", 1, 38_000, 9_120),
    ("trial", "Trial Start", 2, 9_120, 5_654),
    ("activated", "Activated", 3, 5_654, 4_014),
    ("subscribed", "Paid Subscriber", 4, 4_014, 3_131),
    ("retained", "Retained (M1)", 5, 3_131, 3_131),
]
# channel -> (visitor_share, cac_minor_units)
_CHANNELS = {
    "paid_search": (0.45, 42_000),
    "organic": (0.40, 9_000),
    "referral": (0.15, 18_000),
}

# --- Operations --------------------------------------------------------------
# ops_domain, label, volume, sla_target_h, p50_h, p90_h, breach_pct, backlog
_OPS = [
    ("labs", "Lab order turnaround", 3120, 72.0, 41.0, 68.0, 0.070000, 84),
    ("consults", "Consult completion", 2480, 48.0, 26.0, 52.0, 0.120000, 61),
    ("fulfillment", "Pharmacy fulfillment", 2960, 96.0, 54.0, 88.0, 0.050000, 38),
    ("support", "Support first response", 1840, 24.0, 9.0, 27.0, 0.090000, 47),
]


def _cohort_rows():
    """12 monthly signup cohorts ending at the as-of month, blended channel.

    Plus one intentionally tiny niche-pilot cohort (size 8) that trips small-cell
    suppression. Retention follows a believable decay; LTV accrues with tenure.
    """
    rows = []
    # Retention multiplier by months_since_signup (index 0 == signup month).
    def retention(m: int) -> float:
        if m == 0:
            return 1.0
        # 0.86 at M1, then a softening decay toward a ~0.55 floor.
        r = 0.86 - 0.045 * (m - 1)
        return max(round(r, 6), 0.55)

    base_sizes = [280, 305, 330, 360, 390, 415, 445, 480, 520, 560, 590, 620]
    arpu = _OVERVIEW["arpu_minor_units"]  # monthly minor units

    for i, size in enumerate(base_sizes):
        cohort_month = date(2025, 6 + i, 1) if (6 + i) <= 12 else date(2026, (6 + i) - 12, 1)
        age = (len(base_sizes) - 1) - i  # oldest cohort has the most history
        cumulative_minor = 0
        for m in range(0, age + 1):
            r = retention(m)
            retained = round(size * r)
            cumulative_minor += retained * arpu
            ltv_minor = round(cumulative_minor / size) if size else 0
            rows.append({
                "signup_cohort_month": cohort_month,
                "months_since_signup": m,
                "acquisition_channel": "all",
                "cohort_size": size,
                "retained_count": retained,
                "retention_pct": round(r, 6),
                "cumulative_revenue_minor_units": cumulative_minor,
                "ltv_minor_units": ltv_minor,
                "is_suppressed": size < 11,
            })

    # Niche women's-longevity pilot cohort — deliberately tiny -> suppressed.
    pilot_size = 8
    pilot_month = date(2026, 5, 1)
    rows.append({
        "signup_cohort_month": pilot_month,
        "months_since_signup": 0,
        "acquisition_channel": "womens_pilot",
        "cohort_size": pilot_size,
        "retained_count": pilot_size,
        "retention_pct": 1.0,
        "cumulative_revenue_minor_units": pilot_size * arpu,
        "ltv_minor_units": arpu,
        "is_suppressed": pilot_size < 11,
    })
    return rows


def apply(cur, env_id: str, business_id: str, *, actor: str) -> SeedResult:
    rows: dict[str, int] = {}
    notes: list[str] = []

    # Set the tenant key so RLS WITH CHECK passes even when RLS is enforced on the
    # connection. business_id is synthesized — the v2 pipeline passes "" for demo envs.
    # set_config(..., is_local=true) == SET LOCAL but accepts a bind parameter (plain
    # `SET LOCAL app.env_id = %s` cannot be parameterized).
    cur.execute("SELECT set_config('app.env_id', %s, true)", (env_id,))
    biz = _business_id_for(env_id)

    # 1. Plans -----------------------------------------------------------------
    try:
        for plan_key, plan_name, tier, program, price, interval in _PLANS:
            cur.execute(
                """
                INSERT INTO hha_plans
                    (env_id, business_id, plan_key, plan_name, tier, program,
                     price_minor_units, billing_interval, is_active)
                VALUES (%s, %s::uuid, %s, %s, %s, %s, %s, %s, true)
                ON CONFLICT DO NOTHING
                """,
                (env_id, biz, plan_key, plan_name, tier, program, price, interval),
            )
        rows["hha_plans"] = len(_PLANS)
    except Exception as exc:  # pragma: no cover - defensive
        notes.append(f"skipped hha_plans seed: {exc}")

    # 2. Overview --------------------------------------------------------------
    try:
        o = _OVERVIEW
        cur.execute(
            """
            INSERT INTO hha_overview_metrics
                (env_id, business_id, as_of_date, active_members, new_members_mtd,
                 mrr_minor_units, arr_minor_units, arpu_minor_units, blended_cac_minor_units,
                 ltv_minor_units, ltv_cac_ratio, payback_months,
                 trial_to_paid_pct, activation_rate_pct, gross_churn_pct, net_churn_pct,
                 nrr_pct, grr_pct, month3_retention_pct, lab_sla_pct, consult_sla_pct,
                 source_freshness_at, provenance_label)
            VALUES (%s, %s::uuid, %s, %s, %s,
                    %s, %s, %s, %s,
                    %s, %s, %s,
                    %s, %s, %s, %s,
                    %s, %s, %s, %s, %s,
                    %s, %s)
            ON CONFLICT DO NOTHING
            """,
            (
                env_id, biz, _AS_OF, o["active_members"], o["new_members_mtd"],
                o["mrr_minor_units"], o["arr_minor_units"], o["arpu_minor_units"],
                o["blended_cac_minor_units"], o["ltv_minor_units"], o["ltv_cac_ratio"],
                o["payback_months"], o["trial_to_paid_pct"], o["activation_rate_pct"],
                o["gross_churn_pct"], o["net_churn_pct"], o["nrr_pct"], o["grr_pct"],
                o["month3_retention_pct"], o["lab_sla_pct"], o["consult_sla_pct"],
                _FRESHNESS, _PROVENANCE,
            ),
        )
        rows["hha_overview_metrics"] = 1
    except Exception as exc:  # pragma: no cover - defensive
        notes.append(f"skipped hha_overview_metrics seed: {exc}")

    # 3. Funnel (blended + per channel) ---------------------------------------
    try:
        funnel_count = 0
        for stage_key, label, order, entered, converted in _FUNNEL_BLENDED:
            conv = round(converted / entered, 6) if entered else None
            cur.execute(
                """
                INSERT INTO hha_funnel_metrics
                    (env_id, business_id, as_of_date, stage_key, stage_label, stage_order,
                     acquisition_channel, entered_count, converted_count, conversion_pct, cac_minor_units)
                VALUES (%s, %s::uuid, %s, %s, %s, %s, 'all', %s, %s, %s, NULL)
                ON CONFLICT DO NOTHING
                """,
                (env_id, biz, _AS_OF, stage_key, label, order, entered, converted, conv),
            )
            funnel_count += 1
        for channel, (share, cac) in _CHANNELS.items():
            for stage_key, label, order, entered, converted in _FUNNEL_BLENDED:
                c_entered = round(entered * share)
                c_converted = round(converted * share)
                conv = round(c_converted / c_entered, 6) if c_entered else None
                cur.execute(
                    """
                    INSERT INTO hha_funnel_metrics
                        (env_id, business_id, as_of_date, stage_key, stage_label, stage_order,
                         acquisition_channel, entered_count, converted_count, conversion_pct, cac_minor_units)
                    VALUES (%s, %s::uuid, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT DO NOTHING
                    """,
                    (env_id, biz, _AS_OF, stage_key, label, order, channel,
                     c_entered, c_converted, conv, cac),
                )
                funnel_count += 1
        rows["hha_funnel_metrics"] = funnel_count
    except Exception as exc:  # pragma: no cover - defensive
        notes.append(f"skipped hha_funnel_metrics seed: {exc}")

    # 4. Cohorts ---------------------------------------------------------------
    try:
        cohort_rows = _cohort_rows()
        for cr in cohort_rows:
            cur.execute(
                """
                INSERT INTO hha_cohort_metrics
                    (env_id, business_id, signup_cohort_month, months_since_signup,
                     acquisition_channel, cohort_size, retained_count, retention_pct,
                     cumulative_revenue_minor_units, ltv_minor_units, is_suppressed)
                VALUES (%s, %s::uuid, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT DO NOTHING
                """,
                (env_id, biz, cr["signup_cohort_month"], cr["months_since_signup"],
                 cr["acquisition_channel"], cr["cohort_size"], cr["retained_count"],
                 cr["retention_pct"], cr["cumulative_revenue_minor_units"],
                 cr["ltv_minor_units"], cr["is_suppressed"]),
            )
        rows["hha_cohort_metrics"] = len(cohort_rows)
    except Exception as exc:  # pragma: no cover - defensive
        notes.append(f"skipped hha_cohort_metrics seed: {exc}")

    # 5. Operations ------------------------------------------------------------
    try:
        for domain, label, vol, target, p50, p90, breach, backlog in _OPS:
            cur.execute(
                """
                INSERT INTO hha_operational_metrics
                    (env_id, business_id, as_of_date, ops_domain, metric_label, volume,
                     sla_target_hours, sla_actual_p50_hours, sla_actual_p90_hours,
                     sla_breach_pct, backlog_count)
                VALUES (%s, %s::uuid, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT DO NOTHING
                """,
                (env_id, biz, _AS_OF, domain, label, vol, target, p50, p90, breach, backlog),
            )
        rows["hha_operational_metrics"] = len(_OPS)
    except Exception as exc:  # pragma: no cover - defensive
        notes.append(f"skipped hha_operational_metrics seed: {exc}")

    return SeedResult(
        pack_name=NAME,
        pack_version=VERSION,
        rows_created=rows,
        notes=notes or [
            "hha_starter: SYNTHETIC / NO-PHI longevity-subscription gold rollups seeded "
            "(overview, plans, funnel, cohorts incl. one suppressed small cell, operations).",
            f"business_id synthesized deterministically from env_id; as_of={_AS_OF.isoformat()}.",
        ],
    )
