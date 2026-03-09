# PROPOSED FIX for repe_context.py
#
# Replace the binding_found logic in resolve_repe_business_context() function
# Lines 64-213 need to be updated to ensure binding_found is set correctly
# after creating bindings via heuristic or auto-create paths.
#
# The issue: When heuristic slug matching or auto-create finds/creates a business,
# the code inserts a binding row into the database but returns binding_found: False.
# This confuses clients who expect binding_found: True after the binding is created.
#
# The fix: After inserting a binding row, set binding_found: True in the returned
# diagnostics, since the binding now exists in the database.

def resolve_repe_business_context(
    *,
    request: Request | None = None,
    env_id: str | None = None,
    business_id: str | None = None,
    allow_create: bool = True,
) -> RepeContextResolution:
    """
    Resolve REPE business context from environment context (env_id or request).

    Returns a RepeContextResolution with business_id and diagnostic information.
    The binding_found flag now correctly reflects whether a binding exists after
    this function completes (not just before).
    """
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
                "binding_found": bool(resolved_env_id),  # FIX: binding exists if env_id exists
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
                    "binding_found": True,  # FIX: binding now exists after INSERT
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
            "binding_found": True,  # FIX: binding now exists after INSERT
            "business_found": True,
            "env_found": True,
        },
    )
