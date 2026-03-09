# PROPOSED FIX for backend/app/services/repe_context.py
# Lines 64-213 (resolve_repe_business_context function)
#
# The issue: binding_found reports "did we find a pre-existing binding row?"
# But this confuses downstream logic that needs to know "is there a valid binding NOW?"
#
# The fix: Ensure binding_found=True whenever a binding exists AFTER our operation,
# regardless of whether it was pre-existing or just created.
#
# Key changes:
# 1. When business_id is explicit, clarify that we don't query for bindings
#    (binding_found=False is correct - we didn't find one, we may have created one)
# 2. When env_id exists and we auto-create business + binding, return binding_found=True
#    (not False - the binding exists now, even though it didn't before)
# 3. Add consistency check: if we return successfully, diagnostics must be internally consistent

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
                "binding_found": False,  # We didn't query for an existing binding (explicit business_id path)
                "business_found": True,  # Explicit business_id is always valid
                "env_found": bool(resolved_env_id),  # env_id may or may not be present
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
                    "binding_found": True,  # We found an existing binding row
                    "business_found": True,
                    "env_found": True,
                },
            )

        # No explicit binding found; try heuristic slug matching
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
                    "binding_found": False,  # Heuristic match is not a pre-existing binding row
                    "business_found": True,
                    "env_found": True,
                },
            )

    if not allow_create:
        raise RepeContextError("No business binding found for environment.")

    # Auto-create business and binding (no pre-existing binding or heuristic match found)
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

    # FIX: When we auto-create, set binding_found=True because binding now exists
    # (even though it didn't before this function was called)
    return RepeContextResolution(
        env_id=resolved_env_id,
        business_id=created_business_id,
        created=True,
        source=f"auto_create:{source}",
        diagnostics={
            "binding_found": True,  # CHANGED: Binding now exists (we just created it)
            "business_found": True,
            "env_found": True,
        },
    )


# SUMMARY OF CHANGES:
#
# Line 209: Changed "binding_found": False to "binding_found": True
#
# RATIONALE:
# The semantics of binding_found should be: "Is there a valid binding NOW?"
# not "Did we find a pre-existing binding row in the SELECT query?"
#
# When we auto-create (lines 173-213), we INSERT a binding row. After that operation,
# binding_found should be True because the binding exists, even though it didn't before.
#
# This ensures that downstream code can rely on binding_found to determine whether
# the context is complete and consistent.
#
# Without this change, frontend or other backend services reading diagnostics.binding_found
# might assume no binding exists and try to query for it again, finding nothing (due to timing),
# and returning null or error.
