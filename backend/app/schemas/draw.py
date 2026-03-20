"""Pydantic schemas for Construction Draw Management.

Mirrors database tables from 400-403 migrations.
Follows the pattern from backend/app/schemas/capital_projects.py.
"""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from enum import Enum
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


# ── Enums ─────────────────────────────────────────────────────────

class DrawStatus(str, Enum):
    DRAFT = "draft"
    PENDING_REVIEW = "pending_review"
    REVISION_REQUESTED = "revision_requested"
    APPROVED = "approved"
    SUBMITTED_TO_LENDER = "submitted_to_lender"
    FUNDED = "funded"
    REJECTED = "rejected"


class InvoiceOcrStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class InvoiceStatus(str, Enum):
    UPLOADED = "uploaded"
    VERIFIED = "verified"
    ASSIGNED = "assigned"
    REJECTED = "rejected"


class MatchStatus(str, Enum):
    UNMATCHED = "unmatched"
    AUTO_MATCHED = "auto_matched"
    MANUALLY_MATCHED = "manually_matched"
    DISPUTED = "disputed"


class InspectionType(str, Enum):
    PROGRESS = "progress"
    LENDER = "lender"
    THIRD_PARTY = "third_party"
    FINAL = "final"


# ── Draw Request ──────────────────────────────────────────────────

class DrawRequestCreate(BaseModel):
    title: str | None = None
    billing_period_start: date | None = None
    billing_period_end: date | None = None
    created_by: str | None = None


class DrawRequestResponse(BaseModel):
    draw_request_id: UUID
    project_id: UUID
    draw_number: int
    title: str | None = None
    billing_period_start: date | None = None
    billing_period_end: date | None = None
    total_previous_draws: Decimal = Decimal("0")
    total_current_draw: Decimal = Decimal("0")
    total_materials_stored: Decimal = Decimal("0")
    total_retainage_held: Decimal = Decimal("0")
    total_amount_due: Decimal = Decimal("0")
    status: str
    submitted_at: datetime | str | None = None
    approved_at: datetime | str | None = None
    approved_by: str | None = None
    submitted_to_lender_at: datetime | str | None = None
    funded_at: datetime | str | None = None
    rejected_at: datetime | str | None = None
    rejection_reason: str | None = None
    variance_flags_json: list[dict[str, Any]] = Field(default_factory=list)
    variance_amount_at_risk: Decimal = Decimal("0")
    lender_reference: str | None = None
    g702_storage_key: str | None = None
    line_items: list[DrawLineItemResponse] = Field(default_factory=list)
    invoices: list[InvoiceResponse] = Field(default_factory=list)
    inspections: list[InspectionResponse] = Field(default_factory=list)
    line_item_count: int = 0
    invoice_count: int = 0
    inspection_count: int = 0
    variance_count: int = 0
    created_at: datetime | str | None = None


# ── Draw Line Item ────────────────────────────────────────────────

class DrawLineItemUpdate(BaseModel):
    line_item_id: UUID
    current_draw: Decimal = Decimal("0")
    materials_stored: Decimal = Decimal("0")
    override_reason: str | None = None


class DrawLineItemBatchUpdate(BaseModel):
    items: list[DrawLineItemUpdate]
    actor: str | None = None


class DrawLineItemResponse(BaseModel):
    line_item_id: UUID
    draw_request_id: UUID
    cost_code: str
    description: str
    contract_id: UUID | None = None
    vendor_id: UUID | None = None
    scheduled_value: Decimal = Decimal("0")
    previous_draws: Decimal = Decimal("0")
    current_draw: Decimal = Decimal("0")
    materials_stored: Decimal = Decimal("0")
    total_completed: Decimal = Decimal("0")
    percent_complete: Decimal = Decimal("0")
    retainage_pct: Decimal = Decimal("10.0000")
    retainage_amount: Decimal = Decimal("0")
    balance_to_finish: Decimal = Decimal("0")
    variance_flag: bool = False
    variance_reason: str | None = None
    override_reason: str | None = None
    created_at: datetime | str | None = None


# ── Invoice ───────────────────────────────────────────────────────

class InvoiceResponse(BaseModel):
    invoice_id: UUID
    project_id: UUID
    draw_request_id: UUID | None = None
    vendor_id: UUID | None = None
    contract_id: UUID | None = None
    invoice_number: str | None = None
    invoice_date: date | None = None
    total_amount: Decimal = Decimal("0")
    ocr_status: str = "pending"
    ocr_raw_json: dict[str, Any] = Field(default_factory=dict)
    ocr_confidence: Decimal = Decimal("0")
    match_status: str = "unmatched"
    match_confidence: Decimal = Decimal("0")
    matched_cost_code: str | None = None
    matched_line_item_id: UUID | None = None
    file_name: str | None = None
    status: str = "uploaded"
    line_items: list[InvoiceLineItemResponse] = Field(default_factory=list)
    created_at: datetime | str | None = None


class InvoiceLineItemResponse(BaseModel):
    invoice_line_id: UUID
    invoice_id: UUID
    line_number: int
    description: str | None = None
    cost_code: str | None = None
    quantity: Decimal | None = None
    unit_price: Decimal | None = None
    amount: Decimal = Decimal("0")
    match_confidence: Decimal = Decimal("0")
    matched_draw_line_id: UUID | None = None
    match_strategy: str | None = None
    match_status: str = "unmatched"
    created_at: datetime | str | None = None


class InvoiceMatchOverride(BaseModel):
    invoice_line_id: UUID
    draw_line_item_id: UUID
    actor: str | None = None


class InvoiceAssignToDraw(BaseModel):
    draw_request_id: UUID
    actor: str | None = None


# ── Inspection ────────────────────────────────────────────────────

class InspectionCreate(BaseModel):
    draw_request_id: UUID | None = None
    inspector_name: str = Field(min_length=1, max_length=300)
    inspection_date: date
    inspection_type: str = "progress"
    overall_pct_complete: Decimal | None = None
    findings: str | None = None
    recommendations: str | None = None
    passed: bool | None = None
    photo_urls: list[str] = Field(default_factory=list)
    created_by: str | None = None


class InspectionResponse(BaseModel):
    inspection_id: UUID
    project_id: UUID
    draw_request_id: UUID | None = None
    inspector_name: str
    inspection_date: date
    inspection_type: str
    overall_pct_complete: Decimal | None = None
    findings: str | None = None
    recommendations: str | None = None
    passed: bool | None = None
    photo_urls: list[Any] = Field(default_factory=list)
    created_at: datetime | str | None = None


# ── Approval / Rejection ─────────────────────────────────────────

class DrawApproval(BaseModel):
    actor: str = Field(min_length=1, max_length=300)


class DrawRejection(BaseModel):
    actor: str = Field(min_length=1, max_length=300)
    rejection_reason: str = Field(min_length=1, max_length=2000)


# ── Portfolio / Reporting ─────────────────────────────────────────

class DrawPortfolioProject(BaseModel):
    project_id: UUID
    project_name: str
    total_draws: int = 0
    total_drawn: Decimal = Decimal("0")
    total_retainage: Decimal = Decimal("0")
    latest_draw_number: int | None = None
    latest_status: str | None = None


class DrawPortfolioSummary(BaseModel):
    total_projects: int = 0
    total_draws: int = 0
    total_drawn_amount: Decimal = Decimal("0")
    total_retainage: Decimal = Decimal("0")
    pending_draws: int = 0
    projects: list[DrawPortfolioProject] = Field(default_factory=list)


class BudgetVsActualLine(BaseModel):
    cost_code: str
    description: str
    approved_budget: Decimal = Decimal("0")
    committed: Decimal = Decimal("0")
    total_drawn: Decimal = Decimal("0")
    balance_remaining: Decimal = Decimal("0")
    percent_drawn: Decimal = Decimal("0")


# ── Audit ─────────────────────────────────────────────────────────

class DrawAuditEntry(BaseModel):
    audit_id: UUID
    entity_type: str
    entity_id: UUID
    action: str
    previous_state: dict[str, Any] | None = None
    new_state: dict[str, Any] | None = None
    actor: str
    hitl_approval: bool = False
    created_at: datetime | str | None = None


# Resolve forward references
DrawRequestResponse.model_rebuild()
