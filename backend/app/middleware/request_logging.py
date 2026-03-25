from __future__ import annotations

import time
from uuid import uuid4

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware

from app.observability.logger import emit_log, sanitize_headers
from app.observability.request_context import clear_request_context, set_request_context


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        started = time.perf_counter()
        request_id = request.headers.get("x-request-id") or str(uuid4())
        run_id = request.headers.get("x-run-id")
        user = request.headers.get("x-user") or "anonymous"

        request.state.request_id = request_id
        request.state.run_id = run_id

        set_request_context(request_id=request_id, run_id=run_id, user=user)

        emit_log(
            level="info",
            service="backend",
            action="request_received",
            message="Incoming HTTP request",
            context={
                "method": request.method,
                "path": request.url.path,
                "query_keys": sorted(list(request.query_params.keys())),
                "headers": sanitize_headers(dict(request.headers)),
            },
        )

        try:
            response = await call_next(request)
        except Exception as exc:
            duration_ms = int((time.perf_counter() - started) * 1000)
            emit_log(
                level="error",
                service="backend",
                action="request_failed",
                message="Request failed with unhandled exception",
                context={
                    "method": request.method,
                    "path": request.url.path,
                },
                duration_ms=duration_ms,
                error=exc,
            )
            clear_request_context()
            raise

        duration_ms = int((time.perf_counter() - started) * 1000)
        response.headers["X-Request-Id"] = request_id
        if run_id:
            response.headers["X-Run-Id"] = run_id

        emit_log(
            level="info",
            service="backend",
            action="request_completed",
            message="HTTP request completed",
            context={
                "method": request.method,
                "path": request.url.path,
                "status_code": response.status_code,
            },
            duration_ms=duration_ms,
        )
        clear_request_context()
        return response
