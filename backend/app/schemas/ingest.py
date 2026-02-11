from __future__ import annotations

from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class IngestSourceCreateRequest(BaseModel):
    business_id: Optional[UUID] = None
    env_id: Optional[UUID] = None
    name: str
    description: Optional[str] = None
    document_id: UUID
    document_version_id: Optional[UUID] = None
    file_type: Optional[str] = None
    uploaded_by: Optional[str] = None


class IngestSourceOut(BaseModel):
    id: UUID
    business_id: Optional[UUID] = None
    env_id: Optional[UUID] = None
    name: str
    description: Optional[str] = None
    document_id: UUID
    file_type: str
    status: str
    created_at: datetime
    updated_at: datetime
    latest_version_num: Optional[int] = None
    latest_document_version_id: Optional[UUID] = None


class IngestSourceVersionOut(BaseModel):
    id: UUID
    ingest_source_id: UUID
    document_version_id: UUID
    version_num: int
    uploaded_at: datetime
    uploaded_by: Optional[str] = None


class ProfileColumn(BaseModel):
    name: str
    inferred_type: str
    nonnull_count: int
    distinct_count: int
    sample_values: list[str] = Field(default_factory=list)


class ProfileKeyCandidate(BaseModel):
    column: str
    uniqueness_ratio: float
    completeness_ratio: float


class SheetProfile(BaseModel):
    sheet_name: str
    header_row_index: int
    total_rows: int
    columns: list[ProfileColumn] = Field(default_factory=list)
    sample_rows: list[dict[str, Any]] = Field(default_factory=list)
    key_candidates: list[ProfileKeyCandidate] = Field(default_factory=list)
    detected_delimiter: Optional[str] = None


class DetectedTable(BaseModel):
    sheet_name: str
    row_count: int
    column_count: int


class IngestProfileResponse(BaseModel):
    source_id: UUID
    source_version_id: UUID
    file_type: str
    version_num: int
    sheets: list[SheetProfile] = Field(default_factory=list)
    detected_tables: list[DetectedTable] = Field(default_factory=list)


class IngestRecipeMappingInput(BaseModel):
    source_column: str
    target_column: str
    transform_json: dict[str, Any] = Field(default_factory=dict)
    required: bool = False
    mapping_order: int = 0


class IngestRecipeTransformStepInput(BaseModel):
    step_order: int
    step_type: str
    config_json: dict[str, Any] = Field(default_factory=dict)


class IngestRecipeCreateRequest(BaseModel):
    target_table_key: str
    mode: str = "upsert"
    primary_key_fields: list[str] = Field(default_factory=list)
    settings_json: dict[str, Any] = Field(default_factory=dict)
    mappings: list[IngestRecipeMappingInput] = Field(default_factory=list)
    transform_steps: list[IngestRecipeTransformStepInput] = Field(default_factory=list)


class IngestRecipeMappingOut(BaseModel):
    id: UUID
    ingest_recipe_id: UUID
    source_column: str
    target_column: str
    transform_json: dict[str, Any] = Field(default_factory=dict)
    required: bool
    mapping_order: int


class IngestRecipeTransformStepOut(BaseModel):
    id: UUID
    ingest_recipe_id: UUID
    step_order: int
    step_type: str
    config_json: dict[str, Any] = Field(default_factory=dict)


class IngestRecipeOut(BaseModel):
    id: UUID
    ingest_source_id: UUID
    target_table_key: str
    mode: str
    primary_key_fields: list[str] = Field(default_factory=list)
    settings_json: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime
    mappings: list[IngestRecipeMappingOut] = Field(default_factory=list)
    transform_steps: list[IngestRecipeTransformStepOut] = Field(default_factory=list)


class IngestValidationRequest(BaseModel):
    source_version_id: Optional[UUID] = None
    preview_rows: int = 50


class IngestRunErrorOut(BaseModel):
    row_number: Optional[int] = None
    column_name: Optional[str] = None
    error_code: str
    message: str
    raw_value: Optional[str] = None


class IngestValidateResponse(BaseModel):
    run_hash: str
    rows_read: int
    rows_valid: int
    rows_rejected: int
    preview_rows: list[dict[str, Any]] = Field(default_factory=list)
    errors: list[IngestRunErrorOut] = Field(default_factory=list)
    lineage: dict[str, Any] = Field(default_factory=dict)


class IngestRunRequest(BaseModel):
    source_version_id: Optional[UUID] = None


class IngestRunOut(BaseModel):
    id: UUID
    ingest_recipe_id: UUID
    source_version_id: UUID
    run_hash: str
    engine_version: str
    status: str
    rows_read: int
    rows_valid: int
    rows_inserted: int
    rows_updated: int
    rows_rejected: int
    started_at: datetime
    completed_at: Optional[datetime] = None
    error_summary: Optional[str] = None
    lineage_json: dict[str, Any] = Field(default_factory=dict)
    errors: list[IngestRunErrorOut] = Field(default_factory=list)


class IngestTableOut(BaseModel):
    table_key: str
    name: str
    kind: str
    business_id: Optional[UUID] = None
    env_id: Optional[UUID] = None
    row_count: int
    columns: list[str] = Field(default_factory=list)
    last_updated_at: Optional[datetime] = None


class IngestTableRowsResponse(BaseModel):
    table_key: str
    total_rows: int
    rows: list[dict[str, Any]] = Field(default_factory=list)


class IngestTargetColumn(BaseModel):
    name: str
    type: str
    required: bool = False


class IngestTargetOut(BaseModel):
    key: str
    label: str
    columns: list[IngestTargetColumn] = Field(default_factory=list)
    is_canonical: bool = True


class DataPointRegistryOut(BaseModel):
    id: UUID
    business_id: Optional[UUID] = None
    env_id: Optional[UUID] = None
    data_point_key: str
    source_table_key: str
    aggregation: str
    value_column: Optional[str] = None
    last_updated_at: Optional[datetime] = None
    row_count: int
    columns_json: list[str] = Field(default_factory=list)
    metadata_json: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime


class DataPointCreateRequest(BaseModel):
    business_id: Optional[UUID] = None
    env_id: Optional[UUID] = None
    data_point_key: str
    source_table_key: str
    aggregation: str
    value_column: Optional[str] = None
    columns_json: list[str] = Field(default_factory=list)
    metadata_json: dict[str, Any] = Field(default_factory=dict)


class MetricSuggestionOut(BaseModel):
    data_point_key: str
    source_table_key: str
    aggregation: str
    value_column: Optional[str] = None
    rationale: str


class MetricSuggestionResponse(BaseModel):
    table_key: str
    suggestions: list[MetricSuggestionOut] = Field(default_factory=list)
