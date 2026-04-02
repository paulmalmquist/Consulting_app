"""Hard failure modes — deterministic error responses for known failure states.

Instead of vague "something went wrong" or hallucinated filler, the system
should return specific, actionable error messages for known failure patterns.

Usage:
    from app.services.failure_modes import classify_failure, FailureMode

    failure = classify_failure(
        tool_name="repe.list_funds",
        error_message="relation 'repe_fund' does not exist",
        context={"env_id": "abc", "entity_type": "fund"},
    )
    if failure:
        yield _sse("error", {"message": failure.user_message})
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class FailureMode:
    """A deterministic failure with a clear user-facing message."""
    code: str
    user_message: str
    recoverable: bool = True
    suggestion: str | None = None


# ── Known failure patterns ────────────────────────────────────────────

_FAILURE_PATTERNS: list[tuple[re.Pattern, FailureMode]] = [
    # No data in environment
    (
        re.compile(r"no\s+(funds?|assets?|deals?|investments?)\s+found", re.IGNORECASE),
        FailureMode(
            code="no_entities",
            user_message="No data found in this environment. Import data or switch to an environment with existing records.",
            recoverable=True,
            suggestion="Try switching to an environment with data, or use the import tools to add records.",
        ),
    ),
    # Missing table / schema not deployed
    (
        re.compile(r"relation\s+['\"]?\w+['\"]?\s+does not exist", re.IGNORECASE),
        FailureMode(
            code="schema_missing",
            user_message="This environment's database schema is not fully deployed. Contact your administrator.",
            recoverable=False,
        ),
    ),
    # No location data for map
    (
        re.compile(r"no\s+(location|geography|map|geo)\s+data", re.IGNORECASE),
        FailureMode(
            code="no_location_data",
            user_message="No assets with location data in this environment. Add addresses to assets to use map features.",
            recoverable=True,
        ),
    ),
    # Permission denied
    (
        re.compile(r"permission denied|access denied|unauthorized|forbidden", re.IGNORECASE),
        FailureMode(
            code="permission_denied",
            user_message="You don't have permission to perform this action. Contact your administrator for access.",
            recoverable=False,
        ),
    ),
    # Rate limit
    (
        re.compile(r"rate.?limit|too many requests|429", re.IGNORECASE),
        FailureMode(
            code="rate_limited",
            user_message="Request rate limit reached. Please wait a moment and try again.",
            recoverable=True,
        ),
    ),
    # Model overloaded
    (
        re.compile(r"overloaded|capacity|503|service unavailable", re.IGNORECASE),
        FailureMode(
            code="model_overloaded",
            user_message="The AI service is temporarily at capacity. Please try again in a few seconds.",
            recoverable=True,
        ),
    ),
    # Invalid tool / unknown tool
    (
        re.compile(r"unknown\s+tool|tool\s+not\s+found|no\s+such\s+tool", re.IGNORECASE),
        FailureMode(
            code="unknown_tool",
            user_message="That operation is not available in the current configuration.",
            recoverable=False,
        ),
    ),
    # Write operations disabled
    (
        re.compile(r"write.*(not|dis).*abled|writes.*disabled|ENABLE_MCP_WRITES", re.IGNORECASE),
        FailureMode(
            code="writes_disabled",
            user_message="Write operations are not enabled in this environment. Use the platform UI to create or modify records.",
            recoverable=False,
        ),
    ),
    # Empty result set
    (
        re.compile(r"(returned?|found)\s+(0|no|zero)\s+(rows?|results?|records?|items?)", re.IGNORECASE),
        FailureMode(
            code="empty_result",
            user_message="No matching data found for this query.",
            recoverable=True,
            suggestion="Try broadening your search or check that the data exists in this environment.",
        ),
    ),
    # Confirmation required
    (
        re.compile(r"requires?\s+confirmation|must\s+confirm|pending\s+confirmation", re.IGNORECASE),
        FailureMode(
            code="confirmation_required",
            user_message="This action requires your confirmation before proceeding.",
            recoverable=True,
        ),
    ),
]


def classify_failure(
    *,
    tool_name: str | None = None,
    error_message: str,
    context: dict[str, Any] | None = None,
) -> FailureMode | None:
    """Match an error message against known failure patterns.

    Returns a FailureMode with a clean user message, or None if the error
    doesn't match any known pattern (in which case the caller should use
    a generic error message).
    """
    for pattern, failure in _FAILURE_PATTERNS:
        if pattern.search(error_message):
            return failure
    return None


def get_tool_failure_message(
    tool_name: str,
    error_message: str,
) -> str:
    """Get a clean user-facing message for a tool failure.

    Returns the classified failure message if it matches a known pattern,
    otherwise returns a generic but honest message.
    """
    failure = classify_failure(tool_name=tool_name, error_message=error_message)
    if failure:
        msg = failure.user_message
        if failure.suggestion:
            msg += f" {failure.suggestion}"
        return msg

    # Generic fallback — honest but not vague
    clean_tool = tool_name.replace(".", " ").replace("_", " ") if tool_name else "operation"
    return f"The {clean_tool} could not complete: {_truncate_error(error_message)}"


def _truncate_error(msg: str, max_len: int = 200) -> str:
    """Truncate error message, removing internal paths and stack traces."""
    # Strip file paths
    msg = re.sub(r"File\s+\"[^\"]+\".*?line\s+\d+", "", msg)
    # Strip stack traces
    msg = re.sub(r"Traceback.*?(?=\w)", "", msg, flags=re.DOTALL)
    msg = msg.strip()
    if len(msg) > max_len:
        msg = msg[:max_len] + "..."
    return msg
