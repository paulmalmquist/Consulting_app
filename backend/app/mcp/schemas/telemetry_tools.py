"""Typed input schemas for the telemetry MCP tools — all READ-only.

These mirror the dict-shaped contracts already served by `app.services.telemetry_serving`. They exist so
the telemetry copilot's read tools are first-class, JSON-Schema-validated, permission-scoped, audited MCP
tools (registered in the global ToolRegistry) rather than an inline allow-list only. No write tools.
"""
from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, Field


class GetTriggeringPredictionInput(BaseModel):
    """Fetch the NO_GO prediction receipt whose window brackets the first fire tick."""
    model_config = {"extra": "forbid"}
    env_id: str = Field(description="Environment id (tenant scope)")
    business_id: UUID = Field(description="Business id (tenant scope)")
    run_key: str = Field(description="Test run key, e.g. 'smap_msl:D-4:test'")
    fire_tick: int = Field(description="Tick at which the verdict fired")


class GetModelRunDetailInput(BaseModel):
    """Fetch a single promoted-model metadata row (champion metrics + gate)."""
    model_config = {"extra": "forbid"}
    env_id: str = Field(description="Environment id (tenant scope)")
    business_id: UUID = Field(description="Business id (tenant scope)")
    model_name: str = Field(description="Model name, e.g. 'tel_anomaly_detector'")
    model_version: str | None = Field(default=None, description="Optional version; latest when omitted")


class GetAnomalyEventsInWindowInput(BaseModel):
    """Fetch labeled/detected anomaly events overlapping a tick window (point vs contextual)."""
    model_config = {"extra": "forbid"}
    env_id: str = Field(description="Environment id (tenant scope)")
    business_id: UUID = Field(description="Business id (tenant scope)")
    run_key: str = Field(description="Test run key")
    t_start: int = Field(description="Window start tick (inclusive)")
    t_end: int = Field(description="Window end tick (inclusive)")


class PreviewScoreWindowInput(BaseModel):
    """Score a supplied telemetry window without inserting a prediction receipt."""
    model_config = {"extra": "forbid"}
    env_id: str = Field(description="Environment id (tenant scope)")
    business_id: UUID = Field(description="Business id (tenant scope)")
    run_key: str = Field(description="Existing test run key")
    channel_name: str = Field(description="Telemetry channel name")
    window: list[dict] = Field(min_length=1, description="Ordered readings with t and value")


class PreviewScoreWindowOutput(BaseModel):
    """Fail-closed score preview contract used by Agent Builder dry-runs."""
    verdict: str
    anomaly_score: float | None = None
    threshold: float | None = None
    model_name: str | None = None
    model_version: str | None = None
    model_alias: str | None = None
    mlflow_run_id: str | None = None
    attribution: list[dict] = Field(default_factory=list)
    confidence: float = 0.0
    missing_data: list[str] = Field(default_factory=list)
    null_reason: str | None = None
