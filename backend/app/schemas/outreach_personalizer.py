"""outreach_personalizer.py — Pydantic schemas for the Outreach Personalizer API.

Mirrors the pitch_forge schema conventions (Pydantic v2, request models typed,
read responses returned as plain dicts by the route layer).
"""
from __future__ import annotations

from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Target
# ---------------------------------------------------------------------------

class TargetCreateIn(BaseModel):
    """Create-or-seed payload. Idempotent on (env_id, firm_slug).

    env_id / business_id may also arrive as query params (mirrors pitch_forge);
    if present here they take precedence for the seed flow.
    """
    env_id: str | None = None
    business_id: UUID | None = None
    firm_name: str
    firm_slug: str
    logo_url: str | None = None
    accent_hsl: str | None = None
    profile_json: dict[str, Any] = Field(default_factory=dict)
    loom_url: str | None = None


class TargetOut(BaseModel):
    id: UUID
    env_id: str
    business_id: UUID | None
    crm_account_id: UUID | None
    firm_name: str
    firm_slug: str
    status: str
    logo_url: str | None
    accent_hsl: str | None
    profile_json: dict[str, Any]
    microsite_url: str | None
    loom_url: str | None

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Public microsite tracking
# ---------------------------------------------------------------------------

class MicrositeTrackIn(BaseModel):
    event_type: str  # microsite_view | microsite_cta
    metadata: dict[str, Any] = Field(default_factory=dict)


# ---------------------------------------------------------------------------
# Target patch (Phase 2A) — all optional. The route uses
# model_dump(exclude_unset=True) so an absent field is left untouched while an
# explicitly-null loom_url clears it.
# ---------------------------------------------------------------------------

class MicrositeUpdateIn(BaseModel):
    loom_url: str | None = None
    crm_account_id: UUID | None = None
    logo_url: str | None = None
    accent_hsl: str | None = None


# ---------------------------------------------------------------------------
# Log microsite engagement as a CRM activity (Phase 2B). Optional operator note
# appended to the auto-composed body.
# ---------------------------------------------------------------------------

class LogCrmActivityIn(BaseModel):
    note: str | None = None
