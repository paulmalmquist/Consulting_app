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


class ProcessDdqInput(BaseModel):
    model_config = {"extra": "ignore"}
    document_id: UUID = Field(description="DDQ document to process")
    fund_id: UUID = Field(description="Fund to search document corpus for")
    env_id: str = Field(description="Environment ID")
    business_id: str = Field(description="Business ID")


class ExtractOperatingStatementInput(BaseModel):
    model_config = {"extra": "ignore"}
    document_id: UUID = Field(description="Document to extract financial data from")
    asset_id: UUID = Field(description="Target asset for extracted data")
    env_id: str = Field(description="Environment ID")
    business_id: str = Field(description="Business ID")


class ConfirmExtractionInput(BaseModel):
    model_config = {"extra": "ignore"}
    extracted_document_id: UUID = Field(description="Extraction result to confirm")
    asset_id: UUID = Field(description="Target asset for write-back")
    approved_fields: list[str] = Field(description="List of field keys to write back")
    confirm: bool = Field(False, description="Must be true to execute write")
