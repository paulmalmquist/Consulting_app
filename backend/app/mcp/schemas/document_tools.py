"""Schemas for documents module MCP tools."""

from pydantic import BaseModel, Field
from typing import Optional
from uuid import UUID


class InitUploadInput(BaseModel):
    model_config = {"extra": "forbid"}
    business_id: UUID
    filename: str
    content_type: str
    department_id: Optional[UUID] = None
    title: Optional[str] = None
    virtual_path: Optional[str] = None
    confirm: bool = Field(False, description="Must be true to execute write")


class CompleteUploadInput(BaseModel):
    model_config = {"extra": "forbid"}
    document_id: UUID
    version_id: UUID
    sha256: str
    byte_size: int
    confirm: bool = Field(False, description="Must be true to execute write")


class ListDocumentsInput(BaseModel):
    model_config = {"extra": "forbid"}
    business_id: UUID
    department_id: Optional[UUID] = None
    tags: Optional[list[str]] = None


class GetVersionsInput(BaseModel):
    model_config = {"extra": "forbid"}
    document_id: UUID


class GetDownloadUrlInput(BaseModel):
    model_config = {"extra": "forbid"}
    document_id: UUID
    version_id: UUID


class TagDocumentInput(BaseModel):
    model_config = {"extra": "forbid"}
    document_id: UUID
    tag: str
    action: str = Field("add", description="'add' or 'remove'")
    confirm: bool = Field(False, description="Must be true to execute write")
