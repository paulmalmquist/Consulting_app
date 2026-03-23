from fastapi import APIRouter, Query
from uuid import UUID
from typing import Optional
from app.schemas.audit import AuditEventOut
from app.services import audit as audit_svc

router = APIRouter(prefix="/api/audit")


@router.get("/events", response_model=list[AuditEventOut])
def list_audit_events(
    business_id: Optional[UUID] = Query(None),
    tool_name: Optional[str] = Query(None),
    success: Optional[bool] = Query(None),
    limit: int = Query(50, le=200),
    cursor: Optional[str] = Query(None),
):
    rows = audit_svc.list_events(
        business_id=business_id,
        tool_name=tool_name,
        success=success,
        limit=limit,
        cursor_after=cursor,
    )
    return [AuditEventOut(**r) for r in rows]
