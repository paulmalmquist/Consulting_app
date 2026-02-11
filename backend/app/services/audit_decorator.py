"""Audit decorator for FastAPI route handlers.

Wraps route handlers to automatically record audit events on success/failure.
Uses the existing audit service for persistence.
"""

import functools
import time

from app.services import audit as audit_svc


def audited(action: str, tool_name: str, object_type: str):
    """Decorator that wraps a route handler with audit logging.

    Usage:
        @router.post("/api/something")
        @audited("create", "api", "something")
        async def create_something(request: Request):
            ...
    """

    def decorator(func):
        @functools.wraps(func)
        async def async_wrapper(*args, **kwargs):
            start = time.monotonic()
            try:
                result = await func(*args, **kwargs)
                ms = int((time.monotonic() - start) * 1000)
                business_id = kwargs.get("business_id")
                audit_svc.record_event(
                    actor="api_user",
                    action=action,
                    tool_name=tool_name,
                    success=True,
                    latency_ms=ms,
                    business_id=business_id,
                    object_type=object_type,
                )
                return result
            except Exception as e:
                ms = int((time.monotonic() - start) * 1000)
                business_id = kwargs.get("business_id")
                audit_svc.record_event(
                    actor="api_user",
                    action=action,
                    tool_name=tool_name,
                    success=False,
                    latency_ms=ms,
                    business_id=business_id,
                    object_type=object_type,
                    error_message=str(e),
                )
                raise

        @functools.wraps(func)
        def sync_wrapper(*args, **kwargs):
            start = time.monotonic()
            try:
                result = func(*args, **kwargs)
                ms = int((time.monotonic() - start) * 1000)
                business_id = kwargs.get("business_id")
                audit_svc.record_event(
                    actor="api_user",
                    action=action,
                    tool_name=tool_name,
                    success=True,
                    latency_ms=ms,
                    business_id=business_id,
                    object_type=object_type,
                )
                return result
            except Exception as e:
                ms = int((time.monotonic() - start) * 1000)
                business_id = kwargs.get("business_id")
                audit_svc.record_event(
                    actor="api_user",
                    action=action,
                    tool_name=tool_name,
                    success=False,
                    latency_ms=ms,
                    business_id=business_id,
                    object_type=object_type,
                    error_message=str(e),
                )
                raise

        import asyncio

        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        return sync_wrapper

    return decorator
