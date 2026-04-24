"""
schemas/altered_mind.py
Pydantic response models for the Altered Mind operator analytics module.
"""
from __future__ import annotations

from datetime import date
from typing import Any
from uuid import UUID

from pydantic import BaseModel


# ---------------------------------------------------------------------------
# Shared
# ---------------------------------------------------------------------------

class AMTopicBreakdown(BaseModel):
    anxiety: int | None = None
    depression: int | None = None
    adhd: int | None = None
    burnout: int | None = None
    relationships: int | None = None
    trauma_ptsd: int | None = None
    grief_loss: int | None = None
    life_transitions: int | None = None
    relapse_prev: int | None = None
    other: int | None = None


# ---------------------------------------------------------------------------
# Daily check-in
# ---------------------------------------------------------------------------

class AMDailyCheckinRow(BaseModel):
    id: UUID
    session_date: date
    clients_seen: int | None = None
    cancellations: int | None = None
    no_shows: int | None = None
    late_cancel: int | None = None
    late_fee_applied: bool | None = None
    consultations_completed: int | None = None
    new_referrals: int | None = None
    intake_completed: int | None = None
    converted_to_client: int | None = None
    discharges: int | None = None
    self_pay_sessions: int | None = None
    insurance_sessions: int | None = None
    revenue_dollars: float | None = None
    utilization_pct: float | None = None
    revenue_per_session: float | None = None
    topics: AMTopicBreakdown
    notes: str | None = None


class AMCheckinsOut(BaseModel):
    env_id: str
    total: int
    rows: list[AMDailyCheckinRow]


# ---------------------------------------------------------------------------
# Weekly summary
# ---------------------------------------------------------------------------

class AMWeeklyRow(BaseModel):
    id: UUID
    week_starting: date
    clients_seen: int | None = None
    openings: int | None = None
    cancellations: int | None = None
    no_shows: int | None = None
    consultations: int | None = None
    intake_appts: int | None = None
    new_referrals: int | None = None
    discharges: int | None = None
    self_pay_sessions: int | None = None
    insurance_sessions: int | None = None
    weekly_revenue: float | None = None
    capacity_utilization: float | None = None
    betterhelp_active: bool | None = None
    topics: AMTopicBreakdown


class AMWeeklyTrend(BaseModel):
    week_starting: date
    clients_seen: int | None = None
    weekly_revenue: float | None = None
    capacity_utilization: float | None = None
    new_referrals: int | None = None
    cancellations: int | None = None


class AMMetricsOut(BaseModel):
    env_id: str
    total_weeks: int
    weeks: list[AMWeeklyRow]
    trend: list[AMWeeklyTrend]


# ---------------------------------------------------------------------------
# Referrals
# ---------------------------------------------------------------------------

class AMReferralRow(BaseModel):
    id: UUID
    referral_date: date
    platform: str
    referral_source: str | None = None
    consult_completed: bool | None = None
    intake_completed: bool | None = None
    converted_to_client: bool | None = None
    notes: str | None = None


class AMPlatformSummary(BaseModel):
    platform: str
    total_leads: int
    consults: int
    intakes: int
    conversions: int
    conversion_rate: float


class AMGoalsOut(BaseModel):
    env_id: str
    total_referrals: int
    platform_breakdown: list[AMPlatformSummary]
    referrals: list[AMReferralRow]


# ---------------------------------------------------------------------------
# Monthly reflections
# ---------------------------------------------------------------------------

class AMReflectionRow(BaseModel):
    id: UUID
    reflection_month: str
    reflection_month_date: date
    theme: str | None = None
    wins: str | None = None
    challenges: str | None = None
    adjustment: str | None = None


class AMReflectionsOut(BaseModel):
    env_id: str
    total: int
    reflections: list[AMReflectionRow]


# ---------------------------------------------------------------------------
# Dashboard summary (single-call overview for the weekly dashboard)
# ---------------------------------------------------------------------------

class AMDashboardOut(BaseModel):
    env_id: str
    # KPI cards
    latest_week_starting: date | None = None
    latest_clients_seen: int | None = None
    latest_weekly_revenue: float | None = None
    latest_capacity_utilization: float | None = None
    ytd_revenue: float | None = None
    ytd_sessions: int | None = None
    total_referrals: int | None = None
    conversion_rate: float | None = None
    # Quick trend (last 8 weeks)
    trend: list[AMWeeklyTrend]
    # Latest reflection
    latest_reflection: AMReflectionRow | None = None
    # No-data flag
    has_data: bool = True
