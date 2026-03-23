from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class NvContextOut(BaseModel):
    env_id: str
    business_id: UUID
    created: bool
    source: str
    diagnostics: dict[str, Any] = Field(default_factory=dict)


# ---------------------------------------------------------------------------
# Source Artifacts
# ---------------------------------------------------------------------------

class ArtifactCreateRequest(BaseModel):
    account_id: UUID
    system_id: UUID | None = None
    filename: str = Field(min_length=1, max_length=500)
    mime_type: str | None = None
    size_bytes: int | None = None
    storage_key: str | None = None
    file_type: str = "other"
    notes: str | None = None


class ArtifactOut(BaseModel):
    artifact_id: UUID
    account_id: UUID
    system_id: UUID | None = None
    filename: str
    mime_type: str | None = None
    size_bytes: int | None = None
    storage_key: str | None = None
    file_type: str
    row_count: int | None = None
    column_count: int | None = None
    schema_inferred: dict[str, Any] | None = None
    column_profile: dict[str, Any] | None = None
    processing_status: str
    notes: str | None = None
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# Ingestion Jobs
# ---------------------------------------------------------------------------

class IngestionJobOut(BaseModel):
    job_id: UUID
    artifact_id: UUID
    job_type: str
    status: str
    rows_processed: int
    rows_failed: int
    error_message: str | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    result_json: dict[str, Any] | None = None
    created_at: datetime


# ---------------------------------------------------------------------------
# Canonical Entities
# ---------------------------------------------------------------------------

class EntityCreateRequest(BaseModel):
    account_id: UUID
    entity_name: str = Field(min_length=1, max_length=200)
    description: str | None = None


class EntityOut(BaseModel):
    entity_id: UUID
    account_id: UUID
    entity_name: str
    description: str | None = None
    source_count: int
    field_count: int
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# Entity Mappings
# ---------------------------------------------------------------------------

class EntityMappingCreateRequest(BaseModel):
    entity_id: UUID
    system_id: UUID | None = None
    source_table: str | None = None
    source_description: str | None = None
    confidence_score: Decimal = Decimal("0.50")
    notes: str | None = None


class EntityMappingOut(BaseModel):
    mapping_id: UUID
    entity_id: UUID
    system_id: UUID | None = None
    source_table: str | None = None
    source_description: str | None = None
    confidence_score: Decimal | None = None
    notes: str | None = None
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# Field Mappings
# ---------------------------------------------------------------------------

class FieldMappingCreateRequest(BaseModel):
    mapping_id: UUID
    source_field: str = Field(min_length=1)
    target_field: str = Field(min_length=1)
    data_type: str | None = None
    transformation_rule: str | None = None
    confidence_score: Decimal = Decimal("0.50")
    notes: str | None = None


class FieldMappingOut(BaseModel):
    field_mapping_id: UUID
    mapping_id: UUID
    source_field: str
    target_field: str
    data_type: str | None = None
    transformation_rule: str | None = None
    confidence_score: Decimal | None = None
    notes: str | None = None
    created_at: datetime
