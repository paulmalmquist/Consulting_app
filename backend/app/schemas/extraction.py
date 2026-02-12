from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class ExtractionInitRequest(BaseModel):
    document_id: UUID
    version_id: UUID
    extraction_profile: str = "loan_real_estate_v1"


class ExtractionRunRequest(BaseModel):
    extracted_document_id: UUID


class EvidenceRef(BaseModel):
    page: int
    snippet: str


class ExtractedFieldOut(BaseModel):
    id: UUID
    extracted_document_id: UUID
    field_key: str
    field_value_json: Any
    confidence: float | None = None
    evidence_json: dict[str, Any]
    created_at: datetime


class ExtractedDocumentOut(BaseModel):
    id: UUID
    document_id: UUID
    document_version_id: UUID
    doc_type: str
    status: str
    created_at: datetime


class ExtractionRunOut(BaseModel):
    id: UUID
    extracted_document_id: UUID
    run_hash: str
    engine_version: str
    status: str
    error: str | None = None
    started_at: datetime
    completed_at: datetime | None = None


class ExtractionDetailOut(BaseModel):
    extracted_document: ExtractedDocumentOut
    latest_run: ExtractionRunOut | None = None
    fields: list[ExtractedFieldOut] = Field(default_factory=list)
