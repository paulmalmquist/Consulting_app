from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException

from app.schemas.reporting import MetricDefinitionsResponse, MetricsQueryRequest, MetricsQueryResponse
from app.services import metrics_semantic


router = APIRouter(prefix="/api/metrics", tags=["metrics-semantic"])


@router.get("/definitions", response_model=MetricDefinitionsResponse)
def get_metric_definitions(business_id: UUID):
    try:
        payload = metrics_semantic.list_metric_definitions(business_id=business_id)
        return MetricDefinitionsResponse(**payload)
    except Exception as exc:
        if isinstance(exc, LookupError):
            raise HTTPException(status_code=404, detail=str(exc))
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/query", response_model=MetricsQueryResponse)
def query_metrics(req: MetricsQueryRequest):
    try:
        payload = metrics_semantic.query_metrics(
            business_id=req.business_id,
            metric_keys=req.metric_keys,
            dimension=req.dimension,
            date_from=req.date_from,
            date_to=req.date_to,
            refresh=req.refresh,
        )
        return MetricsQueryResponse(**payload)
    except Exception as exc:
        if isinstance(exc, LookupError):
            raise HTTPException(status_code=404, detail=str(exc))
        raise HTTPException(status_code=400, detail=str(exc))
