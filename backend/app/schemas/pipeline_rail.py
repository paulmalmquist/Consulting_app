"""Pydantic models for the Pipeline operating-surface right rail."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


# ── today_moves ──────────────────────────────────────────────────────────────

ReasonCode = Literal[
    "overdue_action_active_deal",
    "no_action_active_stage",
    "proposal_no_followup",
    "high_value_idle",
    "outreach_ready_for_next_touch",
    "discovery_no_scheduled_step",
]


class TodayMoveOut(BaseModel):
    id: str
    deal_id: str
    account_name: str
    amount: float | None = None
    action: str | None = None
    action_type: str | None = None
    due: str | None = None
    priority_score: int
    reason_code: ReasonCode
    reason_text: str


# ── risks_summary ────────────────────────────────────────────────────────────


class PipelineRisksCounts(BaseModel):
    no_next_action: int
    stuck_in_outreach: int
    in_proposal_no_followup: int
    idle_gt_7d: int
    drifting: int
    at_risk: int


class StageConversionRow(BaseModel):
    stage: str
    conversion_pct: float


class NoActionHotlistRow(BaseModel):
    deal_id: str
    account_name: str
    amount: float | None = None
    stage: str
    days_since_last_touch: int | None = None


class PipelineRisksOut(BaseModel):
    counts: PipelineRisksCounts
    stage_conversion_weak: list[StageConversionRow] = Field(default_factory=list)
    no_action_hotlist: list[NoActionHotlistRow] = Field(default_factory=list)


# ── recent_activity ──────────────────────────────────────────────────────────

RecentActivityKind = Literal[
    "stage_advanced",
    "outreach_sent",
    "reply_received",
    "meeting_booked",
    "proposal_sent",
    "next_action_completed",
    "next_action_created",
    "closed_won",
    "closed_lost",
]


class RecentActivityRowOut(BaseModel):
    ts: str
    kind: RecentActivityKind
    deal_id: str | None = None
    account_name: str
    description: str


# ── recent_closes ────────────────────────────────────────────────────────────


class RecentCloseRowOut(BaseModel):
    deal_id: str
    account_name: str
    amount: float | None = None
    closed_at: str | None = None
    loss_reason: str | None = None


class RecentClosesOut(BaseModel):
    wins: list[RecentCloseRowOut]
    losses: list[RecentCloseRowOut]
    win_total: float
    loss_total: float


# ── outreach_brief ───────────────────────────────────────────────────────────


class OutreachBriefOut(BaseModel):
    followups_due_today: int
    no_touch_in_outreach: int
    touches_this_week: int
    replies_this_week: int
    top_vertical_by_response: str
