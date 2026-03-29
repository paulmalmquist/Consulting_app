from typing import Any, Optional

from pydantic import BaseModel, Field


class ExcelSessionCompleteRequest(BaseModel):
    api_key: str | None = None
    code: str | None = None


class ExcelQueryRequest(BaseModel):
    env_id: str | None = None
    entity: str
    filters: dict[str, Any] | None = None
    select: list[str] | None = None
    limit: int | None = 200
    order_by: list[str] | None = None


class ExcelUpsertRequest(BaseModel):
    env_id: str | None = None
    entity: str
    rows: list[dict[str, Any]]
    key_fields: list[str] | None = None
    workbook_id: str | None = None


class ExcelDeleteRequest(BaseModel):
    env_id: str | None = None
    entity: str
    key_fields: list[str]
    keys: list[dict[str, Any]]
    workbook_id: str | None = None


class ExcelMetricRequest(BaseModel):
    env_id: str
    metric_name: str
    params: dict[str, Any] | None = None


class ExcelAuditWriteRequest(BaseModel):
    env_id: str
    workbook_id: str
    action: str
    entity_type: str
    entity_id: str
    details: dict[str, Any] | None = None


class LegacyPipelineStageRequest(BaseModel):
    stage_name: str
    workbook_id: str | None = None


class LegacyUploadResponse(BaseModel):
    doc_id: str
    chunks: int = 0


class LegacyChatRequest(BaseModel):
    env_id: str
    message: str
    limit: Optional[int] = 5
    doc_type: Optional[str] = None
    asset_id: Optional[str] = None
    verified_only: bool = False


class LegacyChatCitation(BaseModel):
    doc_id: Optional[str] = None
    filename: Optional[str] = None
    chunk_id: Optional[str] = None
    snippet: Optional[str] = None
    score: Optional[float] = None


class LegacyChatResponse(BaseModel):
    answer: str
    citations: list[LegacyChatCitation] = Field(default_factory=list)
    suggested_actions: list[dict[str, Any]] = Field(default_factory=list)
