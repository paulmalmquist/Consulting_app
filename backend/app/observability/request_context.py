from __future__ import annotations

from contextvars import ContextVar
from dataclasses import dataclass


@dataclass
class RequestLogContext:
    request_id: str | None = None
    run_id: str | None = None
    env_id: str | None = None
    business_id: str | None = None
    user: str | None = None


_request_context: ContextVar[RequestLogContext] = ContextVar(
    "request_log_context", default=RequestLogContext()
)


def get_request_context() -> RequestLogContext:
    return _request_context.get()


def set_request_context(
    *,
    request_id: str | None = None,
    run_id: str | None = None,
    env_id: str | None = None,
    business_id: str | None = None,
    user: str | None = None,
):
    _request_context.set(
        RequestLogContext(
            request_id=request_id,
            run_id=run_id,
            env_id=env_id,
            business_id=business_id,
            user=user,
        )
    )


def clear_request_context() -> None:
    _request_context.set(RequestLogContext())
