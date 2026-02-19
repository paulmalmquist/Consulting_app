"""API proxy MCP tools — api.call."""

from __future__ import annotations

import httpx

from app.mcp.auth import McpContext
from app.mcp.registry import ToolDef, registry
from app.mcp.schemas.api_tools import ApiCallInput


# Allowlist of API path prefixes
ALLOWED_API_PATHS = [
    "/api/health",
    "/api/businesses",
    "/api/departments",
    "/api/capabilities",
    "/api/documents",
    "/api/executions",
    "/api/underwriting",
    "/api/admin/",  # Admin tools endpoints
]


def _is_allowed_api_path(path: str) -> bool:
    """Check if API path is in allowlist."""
    return any(path.startswith(prefix) for prefix in ALLOWED_API_PATHS)


def _api_call(ctx: McpContext, inp: ApiCallInput) -> dict:
    """Make an API call to the local backend."""

    # Validate path
    if not inp.path.startswith("/"):
        raise ValueError("Path must start with /")

    if not _is_allowed_api_path(inp.path):
        raise PermissionError(
            f"API path '{inp.path}' not in allowlist. "
            f"Allowed prefixes: {ALLOWED_API_PATHS}"
        )

    # Build full URL (assume localhost:8000 for local backend)
    base_url = "http://localhost:8000"
    url = f"{base_url}{inp.path}"

    try:
        with httpx.Client(timeout=inp.timeout_sec) as client:
            response = client.request(
                method=inp.method,
                url=url,
                json=inp.json_body if inp.json_body else None,
                params=inp.query_params if inp.query_params else None,
            )

            # Try to parse as JSON
            try:
                json_response = response.json()
            except Exception:
                json_response = None

            return {
                "success": 200 <= response.status_code < 300,
                "status_code": response.status_code,
                "json": json_response,
                "text": response.text[:5000] if not json_response else None,  # Fallback
                "headers": dict(response.headers),
                "truncated": len(response.text) > 5000 and not json_response,
            }

    except httpx.TimeoutException:
        return {
            "success": False,
            "error": f"Request timed out after {inp.timeout_sec} seconds",
            "timeout": True,
        }
    except httpx.ConnectError:
        return {
            "success": False,
            "error": "Could not connect to backend. Is it running on localhost:8000?",
            "connection_error": True,
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
        }


def register_api_tools():
    """Register API proxy tools."""

    registry.register(ToolDef(
        name="api.call",
        description="Make HTTP calls to local backend API. Allowlisted paths only. Assumes backend runs on localhost:8000.",
        module="api",
        permission="read",  # Even POST/PUT are "read" permission since they go through backend
        input_model=ApiCallInput,
        handler=_api_call,
    ))
