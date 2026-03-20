"""Lab service — environments, metrics, queue, audit for the Demo Lab UI."""

import re
from uuid import UUID

from app.db import get_cursor
from app.services import business as business_svc
from app.services.workspace_templates import resolve_workspace_template_key


# ── Environments ──────────────────────────────────────────────────────

def list_environments() -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            """SELECT env_id, client_name, industry, industry_type, workspace_template_key, schema_name,
                      is_active, business_id, repe_initialized, created_at, notes
               FROM app.environments
               ORDER BY created_at DESC"""
        )
        return cur.fetchall()


def get_environment(env_id: UUID) -> dict | None:
    with get_cursor() as cur:
        cur.execute(
            """SELECT env_id, client_name, industry, industry_type, workspace_template_key, schema_name,
                      is_active, business_id, repe_initialized, created_at, notes
               FROM app.environments
               WHERE env_id = %s""",
            (str(env_id),),
        )
        return cur.fetchone()


def _derive_slug(client_name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", client_name.lower()).strip("-")
    return slug[:40] or "env"


def create_environment(
    client_name: str,
    industry: str,
    industry_type: str | None = None,
    workspace_template_key: str | None = None,
    notes: str | None = None,
) -> dict:
    """Create an environment and auto-provision its business, modules, and REPE workspace if applicable."""
    schema_name = f"env_{client_name.lower().replace(' ', '_').replace('-', '_')[:30]}"
    resolved_workspace_template = resolve_workspace_template_key(
        workspace_template_key=workspace_template_key,
        industry_type=industry_type,
        industry=industry,
    )

    # Step 1: Insert the environment row
    with get_cursor() as cur:
        cur.execute(
            """INSERT INTO app.environments (client_name, industry, industry_type, workspace_template_key, schema_name, notes)
               VALUES (%s, %s, %s, %s, %s, %s)
               RETURNING env_id, client_name, industry, industry_type, workspace_template_key, schema_name""",
            (client_name, industry, industry_type, resolved_workspace_template, schema_name, notes),
        )
        env_row = cur.fetchone()

    env_id = env_row["env_id"]
    repe_initialized = False
    business_id = None

    # Step 2: Auto-create the business
    try:
        slug = _derive_slug(client_name)
        biz = business_svc.create_business(name=client_name, slug=slug, region="us")
        business_id = biz["business_id"]

        # Step 3: Bind env → business
        with get_cursor() as cur:
            cur.execute(
                """INSERT INTO app.env_business_bindings (env_id, business_id)
                   VALUES (%s::uuid, %s::uuid)
                   ON CONFLICT (env_id) DO NOTHING""",
                (str(env_id), str(business_id)),
            )

        # Step 4: Apply industry template (env-scoped)
        business_svc.apply_industry_template(
            UUID(str(business_id)),
            industry_type or industry,
            environment_id=UUID(str(env_id)),
        )

        # Step 5: Seed workspace based on industry type
        ind = (industry_type or industry or "").lower()
        if ind in ("repe", "real_estate_pe", "real_estate"):
            from app.services import repe_context as repe_ctx
            repe_ctx.seed_repe_workspace(str(business_id), str(env_id))
            repe_initialized = True
        elif ind in ("floyorker", "digital_media", "website"):
            from app.services import website_seeder
            website_seeder.seed_website_workspace(str(business_id), str(env_id), client_name)
        elif ind in ("pds_command", "pds"):
            from app.services import pds as pds_svc
            pds_svc.seed_demo_workspace(env_id=UUID(str(env_id)), business_id=UUID(str(business_id)))
        elif ind in ("credit_risk_hub", "credit"):
            from app.services import credit as credit_svc
            credit_svc.seed_demo_workspace(env_id=UUID(str(env_id)), business_id=UUID(str(business_id)))
        elif ind in ("legal_ops_command", "legal"):
            from app.services import legal_ops as legal_ops_svc
            legal_ops_svc.seed_demo_workspace(env_id=UUID(str(env_id)), business_id=UUID(str(business_id)))
        elif ind in ("medical_office_backoffice", "medical"):
            from app.services import medoffice as medoffice_svc
            medoffice_svc.seed_demo_workspace(env_id=UUID(str(env_id)), business_id=UUID(str(business_id)))
        elif ind in ("visual_resume", "resume"):
            from app.services import resume as resume_svc
            resume_svc.seed_demo_workspace(env_id=UUID(str(env_id)), business_id=UUID(str(business_id)))

        # Step 6: Update environment row with business_id and repe_initialized
        with get_cursor() as cur:
            cur.execute(
                """UPDATE app.environments
                   SET business_id = %s::uuid, repe_initialized = %s
                   WHERE env_id = %s::uuid""",
                (str(business_id), repe_initialized, str(env_id)),
            )

    except Exception as exc:
        # Log the error but don't fail the environment create entirely
        from app.observability.logger import emit_log
        emit_log(
            level="error",
            service="backend",
            action="env.create.provision_failed",
            message=f"Environment created but auto-provisioning failed: {exc}",
            context={
                "env_id": str(env_id),
                "industry_type": industry_type,
                "workspace_template_key": resolved_workspace_template,
                "error_reason": str(exc),
            },
        )

    return {
        "env_id": env_id,
        "client_name": env_row["client_name"],
        "industry": env_row["industry"],
        "industry_type": industry_type,
        "workspace_template_key": resolved_workspace_template,
        "schema_name": env_row["schema_name"],
        "business_id": business_id,
        "repe_initialized": repe_initialized,
    }


def update_environment(env_id: UUID, fields: dict) -> dict:
    """Patch updatable environment fields."""
    allowed = {"client_name", "industry", "industry_type", "workspace_template_key", "notes", "is_active"}
    updates = {k: v for k, v in fields.items() if k in allowed and v is not None}
    if "workspace_template_key" not in updates and ("industry_type" in updates or "industry" in updates):
        updates["workspace_template_key"] = resolve_workspace_template_key(
            industry_type=updates.get("industry_type"),
            industry=updates.get("industry"),
        )
    if not updates:
        row = get_environment(env_id)
        if not row:
            raise LookupError(f"Environment not found: {env_id}")
        return row

    set_clause = ", ".join(f"{k} = %s" for k in updates)
    values = list(updates.values()) + [str(env_id)]
    with get_cursor() as cur:
        cur.execute(
            f"""UPDATE app.environments
                SET {set_clause}, updated_at = now()
                WHERE env_id = %s::uuid
                RETURNING env_id, client_name, industry, industry_type, workspace_template_key, schema_name,
                          is_active, business_id, repe_initialized, created_at, notes""",
            values,
        )
        row = cur.fetchone()
    if not row:
        raise LookupError(f"Environment not found: {env_id}")
    return row


def reset_environment(env_id: UUID) -> None:
    """Reset an environment's associated data. Currently a no-op placeholder
    that could later truncate environment-scoped tables."""
    with get_cursor() as cur:
        cur.execute(
            "UPDATE app.environments SET updated_at = now() WHERE env_id = %s",
            (str(env_id),),
        )


def get_environment_health(env_id: UUID) -> dict:
    """Structured health check for a single environment."""
    with get_cursor() as cur:
        cur.execute(
            """SELECT env_id, business_id, industry_type, industry, repe_initialized
               FROM app.environments WHERE env_id = %s::uuid""",
            (str(env_id),),
        )
        env_row = cur.fetchone()

    if not env_row:
        raise LookupError(f"Environment not found: {env_id}")

    business_id = env_row.get("business_id")
    business_exists = False
    modules_initialized = False

    if business_id:
        with get_cursor() as cur:
            cur.execute(
                "SELECT 1 FROM app.businesses WHERE business_id = %s::uuid",
                (str(business_id),),
            )
            business_exists = bool(cur.fetchone())

            if business_exists:
                cur.execute(
                    """SELECT COUNT(*) as cnt FROM app.business_departments
                       WHERE business_id = %s::uuid
                         AND environment_id = %s::uuid
                         AND enabled = true""",
                    (str(business_id), str(env_id)),
                )
                modules_initialized = cur.fetchone()["cnt"] > 0

    ind = ((env_row.get("industry_type") or env_row.get("industry")) or "").lower()
    if ind in ("repe", "real_estate_pe", "real_estate"):
        repe_status = "initialized" if env_row["repe_initialized"] else "pending"
    else:
        repe_status = "not_applicable"

    # Count website module data for this environment
    content_count = 0
    ranking_count = 0
    analytics_count = 0
    crm_count = 0

    try:
        with get_cursor() as cur:
            cur.execute(
                "SELECT COUNT(*) AS cnt FROM website_content_items WHERE environment_id = %s::uuid",
                (str(env_id),),
            )
            content_count = cur.fetchone()["cnt"]

            cur.execute(
                "SELECT COUNT(*) AS cnt FROM website_ranking_lists WHERE environment_id = %s::uuid",
                (str(env_id),),
            )
            ranking_count = cur.fetchone()["cnt"]

            cur.execute(
                "SELECT COUNT(*) AS cnt FROM website_analytics_snapshots WHERE environment_id = %s::uuid",
                (str(env_id),),
            )
            analytics_count = cur.fetchone()["cnt"]

        if business_id:
            with get_cursor() as cur:
                cur.execute(
                    "SELECT COUNT(*) AS cnt FROM crm_account WHERE business_id = %s::uuid",
                    (str(business_id),),
                )
                crm_count = cur.fetchone()["cnt"]
    except Exception:
        pass  # Tables may not exist yet (migration pending)

    return {
        "env_id": str(env_id),
        "business_exists": business_exists,
        "modules_initialized": modules_initialized,
        "repe_status": repe_status,
        "data_integrity": business_exists and modules_initialized,
        "content_count": content_count,
        "ranking_count": ranking_count,
        "analytics_count": analytics_count,
        "crm_count": crm_count,
        "details": {
            "business_id": str(business_id) if business_id else None,
            "industry_type": env_row.get("industry_type"),
        },
    }


# ── Queue (HITL work items) ──────────────────────────────────────────

def list_queue_items(env_id: str | None = None) -> list[dict]:
    """Return open/in_progress work items as HITL queue entries."""
    with get_cursor() as cur:
        cur.execute(
            """SELECT wi.work_item_id as id,
                      wi.created_at,
                      wi.status::text as status,
                      CASE
                        WHEN wi.priority <= 2 THEN 'high'
                        WHEN wi.priority <= 3 THEN 'medium'
                        ELSE 'low'
                      END as risk_level,
                      json_build_object(
                        'type', wi.type::text,
                        'title', wi.title,
                        'description', wi.description,
                        'owner', wi.owner,
                        'priority', wi.priority
                      ) as requested_action
               FROM app.work_items wi
               WHERE wi.status IN ('open', 'in_progress', 'waiting')
               ORDER BY wi.priority ASC, wi.created_at ASC
               LIMIT 50"""
        )
        return cur.fetchall()


def decide_queue_item(work_item_id: UUID, decision: str, reason: str | None = None) -> None:
    """Approve or deny a queue item by updating work_item status."""
    new_status = "resolved" if decision == "approve" else "closed"
    with get_cursor() as cur:
        cur.execute(
            """UPDATE app.work_items
               SET status = %s::app.work_item_status, updated_by = %s
               WHERE work_item_id = %s""",
            (new_status, reason or "lab_reviewer", str(work_item_id)),
        )


# ── Audit ─────────────────────────────────────────────────────────────

def list_audit_items(env_id: str | None = None) -> list[dict]:
    """Return audit events formatted for the Lab UI."""
    with get_cursor() as cur:
        params: tuple[str, ...] = ()
        where_clause = ""
        if env_id:
            cur.execute(
                """SELECT business_id
                   FROM app.environments
                   WHERE env_id = %s::uuid""",
                (str(env_id),),
            )
            env_row = cur.fetchone()
            business_id = env_row["business_id"] if env_row else None
            if not business_id:
                return []
            where_clause = "WHERE business_id = %s::uuid"
            params = (str(business_id),)
        cur.execute(
            f"""SELECT audit_event_id as id,
                       created_at as at,
                       actor,
                       action,
                       COALESCE(object_type, 'system') as entity_type,
                       COALESCE(object_id::text, '') as entity_id,
                       COALESCE(input_redacted, '{{}}'::jsonb) as details
                FROM app.audit_events
                {where_clause}
                ORDER BY created_at DESC
                LIMIT 100""",
            params,
        )
        return cur.fetchall()


# ── Metrics ───────────────────────────────────────────────────────────

def get_metrics(env_id: str | None = None) -> dict:
    """Compute real aggregate metrics from the database."""
    with get_cursor() as cur:
        cur.execute("SELECT COUNT(*) as cnt FROM app.document_versions WHERE state = 'available'")
        uploads_count = cur.fetchone()["cnt"]

        cur.execute("SELECT COUNT(*) as cnt FROM app.work_items")
        tickets_count = cur.fetchone()["cnt"]

        cur.execute("SELECT COUNT(*) as cnt FROM app.work_items WHERE status IN ('open', 'waiting')")
        pending_approvals = cur.fetchone()["cnt"]

        cur.execute("SELECT COUNT(*) as cnt FROM app.work_items WHERE status = 'resolved'")
        resolved = cur.fetchone()["cnt"]

        cur.execute("SELECT COUNT(*) as cnt FROM app.work_items WHERE status = 'closed'")
        denied = cur.fetchone()["cnt"]

        total_decided = resolved + denied
        approval_rate = resolved / total_decided if total_decided > 0 else 0.0
        override_rate = 0.0

        avg_time = 0.0
        if total_decided > 0:
            cur.execute(
                """SELECT AVG(EXTRACT(EPOCH FROM (updated_at - created_at))) as avg_sec
                   FROM app.work_items
                   WHERE status IN ('resolved', 'closed')"""
            )
            row = cur.fetchone()
            avg_time = float(row["avg_sec"] or 0)

        return {
            "uploads_count": uploads_count,
            "tickets_count": tickets_count,
            "pending_approvals": pending_approvals,
            "approval_rate": round(approval_rate, 3),
            "override_rate": override_rate,
            "avg_time_to_decision_sec": round(avg_time, 1),
        }
