from __future__ import annotations

from uuid import UUID

import psycopg
from fastapi import APIRouter, HTTPException, Query, Request

from app.db import get_cursor
from app.observability.logger import emit_log
from app.services import repe_context

router = APIRouter(prefix="/api/re/v1", tags=["re-v1-context"])


def _to_http(exc: Exception) -> HTTPException:
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
            {"error_code": "SCHEMA_NOT_MIGRATED", "message": "RE schema not migrated.", "detail": "Run migration 270."},
        )
    return HTTPException(
        500,
        {"error_code": "INTERNAL_ERROR", "message": "An unexpected error occurred.", "detail": str(exc)},
    )


@router.get("/context")
def get_re_context(
    request: Request,
    env_id: str | None = Query(default=None),
    business_id: UUID | None = Query(default=None),
):
    """
    GET /api/re/v1/context?env_id=...
    Returns environment context + bootstrap status for the RE workspace.
    """
    try:
        resolved = repe_context.resolve_repe_business_context(
            request=request,
            env_id=env_id,
            business_id=str(business_id) if business_id else None,
            allow_create=True,
        )

        # Count funds and scenarios for this business
        funds_count = 0
        scenarios_count = 0
        is_bootstrapped = False
        industry = "real_estate"

        with get_cursor() as cur:
            # Check if repe_fund table exists
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

            # Check scenarios
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

            # Get environment industry
            cur.execute(
                "SELECT 1 FROM information_schema.tables WHERE table_schema = 'app' AND table_name = 'environments'"
            )
            if cur.fetchone():
                cur.execute(
                    "SELECT industry FROM app.environments WHERE env_id = %s::uuid",
                    (resolved.env_id,),
                )
                env_row = cur.fetchone()
                if env_row and env_row.get("industry"):
                    industry = env_row["industry"]

        emit_log(
            level="info",
            service="backend",
            action="re.v1.context.ok",
            message="RE v1 context resolved",
            context={
                "env_id": resolved.env_id,
                "business_id": resolved.business_id,
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


@router.post("/context/bootstrap")
def bootstrap_re_workspace(
    request: Request,
    env_id: str | None = Query(default=None),
    business_id: UUID | None = Query(default=None),
):
    """
    POST /api/re/v1/context/bootstrap
    Bootstrap/seed the RE workspace for the given environment.
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
