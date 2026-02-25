from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from fastapi import Request

from app.db import get_cursor
from app.services import business as business_svc


class EnvContextError(RuntimeError):
    pass


@dataclass
class EnvBusinessContext:
    env_id: str
    business_id: str
    created: bool
    source: str
    diagnostics: dict[str, Any]
    environment: dict[str, Any] | None = None


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


def resolve_env_business_context(
    *,
    request: Request | None = None,
    env_id: str | None = None,
    business_id: str | None = None,
    allow_create: bool = True,
    create_slug_prefix: str = "env",
) -> EnvBusinessContext:
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
                if _table_exists(cur, "app.environments"):
                    cur.execute(
                        """
                        UPDATE app.environments
                        SET business_id = %s::uuid, updated_at = now()
                        WHERE env_id = %s::uuid
                        """,
                        (business_id, resolved_env_id),
                    )

        return EnvBusinessContext(
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
        raise EnvContextError("No environment context found. Provide env_id or X-Env-Id.")

    with get_cursor() as cur:
        if not _table_exists(cur, "app.environments"):
            raise EnvContextError("Environment table is missing (app.environments).")
        if not _table_exists(cur, "app.businesses"):
            raise EnvContextError("Business table is missing (app.businesses).")
        if not _table_exists(cur, "app.env_business_bindings"):
            raise EnvContextError("Binding table is missing (app.env_business_bindings).")

        cur.execute(
            """
            SELECT env_id::text, client_name, industry, industry_type, schema_name, business_id::text AS business_id
            FROM app.environments
            WHERE env_id = %s::uuid
            """,
            (resolved_env_id,),
        )
        env_row = cur.fetchone()
        if not env_row:
            raise EnvContextError(f"Environment not found: {resolved_env_id}")

        env_business_id = env_row.get("business_id")
        if env_business_id:
            cur.execute(
                """
                INSERT INTO app.env_business_bindings (env_id, business_id)
                VALUES (%s::uuid, %s::uuid)
                ON CONFLICT (env_id) DO UPDATE SET business_id = EXCLUDED.business_id, updated_at = now()
                """,
                (resolved_env_id, env_business_id),
            )
            return EnvBusinessContext(
                env_id=resolved_env_id,
                business_id=env_business_id,
                created=False,
                source=f"environment:{source}",
                diagnostics={
                    "binding_found": False,
                    "business_found": True,
                    "env_found": True,
                },
                environment=env_row,
            )

        cur.execute(
            """
            SELECT b.business_id::text AS business_id
            FROM app.env_business_bindings eb
            JOIN app.businesses b ON b.business_id = eb.business_id
            WHERE eb.env_id = %s::uuid
            LIMIT 1
            """,
            (resolved_env_id,),
        )
        bound = cur.fetchone()
        if bound:
            cur.execute(
                """
                UPDATE app.environments
                SET business_id = %s::uuid, updated_at = now()
                WHERE env_id = %s::uuid
                """,
                (bound["business_id"], resolved_env_id),
            )
            return EnvBusinessContext(
                env_id=resolved_env_id,
                business_id=bound["business_id"],
                created=False,
                source=f"binding:{source}",
                diagnostics={
                    "binding_found": True,
                    "business_found": True,
                    "env_found": True,
                },
                environment=env_row,
            )

    if not allow_create:
        raise EnvContextError("No business binding found for environment.")

    env_name = env_row.get("client_name") or "Workspace"
    slug = f"{create_slug_prefix}-{resolved_env_id[:8]}"
    created = business_svc.create_business(f"{env_name} Workspace", slug, "us")
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
        cur.execute(
            """
            UPDATE app.environments
            SET business_id = %s::uuid, updated_at = now()
            WHERE env_id = %s::uuid
            """,
            (created_business_id, resolved_env_id),
        )

    return EnvBusinessContext(
        env_id=resolved_env_id,
        business_id=created_business_id,
        created=True,
        source=f"auto_create:{source}",
        diagnostics={
            "binding_found": False,
            "business_found": True,
            "env_found": True,
        },
        environment=env_row,
    )
