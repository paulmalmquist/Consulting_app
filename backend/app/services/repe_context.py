from __future__ import annotations

from dataclasses import dataclass
from typing import Any
from uuid import UUID

from fastapi import Request

from app.db import get_cursor
from app.observability.logger import emit_log
from app.services import business as business_svc


class RepeContextError(RuntimeError):
    pass


@dataclass
class RepeContextResolution:
    env_id: str
    business_id: str
    created: bool
    source: str
    diagnostics: dict[str, Any]


def _extract_env_id(request: Request | None, env_id: str | None = None) -> tuple[str | None, str]:
    if env_id:
        return env_id, "param"
    if request is None:
        return None, "missing"

    header_env = request.headers.get("x-env-id")
    if header_env:
        return header_env, "header"

    query_env = request.query_params.get("env_id")
    if query_env:
        return query_env, "query"

    cookie_env = request.cookies.get("demo_lab_env_id")
    if cookie_env:
        return cookie_env, "cookie"

    return None, "missing"


def _table_exists(cur, fq_name: str) -> bool:
    if "." in fq_name:
        schema_name, table_name = fq_name.split(".", 1)
    else:
        schema_name, table_name = "public", fq_name
    cur.execute(
        """
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = %s AND table_name = %s
        """,
        (schema_name, table_name),
    )
    return bool(cur.fetchone())


def resolve_repe_business_context(
    *,
    request: Request | None = None,
    env_id: str | None = None,
    business_id: str | None = None,
    allow_create: bool = True,
) -> RepeContextResolution:
    """Resolve REPE business context from env/business parameters or session.

    Returns a RepeContextResolution with business_id, env_id, and diagnostic info
    about how the binding was found or created. Binding semantics:

    - binding_found=True: Binding existed in DB (not newly created)
    - binding_found=False: No binding found or binding was just created
    - business_found=True: We have a valid business_id (from param or DB)
    - env_found=True: env_id was successfully extracted/provided

    Will auto-create a business if allow_create=True and no binding found.
    """
    resolved_env_id, source = _extract_env_id(request, env_id)

    # If explicit business_id provided, use it directly
    # (may optionally create binding if env_id is also available)
    if business_id:
        if resolved_env_id:
            with get_cursor() as cur:
                if _table_exists(cur, "app.env_business_bindings"):
                    # Create or update binding for this env->business mapping
                    cur.execute(
                        """
                        INSERT INTO app.env_business_bindings (env_id, business_id)
                        VALUES (%s::uuid, %s::uuid)
                        ON CONFLICT (env_id) DO UPDATE SET business_id = EXCLUDED.business_id, updated_at = now()
                        """,
                        (resolved_env_id, business_id),
                    )
        # Return explicit business_id even if env_id could not be extracted
        # binding_found=False means binding was not pre-existing, not that business is invalid
        return RepeContextResolution(
            env_id=resolved_env_id or "",
            business_id=business_id,
            created=False,
            source="explicit_business_id",
            diagnostics={
                "binding_found": False,  # Not a pre-existing binding (may have just created it)
                "business_found": True,   # Caller provided valid business_id
                "env_found": bool(resolved_env_id),  # env_id may or may not be available
            },
        )

    if not resolved_env_id:
        raise RepeContextError("No environment context found. Provide env_id or X-Env-Id.")

    with get_cursor() as cur:
        if not _table_exists(cur, "app.environments"):
            raise RepeContextError("Environment table is missing (app.environments).")
        if not _table_exists(cur, "app.businesses"):
            raise RepeContextError("Business table is missing (app.businesses).")
        if not _table_exists(cur, "app.env_business_bindings"):
            raise RepeContextError("Binding table is missing (app.env_business_bindings). Run migration 266.")

        cur.execute(
            "SELECT env_id::text, client_name FROM app.environments WHERE env_id = %s::uuid",
            (resolved_env_id,),
        )
        env_row = cur.fetchone()
        if not env_row:
            raise RepeContextError(f"Environment not found: {resolved_env_id}")

        cur.execute(
            """
            SELECT b.business_id::text AS business_id, b.name
            FROM app.env_business_bindings eb
            JOIN app.businesses b ON b.business_id = eb.business_id
            WHERE eb.env_id = %s::uuid
            LIMIT 1
            """,
            (resolved_env_id,),
        )
        bound = cur.fetchone()
        if bound:
            return RepeContextResolution(
                env_id=resolved_env_id,
                business_id=bound["business_id"],
                created=False,
                source=f"binding:{source}",
                diagnostics={
                    "binding_found": True,
                    "business_found": True,
                    "env_found": True,
                },
            )

        env_token = resolved_env_id.split("-")[0].lower()
        cur.execute(
            """
            SELECT business_id::text AS business_id
            FROM app.businesses
            WHERE lower(slug) LIKE %s OR lower(slug) LIKE %s
            ORDER BY created_at DESC
            LIMIT 1
            """,
            (f"%{env_token}%", f"repe-{env_token}%"),
        )
        candidate = cur.fetchone()
        if candidate:
            cur.execute(
                """
                INSERT INTO app.env_business_bindings (env_id, business_id)
                VALUES (%s::uuid, %s::uuid)
                ON CONFLICT (env_id) DO UPDATE SET business_id = EXCLUDED.business_id, updated_at = now()
                """,
                (resolved_env_id, candidate["business_id"]),
            )
            return RepeContextResolution(
                env_id=resolved_env_id,
                business_id=candidate["business_id"],
                created=False,
                source=f"heuristic_slug:{source}",
                diagnostics={
                    "binding_found": False,
                    "business_found": True,
                    "env_found": True,
                },
            )

    if not allow_create:
        raise RepeContextError("No business binding found for environment.")

    env_name = env_row.get("client_name") or "REPE Workspace"
    slug = f"repe-{resolved_env_id[:8]}"
    created = business_svc.create_business(f"REPE Workspace - {env_name}", slug, "us")
    created_business_id = str(created["business_id"])

    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO app.env_business_bindings (env_id, business_id)
            VALUES (%s::uuid, %s::uuid)
            ON CONFLICT (env_id) DO UPDATE SET business_id = EXCLUDED.business_id, updated_at = now()
            """,
            (resolved_env_id, created_business_id),
        )

    emit_log(
        level="warn",
        service="backend",
        action="repe.context.auto_created_business",
        message="Auto-created business for REPE context",
        context={
            "env_id": resolved_env_id,
            "business_id": created_business_id,
            "source": source,
        },
    )

    return RepeContextResolution(
        env_id=resolved_env_id,
        business_id=created_business_id,
        created=True,
        source=f"auto_create:{source}",
        diagnostics={
            "binding_found": False,
            "business_found": True,
            "env_found": True,
        },
    )


def seed_repe_workspace(business_id: str, env_id: str) -> None:
    """Seed a minimal REPE workspace for a newly created environment.

    Creates one placeholder fund root + empty capital account ledger if none exist.
    Also seeds RE v2 structures (base scenario, default assumption set) if tables exist.
    Logs all outcomes with structured context so failures are traceable.
    """
    ctx = {"environment_id": env_id, "module_name": "repe_context", "business_id": business_id}

    emit_log(
        level="info",
        service="backend",
        action="repe.workspace.seed_start",
        message="Seeding REPE workspace",
        context=ctx,
    )

    try:
        with get_cursor() as cur:
            if not _table_exists(cur, "repe_fund"):
                emit_log(
                    level="warn",
                    service="backend",
                    action="repe.workspace.seed_skipped",
                    message="repe_fund table missing — skipping REPE seed",
                    context={**ctx, "init_status": "skipped", "error_reason": "missing_table:repe_fund"},
                )
                return

            cur.execute(
                "SELECT 1 FROM repe_fund WHERE business_id = %s::uuid LIMIT 1",
                (business_id,),
            )
            if cur.fetchone():
                emit_log(
                    level="info",
                    service="backend",
                    action="repe.workspace.seed_skipped",
                    message="REPE seed skipped — fund already exists",
                    context={**ctx, "init_status": "already_initialized"},
                )
                # Still seed v2 structures in case they're missing
                _seed_re_v2_structures(business_id, ctx)
                return

        # Use full seed_demo for rich demo data (2 funds, 3 deals, 3 assets, entities, capital events)
        from app.services import repe as repe_svc

        try:
            repe_svc.seed_demo(business_id=UUID(business_id))
        except Exception as seed_err:
            emit_log(
                level="warn",
                service="backend",
                action="repe.workspace.seed_demo_fallback",
                message=f"Full seed_demo failed ({seed_err}), falling back to minimal seed",
                context=ctx,
            )
            with get_cursor() as cur:
                cur.execute(
                    """INSERT INTO repe_fund
                         (business_id, name, vintage_year, fund_type, strategy, status)
                       VALUES (%s::uuid, %s, %s, 'closed_end', 'equity', 'fundraising')""",
                    (business_id, "Fund I (Seed)", 2025),
                )

        # Seed RE v2 structures (base scenario + default assumption set)
        _seed_re_v2_structures(business_id, ctx)

        emit_log(
            level="info",
            service="backend",
            action="repe.workspace.seed_complete",
            message="REPE workspace seeded successfully",
            context={**ctx, "init_status": "initialized"},
        )

    except Exception as exc:
        emit_log(
            level="error",
            service="backend",
            action="repe.workspace.seed_failed",
            message=f"REPE workspace seed failed: {exc}",
            context={**ctx, "init_status": "failed", "error_reason": str(exc)},
        )
        raise


def _seed_re_v2_structures(business_id: str, ctx: dict) -> None:
    """Seed RE v2 tables (JVs, scenarios, assumption sets) for all funds owned by this business.

    Fails silently with a log if RE v2 tables are not yet migrated — this is non-fatal.
    """
    try:
        with get_cursor() as cur:
            if not _table_exists(cur, "re_scenario"):
                emit_log(
                    level="info",
                    service="backend",
                    action="repe.workspace.v2_seed_skipped",
                    message="re_scenario table missing — skipping RE v2 seed",
                    context=ctx,
                )
                return

            cur.execute(
                "SELECT fund_id FROM repe_fund WHERE business_id = %s::uuid",
                (business_id,),
            )
            funds = cur.fetchall()

            for fund in funds:
                fund_id = str(fund["fund_id"])

                # Create base scenario if none exists
                cur.execute(
                    "SELECT 1 FROM re_scenario WHERE fund_id = %s::uuid AND is_base = true LIMIT 1",
                    (fund_id,),
                )
                if not cur.fetchone():
                    cur.execute(
                        """INSERT INTO re_scenario (fund_id, name, scenario_type, is_base, status)
                           VALUES (%s::uuid, 'Base', 'base', true, 'active')
                           ON CONFLICT (fund_id, name) DO NOTHING""",
                        (fund_id,),
                    )

                # Create default assumption set if table exists
                if _table_exists(cur, "re_assumption_set"):
                    cur.execute(
                        "SELECT 1 FROM re_assumption_set WHERE fund_id = %s::uuid AND name = 'Default' LIMIT 1",
                        (fund_id,),
                    )
                    if not cur.fetchone():
                        cur.execute(
                            """INSERT INTO re_assumption_set (fund_id, name, version, notes)
                               VALUES (%s::uuid, 'Default', 1, 'Auto-created during environment provisioning')
                               ON CONFLICT DO NOTHING""",
                            (fund_id,),
                        )

            # Seed JV entities for each deal/investment (so the full hierarchy exists)
            if _table_exists(cur, "re_jv"):
                for fund in funds:
                    fund_id = str(fund["fund_id"])
                    cur.execute(
                        "SELECT deal_id, name, deal_type FROM repe_deal WHERE fund_id = %s",
                        (fund_id,),
                    )
                    deals = cur.fetchall()
                    for deal in deals:
                        deal_id = str(deal["deal_id"])
                        cur.execute(
                            "SELECT 1 FROM re_jv WHERE investment_id = %s LIMIT 1",
                            (deal_id,),
                        )
                        if not cur.fetchone():
                            jv_name = f"{deal['name']} JV"
                            gp_pct = "0.200000000000" if deal.get("deal_type") == "equity" else None
                            lp_pct = "0.800000000000" if deal.get("deal_type") == "equity" else None
                            cur.execute(
                                """INSERT INTO re_jv
                                   (investment_id, legal_name, ownership_percent, gp_percent, lp_percent, status)
                                   VALUES (%s, %s, 1.0, %s, %s, 'active')
                                   RETURNING jv_id""",
                                (deal_id, jv_name, gp_pct, lp_pct),
                            )
                            jv_row = cur.fetchone()
                            if jv_row:
                                # Link existing unlinked assets to this JV
                                cur.execute(
                                    """UPDATE repe_asset SET jv_id = %s
                                       WHERE deal_id = %s AND jv_id IS NULL""",
                                    (str(jv_row["jv_id"]), deal_id),
                                )

        emit_log(
            level="info",
            service="backend",
            action="repe.workspace.v2_seed_complete",
            message=f"RE v2 structures seeded for {len(funds)} funds",
            context=ctx,
        )

    except Exception as v2_err:
        emit_log(
            level="warn",
            service="backend",
            action="repe.workspace.v2_seed_failed",
            message=f"RE v2 seed failed (non-fatal): {v2_err}",
            context=ctx,
        )


def repe_health() -> dict[str, Any]:
    required_tables = [
        "app.environments",
        "app.env_business_bindings",
        "app.businesses",
        "repe_fund",
        "repe_fund_term",
        "repe_deal",
        "repe_asset",
    ]

    with get_cursor() as cur:
        missing = [tbl for tbl in required_tables if not _table_exists(cur, tbl)]

    return {
        "ok": len(missing) == 0,
        "migrations_present": [tbl for tbl in required_tables if tbl not in missing],
        "missing_tables": missing,
        "db_ok": True,
    }
