"""Pydantic schemas for the Telemetry Platform serving slice (Phase 3).

Request models carry env_id + business_id first (repo convention). Response models include a
null_reason field wherever a value can be unavailable (fail-closed contract).
"""
from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


# ── /score ───────────────────────────────────────────────────────────────────

class ScoreReading(BaseModel):
    """One telemetry reading in a window. value_rmean50 is the rolling mean feature; if the caller
    only sends raw values, the service computes the rolling mean over the window."""
    t: int
    value: float
    value_rmean50: float | None = None


class ScoreRequest(BaseModel):
    env_id: str
    business_id: UUID
    run_key: str
    channel_name: str = "value"
    window: list[ScoreReading] = Field(min_length=1)


class ChannelAttribution(BaseModel):
    channel_name: str
    contribution: float


class ScoreResponse(BaseModel):
    verdict: str                              # GO | REVIEW | NO_GO | NOT_AVAILABLE
    anomaly_score: float | None = None
    threshold: float | None = None
    model_name: str | None = None
    model_version: str | None = None
    model_alias: str | None = None
    mlflow_run_id: str | None = None
    attribution: list[ChannelAttribution] = []
    null_reason: str | None = None            # set when verdict = NOT_AVAILABLE
    receipt_id: UUID | None = None            # tel_predictions row id (persistence receipt)


# ── /runs and /run/{id} ──────────────────────────────────────────────────────

class TestRunOut(BaseModel):
    id: UUID
    run_key: str
    dataset: str
    unit_or_channel: str
    spacecraft: str | None = None
    row_count: int
    ingest_at: datetime | None = None
    status: str
    created_at: datetime


class ChannelOut(BaseModel):
    channel_name: str
    unit: str | None = None
    redline_low: float | None = None
    redline_high: float | None = None


class AnomalyEventOut(BaseModel):
    channel_name: str | None = None
    start_t: int | None = None
    end_t: int | None = None
    anomaly_class: str | None = None
    confidence: float | None = None
    source: str


class RunDetailOut(BaseModel):
    run: TestRunOut | None = None
    channels: list[ChannelOut] = []
    recent_predictions: list[dict] = []
    anomaly_events: list[AnomalyEventOut] = []
    null_reason: str | None = None


# ── /monitoring ──────────────────────────────────────────────────────────────

class ConformalBudget(BaseModel):
    """Track A surface-only conformal false-alarm DIAGNOSTIC (not a distribution-free guarantee)."""
    alpha: float | None = None
    measured_false_alarm_rate: float | None = None
    calib_coverage: float | None = None
    threshold_quantile: float | None = None
    frozen_k: float | None = None
    status: str | None = None                 # within | approaching | over


class StreamBlock(BaseModel):
    """RS Demo streaming slice: pipeline-status summary carried on /monitoring."""
    status: str | None = None                  # fresh | stale | failed | unknown
    as_of_ts: datetime | None = None
    reason: str | None = None
    last_frame_at: datetime | None = None
    rows_per_min: int | None = None
    failing_assertions: int | None = None


class MonitoringResponse(BaseModel):
    rolling_anomaly_rate: float | None = None
    prediction_count: int = 0
    latest_model_name: str | None = None
    latest_model_version: str | None = None
    latest_model_alias: str | None = None
    last_scored_at: datetime | None = None
    psi: float | None = None
    window_label: str = "recent"
    conformal_budget: ConformalBudget | None = None
    stream: StreamBlock | None = None
    null_reason: str | None = None            # e.g. no_prediction_rows


# ── /stream/source ───────────────────────────────────────────────────────────

class StreamSourceRequest(BaseModel):
    source: str                                # iss | capture | adsb
