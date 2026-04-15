"""Forward-looking environment creation pipeline (v2).

Scope: NEW environments only. Isolated from legacy lab.create_environment.
Existing canonical envs (novendor, floyorker, resume, trading, meridian, stone-pds)
continue to run on the legacy path and are not touched by this module.

Design:
- Staged orchestrator with transactional boundary
- Deterministic slug derivation
- Idempotent (POST with same slug returns existing env, does not re-seed)
- dry_run validates + previews without persisting
- Manifest_json overflow keys enforced against an allowlist
"""

from __future__ import annotations

import re
import time
from dataclasses import dataclass, field
from typing import Any

from app.db import get_cursor
from app.schemas.lab_v2 import (
    MANIFEST_JSON_ALLOWED_KEYS,
    CreateEnvironmentV2Response,
    EnvironmentManifestV2,
    StageReport,
)
from app.services import environment_templates_v2
from app.services.environment_seed_packs_v2 import get_pack


SERVICE_ACTOR = "environment_pipeline_v2"


@dataclass
class _RunCtx:
    manifest: EnvironmentManifestV2
    actor: str
    template: dict[str, Any]
    slug: str
    env_kind: str
    seed_pack_name: str
    stages: list[StageReport] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    env_id: str | None = None
    business_id: str | None = None
    lifecycle_state: str = "draft"


def _derive_slug(client_name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", client_name.lower()).strip("-")
    return slug[:40] or "env"


def _schema_name_for(slug: str) -> str:
    # Mirrors legacy pattern — schema_name is still a required column on app.environments.
    return f"env_{slug.replace('-', '_')}"[:63]


def _record_stage(
    ctx: _RunCtx,
    name: str,
    status: str,
    started_at: float,
    artifacts: dict[str, Any] | None = None,
    error: str | None = None,
) -> None:
    ctx.stages.append(
        StageReport(
            name=name,
            status=status,  # type: ignore[arg-type]
            duration_ms=int((time.time() - started_at) * 1000),
            artifacts=artifacts or {},
            error=error,
        )
    )


def _validate(ctx: _RunCtx) -> None:
    t0 = time.time()
    if ctx.manifest.manifest_overflow:
        bad = set(ctx.manifest.manifest_overflow) - MANIFEST_JSON_ALLOWED_KEYS
        if bad:
            ctx.errors.append(
                f"manifest_overflow has disallowed keys: {sorted(bad)}. "
                f"Allowed: {sorted(MANIFEST_JSON_ALLOWED_KEYS)}. "
                "Add structured columns instead of growing the JSON drawer."
            )
    available = set(ctx.template.get("available_seed_packs") or [])
    if available and ctx.seed_pack_name not in available:
        ctx.warnings.append(
            f"seed_pack '{ctx.seed_pack_name}' is not listed as available for template "
            f"'{ctx.template['template_key']}' (available: {sorted(available)}); proceeding anyway."
        )
    status = "fail" if ctx.errors else "ok"
    _record_stage(
        ctx,
        "validate",
        status,
        t0,
        {
            "template_key": ctx.template["template_key"],
            "template_version": ctx.template["version"],
            "seed_pack": ctx.seed_pack_name,
        },
    )


def _existing_env_by_slug(cur, slug: str) -> dict[str, Any] | None:
    cur.execute(
        """SELECT env_id::text AS env_id, template_key, template_version, lifecycle_state,
                  business_id::text AS business_id
             FROM app.environments
            WHERE slug = %s LIMIT 1""",
        (slug,),
    )
    row = cur.fetchone()
    return dict(row) if row else None


def _create_rows(ctx: _RunCtx, cur) -> None:
    """Insert app.environments row + (best-effort) create/locate business + binding.

    Uses only columns known to exist post-migration-515. Legacy columns (schema_name,
    industry, industry_type) get legacy-compatible defaults so existing reads don't break.
    """
    t0 = time.time()

    # Idempotency: if slug already exists, reuse.
    existing = _existing_env_by_slug(cur, ctx.slug)
    if existing:
        ctx.env_id = existing["env_id"]
        ctx.business_id = existing.get("business_id")
        ctx.lifecycle_state = existing.get("lifecycle_state") or "draft"
        ctx.warnings.append(
            f"slug '{ctx.slug}' already exists (env_id={ctx.env_id}); skipping insert."
        )
        _record_stage(
            ctx, "create_rows", "skipped", t0, {"reused_env_id": ctx.env_id}
        )
        return

    schema_name = _schema_name_for(ctx.slug)
    industry = ctx.template.get("industry_type") or "general"
    manifest_overflow = ctx.manifest.manifest_overflow or {}

    cur.execute(
        """
        INSERT INTO app.environments
          (client_name, industry, industry_type, schema_name, slug,
           template_key, template_version, env_kind,
           lifecycle_state, lifecycle_state_at,
           default_home_route, theme_accent,
           manifest_json, created_by_actor)
        VALUES
          (%s, %s, %s, %s, %s,
           %s, %s, %s,
           'provisioning', now(),
           %s, %s,
           %s::jsonb, %s)
        RETURNING env_id::text AS env_id
        """,
        (
            ctx.manifest.client_name,
            industry,
            ctx.template.get("industry_type"),
            schema_name,
            ctx.slug,
            ctx.template["template_key"],
            ctx.template["version"],
            ctx.env_kind,
            ctx.template.get("default_home_route"),
            (ctx.manifest.theme_tokens or ctx.template.get("theme_tokens") or {}).get("accent"),
            _serialize_json(manifest_overflow),
            ctx.actor,
        ),
    )
    row = cur.fetchone()
    ctx.env_id = row["env_id"]
    ctx.lifecycle_state = "provisioning"

    # Mirror to v1.environments so legacy FKs (pipeline_stages, pipeline_cards,
    # documents, etc.) resolve. Matches the sync pattern in legacy lab.create_environment.
    cur.execute(
        """
        INSERT INTO v1.environments (env_id, client_name, industry, industry_type, schema_name, notes, is_active)
        VALUES (%s::uuid, %s, %s, %s, %s, %s, true)
        ON CONFLICT (env_id) DO UPDATE SET
          client_name   = EXCLUDED.client_name,
          industry      = EXCLUDED.industry,
          industry_type = EXCLUDED.industry_type,
          schema_name   = EXCLUDED.schema_name
        """,
        (
            ctx.env_id,
            ctx.manifest.client_name,
            industry,
            ctx.template.get("industry_type"),
            schema_name,
            f"created by {ctx.actor} via v2 pipeline",
        ),
    )

    _record_stage(
        ctx, "create_rows", "ok", t0, {"env_id": ctx.env_id, "slug": ctx.slug}
    )


def _apply_template_metadata(ctx: _RunCtx, cur) -> None:
    """No-op placeholder for Phase A.

    In a later phase this will copy template.capability_keys into
    app.environment_capabilities and set department/module bindings. For now we
    only record the template reference (done in _create_rows) so nav/home-route
    resolution can read it.
    """
    t0 = time.time()
    _record_stage(
        ctx,
        "apply_template_metadata",
        "skipped",
        t0,
        {
            "note": "capability bindings deferred to a later phase; template_key pinned on env row",
            "enabled_modules_hint": list(ctx.template.get("enabled_modules") or []),
        },
    )


def _assign_owner_membership(ctx: _RunCtx, cur) -> None:
    """Attach owner membership if app.environment_memberships exists and we have an owner id."""
    t0 = time.time()
    owner = ctx.manifest.owner_platform_user_id
    if not owner:
        _record_stage(
            ctx,
            "assign_owner_membership",
            "skipped",
            t0,
            {"reason": "no owner_platform_user_id provided"},
        )
        return

    try:
        cur.execute(
            """
            INSERT INTO app.environment_memberships
              (platform_user_id, env_id, role, membership_status)
            VALUES (%s::uuid, %s::uuid, 'owner', 'active')
            ON CONFLICT (platform_user_id, env_id) DO UPDATE
              SET role = EXCLUDED.role, membership_status = 'active'
            """,
            (owner, ctx.env_id),
        )
        _record_stage(
            ctx,
            "assign_owner_membership",
            "ok",
            t0,
            {"platform_user_id": owner},
        )
    except Exception as exc:
        ctx.warnings.append(f"owner membership insert failed: {exc}")
        _record_stage(
            ctx,
            "assign_owner_membership",
            "warn",
            t0,
            error=str(exc),
        )


def _run_seed_pack(ctx: _RunCtx, cur) -> None:
    t0 = time.time()
    try:
        pack = get_pack(ctx.seed_pack_name)
    except LookupError as exc:
        ctx.warnings.append(str(exc))
        _record_stage(ctx, "run_seed_pack", "warn", t0, error=str(exc))
        return
    result = pack.apply(cur, ctx.env_id, ctx.business_id or "", actor=ctx.actor)  # type: ignore[attr-defined]

    cur.execute(
        """UPDATE app.environments
              SET seed_pack_applied = %s, seed_pack_version = %s,
                  lifecycle_state = 'seeded', lifecycle_state_at = now()
            WHERE env_id = %s::uuid""",
        (result.pack_name, result.pack_version, ctx.env_id),
    )
    ctx.lifecycle_state = "seeded"
    _record_stage(
        ctx,
        "run_seed_pack",
        "ok",
        t0,
        {
            "pack": result.pack_name,
            "version": result.pack_version,
            "rows_created": result.rows_created,
            "notes": result.notes,
        },
    )


def _health_check(ctx: _RunCtx, cur) -> None:
    t0 = time.time()
    cur.execute(
        """SELECT env_id, slug, template_key, seed_pack_applied, lifecycle_state, default_home_route
             FROM app.environments WHERE env_id = %s::uuid""",
        (ctx.env_id,),
    )
    row = dict(cur.fetchone() or {})
    checks = {
        "env_row_present": bool(row.get("env_id")),
        "slug_set": bool(row.get("slug")),
        "template_key_set": bool(row.get("template_key")),
        "home_route_set": bool(row.get("default_home_route")),
        "seed_pack_applied": bool(row.get("seed_pack_applied")),
    }
    all_green = all(checks.values())
    status = "ok" if all_green else "warn"
    final_state = "verified" if all_green else "failed"
    cur.execute(
        """UPDATE app.environments
              SET lifecycle_state = %s, lifecycle_state_at = now(),
                  last_health_check_at = now(),
                  last_health_report = %s::jsonb
            WHERE env_id = %s::uuid""",
        (final_state, _serialize_json(checks), ctx.env_id),
    )
    ctx.lifecycle_state = final_state
    _record_stage(ctx, "health_check", status, t0, {"checks": checks})


def _serialize_json(obj: Any) -> str:
    import json

    return json.dumps(obj, default=str)


def create_environment_v2(
    manifest: EnvironmentManifestV2, *, actor: str = SERVICE_ACTOR
) -> CreateEnvironmentV2Response:
    """Create a brand-new environment from a template manifest.

    Does NOT touch legacy environments or the legacy /v1/environments pipeline.
    """
    template = environment_templates_v2.get_template(
        manifest.template_key, manifest.template_version
    )

    slug = manifest.slug or _derive_slug(manifest.client_name)
    env_kind = manifest.env_kind or template["env_kind_default"]
    seed_pack = manifest.seed_pack or template.get("default_seed_pack") or "empty"

    ctx = _RunCtx(
        manifest=manifest,
        actor=actor,
        template=template,
        slug=slug,
        env_kind=env_kind,
        seed_pack_name=seed_pack,
    )

    # Pre-flight validation happens outside the DB tx so dry_run can bail cheaply.
    _validate(ctx)
    if ctx.errors:
        return _build_response(ctx, template, dry_run=manifest.dry_run)

    if manifest.dry_run:
        # Planner preview — no DB writes at all.
        ctx.stages.append(
            StageReport(
                name="dry_run_preview",
                status="ok",
                duration_ms=0,
                artifacts={
                    "would_create": {
                        "slug": slug,
                        "template_key": template["template_key"],
                        "template_version": template["version"],
                        "env_kind": env_kind,
                        "seed_pack": seed_pack,
                        "home_route": template.get("default_home_route"),
                    }
                },
            )
        )
        return _build_response(ctx, template, dry_run=True)

    # Single DB transaction so any failure rolls back the whole create.
    with get_cursor() as cur:
        _create_rows(ctx, cur)
        if ctx.errors:
            return _build_response(ctx, template, dry_run=False)
        _apply_template_metadata(ctx, cur)
        _assign_owner_membership(ctx, cur)
        _run_seed_pack(ctx, cur)
        _health_check(ctx, cur)

    return _build_response(ctx, template, dry_run=False)


def _build_response(
    ctx: _RunCtx, template: dict[str, Any], *, dry_run: bool
) -> CreateEnvironmentV2Response:
    home_route = template.get("default_home_route") or ""
    links: dict[str, str] = {}
    if ctx.env_id and home_route:
        links["dashboard_url"] = home_route.replace("{env_id}", ctx.env_id)
    return CreateEnvironmentV2Response(
        env_id=ctx.env_id,
        slug=ctx.slug,
        template_key=template["template_key"],
        template_version=template["version"],
        lifecycle_state=ctx.lifecycle_state,  # type: ignore[arg-type]
        stages=ctx.stages,
        links=links,
        warnings=ctx.warnings,
        errors=ctx.errors,
        dry_run=dry_run,
    )


def verify_environment_v2(env_id: str) -> dict[str, Any]:
    """Lightweight health report for a v2 environment.

    Only reads public structural signals — does not run any expensive module-level
    integrity checks in this pass.
    """
    with get_cursor() as cur:
        cur.execute(
            """SELECT env_id::text AS env_id, slug, template_key, template_version,
                      env_kind, lifecycle_state, default_home_route,
                      seed_pack_applied, seed_pack_version,
                      last_health_check_at, last_health_report
                 FROM app.environments WHERE env_id = %s::uuid""",
            (env_id,),
        )
        row = cur.fetchone()
    if not row:
        raise LookupError(f"env_id not found: {env_id}")
    row = dict(row)
    checks = {
        "env_row_present": True,
        "slug_set": bool(row.get("slug")),
        "template_key_set": bool(row.get("template_key")),
        "lifecycle_state_set": bool(row.get("lifecycle_state")),
        "seed_pack_applied": bool(row.get("seed_pack_applied")),
        "home_route_set": bool(row.get("default_home_route")),
    }
    row["health_checks"] = checks
    row["health_ok"] = all(checks.values())
    return row
