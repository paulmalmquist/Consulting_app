"""Response sanitizer — strips internal context leakage from AI responses.

Applied to streamed tokens before they reach the user. Catches:
- Raw UUIDs (e.g., "a1b2c3d4-e5f6-...")
- Schema names (e.g., "novendor_1.", "client_schema.")
- Internal route paths (e.g., "/lab/env/abc123/re/...")
- Database table references (e.g., "repe_deal", "repe_fund")

The model sees these in the context block but should never repeat them
to users. This is a safety net — the system prompt also instructs the
model not to include them.
"""
from __future__ import annotations

import re

# UUID pattern (v4-style: 8-4-4-4-12 hex)
_UUID_RE = re.compile(
    r"\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b",
    re.IGNORECASE,
)

# Internal route paths
_ROUTE_RE = re.compile(r"/lab/env/[a-zA-Z0-9_-]+(?:/[a-zA-Z0-9_-]+)*")

# Schema-qualified table references
_SCHEMA_TABLE_RE = re.compile(r"\b\w+_\d+\.\w+\b")  # e.g., novendor_1.repe_deal

# Common internal table names that shouldn't appear in responses
_INTERNAL_TABLES = re.compile(
    r"\brepe_(deal|fund|asset|model|investor|distribution|capital_call)\b"
    r"|\bcc_(corpus|portfolio|loan|decision)\b"
    r"|\bpds_(project|task|milestone)\b",
    re.IGNORECASE,
)


def sanitize_response_token(text: str) -> str:
    """Clean a streamed token/chunk of any internal context leakage.

    This is designed to be fast (called per token) and conservative —
    only strips patterns that are clearly internal artifacts.
    """
    # Don't sanitize very short tokens (single chars, whitespace)
    if len(text) < 10:
        return text

    # Strip raw UUIDs (replace with entity name reference if possible)
    text = _UUID_RE.sub("[entity-ref]", text)

    # Strip internal route paths
    text = _ROUTE_RE.sub("[current page]", text)

    return text


def sanitize_response_block(text: str) -> str:
    """Clean a complete response block of internal leakage.

    More thorough than per-token sanitization — applied to final
    assembled response text.
    """
    text = _UUID_RE.sub("[ref]", text)
    text = _ROUTE_RE.sub("[current page]", text)
    text = _SCHEMA_TABLE_RE.sub("[data source]", text)
    text = _INTERNAL_TABLES.sub("[data source]", text)
    return text
