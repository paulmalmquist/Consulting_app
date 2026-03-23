from __future__ import annotations

from fastapi import Request
from fastapi.responses import JSONResponse

from app.observability.logger import emit_log


def get_request_id(request: Request | None) -> str | None:
    if request is None:
        return None
    state_req = getattr(getattr(request, "state", None), "request_id", None)
    if state_req:
        return str(state_req)
    return request.headers.get("x-request-id")


def domain_error_response(
    *,
    request: Request,
    status_code: int,
    code: str,
    detail: str,
    action: str,
    context: dict | None = None,
) -> JSONResponse:
    request_id = get_request_id(request)
    emit_log(
        level="error" if status_code >= 500 else "warn",
        service="backend",
        action=action,
        message=detail,
        context={
            "code": code,
            "status_code": status_code,
            "request_id": request_id,
            **(context or {}),
        },
    )
    return JSONResponse(
        status_code=status_code,
        content={
            "detail": detail,
            "code": code,
            "request_id": request_id,
        },
    )


def classify_domain_error(exc: Exception) -> tuple[int, str]:
    if isinstance(exc, LookupError):
        return 404, "not_found"
    if isinstance(exc, ValueError):
        return 400, "validation_error"
    return 500, "internal_error"
