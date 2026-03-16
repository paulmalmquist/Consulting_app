"""CRE Submission Portal API route."""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app.services import cre_submission

router = APIRouter(prefix="/api/re/v2/intelligence", tags=["cre-submission"])


@router.post("/submit")
async def submit_file(
    file: UploadFile = File(...),
    env_id: UUID = Form(...),
    business_id: UUID = Form(...),
):
    """Upload a vendor file (CSV, Excel, PDF) for auto-detection and ingestion."""
    try:
        content = await file.read()
        return cre_submission.process_submission(
            env_id=env_id,
            business_id=business_id,
            filename=file.filename or "unknown",
            content=content,
        )
    except Exception as exc:
        raise HTTPException(500, {"error_code": "SUBMISSION_ERROR", "message": str(exc)})
