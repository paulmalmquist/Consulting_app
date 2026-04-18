"""Pydantic input schemas for novendor.accounting.* MCP tools."""
from __future__ import annotations

from datetime import date
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


class _EnvScoped(BaseModel):
    model_config = {"extra": "forbid"}
    business_id: UUID
    env_id: str


class IngestReceiptInput(_EnvScoped):
    file_bytes_b64: str = Field(..., description="Base64-encoded file bytes")
    filename: Optional[str] = None
    mime_type: str = "application/pdf"
    source_type: str = "upload"
    source_ref: Optional[str] = None
    uploaded_by: Optional[str] = None
    confirm: bool = False


class BulkIngestReceiptsInput(_EnvScoped):
    files: list[dict] = Field(
        ..., description="List of {file_bytes_b64, filename, mime_type}"
    )
    source_type: str = "bulk_upload"
    confirm: bool = False


class ParseReceiptInput(_EnvScoped):
    intake_id: UUID


class ClassifyReceiptInput(_EnvScoped):
    intake_id: UUID


class MatchTransactionInput(_EnvScoped):
    intake_id: UUID


class CreateExpenseFromReceiptInput(_EnvScoped):
    intake_id: UUID
    category: Optional[str] = None
    entity_linkage: Optional[str] = None
    confirm: bool = False


class FlagAmbiguousInput(_EnvScoped):
    intake_id: UUID
    reason: str = "apple_ambiguous"
    next_action: str


class DetectRecurringInput(_EnvScoped):
    pass


class UpdateLedgerInput(_EnvScoped):
    intake_id: UUID


class GetReceiptReviewInput(_EnvScoped):
    status: str = "open"
    limit: int = Field(50, ge=1, le=500)


class SoftwareSpendReportInput(_EnvScoped):
    period_start: Optional[date] = None
    period_end: Optional[date] = None


class AppleBilledReportInput(_EnvScoped):
    period_start: Optional[date] = None
    period_end: Optional[date] = None


class ProcessIntakeInput(_EnvScoped):
    """Canonical pipeline entrypoint: classify → ledger → match → review."""
    intake_id: UUID


class AttachIntakeInput(_EnvScoped):
    intake_id: UUID
    subscription_id: UUID
    confirm: bool = False


class MarkSubscriptionNonBusinessInput(_EnvScoped):
    subscription_id: UUID
    confirm: bool = False


class SuppressOccurrenceInput(_EnvScoped):
    occurrence_id: UUID
    confirm: bool = False


class SetOccurrenceStateInput(_EnvScoped):
    occurrence_id: UUID
    review_state: str = Field(..., description="confirmed|rejected|non_business|mixed|manual")
    notes: Optional[str] = None
    confirm: bool = False


class AiSoftwareSummaryInput(_EnvScoped):
    period_start: Optional[date] = None
    period_end: Optional[date] = None
