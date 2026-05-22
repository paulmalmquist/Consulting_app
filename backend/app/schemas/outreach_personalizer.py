"""outreach_personalizer.py — Pydantic schemas for the Outreach Personalizer API.

Mirrors the pitch_forge schema conventions (Pydantic v2, request models typed,
read responses returned as plain dicts by the route layer).
"""
from __future__ import annotations

from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


# ---------------------------------------------------------------------------
# Microsite profile (Phase 4) — typed schema for the known profile_json keys.
# profile_json stays free-form JSONB in the DB; this model is the typed edge so
# the API does not accept arbitrary object soup. Every field optional: a PATCH
# sends only what it changes; an explicit null clears that key on merge.
# ---------------------------------------------------------------------------

class MicrositeProfilePatch(BaseModel):
    """Typed partial of the microsite profile fields stored inside profile_json.

    Used by both create (TargetCreateIn.profile) and PATCH (MicrositeUpdateIn.
    profile). The route folds/merges this into cro_outreach_target.profile_json.

    proof_points are operator-supplied microsite proof bullets. The cap +
    per-item length limit are enforced at the route layer via
    outreach_personalizer.validate_proof_points (so the failure is a clean
    domain 400, not a request-parse error) — see that function. This schema's
    validator only normalizes (trim + drop empties).
    """
    sector: str | None = None
    website: str | None = None
    calendar_url: str | None = None
    cta_label: str | None = None
    cta_url: str | None = None
    positioning_notes: str | None = None
    proof_points: list[str] | None = None

    @field_validator("proof_points")
    @classmethod
    def _normalize_proof_points(cls, v: list[str] | None) -> list[str] | None:
        if v is None:
            return None
        return [str(p).strip() for p in v if str(p).strip()]


# ---------------------------------------------------------------------------
# Target
# ---------------------------------------------------------------------------

class TargetCreateIn(BaseModel):
    """Create-or-seed payload. Idempotent on (env_id, firm_slug).

    env_id / business_id may also arrive as query params (mirrors pitch_forge);
    if present here they take precedence for the seed flow.

    Phase 4: `profile` is the typed way to set microsite profile fields; it is
    merged into profile_json by the route (profile wins over profile_json on
    key conflicts). `profile_json` is kept for back-compat with the seed path.
    """
    env_id: str | None = None
    business_id: UUID | None = None
    firm_name: str
    firm_slug: str
    logo_url: str | None = None
    accent_hsl: str | None = None
    profile_json: dict[str, Any] = Field(default_factory=dict)
    profile: MicrositeProfilePatch | None = None
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
    crm_opportunity_id: UUID | None = None  # Phase 2C
    logo_url: str | None = None
    accent_hsl: str | None = None
    # Phase 4 — typed partial of profile_json fields. When provided, the route
    # shallow-merges model_dump(exclude_unset=True) into profile_json so the
    # operator can edit CTA / sector / positioning / proof after create. An
    # explicit null on a profile field clears that key.
    profile: MicrositeProfilePatch | None = None


# ---------------------------------------------------------------------------
# Log microsite engagement as a CRM activity (Phase 2B). Optional operator note
# appended to the auto-composed body.
# ---------------------------------------------------------------------------

class LogCrmActivityIn(BaseModel):
    note: str | None = None


# ---------------------------------------------------------------------------
# Advance pipeline (Phase 2C). Optional operator note recorded in the
# crm_opportunity_stage_history row written by crm_svc.move_opportunity_stage.
# ---------------------------------------------------------------------------

class AdvancePipelineIn(BaseModel):
    note: str | None = None


# ---------------------------------------------------------------------------
# Scaffold environment (Phase 3). Optional operator note; current Phase 3 does
# not record it anywhere downstream (env_v2.create_environment_v2 does not
# accept a free-form note), but the field is reserved for symmetry with
# AdvancePipelineIn / LogCrmActivityIn and future use.
# ---------------------------------------------------------------------------

class ScaffoldEnvIn(BaseModel):
    note: str | None = None
    template_key: str | None = None  # Phase 3.5; defaults to "repe" when None
