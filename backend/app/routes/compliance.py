from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from uuid import UUID

from app.schemas.compliance import (
    AccessReviewCreateRequest,
    AccessReviewSignoffRequest,
    BackupVerificationRequest,
    ControlOut,
    EvidenceExportRequest,
    IncidentCreateRequest,
    IncidentTimelineRequest,
    ConfigChangeRequest,
    DeploymentLogRequest,
)
from app.services import compliance as compliance_svc

router = APIRouter(prefix="/api/compliance", tags=["compliance"])


@router.get("/controls", response_model=list[ControlOut])
def list_controls():
    rows = compliance_svc.list_controls()
    return [ControlOut(**r) for r in rows]


@router.post("/evidence/export")
def export_evidence(req: EvidenceExportRequest):
    rows, csv_text = compliance_svc.evidence_for_control(
        req.control_id, req.from_date, req.to_date
    )
    return JSONResponse(
        {
            "control_id": req.control_id,
            "from_date": req.from_date.isoformat(),
            "to_date": req.to_date.isoformat(),
            "json": rows,
            "csv": csv_text,
        }
    )


@router.post("/access-reviews")
def create_access_review(req: AccessReviewCreateRequest):
    return compliance_svc.create_access_review(
        review_period_start=req.review_period_start,
        review_period_end=req.review_period_end,
        generated_by=req.generated_by,
        tenant_id=req.tenant_id,
    )


@router.post("/access-reviews/{review_id}/signoff")
def signoff_access_review(review_id: UUID, req: AccessReviewSignoffRequest):
    try:
        return compliance_svc.signoff_access_review(
            review_id, req.reviewer, req.signoff_notes
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.post("/backups/verify")
def record_backup_verification(req: BackupVerificationRequest):
    return compliance_svc.record_backup_verification(
        environment=req.environment,
        backup_tested_at=req.backup_tested_at,
        restore_confirmed=req.restore_confirmed,
        evidence_notes=req.evidence_notes,
        recorded_by=req.recorded_by,
    )


@router.post("/incidents")
def create_incident(req: IncidentCreateRequest):
    return compliance_svc.create_incident(
        title=req.title,
        severity=req.severity,
        created_by=req.created_by,
        tenant_id=req.tenant_id,
    )


@router.post("/incidents/{incident_id}/timeline")
def add_incident_timeline(incident_id: UUID, req: IncidentTimelineRequest):
    return compliance_svc.add_incident_timeline(
        incident_id=incident_id,
        actor=req.actor,
        note=req.note,
    )


@router.post("/config-changes")
def record_config_change(req: ConfigChangeRequest):
    return compliance_svc.record_config_change(
        changed_by=req.changed_by,
        config_type=req.config_type,
        config_key=req.config_key,
        before_state=req.before_state,
        after_state=req.after_state,
        tenant_id=req.tenant_id,
    )


@router.post("/deployments")
def log_deployment(req: DeploymentLogRequest):
    return compliance_svc.log_deployment(
        commit_hash=req.commit_hash,
        environment=req.environment,
        deployed_by=req.deployed_by,
    )


@router.get("/event-log")
def list_event_log(
    user_id: str | None = None,
    entity_type: str | None = None,
    from_date: str | None = None,
    to_date: str | None = None,
    limit: int = 200,
):
    from_dt = None
    to_dt = None
    if from_date:
        from_dt = __import__("datetime").datetime.fromisoformat(from_date)
    if to_date:
        to_dt = __import__("datetime").datetime.fromisoformat(to_date)
    return compliance_svc.list_event_log(
        user_id=user_id,
        entity_type=entity_type,
        from_date=from_dt,
        to_date=to_dt,
        limit=limit,
    )
