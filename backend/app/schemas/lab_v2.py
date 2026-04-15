"""Schemas for the v2 environment blueprint pipeline.

Scope: forward-looking only. These shapes are used by create_environment_v2
and never touch the legacy /v1/environments path.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


EnvKind = Literal["internal", "client", "demo", "public", "lab", "resume"]
AuthMode = Literal["private", "public", "hybrid"]
LifecycleState = Literal[
    "draft", "provisioning", "seeded", "verified", "live", "failed", "retired"
]


# Allowlisted keys for manifest_json — everything else is structured columns or rejected.
MANIFEST_JSON_ALLOWED_KEYS: frozenset[str] = frozenset(
    {"custom_copy", "feature_flags", "onboarding_checklist", "integration_handles"}
)


class EnvironmentManifestV2(BaseModel):
    """Declarative shape of a new environment. One manifest per create call."""

    model_config = ConfigDict(extra="forbid")

    client_name: str = Field(..., min_length=1, max_length=120)
    template_key: str = Field(..., description="Key in app.environment_templates")
    template_version: int | None = Field(
        default=None,
        description="Pin to specific version; None uses latest.",
    )
    slug: str | None = Field(
        default=None,
        description="URL-safe slug; derived from client_name if omitted.",
        pattern=r"^[a-z0-9][a-z0-9-]{0,39}$",
    )
    env_kind: EnvKind | None = Field(
        default=None,
        description="Overrides template's env_kind_default.",
    )
    industry_type: str | None = None
    auth_mode: AuthMode | None = None
    enabled_modules: list[str] | None = Field(
        default=None,
        description="Overrides template.enabled_modules; None = inherit.",
    )
    theme_tokens: dict[str, Any] | None = Field(
        default=None, description="Overrides template.theme_tokens; None = inherit."
    )
    login_copy: dict[str, Any] | None = None
    seed_pack: str | None = Field(
        default=None, description="Key in seed-pack registry; None = template default."
    )
    owner_platform_user_id: str | None = Field(
        default=None,
        description="Owner membership. If None and caller is authenticated, uses caller.",
    )
    manifest_overflow: dict[str, Any] | None = Field(
        default=None,
        description="Low-frequency template-specific options. Keys must be in MANIFEST_JSON_ALLOWED_KEYS.",
    )
    dry_run: bool = Field(
        default=False,
        description="Validate + preview stages without persisting.",
    )


class StageReport(BaseModel):
    name: str
    status: Literal["ok", "skipped", "warn", "fail"]
    duration_ms: int
    artifacts: dict[str, Any] = Field(default_factory=dict)
    error: str | None = None


class CreateEnvironmentV2Response(BaseModel):
    env_id: str | None
    slug: str
    template_key: str
    template_version: int
    lifecycle_state: LifecycleState
    stages: list[StageReport]
    links: dict[str, str] = Field(default_factory=dict)
    warnings: list[str] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)
    dry_run: bool = False


class TemplateOut(BaseModel):
    template_key: str
    version: int
    display_name: str
    description: str | None
    env_kind_default: EnvKind
    industry_type: str | None
    default_home_route: str | None
    default_auth_mode: AuthMode | None
    enabled_modules: list[str]
    default_seed_pack: str | None
    available_seed_packs: list[str]
    is_latest: bool
