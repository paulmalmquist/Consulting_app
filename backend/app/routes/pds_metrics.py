from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Query, Request

from app.routes.domain_common import classify_domain_error, domain_error_response
from app.schemas.pds_executive import PdsMetricDefinitionOut
from app.services import env_context
from app.services.pds_executive import metric_registry


router = APIRouter(prefix="/api/pds/v1/metrics", tags=["pds-metrics"])


def _resolve_context(request: Request, env_id: str | None, business_id: UUID | None):
    ctx = env_context.resolve_env_business_context(
        request=request,
        env_id=env_id,
        business_id=str(business_id) if business_id else None,
        allow_create=True,
        create_slug_prefix="pds",
    )
    return UUID(ctx.env_id), UUID(ctx.business_id), ctx


_SAMPLE_RECEIPT_SHAPE = {
    "sql": "string — exact SQL executed",
    "params": "list — parameter values bound in execution order",
    "filters": "object — normalized filter contract used for this compute",
    "timestamp": "ISO-8601 UTC",
    "grain": "one of portfolio|account|project|issue",
}


@router.get("", response_model=list[PdsMetricDefinitionOut])
def list_metric_definitions():
    out: list[PdsMetricDefinitionOut] = []
    for _, definition in metric_registry.iter_metrics():
        metadata = definition.to_metadata()
        metadata["sample_receipt_shape"] = _SAMPLE_RECEIPT_SHAPE
        out.append(PdsMetricDefinitionOut(**metadata))
    return out


@router.get("/{metric_name}/definition", response_model=PdsMetricDefinitionOut)
def get_metric_definition(
    metric_name: str,
    request: Request,
    env_id: str | None = Query(default=None),
    business_id: UUID | None = Query(default=None),
):
    try:
        if env_id:
            _resolve_context(request, env_id, business_id)
        definition = metric_registry.get_metric(metric_name)
        metadata = definition.to_metadata()
        metadata["sample_receipt_shape"] = _SAMPLE_RECEIPT_SHAPE
        return PdsMetricDefinitionOut(**metadata)
    except Exception as exc:  # noqa: BLE001
        status_code, code = classify_domain_error(exc)
        return domain_error_response(
            request=request,
            status_code=status_code,
            code=code,
            detail=str(exc),
            action="pds.metrics.definition_failed",
            context={"metric_name": metric_name, "env_id": env_id},
        )
