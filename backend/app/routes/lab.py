"""Lab endpoints — /v1/* routes for the Demo Lab UI."""

import json
import os
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Body, HTTPException, Query, Request

from app.schemas.lab import (
    AuditItem,
    CreateEnvironmentRequest,
    CreateEnvironmentResponse,
    CreatePipelineCardRequest,
    CreatePipelineStageRequest,
    DeleteEnvironmentResponse,
    DeletePipelineCardResponse,
    DeletePipelineStageResponse,
    EnvironmentHealthResponse,
    EnvironmentOut,
    MetricsOut,
    PipelineBoardOut,
    PipelineCardOut,
    PipelineStageOut,
    QueueDecisionRequest,
    QueueItem,
    UpdateEnvironmentRequest,
    UpdatePipelineCardRequest,
    UpdatePipelineStageRequest,
)
from app.schemas.lab_excel import (
    ExcelAuditWriteRequest,
    ExcelDeleteRequest,
    ExcelMetricRequest,
    ExcelQueryRequest,
    ExcelSessionCompleteRequest,
    ExcelUpsertRequest,
    LegacyChatRequest,
    LegacyChatResponse,
    LegacyPipelineStageRequest,
    LegacyUploadResponse,
)
from app.services import lab as lab_svc
from app.services import lab_compat as lab_compat_svc
from app.services import lab_excel as lab_excel_svc

router = APIRouter(prefix="/v1")


@router.get("/health")
def lab_health():
    return {"ok": True}


@router.get("/environments")
def list_environments():
    envs = lab_svc.list_environments()
    return {"environments": [EnvironmentOut(**e) for e in envs]}


@router.get("/environments/{env_id}", response_model=EnvironmentOut)
def get_environment(env_id: UUID):
    result = lab_svc.get_environment(env_id)
    if not result:
        raise HTTPException(status_code=404, detail="Environment not found")
    return EnvironmentOut(**result)


@router.post("/environments", response_model=CreateEnvironmentResponse, status_code=201)
def create_environment(req: CreateEnvironmentRequest):
    result = lab_svc.create_environment(
        req.client_name,
        req.industry,
        req.industry_type,
        req.workspace_template_key,
        req.notes,
    )
    return CreateEnvironmentResponse(**result)


@router.patch("/environments/{env_id}", response_model=EnvironmentOut)
def update_environment(env_id: UUID, req: UpdateEnvironmentRequest):
    try:
        result = lab_svc.update_environment(env_id, req.model_dump(exclude_none=True))
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return EnvironmentOut(**result)


@router.delete("/environments/{env_id}", response_model=DeleteEnvironmentResponse)
def delete_environment(env_id: UUID):
    try:
        result = lab_svc.delete_environment(env_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return DeleteEnvironmentResponse(**result)


@router.post("/environments/{env_id}/reset")
def reset_environment(env_id: UUID):
    try:
        lab_svc.reset_environment(env_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return {"ok": True, "message": "Environment reset and reseeded."}


@router.get("/env/{env_id}/health", response_model=EnvironmentHealthResponse)
def environment_health(env_id: UUID):
    try:
        result = lab_svc.get_environment_health(env_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return EnvironmentHealthResponse(**result)


@router.get("/queue")
def list_queue(env_id: Optional[str] = Query(None)):
    items = lab_svc.list_queue_items(env_id)
    return {"items": [QueueItem(**i) for i in items]}


@router.post("/queue/{item_id}/decision")
def decide_queue_item(item_id: UUID, req: QueueDecisionRequest):
    try:
        lab_svc.decide_queue_item(item_id, req.decision, req.reason)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return {"ok": True, "decision": req.decision}


@router.get("/audit")
def list_audit(env_id: Optional[str] = Query(None)):
    items = lab_svc.list_audit_items(env_id)
    return {"items": [AuditItem(**i) for i in items]}


@router.get("/metrics", response_model=MetricsOut)
def get_metrics(env_id: Optional[str] = Query(None)):
    return MetricsOut(**lab_svc.get_metrics(env_id))


@router.get("/pipeline", response_model=PipelineBoardOut)
def get_pipeline(env_id: UUID = Query(...)):
    try:
        return PipelineBoardOut(**lab_svc.get_pipeline_board(env_id))
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.post("/pipeline/stages", status_code=201)
def create_pipeline_stage(req: CreatePipelineStageRequest):
    try:
        stage = lab_svc.create_pipeline_stage(
            env_id=req.env_id,
            stage_name=req.stage_name,
            order_index=req.order_index,
            color_token=req.color_token,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"stage": PipelineStageOut(**stage)}


@router.patch("/pipeline/stages/{stage_id}")
def update_pipeline_stage(stage_id: UUID, req: UpdatePipelineStageRequest):
    try:
        stage = lab_svc.update_pipeline_stage(stage_id, req.model_dump(exclude_none=False))
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"stage": PipelineStageOut(**stage)}


@router.delete("/pipeline/stages/{stage_id}", response_model=DeletePipelineStageResponse)
def delete_pipeline_stage(stage_id: UUID):
    try:
        result = lab_svc.delete_pipeline_stage(stage_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    return DeletePipelineStageResponse(**result)


@router.post("/pipeline/cards", status_code=201)
def create_pipeline_card(req: CreatePipelineCardRequest):
    try:
        card = lab_svc.create_pipeline_card(
            env_id=req.env_id,
            stage_id=req.stage_id,
            title=req.title,
            account_name=req.account_name,
            owner=req.owner,
            value_cents=req.value_cents,
            priority=req.priority,
            due_date=req.due_date,
            notes=req.notes,
            rank=req.rank,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"card": PipelineCardOut(**card)}


@router.patch("/pipeline/cards/{card_id}")
def update_pipeline_card(card_id: UUID, req: UpdatePipelineCardRequest):
    try:
        card = lab_svc.update_pipeline_card(card_id, req.model_dump(exclude_none=False))
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"card": PipelineCardOut(**card)}


@router.delete("/pipeline/cards/{card_id}", response_model=DeletePipelineCardResponse)
def delete_pipeline_card(card_id: UUID):
    try:
        result = lab_svc.delete_pipeline_card(card_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return DeletePipelineCardResponse(**result)


@router.get("/pipeline/global")
def get_pipeline_global(env_id: Optional[UUID] = Query(None)):
    try:
        return lab_compat_svc.get_pipeline_global(env_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.get("/environments/{env_id}/pipeline")
def get_environment_pipeline(env_id: UUID):
    try:
        return lab_compat_svc.get_environment_pipeline(env_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.patch("/environments/{env_id}/pipeline-stage")
def set_environment_pipeline_stage(env_id: UUID, req: LegacyPipelineStageRequest):
    try:
        return lab_compat_svc.set_environment_pipeline_stage(env_id, req.stage_name, req.workbook_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/environments/{env_id}/pipeline/items")
def create_environment_pipeline_item(env_id: UUID, payload: dict = Body(...)):
    try:
        req = CreatePipelineCardRequest.model_validate({**payload, "env_id": str(env_id)})
        card = lab_svc.create_pipeline_card(
            env_id=req.env_id,
            stage_id=req.stage_id,
            title=req.title,
            account_name=req.account_name,
            owner=req.owner,
            value_cents=req.value_cents,
            priority=req.priority,
            due_date=req.due_date,
            notes=req.notes,
            rank=req.rank,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"card": PipelineCardOut(**card)}


@router.patch("/pipeline/items/{item_id}")
def update_pipeline_item(item_id: UUID, payload: dict = Body(...)):
    try:
        req = UpdatePipelineCardRequest.model_validate(payload)
        card = lab_svc.update_pipeline_card(item_id, req.model_dump(exclude_none=False))
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"card": PipelineCardOut(**card)}


@router.get("/environments/{env_id}/documents")
def list_documents(env_id: UUID):
    try:
        return lab_compat_svc.list_documents(env_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/environments/{env_id}/upload", response_model=LegacyUploadResponse)
async def upload_document(env_id: UUID, request: Request):
    try:
        form = await request.form()
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    file = form.get("file")
    if file is None or not hasattr(file, "read"):
        raise HTTPException(status_code=400, detail="file is required")

    doc_type = str(form.get("doc_type") or "").strip()
    if not doc_type:
        raise HTTPException(status_code=400, detail="doc_type is required")

    linked_entities_json = str(form.get("linked_entities_json") or "[]")
    try:
        linked_entities = json.loads(linked_entities_json) if linked_entities_json else []
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="linked_entities_json must be valid JSON")

    try:
        raw_bytes = await file.read()
        return lab_compat_svc.upload_document(
            env_id,
            filename=getattr(file, "filename", None) or "uploaded-document.txt",
            raw_bytes=raw_bytes,
            doc_type=doc_type,
            author=str(form.get("author") or "Demo Lab User"),
            verification_status=str(form.get("verification_status") or "draft"),
            source_type=str(form.get("source_type") or "upload"),
            linked_entities=linked_entities if isinstance(linked_entities, list) else [],
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/chat", response_model=LegacyChatResponse)
def chat(req: LegacyChatRequest):
    try:
        return lab_compat_svc.chat(
            UUID(req.env_id),
            message=req.message,
            limit=int(req.limit or 5),
            doc_type=req.doc_type,
            asset_id=req.asset_id,
            verified_only=req.verified_only,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.post("/excel/session/init")
def excel_session_init():
    required_key = bool(lab_excel_svc._configured_excel_api_key())
    return {"mode": "api_key", "requires_api_key": required_key, "auth_url": None}


@router.post("/excel/session/complete")
def excel_session_complete(req: ExcelSessionCompleteRequest):
    required_key = lab_excel_svc._configured_excel_api_key()
    candidate = (req.api_key or "").strip()
    if required_key and candidate != required_key:
        raise HTTPException(status_code=401, detail="Invalid Excel API key")
    token = candidate or "demo-excel-token"
    return {"access_token": token, "token_type": "Bearer", "expires_in": 24 * 60 * 60}


@router.get("/excel/me")
def excel_me(request: Request):
    lab_excel_svc.require_excel_actor(request.headers)
    return {
        "user_id": "excel-user",
        "email": os.getenv("EXCEL_DEFAULT_EMAIL", "excel.user@business-machine.local"),
        "org_name": os.getenv("EXCEL_DEFAULT_ORG", "Business Machine"),
        "permissions": [
            "excel:read",
            "excel:write",
            "environments:read",
            "environments:write",
            "pipeline:read",
            "pipeline:write",
        ],
    }


@router.get("/excel/schema")
def excel_schema(request: Request, env_id: Optional[str] = Query(None)):
    lab_excel_svc.require_excel_actor(request.headers)
    return lab_excel_svc.list_schema_entities(env_id)


@router.get("/excel/schema/{entity}")
def excel_schema_entity(entity: str, request: Request, env_id: Optional[str] = Query(None)):
    lab_excel_svc.require_excel_actor(request.headers)
    return lab_excel_svc.get_schema_entity(entity, env_id)


@router.post("/excel/query")
def excel_query(payload: ExcelQueryRequest, request: Request):
    lab_excel_svc.require_excel_actor(request.headers)
    return lab_excel_svc.query_rows(payload)


@router.post("/excel/upsert")
def excel_upsert(payload: ExcelUpsertRequest, request: Request):
    return lab_excel_svc.upsert_rows(payload, request.headers)


@router.post("/excel/delete")
def excel_delete(payload: ExcelDeleteRequest, request: Request):
    return lab_excel_svc.delete_rows(payload, request.headers)


@router.post("/excel/metric")
def excel_metric(payload: ExcelMetricRequest, request: Request):
    return lab_excel_svc.metric(payload, request.headers)


@router.get("/excel/audit")
def excel_audit(
    request: Request,
    workbook_id: Optional[str] = Query(None),
    env_id: Optional[str] = Query(None),
    limit: int = Query(default=100, ge=1, le=500),
):
    return lab_excel_svc.list_audit(env_id, workbook_id, limit, request.headers)


@router.post("/excel/audit")
def excel_audit_write(payload: ExcelAuditWriteRequest, request: Request):
    return lab_excel_svc.write_audit(payload, request.headers)
