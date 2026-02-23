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
    resolved_env_id, source = _extract_env_id(request, env_id)

    if business_id:
        if resolved_env_id:
            with get_cursor() as cur:
                if _table_exists(cur, "app.env_business_bindings"):
                    cur.execute(
                        """
                        INSERT INTO app.env_business_bindings (env_id, business_id)
                        VALUES (%s::uuid, %s::uuid)
                        ON CONFLICT (env_id) DO UPDATE SET business_id = EXCLUDED.business_id, updated_at = now()
                        """,
                        (resolved_env_id, business_id),
                    )
        return RepeContextResolution(
            env_id=resolved_env_id or "",
            business_id=business_id,
            created=False,
            source="explicit_business_id",
            diagnostics={
                "binding_found": False,
                "business_found": True,
                "env_found": bool(resolved_env_id),
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
