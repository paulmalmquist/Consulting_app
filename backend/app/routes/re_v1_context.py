from __future__ import annotations

from uuid import UUID

import psycopg
from fastapi import APIRouter, HTTPException, Query, Request, Response

from app.db import get_cursor
from app.observability.logger import emit_log
from app.services import repe_context

router = APIRouter(prefix="/api/re/v1", tags=["re-v1-context"])

# ---------------------------------------------------------------------------
# Canonical endpoint: GET /api/re/v1/context?env_id=...
#
# Contract guarantees (enforced here, not in middleware):
#   - Only GET and OPTIONS are accepted.
#   - Returns structured error envelopes on ALL non-2xx paths.
#   - Never returns 405; method mismatch is caught at route definition.
#   - Never hangs; all DB calls are bounded by connection-pool timeout.
#   - Validates: env exists, industry=real_estate, business mapping exists.
#   - If workspace is not bootstrapped returns RE_NOT_BOOTSTRAPPED (422).
# ---------------------------------------------------------------------------


def _to_http(exc: Exception) -> HTTPException:
    if isinstance(exc, HTTPException):
        return exc
    if isinstance(exc, repe_context.RepeContextError):
        msg = str(exc)
        if "missing" in msg.lower() or "migration" in msg.lower():
            return HTTPException(
                503,
                {"error_code": "SCHEMA_NOT_MIGRATED", "message": msg, "detail": msg},
            )
        return HTTPException(
            400,
            {"error_code": "CONTEXT_ERROR", "message": msg, "detail": msg},
        )
    if isinstance(exc, psycopg.errors.UndefinedTable):
        return HTTPException(
            503,
            {
                "error_code": "SCHEMA_NOT_MIGRATED",
                "message": "RE schema not migrated.",
                "detail": "Run migration 270.",
            },
        )
    return HTTPException(
        500,
        {
            "error_code": "INTERNAL_ERROR",
            "message": "An unexpected error occurred.",
            "detail": str(exc),
        },
    )


@router.options("/context")
def options_re_context() -> Response:
    """
    OPTIONS /api/re/v1/context
    Explicit OPTIONS handler. Belt-and-suspenders alongside CORS middleware.
    Prevents any ambiguity about which methods this endpoint accepts.
    """
    return Response(
        status_code=200,
        headers={"Allow": "GET, OPTIONS"},
    )


@router.get("/context")
def get_re_context(
    request: Request,
    env_id: str | None = Query(default=None),
    business_id: UUID | None = Query(default=None),
):
    """
    GET /api/re/v1/context?env_id=...

    Canonical context endpoint for the RE workspace. Validates:
      1. env_id is present and resolvable
      2. industry = real_estate
      3. business binding exists
      4. workspace is bootstrapped (has ≥1 fund)

    Returns deterministic context payload on success.
    Returns structured error envelope on all failure paths. Never 405. Never hangs.
    """
    try:
        resolved = repe_context.resolve_repe_business_context(
            request=request,
            env_id=env_id,
            business_id=str(business_id) if business_id else None,
            allow_create=True,
        )

        funds_count = 0
        scenarios_count = 0
        is_bootstrapped = False
        industry = "real_estate"

        with get_cursor() as cur:
            # --- Validate: environment industry = real_estate ---
            cur.execute(
                "SELECT 1 FROM information_schema.tables WHERE table_schema = 'app' AND table_name = 'environments'"
            )
            if cur.fetchone():
                cur.execute(
                    "SELECT industry FROM app.environments WHERE env_id = %s::uuid",
                    (resolved.env_id,),
                )
                env_row = cur.fetchone()
                if env_row:
                    industry = env_row.get("industry") or "real_estate"
                    # Accept the canonical real-estate industry codes:
                    #   - real_estate (legacy slug)
                    #   - real_estate_pe (Meridian-style PE shop)
                    #   - repe (older code path)
                    # The RE workspace's data contracts are identical
                    # for all three. See repo-b/src/lib/labels.ts +
                    # backend/app/services/workspace_templates.py.
                    if industry not in ("real_estate", "real_estate_pe", "repe"):
                        raise HTTPException(
                            400,
                            {
                                "error_code": "WRONG_INDUSTRY",
                                "message": (
                                    f"Environment {resolved.env_id} has industry '{industry}', "
                                    "not a real-estate industry. The RE workspace requires "
                                    "industry in (real_estate, real_estate_pe, repe)."
                                ),
                                "detail": {
                                    "env_id": resolved.env_id,
                                    "actual_industry": industry,
                                    "required_industries": ["real_estate", "real_estate_pe", "repe"],
                                },
                            },
                        )

            # --- Count funds (determines bootstrap status) ---
            cur.execute(
                "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'repe_fund'"
            )
            if cur.fetchone():
                cur.execute(
                    "SELECT count(*) AS cnt FROM repe_fund WHERE business_id = %s::uuid",
                    (resolved.business_id,),
                )
                row = cur.fetchone()
                funds_count = row["cnt"] if row else 0
                is_bootstrapped = funds_count > 0

            # --- Count scenarios ---
            cur.execute(
                "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 're_scenario'"
            )
            if cur.fetchone():
                cur.execute(
                    """SELECT count(*) AS cnt FROM re_scenario s
                       JOIN repe_fund f ON f.fund_id = s.fund_id
                       WHERE f.business_id = %s::uuid""",
                    (resolved.business_id,),
                )
                row = cur.fetchone()
                scenarios_count = row["cnt"] if row else 0

        # --- Validate: bootstrap complete ---
        if not is_bootstrapped:
            emit_log(
                level="warn",
                service="backend",
                action="re.v1.context.not_bootstrapped",
                message="RE workspace context resolved but bootstrap incomplete",
                context={
                    "env_id": resolved.env_id,
                    "business_id": resolved.business_id,
                    "industry": industry,
                },
            )
            raise HTTPException(
                422,
                {
                    "error_code": "RE_NOT_BOOTSTRAPPED",
                    "message": (
                        "Real Estate workspace has not been bootstrapped for this environment. "
                        "Call POST /api/re/v1/context/bootstrap to initialize."
                    ),
                    "detail": {
                        "env_id": resolved.env_id,
                        "business_id": resolved.business_id,
                        "industry": industry,
                        "funds_count": funds_count,
                        "bootstrap_endpoint": "POST /api/re/v1/context/bootstrap",
                    },
                },
            )

        emit_log(
            level="info",
            service="backend",
            action="re.v1.context.ok",
            message="RE v1 context resolved",
            context={
                "env_id": resolved.env_id,
                "business_id": resolved.business_id,
                "industry": industry,
                "is_bootstrapped": is_bootstrapped,
                "funds_count": funds_count,
            },
        )

        return {
            "env_id": resolved.env_id,
            "business_id": resolved.business_id,
            "industry": industry,
            "is_bootstrapped": is_bootstrapped,
            "funds_count": funds_count,
            "scenarios_count": scenarios_count,
        }
    except Exception as exc:
        raise _to_http(exc)


@router.options("/context/bootstrap")
def options_re_context_bootstrap() -> Response:
    """OPTIONS /api/re/v1/context/bootstrap — explicit OPTIONS handler."""
    return Response(
        status_code=200,
        headers={"Allow": "POST, OPTIONS"},
    )


@router.post("/context/bootstrap")
def bootstrap_re_workspace(
    request: Request,
    env_id: str | None = Query(default=None),
    business_id: UUID | None = Query(default=None),
):
    """
    POST /api/re/v1/context/bootstrap

    Bootstrap/seed the RE workspace for the given environment.
    Idempotent: safe to call if workspace already exists.
    """
    try:
        resolved = repe_context.resolve_repe_business_context(
            request=request,
            env_id=env_id,
            business_id=str(business_id) if business_id else None,
            allow_create=True,
        )

        repe_context.seed_repe_workspace(
            business_id=resolved.business_id,
            env_id=resolved.env_id,
        )

        # Re-count after seeding
        funds_count = 0
        scenarios_count = 0
        with get_cursor() as cur:
            cur.execute(
                "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'repe_fund'"
            )
            if cur.fetchone():
                cur.execute(
                    "SELECT count(*) AS cnt FROM repe_fund WHERE business_id = %s::uuid",
                    (resolved.business_id,),
                )
                row = cur.fetchone()
                funds_count = row["cnt"] if row else 0

            cur.execute(
                "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 're_scenario'"
            )
            if cur.fetchone():
                cur.execute(
                    """SELECT count(*) AS cnt FROM re_scenario s
                       JOIN repe_fund f ON f.fund_id = s.fund_id
                       WHERE f.business_id = %s::uuid""",
                    (resolved.business_id,),
                )
                row = cur.fetchone()
                scenarios_count = row["cnt"] if row else 0

        emit_log(
            level="info",
            service="backend",
            action="re.v1.context.bootstrap.ok",
            message="RE workspace bootstrap complete",
            context={
                "env_id": resolved.env_id,
                "business_id": resolved.business_id,
                "funds_count": funds_count,
            },
        )

        return {
            "env_id": resolved.env_id,
            "business_id": resolved.business_id,
            "industry": "real_estate",
            "is_bootstrapped": funds_count > 0,
            "funds_count": funds_count,
            "scenarios_count": scenarios_count,
        }
    except Exception as exc:
        raise _to_http(exc)
