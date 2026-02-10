from fastapi import APIRouter, HTTPException, Query
from uuid import UUID
from typing import Optional
from app.schemas.documents import (
    InitUploadRequest,
    InitUploadResponse,
    CompleteUploadRequest,
    DocumentOut,
    DocumentVersionOut,
    DownloadUrlResponse,
)
from app.schemas.business import OkResponse
from app.services import documents as doc_svc

router = APIRouter(prefix="/api/documents")


@router.post("/init-upload", response_model=InitUploadResponse)
def init_upload(req: InitUploadRequest):
    try:
        result = doc_svc.init_upload(
            business_id=req.business_id,
            filename=req.filename,
            content_type=req.content_type,
            department_id=req.department_id,
            title=req.title,
            virtual_path=req.virtual_path,
        )
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return InitUploadResponse(**result)


@router.post("/complete-upload", response_model=OkResponse)
def complete_upload(req: CompleteUploadRequest):
    try:
        doc_svc.complete_upload(req.document_id, req.version_id, req.sha256, req.byte_size)
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return OkResponse()


@router.get("", response_model=list[DocumentOut])
def list_documents(
    business_id: UUID = Query(...),
    department_id: Optional[UUID] = Query(None),
):
    rows = doc_svc.list_documents(business_id, department_id)
    return [DocumentOut(**r) for r in rows]


@router.get("/{document_id}/versions", response_model=list[DocumentVersionOut])
def list_versions(document_id: UUID):
    rows = doc_svc.list_versions(document_id)
    return [DocumentVersionOut(**r) for r in rows]


@router.get("/{document_id}/versions/{version_id}/download-url", response_model=DownloadUrlResponse)
def get_download_url(document_id: UUID, version_id: UUID):
    try:
        signed_url = doc_svc.get_download_url(document_id, version_id)
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return DownloadUrlResponse(signed_download_url=signed_url)
