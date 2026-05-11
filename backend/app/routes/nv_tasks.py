"""
API routes for personal/operational tasks (nv_task table).
Prefix: /api/nv-tasks
"""
from __future__ import annotations

from datetime import date
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.services import nv_tasks as svc

router = APIRouter(prefix="/api/nv-tasks", tags=["nv-tasks"])

NOVENDOR_BUSINESS_ID = UUID("225f52ca-cdf4-4af9-a973-d1d310ddcba1")
NOVENDOR_ENV_ID = "62cfd59c-a171-4224-ad1e-fffc35bd1ef4"


class CreateTaskRequest(BaseModel):
    task_name: str
    priority: str = "medium"
    due_date: Optional[date] = None
    category: Optional[str] = None
    related_entity_id: Optional[str] = None
    assigned_to: Optional[str] = None
    notes: Optional[str] = None
    mobile_quick_action_flag: bool = False


class UpdateTaskRequest(BaseModel):
    task_name: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    due_date: Optional[date] = None
    category: Optional[str] = None
    related_entity_id: Optional[str] = None
    assigned_to: Optional[str] = None
    notes: Optional[str] = None
    mobile_quick_action_flag: Optional[bool] = None


def _resolve_context(business_id: Optional[UUID], env_id: Optional[str]):
    return (
        business_id or NOVENDOR_BUSINESS_ID,
        env_id or NOVENDOR_ENV_ID,
    )


@router.get("")
def list_tasks(
    business_id: Optional[UUID] = Query(None),
    env_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    priority: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
):
    bid, eid = _resolve_context(business_id, env_id)
    try:
        return svc.list_tasks(
            business_id=bid,
            env_id=eid,
            status=status,
            priority=priority,
            category=category,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/today")
def todays_tasks(
    business_id: Optional[UUID] = Query(None),
    env_id: Optional[str] = Query(None),
):
    """Tasks due today or overdue — for the Command Center widget."""
    bid, eid = _resolve_context(business_id, env_id)
    try:
        return svc.get_todays_tasks(business_id=bid, env_id=eid)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("")
def create_task(req: CreateTaskRequest):
    try:
        return svc.create_task(
            business_id=NOVENDOR_BUSINESS_ID,
            env_id=NOVENDOR_ENV_ID,
            task_name=req.task_name,
            priority=req.priority,
            due_date=req.due_date,
            category=req.category,
            related_entity_id=req.related_entity_id,
            assigned_to=req.assigned_to,
            notes=req.notes,
            mobile_quick_action_flag=req.mobile_quick_action_flag,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.patch("/{task_id}")
def update_task(task_id: UUID, req: UpdateTaskRequest):
    updates = req.model_dump(exclude_unset=True)
    # Map category -> related_entity_type for DB
    if "category" in updates:
        updates["related_entity_type"] = updates.pop("category")
    try:
        return svc.update_task(
            task_id=task_id,
            business_id=NOVENDOR_BUSINESS_ID,
            env_id=NOVENDOR_ENV_ID,
            updates=updates,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
