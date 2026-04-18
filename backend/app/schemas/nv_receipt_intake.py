"""Pydantic schemas for the nv_receipt_intake route."""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class ReceiptIngestResult(BaseModel):
    intake_id: UUID
    ingest_status: str
    parse_result_id: Optional[UUID] = None
    duplicate: bool = False


class BulkIngestResult(BaseModel):
    count: int
    results: list[ReceiptIngestResult]


class ReceiptIntakeRow(BaseModel):
    id: UUID
    source_type: str
    ingest_status: str
    original_filename: Optional[str] = None
    created_at: datetime
    file_hash: str
    merchant_raw: Optional[str] = None
    billing_platform: Optional[str] = None
    vendor_normalized: Optional[str] = None
    service_name_guess: Optional[str] = None
    total: Optional[Decimal] = None
    currency: Optional[str] = None
    transaction_date: Optional[date] = None
    confidence_overall: Optional[Decimal] = None


class ParseResultOut(BaseModel):
    id: UUID
    parser_source: str
    parser_version: Optional[str] = None
    merchant_raw: Optional[str] = None
    billing_platform: Optional[str] = None
    service_name_guess: Optional[str] = None
    vendor_normalized: Optional[str] = None
    transaction_date: Optional[date] = None
    billing_period_start: Optional[date] = None
    billing_period_end: Optional[date] = None
    subtotal: Optional[Decimal] = None
    tax: Optional[Decimal] = None
    total: Optional[Decimal] = None
    currency: Optional[str] = None
    apple_document_ref: Optional[str] = None
    line_items: list[dict[str, Any]] = Field(default_factory=list)
    payment_method_hints: Optional[str] = None
    renewal_language: Optional[str] = None
    confidence_overall: Optional[Decimal] = None
    confidence_vendor: Optional[Decimal] = None
    confidence_service: Optional[Decimal] = None


class MatchCandidateOut(BaseModel):
    id: UUID
    transaction_id: Optional[UUID] = None
    match_score: Decimal
    match_reason: dict[str, Any]
    match_status: str
    created_at: datetime


class ReviewItemOut(BaseModel):
    id: UUID
    reason: str
    next_action: str
    status: str
    created_at: datetime
    resolved_at: Optional[datetime] = None


class IntakeDetail(BaseModel):
    intake: dict[str, Any]
    parse: Optional[dict[str, Any]] = None
    match_candidates: list[dict[str, Any]] = Field(default_factory=list)
    review_items: list[dict[str, Any]] = Field(default_factory=list)


class SubscriptionRow(BaseModel):
    id: UUID
    vendor_normalized: Optional[str] = None
    service_name: str
    billing_platform: Optional[str] = None
    cadence: str
    expected_amount: Optional[Decimal] = None
    currency: Optional[str] = None
    category: Optional[str] = None
    business_relevance: Optional[str] = None
    last_seen_date: Optional[date] = None
    next_expected_date: Optional[date] = None
    documentation_complete: bool
    is_active: bool


class ConfirmReceiptInput(BaseModel):
    env_id: str
    business_id: UUID
    category: Optional[str] = None
    entity_linkage: Optional[str] = None
    notes: Optional[str] = None


class MarkReviewInput(BaseModel):
    env_id: str
    business_id: UUID
    resolved_by: Optional[str] = None
    notes: Optional[str] = None


class SoftwareSpendReport(BaseModel):
    period_start: Optional[str] = None
    period_end: Optional[str] = None
    total_spend: float
    by_vendor: list[dict[str, Any]]
    by_platform: list[dict[str, Any]]


class AppleBilledReport(BaseModel):
    period_start: Optional[str] = None
    period_end: Optional[str] = None
    total_apple_billed: float
    undetermined_vendor_spend: float
    rows: list[dict[str, Any]]
