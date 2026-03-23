from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query
from uuid import UUID

from app.schemas.extraction import (
    ExtractionDetailOut,
    ExtractionInitRequest,
    ExtractionRunRequest,
    ExtractedDocumentOut,
    ExtractedFieldOut,
)
from app.services.extraction import service

router = APIRouter(prefix="/api/extract", tags=["extract"])


@router.post("/init", response_model=ExtractedDocumentOut)
def init_extraction(req: ExtractionInitRequest):
    try:
        row = service.init_extraction(req.document_id, req.version_id, req.extraction_profile)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return ExtractedDocumentOut(**row)


@router.post("/run", response_model=ExtractionDetailOut)
def run_extraction(req: ExtractionRunRequest):
    try:
        out = service.run_extraction(req.extracted_document_id)
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return ExtractionDetailOut(**out)


@router.get("/{extracted_document_id}", response_model=ExtractionDetailOut)
def get_extraction(extracted_document_id: UUID):
    try:
        out = service.get_extracted_document(extracted_document_id)
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return ExtractionDetailOut(**out)


@router.get("/{extracted_document_id}/fields", response_model=list[ExtractedFieldOut])
def get_fields(extracted_document_id: UUID):
    return [ExtractedFieldOut(**r) for r in service.get_fields(extracted_document_id)]


@router.get("/{extracted_document_id}/evidence")
def get_evidence(extracted_document_id: UUID, page: int | None = Query(default=None)):
    return service.get_evidence(extracted_document_id, page)
