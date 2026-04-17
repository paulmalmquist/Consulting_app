from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Query, Request

from app.routes.domain_common import classify_domain_error, domain_error_response
from app.schemas.operator import PipelineIntegrityOut
from app.services import env_context
from app.services import pipeline_integrity as svc

router = APIRouter(
    prefix="/api/operator/v1/pipeline-integrity",
    tags=["operator-pipeline-integrity"],
)


def _resolve(request: Request, env_id: str, business_id: UUID | None):
    ctx = env_context.resolve_env_business_context(
        request=request,
        env_id=env_id,
        business_id=str(business_id) if business_id else None,
        allow_create=True,
        create_slug_prefix="operator",
    )
    return UUID(ctx.env_id), UUID(ctx.business_id)


@router.get("", response_model=PipelineIntegrityOut)
def get_pipeline_integrity(
    request: Request,
    env_id: str = Query(...),
    business_id: UUID | None = Query(default=None),
):
    try:
        resolved_env_id, resolved_business_id = _resolve(request, env_id, business_id)
        return PipelineIntegrityOut(
            **svc.list_pipeline_integrity(
                env_id=resolved_env_id, business_id=resolved_business_id
            )
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request,
            status_code=status,
            code=code,
            detail=str(exc),
            action="operator.pipeline_integrity.failed",
            context={"env_id": env_id},
        )
