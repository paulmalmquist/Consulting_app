from __future__ import annotations

import json
import re
import traceback
import sys
from datetime import datetime
from typing import Any, Mapping

# Python 3.11+ has UTC in datetime, older versions use timezone.utc
if sys.version_info >= (3, 11):
    from datetime import UTC
else:
    from datetime import timezone
    UTC = timezone.utc

from fastapi import Request

from app.observability.request_context import get_request_context

_REDACT_PATTERN = re.compile(r"token|authorization|cookie|secret|password|key", re.IGNORECASE)
_SAFE_HEADERS = {
    "host",
    "user-agent",
    "accept",
    "content-type",
    "x-request-id",
    "x-run-id",
    "x-forwarded-for",
    "x-forwarded-proto",
}


def _iso_now() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def _redact_value(key: str, value: Any) -> Any:
    if _REDACT_PATTERN.search(key):
        return "[REDACTED]"
    if isinstance(value, Mapping):
        return {str(k): _redact_value(str(k), v) for k, v in value.items()}
    if isinstance(value, list):
        return [_redact_value(key, v) for v in value]
    return value


def sanitize_headers(headers: Mapping[str, str] | None) -> dict[str, Any]:
    if not headers:
        return {}
    out: dict[str, Any] = {}
    for raw_key, raw_val in headers.items():
        key = raw_key.lower()
        if key not in _SAFE_HEADERS and not _REDACT_PATTERN.search(key):
            continue
        out[key] = _redact_value(key, raw_val)
    return out


def sanitize_context(context: Mapping[str, Any] | None) -> dict[str, Any]:
    if not context:
        return {}
    return {str(k): _redact_value(str(k), v) for k, v in context.items()}


def build_error(exc: Exception | None) -> dict[str, Any] | None:
    if exc is None:
        return None
    return {
        "name": exc.__class__.__name__,
        "message": str(exc),
        "stack": "".join(traceback.format_exception(type(exc), exc, exc.__traceback__))[-6000:],
    }


def emit_log(
    *,
    level: str,
    service: str,
    action: str,
    message: str,
    context: Mapping[str, Any] | None = None,
    request: Request | None = None,
    duration_ms: int | None = None,
    error: Exception | None = None,
):
    ctx = get_request_context()
    user = ctx.user or "anonymous"

    enriched_context: dict[str, Any] = {}
    if request is not None:
        enriched_context.update(
            {
                "method": request.method,
                "path": request.url.path,
                "query_keys": sorted(list(request.query_params.keys())),
                "headers": sanitize_headers(dict(request.headers)),
            }
        )
    if context:
        enriched_context.update(context)

    payload: dict[str, Any] = {
        "ts": _iso_now(),
        "level": level,
        "service": service,
        "env_id": ctx.env_id,
        "business_id": ctx.business_id,
        "user": user,
        "request_id": ctx.request_id,
        "run_id": ctx.run_id,
        "action": action,
        "message": message,
        "context": sanitize_context(enriched_context),
        "duration_ms": duration_ms,
    }
    err = build_error(error)
    if err is not None:
        payload["error"] = err
    print(json.dumps(payload, separators=(",", ":"), ensure_ascii=True))
