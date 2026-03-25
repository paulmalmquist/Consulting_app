from fastapi import APIRouter, HTTPException, Query
from uuid import UUID
from typing import Optional
from app.schemas.work import (
    CreateWorkItemRequest,
    CreateWorkItemResponse,
    AddCommentRequest,
    AddCommentResponse,
    UpdateStatusRequest,
    UpdateStatusResponse,
    ResolveItemRequest,
    ResolveItemResponse,
    WorkItemOut,
    WorkItemDetailOut,
)
from app.services import work as work_svc

router = APIRouter(prefix="/api/work")


@router.get("/items", response_model=list[WorkItemOut])
def list_work_items(
    business_id: UUID = Query(...),
    owner: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    type: Optional[str] = Query(None),
    department_id: Optional[UUID] = Query(None),
    capability_id: Optional[UUID] = Query(None),
    limit: int = Query(50, le=200),
    cursor: Optional[str] = Query(None),
):
    rows = work_svc.list_items(
        business_id=business_id,
        owner=owner,
        status=status,
        item_type=type,
        department_id=department_id,
        capability_id=capability_id,
        limit=limit,
        cursor_after=cursor,
    )
    return [WorkItemOut(**r) for r in rows]


@router.get("/items/{work_item_id}", response_model=WorkItemDetailOut)
def get_work_item(work_item_id: UUID):
    item = work_svc.get_item(work_item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Work item not found")
    return WorkItemDetailOut(**item)


@router.post("/items", response_model=CreateWorkItemResponse)
def create_work_item(req: CreateWorkItemRequest):
    try:
        result = work_svc.create_item(
            business_id=req.business_id,
            title=req.title,
            owner=req.owner,
            item_type=req.type.value,
            created_by=req.owner,
            department_id=req.department_id,
            capability_id=req.capability_id,
            priority=req.priority,
            description=req.description,
        )
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return CreateWorkItemResponse(**result)


@router.post("/items/{work_item_id}/comments", response_model=AddCommentResponse)
def add_comment(work_item_id: UUID, req: AddCommentRequest):
    try:
        result = work_svc.add_comment(
            work_item_id=work_item_id,
            comment_type=req.comment_type.value,
            author=req.author,
            body=req.body,
        )
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return AddCommentResponse(**result)


@router.post("/items/{work_item_id}/status", response_model=UpdateStatusResponse)
def update_status(work_item_id: UUID, req: UpdateStatusRequest):
    try:
        result = work_svc.update_status(
            work_item_id=work_item_id,
            new_status=req.status.value,
            actor=req.rationale or "system",
            rationale=req.rationale,
        )
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return UpdateStatusResponse(**result)


@router.post("/items/{work_item_id}/resolve", response_model=ResolveItemResponse)
def resolve_item(work_item_id: UUID, req: ResolveItemRequest):
    try:
        result = work_svc.resolve_item(
            work_item_id=work_item_id,
            summary=req.summary,
            outcome=req.outcome.value,
            created_by="system",
            linked_documents=req.linked_documents,
            linked_executions=req.linked_executions,
        )
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return ResolveItemResponse(**result)
