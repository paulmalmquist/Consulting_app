"""Lab service — environments, metrics, queue, audit, and pipeline for Demo Lab."""

from __future__ import annotations

import re
from typing import Any
from uuid import UUID

from app.db import get_cursor
from app.services import audit as audit_svc
from app.services import business as business_svc
from app.services.workspace_templates import resolve_workspace_template_key


DEFAULT_PIPELINE_STAGES: dict[str, list[dict[str, str]]] = {
    "healthcare": [
        {"key": "intake", "label": "Intake", "color": "slate"},
        {"key": "eligibility", "label": "Eligibility Verified", "color": "blue"},
        {"key": "treatment_plan", "label": "Treatment Plan", "color": "amber"},
        {"key": "prior_auth", "label": "Prior Auth", "color": "purple"},
        {"key": "scheduled", "label": "Scheduled", "color": "green"},
    ],
    "legal": [
        {"key": "new_matter", "label": "New Matter", "color": "slate"},
        {"key": "conflicts", "label": "Conflicts Check", "color": "blue"},
        {"key": "engagement", "label": "Engagement Signed", "color": "amber"},
        {"key": "discovery", "label": "Discovery", "color": "purple"},
        {"key": "retained", "label": "Retained", "color": "green"},
    ],
    "construction": [
        {"key": "lead", "label": "Lead", "color": "slate"},
        {"key": "site_walk", "label": "Site Walk", "color": "blue"},
        {"key": "estimate", "label": "Estimate Sent", "color": "amber"},
        {"key": "contract", "label": "Contract Review", "color": "purple"},
        {"key": "won", "label": "Won", "color": "green"},
    ],
    "website": [
        {"key": "inbound", "label": "Inbound", "color": "slate"},
        {"key": "discovery", "label": "Discovery", "color": "blue"},
        {"key": "proposal", "label": "Proposal", "color": "amber"},
        {"key": "negotiation", "label": "Negotiation", "color": "purple"},
        {"key": "closed_won", "label": "Closed Won", "color": "green"},
    ],
    "general": [
        {"key": "lead", "label": "Lead", "color": "slate"},
        {"key": "qualified", "label": "Qualified", "color": "blue"},
        {"key": "proposal", "label": "Proposal", "color": "amber"},
        {"key": "negotiation", "label": "Negotiation", "color": "purple"},
        {"key": "closed_won", "label": "Closed Won", "color": "green"},
    ],
}

ALLOWED_CARD_PRIORITIES = {"low", "medium", "high", "critical"}


def _derive_slug(client_name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", client_name.lower()).strip("-")
    return slug[:40] or "env"


def _slug_stage_key(stage_name: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "_", stage_name.strip().lower()).strip("_")
    return base or "stage"


def _normalize_industry(industry_type: str | None, industry: str | None) -> str:
    value = (industry_type or industry or "general").strip().lower()
    return value or "general"


def _pipeline_template(industry_type: str | None, industry: str | None) -> list[dict[str, str]]:
    normalized = _normalize_industry(industry_type, industry)
    return DEFAULT_PIPELINE_STAGES.get(normalized, DEFAULT_PIPELINE_STAGES["general"])


def _environment_payload(row: dict) -> dict:
    return {
        "env_id": row["env_id"],
        "client_name": row["client_name"],
        "industry": row["industry"],
        "industry_type": row.get("industry_type"),
        "workspace_template_key": row.get("workspace_template_key"),
        "schema_name": row["schema_name"],
        "is_active": row["is_active"],
        "business_id": row.get("business_id"),
        "repe_initialized": row.get("repe_initialized", False),
        "created_at": row.get("created_at"),
        "notes": row.get("notes"),
        "pipeline_stage_name": row.get("pipeline_stage_name"),
    }


def _stage_payload(row: dict) -> dict:
    return {
        "stage_id": row["stage_id"],
        "stage_key": row["stage_key"],
        "stage_name": row["stage_name"],
        "order_index": row["order_index"],
        "color_token": row.get("color_token"),
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def _card_payload(row: dict) -> dict:
    return {
        "card_id": row["card_id"],
        "stage_id": row["stage_id"],
        "title": row["title"],
        "account_name": row.get("account_name"),
        "owner": row.get("owner"),
        "value_cents": row.get("value_cents"),
        "priority": row.get("priority") or "medium",
        "due_date": row.get("due_date"),
        "notes": row.get("notes"),
        "rank": row.get("rank") or 0,
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def _fetch_environment_row(cur, env_id: UUID | str) -> dict | None:
    cur.execute(
        """SELECT env_id, client_name, industry, industry_type, workspace_template_key, schema_name,
                  is_active, business_id, repe_initialized, created_at, notes, pipeline_stage_name
           FROM app.environments
           WHERE env_id = %s::uuid""",
        (str(env_id),),
    )
    row = cur.fetchone()
    return _environment_payload(row) if row else None


def _sync_v1_environment(cur, env_row: dict) -> None:
    cur.execute(
        """INSERT INTO v1.environments
               (env_id, client_name, industry, industry_type, schema_name, notes, is_active, pipeline_stage_name)
           VALUES (%s::uuid, %s, %s, %s, %s, %s, %s, %s)
           ON CONFLICT (env_id)
           DO UPDATE SET client_name = EXCLUDED.client_name,
                         industry = EXCLUDED.industry,
                         industry_type = EXCLUDED.industry_type,
                         schema_name = EXCLUDED.schema_name,
                         notes = EXCLUDED.notes,
                         is_active = EXCLUDED.is_active,
                         pipeline_stage_name = EXCLUDED.pipeline_stage_name""",
        (
            str(env_row["env_id"]),
            env_row["client_name"],
            env_row["industry"],
            env_row.get("industry_type") or env_row["industry"],
            env_row["schema_name"],
            env_row.get("notes"),
            env_row["is_active"],
            env_row.get("pipeline_stage_name"),
        ),
    )


def _seed_pipeline_if_missing(cur, env_row: dict) -> None:
    cur.execute(
        "SELECT COUNT(*) AS cnt FROM v1.pipeline_stages WHERE env_id = %s::uuid",
        (str(env_row["env_id"]),),
    )
    row = cur.fetchone()
    template = _pipeline_template(env_row.get("industry_type"), env_row["industry"])
    if (row or {}).get("cnt", 0) == 0:
        for index, stage in enumerate(template):
            cur.execute(
                """INSERT INTO v1.pipeline_stages (env_id, key, label, sort_order, color_token)
                   VALUES (%s::uuid, %s, %s, %s, %s)
                   ON CONFLICT (env_id, key)
                   DO UPDATE SET label = EXCLUDED.label,
                                 sort_order = EXCLUDED.sort_order,
                                 color_token = EXCLUDED.color_token,
                                 updated_at = now()""",
                (
                    str(env_row["env_id"]),
                    stage["key"],
                    stage["label"],
                    (index + 1) * 10,
                    stage["color"],
                ),
            )

    if not env_row.get("pipeline_stage_name") and template:
        default_stage_name = template[0]["label"]
        cur.execute(
            "UPDATE app.environments SET pipeline_stage_name = COALESCE(pipeline_stage_name, %s) WHERE env_id = %s::uuid",
            (default_stage_name, str(env_row["env_id"])),
        )
        cur.execute(
            "UPDATE v1.environments SET pipeline_stage_name = COALESCE(pipeline_stage_name, %s) WHERE env_id = %s::uuid",
            (default_stage_name, str(env_row["env_id"])),
        )
        env_row["pipeline_stage_name"] = default_stage_name


def _resolve_business_id(cur, env_id: str | None) -> str | None:
    if not env_id:
        return None
    cur.execute(
        "SELECT business_id FROM app.environments WHERE env_id = %s::uuid",
        (str(env_id),),
    )
    row = cur.fetchone()
    if not row or not row.get("business_id"):
        return None
    return str(row["business_id"])


def _record_lab_event(
    *,
    actor: str,
    action: str,
    tool_name: str,
    business_id: UUID | str | None,
    object_type: str,
    object_id: UUID | str | None,
    input_data: dict | None = None,
    output_data: dict | None = None,
) -> None:
    try:
        audit_svc.record_event(
            actor=actor,
            action=action,
            tool_name=tool_name,
            success=True,
            latency_ms=0,
            business_id=UUID(str(business_id)) if business_id else None,
            object_type=object_type,
            object_id=UUID(str(object_id)) if object_id else None,
            input_data=input_data,
            output_data=output_data,
        )
    except Exception:
        # Audit should not block the primary workflow.
        return


# ── Environments ──────────────────────────────────────────────────────

def list_environments() -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            """SELECT env_id, client_name, industry, industry_type, workspace_template_key, schema_name,
                      is_active, business_id, repe_initialized, created_at, notes, pipeline_stage_name
               FROM app.environments
               ORDER BY created_at DESC"""
        )
        return [_environment_payload(row) for row in cur.fetchall()]


def get_environment(env_id: UUID) -> dict | None:
    with get_cursor() as cur:
        return _fetch_environment_row(cur, env_id)


def create_environment(
    client_name: str,
    industry: str,
    industry_type: str | None = None,
    workspace_template_key: str | None = None,
    notes: str | None = None,
) -> dict:
    """Create an environment and auto-provision its business, modules, and workspace."""
    schema_name = f"env_{client_name.lower().replace(' ', '_').replace('-', '_')[:30]}"
    resolved_workspace_template = resolve_workspace_template_key(
        workspace_template_key=workspace_template_key,
        industry_type=industry_type,
        industry=industry,
    )

    with get_cursor() as cur:
        cur.execute(
            """INSERT INTO app.environments
                   (client_name, industry, industry_type, workspace_template_key, schema_name, notes)
               VALUES (%s, %s, %s, %s, %s, %s)
               RETURNING env_id, client_name, industry, industry_type, workspace_template_key, schema_name,
                         is_active, business_id, repe_initialized, created_at, notes, pipeline_stage_name""",
            (client_name, industry, industry_type, resolved_workspace_template, schema_name, notes),
        )
        env_row = _environment_payload(cur.fetchone())
        _sync_v1_environment(cur, env_row)
        _seed_pipeline_if_missing(cur, env_row)

    env_id = env_row["env_id"]
    repe_initialized = False
    business_id = None

    try:
        slug = _derive_slug(client_name)
        biz = business_svc.create_business(name=client_name, slug=slug, region="us")
        business_id = biz["business_id"]

        with get_cursor() as cur:
            cur.execute(
                """INSERT INTO app.env_business_bindings (env_id, business_id)
                   VALUES (%s::uuid, %s::uuid)
                   ON CONFLICT (env_id) DO NOTHING""",
                (str(env_id), str(business_id)),
            )

        business_svc.apply_industry_template(
            UUID(str(business_id)),
            industry_type or industry,
            environment_id=UUID(str(env_id)),
        )

        ind = _normalize_industry(industry_type, industry)
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

        with get_cursor() as cur:
            cur.execute(
                """UPDATE app.environments
                   SET business_id = %s::uuid, repe_initialized = %s
                   WHERE env_id = %s::uuid""",
                (str(business_id), repe_initialized, str(env_id)),
            )
    except Exception as exc:
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
                "pipeline_stage_name": env_row.get("pipeline_stage_name"),
                "error_reason": str(exc),
            },
        )

    return {
        "env_id": env_id,
        "client_name": env_row["client_name"],
        "industry": env_row["industry"],
        "industry_type": env_row.get("industry_type") or industry_type or industry,
        "workspace_template_key": resolved_workspace_template,
        "schema_name": env_row["schema_name"],
        "business_id": business_id,
        "repe_initialized": repe_initialized,
        "pipeline_stage_name": env_row.get("pipeline_stage_name"),
    }


def update_environment(env_id: UUID, fields: dict) -> dict:
    """Patch updatable environment fields and keep v1 compatibility rows aligned."""
    allowed = {"client_name", "industry", "industry_type", "workspace_template_key", "notes", "is_active"}
    updates = {k: v for k, v in fields.items() if k in allowed and v is not None}
    if "workspace_template_key" not in updates and ("industry_type" in updates or "industry" in updates):
        updates["workspace_template_key"] = resolve_workspace_template_key(
            industry_type=updates.get("industry_type"),
            industry=updates.get("industry"),
        )

    with get_cursor() as cur:
        existing = _fetch_environment_row(cur, env_id)
        if not existing:
            raise LookupError(f"Environment not found: {env_id}")

        if not updates:
            return existing

        set_clause = ", ".join(f"{k} = %s" for k in updates)
        values = list(updates.values()) + [str(env_id)]
        cur.execute(
            f"""UPDATE app.environments
                   SET {set_clause}, updated_at = now()
                 WHERE env_id = %s::uuid
                 RETURNING env_id, client_name, industry, industry_type, workspace_template_key, schema_name,
                           is_active, business_id, repe_initialized, created_at, notes, pipeline_stage_name""",
            values,
        )
        row = cur.fetchone()
        if not row:
            raise LookupError(f"Environment not found: {env_id}")
        payload = _environment_payload(row)
        _sync_v1_environment(cur, payload)
        return payload


def delete_environment(env_id: UUID) -> dict:
    with get_cursor() as cur:
        env_row = _fetch_environment_row(cur, env_id)
        if not env_row:
            raise LookupError(f"Environment not found: {env_id}")
        cur.execute("DELETE FROM v1.environments WHERE env_id = %s::uuid", (str(env_id),))
        cur.execute("DELETE FROM app.environments WHERE env_id = %s::uuid", (str(env_id),))

    _record_lab_event(
        actor="lab_user",
        action="lab.environment.deleted",
        tool_name="lab.environment.delete",
        business_id=env_row.get("business_id"),
        object_type="environment",
        object_id=env_id,
        input_data={"env_id": str(env_id), "client_name": env_row["client_name"]},
        output_data={"ok": True},
    )
    return {"ok": True, "env_id": env_id}


def reset_environment(env_id: UUID) -> None:
    with get_cursor() as cur:
        env_row = _fetch_environment_row(cur, env_id)
        if not env_row:
            raise LookupError(f"Environment not found: {env_id}")
        _sync_v1_environment(cur, env_row)
        cur.execute("DELETE FROM v1.pipeline_cards WHERE env_id = %s::uuid", (str(env_id),))
        cur.execute("DELETE FROM v1.pipeline_stages WHERE env_id = %s::uuid", (str(env_id),))
        _seed_pipeline_if_missing(cur, env_row)
        cur.execute(
            "UPDATE app.environments SET updated_at = now() WHERE env_id = %s::uuid",
            (str(env_id),),
        )
        env_row["pipeline_stage_name"] = None


# ── Environment Health ────────────────────────────────────────────────

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
        pass

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
    """Return open/in-progress work items as HITL queue entries."""
    with get_cursor() as cur:
        where_clauses = ["wi.status IN ('open', 'in_progress', 'waiting')"]
        params: list[Any] = []
        business_id = _resolve_business_id(cur, env_id)
        if env_id and not business_id:
            return []
        if business_id:
            where_clauses.append("wi.business_id = %s::uuid")
            params.append(business_id)

        cur.execute(
            f"""SELECT wi.work_item_id as id,
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
               WHERE {' AND '.join(where_clauses)}
               ORDER BY wi.priority ASC, wi.created_at ASC
               LIMIT 50""",
            tuple(params),
        )
        return cur.fetchall()


def decide_queue_item(work_item_id: UUID, decision: str, reason: str | None = None) -> None:
    """Approve or deny a queue item by updating work_item status."""
    new_status = "resolved" if decision == "approve" else "closed"
    with get_cursor() as cur:
        cur.execute(
            """UPDATE app.work_items
               SET status = %s::app.work_item_status, updated_by = %s
               WHERE work_item_id = %s::uuid""",
            (new_status, reason or "lab_reviewer", str(work_item_id)),
        )
        if getattr(cur, "rowcount", 1) == 0:
            raise LookupError(f"Queue item not found: {work_item_id}")


# ── Audit ─────────────────────────────────────────────────────────────

def list_audit_items(env_id: str | None = None) -> list[dict]:
    """Return audit events formatted for the Lab UI."""
    with get_cursor() as cur:
        params: tuple[str, ...] = ()
        where_clause = ""
        if env_id:
            business_id = _resolve_business_id(cur, env_id)
            if not business_id:
                return []
            where_clause = "WHERE business_id = %s::uuid"
            params = (business_id,)
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
    """Compute aggregate metrics from the database."""
    with get_cursor() as cur:
        cur.execute("SELECT COUNT(*) as cnt FROM app.document_versions WHERE state = 'available'")
        uploads_count = cur.fetchone()["cnt"]

        work_items_where = ""
        params: tuple[str, ...] = ()
        business_id = _resolve_business_id(cur, env_id)
        if env_id and business_id:
            work_items_where = "WHERE business_id = %s::uuid"
            params = (business_id,)
        elif env_id:
            work_items_where = "WHERE 1 = 0"

        cur.execute(f"SELECT COUNT(*) as cnt FROM app.work_items {work_items_where}", params)
        tickets_count = cur.fetchone()["cnt"]

        status_prefix = f"{work_items_where} {'AND' if work_items_where else 'WHERE'}"
        cur.execute(
            f"SELECT COUNT(*) as cnt FROM app.work_items {status_prefix} status IN ('open', 'waiting')",
            params,
        )
        pending_approvals = cur.fetchone()["cnt"]

        cur.execute(
            f"SELECT COUNT(*) as cnt FROM app.work_items {status_prefix} status = 'resolved'",
            params,
        )
        resolved = cur.fetchone()["cnt"]

        cur.execute(
            f"SELECT COUNT(*) as cnt FROM app.work_items {status_prefix} status = 'closed'",
            params,
        )
        denied = cur.fetchone()["cnt"]

        total_decided = resolved + denied
        approval_rate = resolved / total_decided if total_decided > 0 else 0.0
        override_rate = denied / total_decided if total_decided > 0 else 0.0

        avg_time = 0.0
        if total_decided > 0:
            cur.execute(
                f"""SELECT AVG(EXTRACT(EPOCH FROM (updated_at - created_at))) as avg_sec
                   FROM app.work_items
                   {status_prefix} status IN ('resolved', 'closed')""",
                params,
            )
            row = cur.fetchone()
            avg_time = float(row["avg_sec"] or 0)

        return {
            "uploads_count": uploads_count,
            "tickets_count": tickets_count,
            "pending_approvals": pending_approvals,
            "approval_rate": round(approval_rate, 3),
            "override_rate": round(override_rate, 3),
            "avg_time_to_decision_sec": round(avg_time, 1),
        }


# ── Pipeline ──────────────────────────────────────────────────────────

def get_pipeline_board(env_id: UUID) -> dict:
    with get_cursor() as cur:
        env_row = _fetch_environment_row(cur, env_id)
        if not env_row:
            raise LookupError(f"Environment not found: {env_id}")
        _sync_v1_environment(cur, env_row)
        _seed_pipeline_if_missing(cur, env_row)

        cur.execute(
            """SELECT stage_id,
                      key AS stage_key,
                      label AS stage_name,
                      sort_order AS order_index,
                      color_token,
                      created_at,
                      updated_at
               FROM v1.pipeline_stages
               WHERE env_id = %s::uuid
               ORDER BY sort_order ASC, created_at ASC""",
            (str(env_id),),
        )
        stages = [_stage_payload(row) for row in cur.fetchall()]

        cur.execute(
            """SELECT card_id,
                      stage_id,
                      title,
                      account_name,
                      owner,
                      value_cents,
                      priority,
                      due_date,
                      notes,
                      rank,
                      created_at,
                      updated_at
               FROM v1.pipeline_cards
               WHERE env_id = %s::uuid
               ORDER BY rank ASC, created_at ASC""",
            (str(env_id),),
        )
        cards = [_card_payload(row) for row in cur.fetchall()]

    return {
        "env_id": env_row["env_id"],
        "client_name": env_row["client_name"],
        "industry": env_row["industry"],
        "industry_type": env_row.get("industry_type") or env_row["industry"],
        "stages": stages,
        "cards": cards,
    }


def create_pipeline_stage(
    *,
    env_id: UUID,
    stage_name: str,
    order_index: int | None = None,
    color_token: str | None = None,
) -> dict:
    stage_name = stage_name.strip()
    if not stage_name:
        raise ValueError("stage_name is required")

    with get_cursor() as cur:
        env_row = _fetch_environment_row(cur, env_id)
        if not env_row:
            raise LookupError(f"Environment not found: {env_id}")
        _sync_v1_environment(cur, env_row)
        _seed_pipeline_if_missing(cur, env_row)

        cur.execute(
            "SELECT key FROM v1.pipeline_stages WHERE env_id = %s::uuid",
            (str(env_id),),
        )
        existing_keys = {row["key"] for row in cur.fetchall()}
        base_key = _slug_stage_key(stage_name)
        stage_key = base_key
        suffix = 2
        while stage_key in existing_keys:
            stage_key = f"{base_key}_{suffix}"
            suffix += 1

        if order_index is None:
            cur.execute(
                "SELECT COALESCE(MAX(sort_order), 0) AS max_sort FROM v1.pipeline_stages WHERE env_id = %s::uuid",
                (str(env_id),),
            )
            order_index = int((cur.fetchone() or {}).get("max_sort", 0)) + 10

        cur.execute(
            """INSERT INTO v1.pipeline_stages (env_id, key, label, sort_order, color_token)
               VALUES (%s::uuid, %s, %s, %s, %s)
               RETURNING stage_id,
                         key AS stage_key,
                         label AS stage_name,
                         sort_order AS order_index,
                         color_token,
                         created_at,
                         updated_at""",
            (str(env_id), stage_key, stage_name, order_index, color_token or "slate"),
        )
        stage = _stage_payload(cur.fetchone())

    _record_lab_event(
        actor="lab_user",
        action="lab.pipeline.stage.created",
        tool_name="lab.pipeline.stage.create",
        business_id=env_row.get("business_id"),
        object_type="pipeline_stage",
        object_id=stage["stage_id"],
        input_data={"env_id": str(env_id), "stage_name": stage_name},
        output_data={"stage_id": str(stage["stage_id"]), "stage_key": stage["stage_key"]},
    )
    return stage


def update_pipeline_stage(stage_id: UUID, patch: dict) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """SELECT s.stage_id,
                      s.env_id,
                      s.key AS stage_key,
                      s.label AS stage_name,
                      s.sort_order AS order_index,
                      s.color_token,
                      s.created_at,
                      s.updated_at,
                      e.business_id
               FROM v1.pipeline_stages s
               JOIN app.environments e ON e.env_id = s.env_id
               WHERE s.stage_id = %s::uuid""",
            (str(stage_id),),
        )
        existing = cur.fetchone()
        if not existing:
            raise LookupError(f"Pipeline stage not found: {stage_id}")

        updates: dict[str, Any] = {}
        if patch.get("stage_name") is not None:
            next_name = str(patch["stage_name"]).strip()
            if not next_name:
                raise ValueError("stage_name cannot be empty")
            updates["label"] = next_name
        if patch.get("order_index") is not None:
            updates["sort_order"] = int(patch["order_index"])
        if "color_token" in patch:
            updates["color_token"] = patch.get("color_token")

        if not updates:
            return _stage_payload(existing)

        assignments = ", ".join(f"{column} = %s" for column in updates)
        values = list(updates.values()) + [str(stage_id)]
        cur.execute(
            f"""UPDATE v1.pipeline_stages
                   SET {assignments}, updated_at = now()
                 WHERE stage_id = %s::uuid
                 RETURNING stage_id,
                           key AS stage_key,
                           label AS stage_name,
                           sort_order AS order_index,
                           color_token,
                           created_at,
                           updated_at""",
            values,
        )
        stage = _stage_payload(cur.fetchone())

    _record_lab_event(
        actor="lab_user",
        action="lab.pipeline.stage.updated",
        tool_name="lab.pipeline.stage.update",
        business_id=existing.get("business_id"),
        object_type="pipeline_stage",
        object_id=stage["stage_id"],
        input_data={"changed_fields": sorted(patch.keys())},
        output_data={"stage_id": str(stage["stage_id"]), "stage_name": stage["stage_name"]},
    )
    return stage


def delete_pipeline_stage(stage_id: UUID) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """SELECT s.stage_id, s.env_id, s.key AS stage_key, s.label AS stage_name, e.business_id
               FROM v1.pipeline_stages s
               JOIN app.environments e ON e.env_id = s.env_id
               WHERE s.stage_id = %s::uuid""",
            (str(stage_id),),
        )
        stage = cur.fetchone()
        if not stage:
            raise LookupError(f"Pipeline stage not found: {stage_id}")

        cur.execute(
            """SELECT stage_id
               FROM v1.pipeline_stages
               WHERE env_id = %s::uuid AND stage_id <> %s::uuid
               ORDER BY sort_order ASC, created_at ASC""",
            (str(stage["env_id"]), str(stage_id)),
        )
        alternatives = cur.fetchall()
        if not alternatives:
            raise ValueError("Cannot delete the final pipeline stage")
        target_stage_id = alternatives[0]["stage_id"]

        cur.execute(
            "SELECT COUNT(*) AS cnt FROM v1.pipeline_cards WHERE stage_id = %s::uuid",
            (str(stage_id),),
        )
        moved_cards = int((cur.fetchone() or {}).get("cnt", 0))

        cur.execute(
            """UPDATE v1.pipeline_cards
               SET stage_id = %s::uuid, updated_at = now()
               WHERE stage_id = %s::uuid""",
            (str(target_stage_id), str(stage_id)),
        )
        cur.execute("DELETE FROM v1.pipeline_stages WHERE stage_id = %s::uuid", (str(stage_id),))

    _record_lab_event(
        actor="lab_user",
        action="lab.pipeline.stage.deleted",
        tool_name="lab.pipeline.stage.delete",
        business_id=stage.get("business_id"),
        object_type="pipeline_stage",
        object_id=stage_id,
        input_data={"stage_id": str(stage_id)},
        output_data={
            "target_stage_id": str(target_stage_id),
            "moved_cards": moved_cards,
        },
    )
    return {"ok": True, "moved_cards": moved_cards, "target_stage_id": target_stage_id}


def create_pipeline_card(
    *,
    env_id: UUID,
    stage_id: UUID | None,
    title: str,
    account_name: str | None = None,
    owner: str | None = None,
    value_cents: int | None = None,
    priority: str | None = None,
    due_date=None,
    notes: str | None = None,
    rank: int | None = None,
) -> dict:
    title = title.strip()
    if not title:
        raise ValueError("title is required")
    normalized_priority = (priority or "medium").lower()
    if normalized_priority not in ALLOWED_CARD_PRIORITIES:
        raise ValueError("priority must be one of low, medium, high, critical")

    with get_cursor() as cur:
        env_row = _fetch_environment_row(cur, env_id)
        if not env_row:
            raise LookupError(f"Environment not found: {env_id}")
        _sync_v1_environment(cur, env_row)
        _seed_pipeline_if_missing(cur, env_row)

        if stage_id:
            cur.execute(
                """SELECT stage_id
                   FROM v1.pipeline_stages
                   WHERE env_id = %s::uuid AND stage_id = %s::uuid""",
                (str(env_id), str(stage_id)),
            )
            stage = cur.fetchone()
        else:
            cur.execute(
                """SELECT stage_id
                   FROM v1.pipeline_stages
                   WHERE env_id = %s::uuid
                   ORDER BY sort_order ASC, created_at ASC
                   LIMIT 1""",
                (str(env_id),),
            )
            stage = cur.fetchone()

        if not stage:
            raise LookupError("No pipeline stage available for this environment")
        resolved_stage_id = stage["stage_id"]

        if rank is None:
            cur.execute(
                "SELECT COALESCE(MAX(rank), 0) AS max_rank FROM v1.pipeline_cards WHERE stage_id = %s::uuid",
                (str(resolved_stage_id),),
            )
            rank = int((cur.fetchone() or {}).get("max_rank", 0)) + 10

        cur.execute(
            """INSERT INTO v1.pipeline_cards
                   (env_id, stage_id, title, account_name, owner, value_cents, priority, due_date, notes, rank)
               VALUES (%s::uuid, %s::uuid, %s, %s, %s, %s, %s, %s, %s, %s)
               RETURNING card_id,
                         stage_id,
                         title,
                         account_name,
                         owner,
                         value_cents,
                         priority,
                         due_date,
                         notes,
                         rank,
                         created_at,
                         updated_at""",
            (
                str(env_id),
                str(resolved_stage_id),
                title,
                account_name,
                owner,
                value_cents,
                normalized_priority,
                due_date,
                notes,
                rank,
            ),
        )
        card = _card_payload(cur.fetchone())

    _record_lab_event(
        actor="lab_user",
        action="lab.pipeline.card.created",
        tool_name="lab.pipeline.card.create",
        business_id=env_row.get("business_id"),
        object_type="pipeline_card",
        object_id=card["card_id"],
        input_data={"env_id": str(env_id), "title": title},
        output_data={"card_id": str(card["card_id"]), "stage_id": str(card["stage_id"])} ,
    )
    return card


def update_pipeline_card(card_id: UUID, patch: dict) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """SELECT c.card_id,
                      c.env_id,
                      c.stage_id,
                      c.title,
                      c.account_name,
                      c.owner,
                      c.value_cents,
                      c.priority,
                      c.due_date,
                      c.notes,
                      c.rank,
                      c.created_at,
                      c.updated_at,
                      e.business_id
               FROM v1.pipeline_cards c
               JOIN app.environments e ON e.env_id = c.env_id
               WHERE c.card_id = %s::uuid""",
            (str(card_id),),
        )
        existing = cur.fetchone()
        if not existing:
            raise LookupError(f"Pipeline card not found: {card_id}")

        updates: dict[str, Any] = {}
        if patch.get("stage_id") is not None:
            cur.execute(
                """SELECT stage_id
                   FROM v1.pipeline_stages
                   WHERE env_id = %s::uuid AND stage_id = %s::uuid""",
                (str(existing["env_id"]), str(patch["stage_id"])),
            )
            stage = cur.fetchone()
            if not stage:
                raise LookupError(f"Pipeline stage not found: {patch['stage_id']}")
            updates["stage_id"] = stage["stage_id"]
        if patch.get("title") is not None:
            title = str(patch["title"]).strip()
            if not title:
                raise ValueError("title cannot be empty")
            updates["title"] = title
        if "account_name" in patch:
            updates["account_name"] = patch.get("account_name")
        if "owner" in patch:
            updates["owner"] = patch.get("owner")
        if "value_cents" in patch:
            updates["value_cents"] = patch.get("value_cents")
        if "priority" in patch and patch.get("priority") is not None:
            normalized_priority = str(patch["priority"]).lower()
            if normalized_priority not in ALLOWED_CARD_PRIORITIES:
                raise ValueError("priority must be one of low, medium, high, critical")
            updates["priority"] = normalized_priority
        if "due_date" in patch:
            updates["due_date"] = patch.get("due_date")
        if "notes" in patch:
            updates["notes"] = patch.get("notes")
        if patch.get("rank") is not None:
            updates["rank"] = int(patch["rank"])

        if not updates:
            return _card_payload(existing)

        assignments = ", ".join(f"{column} = %s" for column in updates)
        values = list(updates.values()) + [str(card_id)]
        cur.execute(
            f"""UPDATE v1.pipeline_cards
                   SET {assignments}, updated_at = now()
                 WHERE card_id = %s::uuid
                 RETURNING card_id,
                           stage_id,
                           title,
                           account_name,
                           owner,
                           value_cents,
                           priority,
                           due_date,
                           notes,
                           rank,
                           created_at,
                           updated_at""",
            values,
        )
        card = _card_payload(cur.fetchone())

    _record_lab_event(
        actor="lab_user",
        action="lab.pipeline.card.updated",
        tool_name="lab.pipeline.card.update",
        business_id=existing.get("business_id"),
        object_type="pipeline_card",
        object_id=card["card_id"],
        input_data={"changed_fields": sorted(patch.keys())},
        output_data={"card_id": str(card["card_id"]), "stage_id": str(card["stage_id"])} ,
    )
    return card


def delete_pipeline_card(card_id: UUID) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """SELECT c.card_id, c.title, c.env_id, e.business_id
               FROM v1.pipeline_cards c
               JOIN app.environments e ON e.env_id = c.env_id
               WHERE c.card_id = %s::uuid""",
            (str(card_id),),
        )
        card = cur.fetchone()
        if not card:
            raise LookupError(f"Pipeline card not found: {card_id}")
        cur.execute("DELETE FROM v1.pipeline_cards WHERE card_id = %s::uuid", (str(card_id),))

    _record_lab_event(
        actor="lab_user",
        action="lab.pipeline.card.deleted",
        tool_name="lab.pipeline.card.delete",
        business_id=card.get("business_id"),
        object_type="pipeline_card",
        object_id=card_id,
        input_data={"card_id": str(card_id)},
        output_data={"ok": True},
    )
    return {"ok": True}
