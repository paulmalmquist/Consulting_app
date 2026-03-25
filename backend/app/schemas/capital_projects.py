from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


# ── Portfolio ──────────────────────────────────────────────────────

class CpProjectHealth(BaseModel):
    budget_health: str  # green / yellow / red
    schedule_health: str
    overall_health: str  # on_track / at_risk / critical
    risk_score: Decimal = Decimal("0")


class CpProjectRow(BaseModel):
    project_id: UUID
    name: str
    project_code: str | None = None
    sector: str | None = None
    stage: str
    region: str | None = None
    market: str | None = None
    gc_name: str | None = None
    approved_budget: Decimal = Decimal("0")
    committed_amount: Decimal = Decimal("0")
    spent_amount: Decimal = Decimal("0")
    forecast_at_completion: Decimal = Decimal("0")
    contingency_remaining: Decimal = Decimal("0")
    health: CpProjectHealth
    open_rfis: int = 0
    open_submittals: int = 0
    open_punch_items: int = 0
    pending_change_orders: int = 0


class CpPortfolioKpis(BaseModel):
    total_approved_budget: Decimal = Decimal("0")
    total_committed: Decimal = Decimal("0")
    total_spent: Decimal = Decimal("0")
    total_forecast: Decimal = Decimal("0")
    total_budget_variance: Decimal = Decimal("0")
    total_contingency_remaining: Decimal = Decimal("0")
    projects_on_track: int = 0
    projects_at_risk: int = 0
    projects_critical: int = 0
    total_open_rfis: int = 0
    total_overdue_submittals: int = 0
    total_open_punch_items: int = 0


class CpPortfolioSummary(BaseModel):
    kpis: CpPortfolioKpis
    projects: list[CpProjectRow]


# ── Project Dashboard ──────────────────────────────────────────────

class CpProjectDashboard(BaseModel):
    project_id: UUID
    name: str
    project_code: str | None = None
    description: str | None = None
    sector: str | None = None
    project_type: str | None = None
    stage: str
    status: str
    region: str | None = None
    market: str | None = None
    address: str | None = None
    gc_name: str | None = None
    architect_name: str | None = None
    owner_rep: str | None = None
    project_manager: str | None = None
    start_date: date | None = None
    target_end_date: date | None = None
    approved_budget: Decimal = Decimal("0")
    original_budget: Decimal = Decimal("0")
    committed_amount: Decimal = Decimal("0")
    spent_amount: Decimal = Decimal("0")
    forecast_at_completion: Decimal = Decimal("0")
    contingency_budget: Decimal = Decimal("0")
    contingency_remaining: Decimal = Decimal("0")
    management_reserve: Decimal = Decimal("0")
    pending_change_order_amount: Decimal = Decimal("0")
    budget_variance: Decimal = Decimal("0")
    risk_score: Decimal = Decimal("0")
    health: CpProjectHealth
    open_rfis: int = 0
    open_submittals: int = 0
    overdue_submittals: int = 0
    open_punch_items: int = 0
    pending_change_orders: int = 0
    open_risks: int = 0
    open_action_items: int = 0
    milestones: list[dict[str, Any]] = Field(default_factory=list)
    recent_activity: list[dict[str, Any]] = Field(default_factory=list)


# ── Daily Logs ─────────────────────────────────────────────────────

class CpDailyLogCreate(BaseModel):
    log_date: date
    weather_high: int | None = None
    weather_low: int | None = None
    weather_conditions: str | None = None
    manpower_count: int = 0
    superintendent: str | None = None
    work_completed: str | None = None
    visitors: str | None = None
    incidents: str | None = None
    deliveries: str | None = None
    equipment: str | None = None
    safety_observations: str | None = None
    notes: str | None = None
    photo_urls: list[str] = Field(default_factory=list)
    created_by: str | None = None


class CpDailyLogOut(BaseModel):
    daily_log_id: UUID
    project_id: UUID
    log_date: date
    weather_high: int | None = None
    weather_low: int | None = None
    weather_conditions: str | None = None
    manpower_count: int = 0
    superintendent: str | None = None
    work_completed: str | None = None
    visitors: str | None = None
    incidents: str | None = None
    deliveries: str | None = None
    equipment: str | None = None
    safety_observations: str | None = None
    notes: str | None = None
    photo_urls: list[Any] = Field(default_factory=list)
    created_at: datetime


# ── Meetings ───────────────────────────────────────────────────────

class CpMeetingItemCreate(BaseModel):
    topic: str = Field(min_length=2, max_length=500)
    discussion: str | None = None
    action_required: str | None = None
    responsible_party: str | None = None
    due_date: date | None = None
    status: str = "open"


class CpMeetingCreate(BaseModel):
    meeting_type: str = "progress"
    meeting_date: date
    location: str | None = None
    called_by: str | None = None
    attendees: list[str] = Field(default_factory=list)
    agenda: str | None = None
    minutes: str | None = None
    next_meeting_date: date | None = None
    items: list[CpMeetingItemCreate] = Field(default_factory=list)
    created_by: str | None = None


class CpMeetingItemOut(BaseModel):
    meeting_item_id: UUID
    item_number: int
    topic: str
    discussion: str | None = None
    action_required: str | None = None
    responsible_party: str | None = None
    due_date: date | None = None
    status: str


class CpMeetingOut(BaseModel):
    meeting_id: UUID
    project_id: UUID
    meeting_type: str
    meeting_date: date
    location: str | None = None
    called_by: str | None = None
    attendees: list[Any] = Field(default_factory=list)
    agenda: str | None = None
    minutes: str | None = None
    next_meeting_date: date | None = None
    status: str
    items: list[CpMeetingItemOut] = Field(default_factory=list)
    created_at: datetime


# ── Drawings ───────────────────────────────────────────────────────

class CpDrawingCreate(BaseModel):
    discipline: str = Field(min_length=2, max_length=40)
    sheet_number: str = Field(min_length=1, max_length=40)
    title: str = Field(min_length=2, max_length=300)
    revision: str = "A"
    issue_date: date | None = None
    received_date: date | None = None
    status: str = "current"
    notes: str | None = None
    created_by: str | None = None


class CpDrawingOut(BaseModel):
    drawing_id: UUID
    project_id: UUID
    discipline: str
    sheet_number: str
    title: str
    revision: str
    issue_date: date | None = None
    received_date: date | None = None
    status: str
    notes: str | None = None
    created_at: datetime


# ── Pay Applications ───────────────────────────────────────────────

class CpPayAppCreate(BaseModel):
    contract_id: UUID | None = None
    vendor_id: UUID | None = None
    pay_app_number: int = Field(ge=1)
    billing_period_start: date | None = None
    billing_period_end: date | None = None
    scheduled_value: Decimal = Decimal("0")
    work_completed_previous: Decimal = Decimal("0")
    work_completed_this_period: Decimal = Decimal("0")
    stored_materials_previous: Decimal = Decimal("0")
    stored_materials_current: Decimal = Decimal("0")
    retainage_pct: Decimal = Decimal("10.0000")
    created_by: str | None = None


class CpPayAppOut(BaseModel):
    pay_app_id: UUID
    project_id: UUID
    contract_id: UUID | None = None
    vendor_id: UUID | None = None
    pay_app_number: int
    billing_period_start: date | None = None
    billing_period_end: date | None = None
    scheduled_value: Decimal = Decimal("0")
    work_completed_previous: Decimal = Decimal("0")
    work_completed_this_period: Decimal = Decimal("0")
    stored_materials_previous: Decimal = Decimal("0")
    stored_materials_current: Decimal = Decimal("0")
    total_completed_stored: Decimal = Decimal("0")
    retainage_pct: Decimal = Decimal("10.0000")
    retainage_amount: Decimal = Decimal("0")
    total_earned_less_retainage: Decimal = Decimal("0")
    previous_payments: Decimal = Decimal("0")
    current_payment_due: Decimal = Decimal("0")
    balance_to_finish: Decimal = Decimal("0")
    status: str
    submitted_date: date | None = None
    approved_date: date | None = None
    paid_date: date | None = None
    created_at: datetime
