from fastapi import APIRouter, HTTPException, Query
import time
from uuid import UUID
from typing import Optional
from app.schemas.documents import (
    InitUploadRequest,
    InitUploadResponse,
    CompleteUploadRequest,
    DocumentOut,
    DocumentVersionOut,
    DownloadUrlResponse,
    DocumentEntityType,
)
from app.schemas.business import OkResponse
from app.services import audit as audit_svc
from app.services import documents as doc_svc

router = APIRouter(prefix="/api/documents")


@router.post("/init-upload", response_model=InitUploadResponse)
def init_upload(req: InitUploadRequest):
    started = time.monotonic()
    try:
        result = doc_svc.init_upload(
            business_id=req.business_id,
            filename=req.filename,
            content_type=req.content_type,
            department_id=req.department_id,
            title=req.title,
            virtual_path=req.virtual_path,
            entity_type=req.entity_type,
            entity_id=req.entity_id,
            env_id=req.env_id,
        )
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if req.entity_type and req.entity_id and req.env_id:
        audit_svc.record_event(
            actor="api_user",
            action="document.attach",
            tool_name="documents.init_upload",
            success=True,
            latency_ms=int((time.monotonic() - started) * 1000),
            business_id=req.business_id,
            object_type=req.entity_type,
            object_id=req.entity_id,
            input_data={
                "env_id": str(req.env_id),
                "document_id": result.get("document_id"),
                "virtual_path": req.virtual_path,
            },
        )
    return InitUploadResponse(**result)


@router.post("/complete-upload", response_model=OkResponse)
def complete_upload(req: CompleteUploadRequest):
    started = time.monotonic()
    try:
        doc_svc.complete_upload(
            req.document_id,
            req.version_id,
            req.sha256,
            req.byte_size,
            entity_type=req.entity_type,
            entity_id=req.entity_id,
            env_id=req.env_id,
        )
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if req.entity_type and req.entity_id and req.env_id:
        audit_svc.record_event(
            actor="api_user",
            action="document.attach",
            tool_name="documents.complete_upload",
            success=True,
            latency_ms=int((time.monotonic() - started) * 1000),
            object_type=req.entity_type,
            object_id=req.entity_id,
            input_data={
                "env_id": str(req.env_id),
                "document_id": str(req.document_id),
            },
        )
    return OkResponse()


@router.get("", response_model=list[DocumentOut])
def list_documents(
    business_id: UUID = Query(...),
    department_id: Optional[UUID] = Query(None),
    env_id: Optional[UUID] = Query(None),
    entity_type: Optional[DocumentEntityType] = Query(None),
    entity_id: Optional[UUID] = Query(None),
):
    try:
        rows = doc_svc.list_documents(
            business_id,
            department_id,
            env_id=env_id,
            entity_type=entity_type,
            entity_id=entity_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
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
