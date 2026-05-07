"""
routes/altered_mind.py
FastAPI routes for the Altered Mind operator analytics module.

All routes require env_id. Tenant isolation is enforced via SET LOCAL app.env_id.
No silent fallbacks — missing data returns explicit has_data=false or empty lists.

Prefix: /api/am/v1
"""
from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query

from app.db import get_cursor
from app.schemas.altered_mind import (
    AMCheckinsOut,
    AMDailyCheckinRow,
    AMDashboardOut,
    AMGoalsOut,
    AMMetricsOut,
    AMPlatformSummary,
    AMReferralRow,
    AMReflectionRow,
    AMReflectionsOut,
    AMTopicBreakdown,
    AMWeeklyRow,
    AMWeeklyTrend,
)

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/am/v1", tags=["altered-mind"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _require_env(env_id: str = Query(..., description="Winston env_id")) -> str:
    if not env_id or not env_id.strip():
        raise HTTPException(status_code=400, detail="env_id is required")
    return env_id.strip()


EnvId = Annotated[str, _require_env]


def _topic_from_row(r: dict) -> AMTopicBreakdown:
    return AMTopicBreakdown(
        anxiety=r.get("topic_anxiety"),
        depression=r.get("topic_depression"),
        adhd=r.get("topic_adhd"),
        burnout=r.get("topic_burnout"),
        relationships=r.get("topic_relationships"),
        trauma_ptsd=r.get("topic_trauma_ptsd"),
        grief_loss=r.get("topic_grief_loss"),
        life_transitions=r.get("topic_life_transitions"),
        relapse_prev=r.get("topic_relapse_prev"),
        other=r.get("topic_other"),
    )


# ---------------------------------------------------------------------------
# GET /api/am/v1/dashboard
# ---------------------------------------------------------------------------

@router.get("/dashboard", response_model=AMDashboardOut)
def get_dashboard(env_id: EnvId = Query(...)):
    """
    Single-call overview for the Altered Mind weekly dashboard.
    Returns KPI cards, 8-week trend, and latest monthly reflection.
    Fails closed: if no data exists returns has_data=False with safe nulls.
    """
    try:
        with get_cursor() as cur:
            cur.execute("SELECT set_config('app.env_id', %s, true)", (str(env_id),))

            # Widened predicate: has_data is true if ANY of the four am_* tables
            # has rows for this env_id. Was previously gated only on
            # am_weekly_summary AND clients_seen > 0, which hid legitimate data
            # whenever weekly rollups lagged or had nullable clients_seen.
            # Downstream queries handle missing weekly data via null fallbacks;
            # the frontend renders the trend section only when trend.length > 0.
            cur.execute(
                """
                SELECT
                    (SELECT COUNT(*) FROM am_weekly_summary    WHERE env_id = %s) AS weekly_n,
                    (SELECT COUNT(*) FROM am_daily_checkin     WHERE env_id = %s) AS daily_n,
                    (SELECT COUNT(*) FROM am_referral          WHERE env_id = %s) AS referral_n,
                    (SELECT COUNT(*) FROM am_monthly_reflection WHERE env_id = %s) AS reflection_n
                """,
                (env_id, env_id, env_id, env_id),
            )
            row = cur.fetchone()
            total_rows = (
                (row["weekly_n"]     or 0) +
                (row["daily_n"]      or 0) +
                (row["referral_n"]   or 0) +
                (row["reflection_n"] or 0)
            ) if row else 0
            if total_rows == 0:
                return AMDashboardOut(env_id=env_id, trend=[], has_data=False)

            # Latest week
            cur.execute("""
                SELECT week_starting, clients_seen, weekly_revenue, capacity_utilization
                FROM am_weekly_summary
                WHERE env_id = %s AND clients_seen > 0
                ORDER BY week_starting DESC LIMIT 1
            """, (env_id,))
            latest = cur.fetchone()

            # YTD from daily
            cur.execute("""
                SELECT
                    COALESCE(SUM(revenue_dollars), 0) AS ytd_revenue,
                    COALESCE(SUM(clients_seen), 0)   AS ytd_sessions
                FROM am_daily_checkin
                WHERE env_id = %s
                  AND EXTRACT(YEAR FROM session_date) = EXTRACT(YEAR FROM CURRENT_DATE)
            """, (env_id,))
            ytd = cur.fetchone()

            # Referral conversion
            cur.execute("""
                SELECT
                    COUNT(*)                                              AS total,
                    SUM(CASE WHEN converted_to_client THEN 1 ELSE 0 END) AS converted
                FROM am_referral WHERE env_id = %s
            """, (env_id,))
            ref = cur.fetchone()
            total_refs = ref["total"] or 0
            converted = ref["converted"] or 0
            conv_rate = round(converted / total_refs, 4) if total_refs > 0 else None

            # 8-week trend
            cur.execute("""
                SELECT week_starting, clients_seen, weekly_revenue,
                       capacity_utilization, new_referrals, cancellations
                FROM am_weekly_summary
                WHERE env_id = %s AND clients_seen > 0
                ORDER BY week_starting DESC LIMIT 8
            """, (env_id,))
            trend_rows = [
                AMWeeklyTrend(
                    week_starting=r["week_starting"],
                    clients_seen=r["clients_seen"],
                    weekly_revenue=float(r["weekly_revenue"]) if r["weekly_revenue"] is not None else None,
                    capacity_utilization=float(r["capacity_utilization"]) if r["capacity_utilization"] is not None else None,
                    new_referrals=r["new_referrals"],
                    cancellations=r["cancellations"],
                )
                for r in cur.fetchall()
            ]
            trend_rows.reverse()

            # Latest reflection
            cur.execute("""
                SELECT id, reflection_month, reflection_month_date, theme, wins, challenges, adjustment
                FROM am_monthly_reflection
                WHERE env_id = %s AND theme IS NOT NULL
                ORDER BY reflection_month_date DESC LIMIT 1
            """, (env_id,))
            refl_row = cur.fetchone()
            latest_reflection = None
            if refl_row:
                latest_reflection = AMReflectionRow(
                    id=refl_row["id"],
                    reflection_month=refl_row["reflection_month"],
                    reflection_month_date=refl_row["reflection_month_date"],
                    theme=refl_row["theme"],
                    wins=refl_row["wins"],
                    challenges=refl_row["challenges"],
                    adjustment=refl_row["adjustment"],
                )

            return AMDashboardOut(
                env_id=env_id,
                latest_week_starting=latest["week_starting"] if latest else None,
                latest_clients_seen=latest["clients_seen"] if latest else None,
                latest_weekly_revenue=float(latest["weekly_revenue"]) if latest and latest["weekly_revenue"] else None,
                latest_capacity_utilization=float(latest["capacity_utilization"]) if latest and latest["capacity_utilization"] else None,
                ytd_revenue=float(ytd["ytd_revenue"]) if ytd and ytd["ytd_revenue"] else None,
                ytd_sessions=int(ytd["ytd_sessions"]) if ytd and ytd["ytd_sessions"] else None,
                total_referrals=total_refs,
                conversion_rate=conv_rate,
                trend=trend_rows,
                latest_reflection=latest_reflection,
                has_data=True,
            )
    except HTTPException:
        raise
    except Exception as exc:
        log.exception("am.dashboard failed env_id=%s", env_id)
        raise HTTPException(status_code=500, detail=f"Dashboard query failed: {exc}")


# ---------------------------------------------------------------------------
# GET /api/am/v1/checkins
# ---------------------------------------------------------------------------

@router.get("/checkins", response_model=AMCheckinsOut)
def get_checkins(
    env_id: EnvId = Query(...),
    limit: int = Query(default=30, ge=1, le=365),
    offset: int = Query(default=0, ge=0),
):
    """Paginated daily check-in rows, newest first, with topic breakdowns."""
    try:
        with get_cursor() as cur:
            cur.execute("SELECT set_config('app.env_id', %s, true)", (str(env_id),))

            cur.execute(
                "SELECT COUNT(*) AS n FROM am_daily_checkin WHERE env_id = %s",
                (env_id,)
            )
            total = cur.fetchone()["n"]

            cur.execute("""
                SELECT
                    id, session_date,
                    clients_seen, cancellations, no_shows, late_cancel, late_fee_applied,
                    consultations_completed, new_referrals, intake_completed,
                    converted_to_client, discharges,
                    self_pay_sessions, insurance_sessions,
                    revenue_dollars, utilization_pct, revenue_per_session,
                    topic_anxiety, topic_depression, topic_adhd, topic_burnout,
                    topic_relationships, topic_trauma_ptsd, topic_grief_loss,
                    topic_life_transitions, topic_relapse_prev, topic_other,
                    notes
                FROM am_daily_checkin
                WHERE env_id = %s
                ORDER BY session_date DESC
                LIMIT %s OFFSET %s
            """, (env_id, limit, offset))

            rows = [
                AMDailyCheckinRow(
                    id=r["id"],
                    session_date=r["session_date"],
                    clients_seen=r["clients_seen"],
                    cancellations=r["cancellations"],
                    no_shows=r["no_shows"],
                    late_cancel=r["late_cancel"],
                    late_fee_applied=r["late_fee_applied"],
                    consultations_completed=r["consultations_completed"],
                    new_referrals=r["new_referrals"],
                    intake_completed=r["intake_completed"],
                    converted_to_client=r["converted_to_client"],
                    discharges=r["discharges"],
                    self_pay_sessions=r["self_pay_sessions"],
                    insurance_sessions=r["insurance_sessions"],
                    revenue_dollars=float(r["revenue_dollars"]) if r["revenue_dollars"] is not None else None,
                    utilization_pct=float(r["utilization_pct"]) if r["utilization_pct"] is not None else None,
                    revenue_per_session=float(r["revenue_per_session"]) if r["revenue_per_session"] is not None else None,
                    topics=_topic_from_row(r),
                    notes=r["notes"],
                )
                for r in cur.fetchall()
            ]
            return AMCheckinsOut(env_id=env_id, total=total, rows=rows)
    except HTTPException:
        raise
    except Exception as exc:
        log.exception("am.checkins failed env_id=%s", env_id)
        raise HTTPException(status_code=500, detail=str(exc))


# ---------------------------------------------------------------------------
# GET /api/am/v1/checkins/{session_date}
# ---------------------------------------------------------------------------

@router.get("/checkins/{session_date}", response_model=AMDailyCheckinRow)
def get_checkin_detail(session_date: str, env_id: EnvId = Query(...)):
    """Single day detail view."""
    try:
        with get_cursor() as cur:
            cur.execute("SELECT set_config('app.env_id', %s, true)", (str(env_id),))
            cur.execute("""
                SELECT
                    id, session_date,
                    clients_seen, cancellations, no_shows, late_cancel, late_fee_applied,
                    consultations_completed, new_referrals, intake_completed,
                    converted_to_client, discharges,
                    self_pay_sessions, insurance_sessions,
                    revenue_dollars, utilization_pct, revenue_per_session,
                    topic_anxiety, topic_depression, topic_adhd, topic_burnout,
                    topic_relationships, topic_trauma_ptsd, topic_grief_loss,
                    topic_life_transitions, topic_relapse_prev, topic_other,
                    notes
                FROM am_daily_checkin
                WHERE env_id = %s AND session_date = %s
            """, (env_id, session_date))
            r = cur.fetchone()
            if not r:
                raise HTTPException(status_code=404, detail=f"No check-in found for {session_date}")
            return AMDailyCheckinRow(
                id=r["id"], session_date=r["session_date"],
                clients_seen=r["clients_seen"], cancellations=r["cancellations"],
                no_shows=r["no_shows"], late_cancel=r["late_cancel"],
                late_fee_applied=r["late_fee_applied"],
                consultations_completed=r["consultations_completed"],
                new_referrals=r["new_referrals"], intake_completed=r["intake_completed"],
                converted_to_client=r["converted_to_client"], discharges=r["discharges"],
                self_pay_sessions=r["self_pay_sessions"],
                insurance_sessions=r["insurance_sessions"],
                revenue_dollars=float(r["revenue_dollars"]) if r["revenue_dollars"] is not None else None,
                utilization_pct=float(r["utilization_pct"]) if r["utilization_pct"] is not None else None,
                revenue_per_session=float(r["revenue_per_session"]) if r["revenue_per_session"] is not None else None,
                topics=_topic_from_row(r),
                notes=r["notes"],
            )
    except HTTPException:
        raise
    except Exception as exc:
        log.exception("am.checkin_detail failed")
        raise HTTPException(status_code=500, detail=str(exc))


# ---------------------------------------------------------------------------
# GET /api/am/v1/metrics
# ---------------------------------------------------------------------------

@router.get("/metrics", response_model=AMMetricsOut)
def get_metrics(
    env_id: EnvId = Query(...),
    limit: int = Query(default=16, ge=1, le=53),
):
    """Weekly summaries with trend array. Returns chronological order."""
    try:
        with get_cursor() as cur:
            cur.execute("SELECT set_config('app.env_id', %s, true)", (str(env_id),))

            cur.execute(
                "SELECT COUNT(*) AS n FROM am_weekly_summary WHERE env_id = %s AND clients_seen > 0",
                (env_id,)
            )
            total = cur.fetchone()["n"]

            cur.execute("""
                SELECT
                    id, week_starting,
                    clients_seen, openings, cancellations, no_shows,
                    consultations, intake_appts, new_referrals, discharges,
                    self_pay_sessions, insurance_sessions,
                    weekly_revenue, capacity_utilization, betterhelp_active,
                    topic_adhd, topic_anxiety, topic_burnout, topic_depression,
                    topic_grief_loss, topic_life_transitions, topic_other,
                    topic_relationships, topic_trauma_ptsd, topic_relapse_prev
                FROM am_weekly_summary
                WHERE env_id = %s AND clients_seen > 0
                ORDER BY week_starting DESC
                LIMIT %s
            """, (env_id, limit))

            all_rows = cur.fetchall()
            all_rows.reverse()  # chronological

            weeks = [
                AMWeeklyRow(
                    id=r["id"], week_starting=r["week_starting"],
                    clients_seen=r["clients_seen"], openings=r["openings"],
                    cancellations=r["cancellations"], no_shows=r["no_shows"],
                    consultations=r["consultations"], intake_appts=r["intake_appts"],
                    new_referrals=r["new_referrals"], discharges=r["discharges"],
                    self_pay_sessions=r["self_pay_sessions"],
                    insurance_sessions=r["insurance_sessions"],
                    weekly_revenue=float(r["weekly_revenue"]) if r["weekly_revenue"] is not None else None,
                    capacity_utilization=float(r["capacity_utilization"]) if r["capacity_utilization"] is not None else None,
                    betterhelp_active=r["betterhelp_active"],
                    topics=AMTopicBreakdown(
                        adhd=r["topic_adhd"], anxiety=r["topic_anxiety"],
                        burnout=r["topic_burnout"], depression=r["topic_depression"],
                        grief_loss=r["topic_grief_loss"],
                        life_transitions=r["topic_life_transitions"],
                        other=r["topic_other"], relationships=r["topic_relationships"],
                        trauma_ptsd=r["topic_trauma_ptsd"],
                        relapse_prev=r["topic_relapse_prev"],
                    ),
                )
                for r in all_rows
            ]
            trend = [
                AMWeeklyTrend(
                    week_starting=r["week_starting"],
                    clients_seen=r["clients_seen"],
                    weekly_revenue=float(r["weekly_revenue"]) if r["weekly_revenue"] is not None else None,
                    capacity_utilization=float(r["capacity_utilization"]) if r["capacity_utilization"] is not None else None,
                    new_referrals=r["new_referrals"],
                    cancellations=r["cancellations"],
                )
                for r in all_rows
            ]
            return AMMetricsOut(env_id=env_id, total_weeks=total, weeks=weeks, trend=trend)
    except HTTPException:
        raise
    except Exception as exc:
        log.exception("am.metrics failed env_id=%s", env_id)
        raise HTTPException(status_code=500, detail=str(exc))


# ---------------------------------------------------------------------------
# GET /api/am/v1/goals
# ---------------------------------------------------------------------------

@router.get("/goals", response_model=AMGoalsOut)
def get_goals(
    env_id: EnvId = Query(...),
    limit: int = Query(default=64, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
):
    """Referral intake pipeline — client acquisition funnel by platform."""
    try:
        with get_cursor() as cur:
            cur.execute("SELECT set_config('app.env_id', %s, true)", (str(env_id),))

            cur.execute(
                "SELECT COUNT(*) AS n FROM am_referral WHERE env_id = %s",
                (env_id,)
            )
            total = cur.fetchone()["n"]

            cur.execute("""
                SELECT
                    platform,
                    COUNT(*)                                                 AS total_leads,
                    SUM(CASE WHEN consult_completed   THEN 1 ELSE 0 END)    AS consults,
                    SUM(CASE WHEN intake_completed    THEN 1 ELSE 0 END)    AS intakes,
                    SUM(CASE WHEN converted_to_client THEN 1 ELSE 0 END)    AS conversions
                FROM am_referral
                WHERE env_id = %s
                GROUP BY platform
                ORDER BY total_leads DESC
            """, (env_id,))
            platforms = []
            for r in cur.fetchall():
                leads = r["total_leads"] or 0
                convs = r["conversions"] or 0
                platforms.append(AMPlatformSummary(
                    platform=r["platform"],
                    total_leads=leads,
                    consults=r["consults"] or 0,
                    intakes=r["intakes"] or 0,
                    conversions=convs,
                    conversion_rate=round(convs / leads, 4) if leads > 0 else 0.0,
                ))

            cur.execute("""
                SELECT id, referral_date, platform, referral_source,
                       consult_completed, intake_completed, converted_to_client, notes
                FROM am_referral
                WHERE env_id = %s
                ORDER BY referral_date DESC
                LIMIT %s OFFSET %s
            """, (env_id, limit, offset))
            rows = [
                AMReferralRow(
                    id=r["id"], referral_date=r["referral_date"],
                    platform=r["platform"], referral_source=r["referral_source"],
                    consult_completed=r["consult_completed"],
                    intake_completed=r["intake_completed"],
                    converted_to_client=r["converted_to_client"],
                    notes=r["notes"],
                )
                for r in cur.fetchall()
            ]
            return AMGoalsOut(
                env_id=env_id,
                total_referrals=total,
                platform_breakdown=platforms,
                referrals=rows,
            )
    except HTTPException:
        raise
    except Exception as exc:
        log.exception("am.goals failed env_id=%s", env_id)
        raise HTTPException(status_code=500, detail=str(exc))


# ---------------------------------------------------------------------------
# GET /api/am/v1/reflections
# ---------------------------------------------------------------------------

@router.get("/reflections", response_model=AMReflectionsOut)
def get_reflections(env_id: EnvId = Query(...)):
    """Monthly narrative reflections — theme, wins, challenges, adjustment."""
    try:
        with get_cursor() as cur:
            cur.execute("SELECT set_config('app.env_id', %s, true)", (str(env_id),))
            cur.execute("""
                SELECT id, reflection_month, reflection_month_date,
                       theme, wins, challenges, adjustment
                FROM am_monthly_reflection
                WHERE env_id = %s AND theme IS NOT NULL
                ORDER BY reflection_month_date DESC
            """, (env_id,))
            rows = [
                AMReflectionRow(
                    id=r["id"],
                    reflection_month=r["reflection_month"],
                    reflection_month_date=r["reflection_month_date"],
                    theme=r["theme"],
                    wins=r["wins"],
                    challenges=r["challenges"],
                    adjustment=r["adjustment"],
                )
                for r in cur.fetchall()
            ]
            return AMReflectionsOut(env_id=env_id, total=len(rows), reflections=rows)
    except HTTPException:
        raise
    except Exception as exc:
        log.exception("am.reflections failed env_id=%s", env_id)
        raise HTTPException(status_code=500, detail=str(exc))
