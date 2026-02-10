"""MCP auth — token gating and actor identity for stdio transport."""

from __future__ import annotations

from dataclasses import dataclass

from app.config import MCP_API_TOKEN, MCP_ACTOR_NAME


@dataclass
class McpContext:
    actor: str
    token_valid: bool


def validate_token(token: str | None) -> McpContext:
    """Validate the MCP API token and return a context."""
    if not MCP_API_TOKEN:
        raise RuntimeError(
            "MCP_API_TOKEN is not set. Cannot start MCP server without it."
        )
    valid = token == MCP_API_TOKEN
    return McpContext(actor=MCP_ACTOR_NAME, token_valid=valid)


def require_auth(ctx: McpContext) -> None:
    """Raise if the context is not authenticated."""
    if not ctx.token_valid:
        raise PermissionError("Invalid or missing MCP_API_TOKEN")
