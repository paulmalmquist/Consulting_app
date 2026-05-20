"""outreach_personalizer.py — Outreach Personalizer API routes.

Phase 1 vertical slice: seed one outreach target, generate (or deterministically
seed) insight / loom_script / cold_email assets, serve a public personalized
microsite, and track anonymous microsite_view / microsite_cta events.

Mirrors pitch_forge route conventions (Query env_id/business_id, domain_common
error handling). Public endpoints (microsite read + track) take no auth/env —
they are keyed by firm_slug and reach the backend through the non-auth-gated
/bos proxy.

Out of scope (Phase 2): environment scaffolding, CRM linking, Apollo enrichment,
Loom edit/save loop, web scraping.
"""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Query, Request

from app.routes.domain_common import classify_domain_error, domain_error_response
from app.schemas.outreach_personalizer import (
    TargetCreateIn,
    MicrositeTrackIn,
    MicrositeUpdateIn,
    LogCrmActivityIn,
    AdvancePipelineIn,
    ScaffoldEnvIn,
)
from app.schemas.lab_v2 import EnvironmentManifestV2
from app.services import outreach_personalizer as op_db
from app.services import outreach_personalizer_ai as op_ai
from app.services import crm as crm_svc
from app.services import environment_pipeline_v2 as env_v2
from app.services.outreach_personalizer import (
    OutreachTargetNotFound,
    normalize_loom_url,
)

router = APIRouter(prefix="/api/outreach-personalizer/v1", tags=["outreach-personalizer"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _resolve_env(
    env_id_q: str | None, business_id_q: UUID | None, payload: TargetCreateIn | None = None
) -> tuple[str, UUID | None]:
    """env_id from query param, falling back to payload. No env auto-creation
    (deliberately unlike pitch_forge — env scaffolding is out of scope here)."""
    env_id = env_id_q or (payload.env_id if payload else None)
    if not env_id:
        raise ValueError("env_id is required (query param or payload)")
    business_id = business_id_q or (payload.business_id if payload else None)
    return env_id, business_id


def _sector(profile: dict) -> str:
    return (
        profile.get("sector")
        or "real estate investment management / real estate private equity"
    )


def _assets_by_type(assets: list[dict]) -> dict[str, dict]:
    out: dict[str, dict] = {}
    for a in assets:
        out[a["asset_type"]] = a
    return out


def _insights_from_assets(by_type: dict[str, dict]) -> list[dict]:
    ins = by_type.get("insight")
    if not ins:
        return []
    payload = ins.get("payload") or {}
    return payload.get("insights") or []


def _target_response(target: dict) -> dict:
    assets = op_db.list_assets(target_id=target["id"])
    return {
        "target": target,
        "assets": assets,
        "microsite_url": target.get("microsite_url"),
        "public_path": f"/for/{target['firm_slug']}",
    }


def _seed_assets(target: dict) -> None:
    """Generate the 3-asset pack and persist it. AI when configured, else the
    clearly-labeled deterministic pack."""
    profile = target.get("profile_json") or {}
    pack = op_ai.generate_asset_pack(
        firm_name=target["firm_name"],
        sector=_sector(profile),
        profile=profile,
    )
    source = pack["source"]
    op_db.insert_asset(
        target_id=target["id"],
        asset_type="insight",
        payload={"insights": pack["insights"], "source": source},
    )
    op_db.insert_asset(
        target_id=target["id"],
        asset_type="loom_script",
        payload={**pack["loom_script"], "source": source},
    )
    op_db.insert_asset(
        target_id=target["id"],
        asset_type="cold_email",
        payload={**pack["cold_email"], "source": source},
    )
    op_db.update_target(
        target_id=target["id"],
        status="assets_ready",
        microsite_url=f"/for/{target['firm_slug']}",
    )


def _microsite_payload(target: dict, assets: list[dict]) -> dict:
    by_type = _assets_by_type(assets)
    insights = _insights_from_assets(by_type)
    loom_payload = (by_type.get("loom_script") or {}).get("payload") or {}
    email_payload = (by_type.get("cold_email") or {}).get("payload") or {}
    # Re-validate the stored loom_url at serve time so a tampered/legacy DB value
    # can never reach the public page as an arbitrary iframe src. Anything that
    # is not a recognizable Loom URL degrades to the "pending" state.
    try:
        loom_url = normalize_loom_url(target.get("loom_url"))
    except ValueError:
        loom_url = None
    return {
        "ready": True,
        "firm": {
            "name": target["firm_name"],
            "slug": target["firm_slug"],
            "logo_url": target.get("logo_url"),
        },
        "insights": insights,
        "loom": {
            "url": loom_url,
            "script": loom_payload.get("script"),
            "state": "ready" if loom_url else "pending",
        },
        "cold_email_preview": {
            "subject": email_payload.get("subject"),
            "body": email_payload.get("body"),
        },
        "cta": {
            "label": "Talk to Novendor",
            "kind": "email" if not target.get("profile_json", {}).get("calendar_url") else "calendar",
            "href": target.get("profile_json", {}).get("calendar_url")
            or "mailto:info@novendor.ai?subject=" + target["firm_name"].replace(" ", "%20"),
        },
        "styling": {
            "accent_hsl": target.get("accent_hsl"),
            "logo_url": target.get("logo_url"),
        },
        "source": (by_type.get("cold_email") or {}).get("payload", {}).get("source"),
    }


# ---------------------------------------------------------------------------
# Targets (operator)
# ---------------------------------------------------------------------------

@router.post("/targets")
def create_or_seed_target(
    payload: TargetCreateIn,
    request: Request,
    env_id: str = Query(default=None),
    business_id: UUID | None = Query(default=None),
):
    """Create-or-idempotently-return a target by (env_id, firm_slug).

    On first creation, generate the default asset pack (AI or deterministic).
    No external scraping, no environment scaffolding.
    """
    try:
        resolved_env, resolved_business = _resolve_env(env_id, business_id, payload)
        existing = op_db.get_target_by_slug(
            env_id=resolved_env, firm_slug=payload.firm_slug
        )
        if existing:
            return {**_target_response(existing), "created": False}

        target = op_db.create_target(
            env_id=resolved_env,
            business_id=resolved_business,
            payload=payload.dict(),
        )
        try:
            _seed_assets(target)
        except Exception as gen_exc:
            op_db.update_target(target_id=target["id"], status="failed")
            raise gen_exc
        fresh = op_db.get_target_by_id(target_id=target["id"])
        return {**_target_response(fresh), "created": True}
    except ValueError as exc:
        return domain_error_response(
            request=request, status_code=422, code="outreach_personalizer.validation_error",
            detail=str(exc), action="outreach-personalizer.target.create.failed",
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request, status_code=status, code=code,
            detail=str(exc), action="outreach-personalizer.target.create.failed",
        )


@router.get("/targets")
def list_targets(
    request: Request,
    env_id: str = Query(...),
):
    try:
        targets = op_db.list_targets(env_id=env_id)
        rollups = op_db.engagement_rollup_bulk(
            target_ids=[str(t["id"]) for t in targets]
        )
        # Phase 2C: per-row linked-opportunity indicator, single bulk JOIN
        # (no per-row N+1 gate computation; full gate is detail-view only).
        opp_summaries = op_db.list_opportunity_summaries_bulk(
            opp_ids=[
                str(t["crm_opportunity_id"]) for t in targets
                if t.get("crm_opportunity_id")
            ]
        )
        # Phase 3: per-row scaffolded-env indicator. Single bulk lookup;
        # empty-input short-circuit keeps Phase 1/2A/2B/2C list-view tests
        # with unscaffolded targets from consuming an extra FakeCursor push.
        scaffold_links = op_db.get_scaffolded_env_id_bulk(
            target_ids=[str(t["id"]) for t in targets]
        )
        for t in targets:
            t["engagement"] = rollups.get(str(t["id"]), dict(op_db._EMPTY_ROLLUP))
            opp_id = t.get("crm_opportunity_id")
            opp = opp_summaries.get(str(opp_id)) if opp_id else None
            t["crm_opportunity"] = opp
            t["pipeline"] = {
                "linked": opp is not None,
                "opportunity_name": (opp or {}).get("name") if opp else None,
                "current_stage_label": (opp or {}).get("stage_label") if opp else None,
            }
            sid = scaffold_links.get(str(t["id"]))
            t["scaffold"] = {"linked": sid is not None, "env_id": sid}
        return {"targets": targets}
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request, status_code=status, code=code,
            detail=str(exc), action="outreach-personalizer.targets.list.failed",
        )


@router.get("/targets/{target_id}")
def get_target(
    target_id: UUID,
    request: Request,
):
    try:
        target = op_db.get_target_by_id(target_id=target_id)
        resp = _target_response(target)
        resp["engagement"] = op_db.engagement_rollup(target_id=target_id)
        resp["crm_account"] = _crm_account_summary(target)
        # Phase 2C: pre-fetch the opp summary once, attach to response, AND pass
        # to compute_pipeline_advance_state so it does not re-query.
        opp = _crm_opportunity_summary(target)
        resp["crm_opportunity"] = opp
        resp["pipeline"] = op_db.compute_pipeline_advance_state(
            target=target, opportunity=opp,
        )
        # Phase 3: pre-fetch the env summary if scaffolded, attach to response,
        # AND pass to compute_scaffold_env_state so it does not re-query.
        env = _scaffolded_env_summary(target)
        resp["scaffold"] = op_db.compute_scaffold_env_state(target=target, env=env)
        return resp
    except OutreachTargetNotFound as exc:
        return domain_error_response(
            request=request, status_code=404, code="outreach_personalizer.not_found",
            detail=str(exc), action="outreach-personalizer.target.get.failed",
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request, status_code=status, code=code,
            detail=str(exc), action="outreach-personalizer.target.get.failed",
        )


def _crm_account_summary(target: dict) -> dict | None:
    cid = target.get("crm_account_id")
    if not cid:
        return None
    return op_db.crm_account_summary(crm_account_id=cid)


def _crm_opportunity_summary(target: dict) -> dict | None:
    """Phase 2C — read-only opportunity summary attached to detail responses.
    Mirrors `_crm_account_summary` exactly. None if no linked opportunity."""
    oid = target.get("crm_opportunity_id")
    if not oid:
        return None
    return op_db.crm_opportunity_summary(crm_opportunity_id=oid)


def _scaffolded_env_summary(target: dict) -> dict | None:
    """Phase 3 — read-only scaffolded-env summary attached to detail responses.
    Mirrors `_crm_account_summary` / `_crm_opportunity_summary` exactly. None
    if the target has no scaffolded env. `dashboard_url` is computed inside
    op_db.env_summary using the same substitution that
    environment_pipeline_v2._build_response performs."""
    sid = target.get("scaffolded_env_id")
    if not sid:
        return None
    return op_db.env_summary(env_id=sid)


@router.patch("/targets/{target_id}")
def patch_target(
    target_id: UUID,
    payload: MicrositeUpdateIn,
    request: Request,
):
    """Phase 2A: edit/save loom_url + link a CRM account (+ optional logo/accent).

    Only explicitly-provided fields are written. loom_url is validated and
    normalized to a safe Loom embed URL (or null to clear). crm_account_id must
    reference an existing crm_account. No env scaffolding, no CRM model changes.
    """
    try:
        target = op_db.get_target_by_id(target_id=target_id)  # 404 early if missing
        provided = payload.model_dump(exclude_unset=True)

        if "loom_url" in provided:
            provided["loom_url"] = normalize_loom_url(provided["loom_url"])

        # Phase 2C clear-order guard: prevent the impossible state
        # (crm_opportunity_id NOT NULL AND crm_account_id NULL) at the route
        # layer with a specific operator message, so the migration 612 CHECK
        # never actually fires. Resolve post-PATCH values from current target
        # + provided patch fields.
        if "crm_account_id" in provided or "crm_opportunity_id" in provided:
            final_account = provided.get("crm_account_id", target.get("crm_account_id"))
            final_opp = provided.get(
                "crm_opportunity_id", target.get("crm_opportunity_id")
            )
            if final_opp is not None and final_account is None:
                raise ValueError(
                    "Clear the linked CRM opportunity before clearing the CRM account."
                )

        if provided.get("crm_account_id") is not None:
            if not op_db.crm_account_exists(crm_account_id=provided["crm_account_id"]):
                raise ValueError(
                    f"crm_account_id {provided['crm_account_id']} does not exist."
                )

        # Phase 2C: opportunity FK + same-business guard.
        if provided.get("crm_opportunity_id") is not None:
            if not target.get("business_id"):
                raise ValueError(
                    "Target has no business_id; cannot link an opportunity."
                )
            if not op_db.crm_opportunity_exists(
                crm_opportunity_id=provided["crm_opportunity_id"],
                business_id=target["business_id"],
            ):
                raise ValueError(
                    f"crm_opportunity_id {provided['crm_opportunity_id']} "
                    "does not exist or belongs to a different business."
                )

        updated = op_db.patch_target(target_id=target_id, fields=provided)
        resp = _target_response(updated)
        resp["crm_account"] = _crm_account_summary(updated)
        resp["crm_opportunity"] = _crm_opportunity_summary(updated)
        return resp
    except OutreachTargetNotFound as exc:
        return domain_error_response(
            request=request, status_code=404, code="outreach_personalizer.not_found",
            detail=str(exc), action="outreach-personalizer.target.patch.failed",
        )
    except ValueError as exc:
        return domain_error_response(
            request=request, status_code=400, code="outreach_personalizer.validation_error",
            detail=str(exc), action="outreach-personalizer.target.patch.failed",
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request, status_code=status, code=code,
            detail=str(exc), action="outreach-personalizer.target.patch.failed",
        )


@router.post("/targets/{target_id}/regenerate/{asset_type}")
def regenerate_asset(
    target_id: UUID,
    asset_type: str,
    request: Request,
):
    """Regenerate one asset. AI REQUIRED — fails closed if unconfigured."""
    try:
        target = op_db.get_target_by_id(target_id=target_id)
        profile = target.get("profile_json") or {}
        by_type = _assets_by_type(op_db.list_assets(target_id=target_id))
        insights = _insights_from_assets(by_type)

        result = op_ai.regenerate_asset(
            asset_type=asset_type,
            firm_name=target["firm_name"],
            sector=_sector(profile),
            profile=profile,
            insights=insights,
        )
        if asset_type == "insight":
            new_payload = {"insights": result, "source": "ai"}
        else:
            new_payload = {**result, "source": "ai"}
        row = op_db.regenerate_asset_row(
            target_id=target_id, asset_type=asset_type, payload=new_payload
        )
        return {"asset": row}
    except OutreachTargetNotFound as exc:
        return domain_error_response(
            request=request, status_code=404, code="outreach_personalizer.not_found",
            detail=str(exc), action="outreach-personalizer.regenerate.failed",
        )
    except ValueError as exc:
        return domain_error_response(
            request=request, status_code=422, code="outreach_personalizer.regenerate_error",
            detail=str(exc), action="outreach-personalizer.regenerate.failed",
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request, status_code=status, code=code,
            detail=str(exc), action="outreach-personalizer.regenerate.failed",
        )


# ---------------------------------------------------------------------------
# CRM follow-through (Phase 2B) — reuses crm_svc.create_activity. No new model.
# ---------------------------------------------------------------------------

def _engagement_activity_body(target: dict, rollup: dict, note: str | None) -> str:
    lines = [
        f"Outreach microsite engagement for {target['firm_name']}.",
        f"Microsite: {target.get('microsite_url') or '/for/' + target['firm_slug']}",
        f"Views: {rollup['total_views']}  |  CTA clicks: {rollup['total_ctas']}",
        f"Last viewed: {rollup.get('last_viewed_at') or 'never'}",
        f"Last CTA: {rollup.get('last_cta_at') or 'never'}",
    ]
    if note:
        lines.append(f"Operator note: {note}")
    lines.append("Generated from Outreach Personalizer.")
    return "\n".join(lines)


@router.post("/targets/{target_id}/crm-activity")
def log_crm_activity(
    target_id: UUID,
    payload: LogCrmActivityIn,
    request: Request,
):
    """Log the target's microsite engagement as a CRM activity.

    Reuses crm_svc.create_activity (writes crm_activity). Fails closed when the
    target has no linked CRM account or no business_id (create_activity needs a
    business_id to resolve the tenant).
    """
    try:
        target = op_db.get_target_by_id(target_id=target_id)
        if not target.get("crm_account_id"):
            raise ValueError(
                "Target is not linked to a CRM account. Link one before logging activity."
            )
        if not target.get("business_id"):
            raise ValueError(
                "Target has no business_id; cannot resolve a CRM tenant for the activity."
            )
        rollup = op_db.engagement_rollup(target_id=target_id)
        activity = crm_svc.create_activity(
            business_id=target["business_id"],
            subject=f"Outreach microsite engagement — {target['firm_name']}",
            activity_type="note",
            body=_engagement_activity_body(target, rollup, payload.note),
            crm_account_id=target["crm_account_id"],
        )
        return {"ok": True, "activity": activity, "engagement": rollup}
    except OutreachTargetNotFound as exc:
        return domain_error_response(
            request=request, status_code=404, code="outreach_personalizer.not_found",
            detail=str(exc), action="outreach-personalizer.crm-activity.failed",
        )
    except ValueError as exc:
        return domain_error_response(
            request=request, status_code=400, code="outreach_personalizer.validation_error",
            detail=str(exc), action="outreach-personalizer.crm-activity.failed",
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request, status_code=status, code=code,
            detail=str(exc), action="outreach-personalizer.crm-activity.failed",
        )


@router.post("/targets/{target_id}/advance-pipeline")
def advance_pipeline(
    target_id: UUID,
    payload: AdvancePipelineIn,
    request: Request,
):
    """Phase 2C: advance the linked opportunity's pipeline stage by ONE step.

    The four-condition gate is enforced inside compute_pipeline_advance_state
    (the single source of truth for both display and enforcement). When all
    conditions pass, this endpoint calls the existing crm_svc.move_opportunity_stage
    with the deterministic computed next stage; no new pipeline mechanism, no
    operator-chosen target stage. Fail-closed with the exact gate
    `blocking_reason` string on every unavailable case.
    """
    try:
        target = op_db.get_target_by_id(target_id=target_id)
        state = op_db.compute_pipeline_advance_state(target=target)
        if not state["available"]:
            raise ValueError(state["blocking_reason"])

        moved = crm_svc.move_opportunity_stage(
            business_id=target["business_id"],
            crm_opportunity_id=target["crm_opportunity_id"],
            to_stage_id=state["next_stage"]["crm_pipeline_stage_id"],
            note=payload.note or "Advanced via Outreach Personalizer",
        )
        # Recompute gate so the operator UI immediately reflects the post-move
        # state (next-next stage, or "Opportunity already at terminal stage."
        # if we just advanced into the terminal).
        fresh_target = op_db.get_target_by_id(target_id=target_id)
        fresh_state = op_db.compute_pipeline_advance_state(target=fresh_target)
        return {"ok": True, "opportunity": moved, "pipeline": fresh_state}
    except OutreachTargetNotFound as exc:
        return domain_error_response(
            request=request, status_code=404, code="outreach_personalizer.not_found",
            detail=str(exc), action="outreach-personalizer.advance-pipeline.failed",
        )
    except ValueError as exc:
        return domain_error_response(
            request=request, status_code=400,
            code="outreach_personalizer.validation_error",
            detail=str(exc), action="outreach-personalizer.advance-pipeline.failed",
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request, status_code=status, code=code,
            detail=str(exc), action="outreach-personalizer.advance-pipeline.failed",
        )


@router.post("/targets/{target_id}/scaffold-env")
def scaffold_env(
    target_id: UUID,
    payload: ScaffoldEnvIn,
    request: Request,
):
    """Phase 3: provision a REPE-flavored outreach environment for the target
    via env_v2.create_environment_v2(), idempotent on target.scaffolded_env_id.

    Single source of truth for the gate: compute_scaffold_env_state. When all
    conditions pass and no env is linked yet, this endpoint calls the existing
    env_v2 service with template_key="repe"; on success the returned env_id is
    persisted on the target row. When the target is already scaffolded, this
    endpoint returns the existing env summary with created=False (idempotent
    branch; not a 400).

    Public microsite NEVER reaches this endpoint — operator-only.
    """
    try:
        target = op_db.get_target_by_id(target_id=target_id)
        state = op_db.compute_scaffold_env_state(target=target)
        if not state["available"]:
            # Idempotent already-linked branch returns 200 with created=False
            # (consistent with Phase 1's POST /targets idempotency). All other
            # gate failures are 400 with the exact blocking_reason.
            if (
                state["env_summary"] is not None
                and state["blocking_reason"] == "Environment already exists."
            ):
                return {
                    "ok": True, "created": False,
                    "env": state["env_summary"], "scaffold": state,
                }
            raise ValueError(state["blocking_reason"])

        manifest = EnvironmentManifestV2(
            client_name=target["firm_name"],
            template_key="repe",
            slug=str(target["firm_slug"]).lower(),  # citext → str; enforce lowercase
            theme_tokens=(
                {"accent": target["accent_hsl"]} if target.get("accent_hsl") else None
            ),
        )
        result = env_v2.create_environment_v2(
            manifest, actor="outreach_personalizer",
        )
        if result.errors or not result.env_id:
            raise ValueError(
                f"Environment pipeline failed: {'; '.join(result.errors) or 'unknown error'}"
            )
        op_db.set_scaffolded_env_id(target_id=target_id, env_id=result.env_id)

        # Recompute the gate so the response carries the fresh
        # "Environment already exists." + populated env_summary.
        fresh_target = op_db.get_target_by_id(target_id=target_id)
        fresh_state = op_db.compute_scaffold_env_state(target=fresh_target)
        return {
            "ok": True, "created": True,
            "env": fresh_state["env_summary"], "scaffold": fresh_state,
        }
    except OutreachTargetNotFound as exc:
        return domain_error_response(
            request=request, status_code=404,
            code="outreach_personalizer.not_found",
            detail=str(exc), action="outreach-personalizer.scaffold-env.failed",
        )
    except LookupError:
        # env_v2.get_template raises LookupError on unknown template_key
        return domain_error_response(
            request=request, status_code=400,
            code="outreach_personalizer.validation_error",
            detail="Environment template is not available.",
            action="outreach-personalizer.scaffold-env.failed",
        )
    except ValueError as exc:
        return domain_error_response(
            request=request, status_code=400,
            code="outreach_personalizer.validation_error",
            detail=str(exc),
            action="outreach-personalizer.scaffold-env.failed",
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request, status_code=status, code=code,
            detail=f"Environment pipeline failed: {exc}",
            action="outreach-personalizer.scaffold-env.failed",
        )


# ---------------------------------------------------------------------------
# Microsite (public — no auth, no env)
# ---------------------------------------------------------------------------

@router.get("/microsite/{slug}")
def get_microsite(slug: str, request: Request):
    try:
        target = op_db.get_public_target_by_slug(firm_slug=slug)
        if not target:
            return domain_error_response(
                request=request, status_code=404,
                code="outreach_personalizer.microsite_not_found",
                detail=f"No microsite for '{slug}'.",
                action="outreach-personalizer.microsite.get.failed",
            )
        if not op_db.is_public_ready(target):
            return {
                "ready": False,
                "reason": "not_ready",
                "firm": {"name": target["firm_name"], "slug": target["firm_slug"]},
            }
        assets = op_db.list_assets(target_id=target["id"])
        return _microsite_payload(target, assets)
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request, status_code=status, code=code,
            detail=str(exc), action="outreach-personalizer.microsite.get.failed",
        )


@router.post("/microsite/{slug}/track")
def track_microsite_event(
    slug: str,
    payload: MicrositeTrackIn,
    request: Request,
):
    try:
        if payload.event_type not in ("microsite_view", "microsite_cta"):
            raise ValueError(
                f"event_type must be microsite_view or microsite_cta, got '{payload.event_type}'"
            )
        target = op_db.get_public_target_by_slug(firm_slug=slug)
        event = op_db.record_microsite_event(
            target_id=target["id"] if target else None,
            env_id=target["env_id"] if target else None,
            microsite_slug=slug,
            event_type=payload.event_type,
            metadata=payload.metadata,
            ip_address=request.headers.get("x-forwarded-for")
            or (request.client.host if request.client else None),
            user_agent=request.headers.get("user-agent"),
        )
        return {"ok": True, "event_id": event["id"]}
    except ValueError as exc:
        return domain_error_response(
            request=request, status_code=422, code="outreach_personalizer.validation_error",
            detail=str(exc), action="outreach-personalizer.microsite.track.failed",
        )
    except Exception as exc:
        status, code = classify_domain_error(exc)
        return domain_error_response(
            request=request, status_code=status, code=code,
            detail=str(exc), action="outreach-personalizer.microsite.track.failed",
        )
