from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Query

from app.schemas.tasks import MetricsResponse
from app.services import tasks as tasks_svc


router = APIRouter(prefix="/api/metrics", tags=["metrics"])


@router.get("", response_model=MetricsResponse)
def get_metrics(project_id: UUID | None = Query(None)):
    payload = tasks_svc.get_task_metrics(project_id=project_id)
    return MetricsResponse(**payload)
