from pydantic import BaseModel
from typing import Optional
from uuid import UUID
from datetime import datetime


class InitUploadRequest(BaseModel):
    business_id: UUID
    department_id: Optional[UUID] = None
    filename: str
    content_type: str
    title: Optional[str] = None
    virtual_path: Optional[str] = None


class InitUploadResponse(BaseModel):
    document_id: UUID
    version_id: UUID
    storage_key: str
    signed_upload_url: str


class CompleteUploadRequest(BaseModel):
    document_id: UUID
    version_id: UUID
    sha256: str
    byte_size: int


class DocumentOut(BaseModel):
    document_id: UUID
    business_id: Optional[UUID] = None
    department_id: Optional[UUID] = None
    title: str
    virtual_path: Optional[str] = None
    status: str
    created_at: datetime
    latest_version_number: Optional[int] = None
    latest_content_type: Optional[str] = None
    latest_size_bytes: Optional[int] = None


class DocumentVersionOut(BaseModel):
    version_id: UUID
    document_id: UUID
    version_number: int
    state: str
    original_filename: Optional[str] = None
    mime_type: Optional[str] = None
    size_bytes: Optional[int] = None
    content_hash: Optional[str] = None
    created_at: datetime


class DownloadUrlResponse(BaseModel):
    signed_download_url: str
