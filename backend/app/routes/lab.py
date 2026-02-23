"""Lab endpoints — /v1/* routes for the Demo Lab UI.

These replace the temporary stub routes that were in the Next.js frontend.
"""

from fastapi import APIRouter, HTTPException, Query
from uuid import UUID
from typing import Optional
from app.schemas.lab import (
    EnvironmentOut,
    CreateEnvironmentRequest,
    CreateEnvironmentResponse,
    UpdateEnvironmentRequest,
    EnvironmentHealthResponse,
    QueueItem,
    QueueDecisionRequest,
    AuditItem,
    MetricsOut,
    ChatRequest,
    ChatResponse,
)
from app.services import lab as lab_svc

router = APIRouter(prefix="/v1")


# ── Health ────────────────────────────────────────────────────────────

@router.get("/health")
def lab_health():
    return {"ok": True}


# ── Environments ──────────────────────────────────────────────────────

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


@router.post("/environments/{env_id}/reset")
def reset_environment(env_id: UUID):
    lab_svc.reset_environment(env_id)
    return {"ok": True, "message": "Environment reset and reseeded."}


# ── Environment Health ────────────────────────────────────────────────

@router.get("/env/{env_id}/health", response_model=EnvironmentHealthResponse)
def environment_health(env_id: UUID):
    try:
        result = lab_svc.get_environment_health(env_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return EnvironmentHealthResponse(**result)


# ── Queue (HITL) ──────────────────────────────────────────────────────

@router.get("/queue")
def list_queue(env_id: Optional[str] = Query(None)):
    items = lab_svc.list_queue_items(env_id)
    return {"items": [QueueItem(**i) for i in items]}


@router.post("/queue/{item_id}/decision")
def decide_queue_item(item_id: UUID, req: QueueDecisionRequest):
    lab_svc.decide_queue_item(item_id, req.decision, req.reason)
    return {"ok": True, "decision": req.decision}


# ── Audit ─────────────────────────────────────────────────────────────

@router.get("/audit")
def list_audit(env_id: Optional[str] = Query(None)):
    items = lab_svc.list_audit_items(env_id)
    return {"items": [AuditItem(**i) for i in items]}


# ── Metrics ───────────────────────────────────────────────────────────

@router.get("/metrics", response_model=MetricsOut)
def get_metrics(env_id: Optional[str] = Query(None)):
    return MetricsOut(**lab_svc.get_metrics(env_id))


# ── Chat ──────────────────────────────────────────────────────────────

@router.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest):
    # For now, provide a helpful response. The AI sidecar integration
    # can be wired in later when the LLM backend is deployed.
    return ChatResponse(
        answer=(
            "I received your message. The AI chat backend is being configured. "
            "In the meantime, you can use the Queue, Audit, and Metrics pages "
            "to explore the demo environment."
        ),
        citations=[],
        suggested_actions=[],
    )
