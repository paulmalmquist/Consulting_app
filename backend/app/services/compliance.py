import csv
import io
import json
from datetime import datetime
from uuid import UUID

from app.db import get_cursor


CONTROL_SEED = [
    (
        "SEC-AR-01",
        "Quarterly access review",
        "Detective",
        "access_review_tasks",
        "access_review_tasks + event_log",
        "quarterly",
    ),
    (
        "SEC-MFA-01",
        "MFA enforcement for privileged roles",
        "Preventative",
        "auth gateway",
        "auth policy config + event_log",
        "continuous",
    ),
    (
        "SEC-RL-01",
        "Role change logging",
        "Detective",
        "role_change_log",
        "role_change_log + event_log",
        "continuous",
    ),
    (
        "SEC-ADM-01",
        "Restrict admin privileges",
        "Preventative",
        "RBAC middleware",
        "permission checks + denied events",
        "continuous",
    ),
    (
        "SEC-PWD-01",
        "Password policy enforcement",
        "Preventative",
        "identity provider",
        "policy configuration snapshot",
        "continuous",
    ),
    (
        "AVL-BKP-01",
        "Daily backup automation",
        "Preventative",
        "backup jobs",
        "backup job logs",
        "daily",
    ),
    (
        "AVL-RST-01",
        "Backup restore testing",
        "Detective",
        "backup_verification_log",
        "backup_verification_log + event_log",
        "quarterly",
    ),
    (
        "AVL-MON-01",
        "Monitoring alerts",
        "Detective",
        "monitoring stack",
        "incident timeline + alert logs",
        "continuous",
    ),
    (
        "AVL-IR-01",
        "Incident response logging",
        "Detective",
        "incidents",
        "incidents + incident_timeline",
        "continuous",
    ),
    (
        "PI-DBL-01",
        "Double-entry validation",
        "Preventative",
        "journal_entries",
        "journal validation events",
        "continuous",
    ),
    (
        "PI-BAL-01",
        "Transaction balancing enforcement",
        "Preventative",
        "journal_entries",
        "event_log validation events",
        "continuous",
    ),
    (
        "PI-APR-01",
        "Approval routing enforcement",
        "Preventative",
        "SoD engine",
        "event_log approval traces",
        "continuous",
    ),
    (
        "PI-EXC-01",
        "Exception review workflow",
        "Detective",
        "work_items",
        "work_items + event_log",
        "continuous",
    ),
]

WORK_ITEM_TRANSITIONS = {
    "open": {"in_progress", "waiting", "blocked", "closed"},
    "in_progress": {"waiting", "blocked", "resolved", "closed"},
    "waiting": {"in_progress", "blocked", "resolved", "closed"},
    "blocked": {"in_progress", "waiting", "resolved", "closed"},
    "resolved": {"closed", "in_progress"},
    "closed": set(),
}

JOURNAL_TRANSITIONS = {
    "draft": {"approved"},
    "approved": {"posted"},
    "posted": set(),
}


def seed_controls() -> None:
    with get_cursor() as cur:
        for row in CONTROL_SEED:
            cur.execute(
                """INSERT INTO app.compliance_controls
                   (control_id, description, control_type, system_component, evidence_generated, frequency)
                   VALUES (%s, %s, %s, %s, %s, %s)
                   ON CONFLICT (control_id) DO NOTHING""",
                row,
            )


def validate_transition(workflow: str, current_status: str, new_status: str) -> None:
    matrix = WORK_ITEM_TRANSITIONS if workflow == "work_item" else JOURNAL_TRANSITIONS
    allowed = matrix.get(current_status, set())
    if new_status not in allowed:
        raise ValueError(
            f"Invalid {workflow} transition: {current_status} -> {new_status}"
        )


def enforce_sod(entity_type: str, creator_id: str, approver_id: str) -> None:
    if creator_id == approver_id:
        raise ValueError(f"SoD violation: creator cannot self-approve {entity_type}")


def log_event(
    entity_type: str,
    entity_id: str,
    action_type: str,
    user_id: str | None,
    before_state: dict | None,
    after_state: dict | None,
    tenant_id: UUID | None = None,
    business_id: UUID | None = None,
    ip_address: str | None = None,
    session_id: str | None = None,
) -> None:
    with get_cursor() as cur:
        cur.execute(
            """INSERT INTO app.event_log
               (tenant_id, business_id, user_id, entity_type, entity_id, action_type,
                before_state, after_state, ip_address, session_id)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
            (
                str(tenant_id) if tenant_id else None,
                str(business_id) if business_id else None,
                user_id,
                entity_type,
                entity_id,
                action_type,
                json.dumps(before_state) if before_state else None,
                json.dumps(after_state) if after_state else None,
                ip_address,
                session_id,
            ),
        )


def list_controls() -> list[dict]:
    seed_controls()
    with get_cursor() as cur:
        cur.execute(
            """SELECT control_id, description, control_type, system_component,
                      evidence_generated, frequency, status
               FROM app.compliance_controls
               ORDER BY control_id ASC"""
        )
        return cur.fetchall()


def evidence_for_control(
    control_id: str, from_date: datetime, to_date: datetime
) -> tuple[list[dict], str]:
    with get_cursor() as cur:
        cur.execute(
            """SELECT id, timestamp, user_id, entity_type, entity_id, action_type,
                      before_state, after_state, ip_address, session_id
               FROM app.event_log
               WHERE timestamp >= %s AND timestamp <= %s
                 AND (entity_type = %s OR action_type = %s)
               ORDER BY timestamp ASC""",
            (from_date, to_date, control_id, control_id),
        )
        rows = cur.fetchall()

    output = io.StringIO()
    writer = csv.DictWriter(
        output,
        fieldnames=[
            "id",
            "timestamp",
            "user_id",
            "entity_type",
            "entity_id",
            "action_type",
            "ip_address",
            "session_id",
        ],
    )
    writer.writeheader()
    for row in rows:
        writer.writerow(
            {
                "id": row["id"],
                "timestamp": row["timestamp"],
                "user_id": row["user_id"],
                "entity_type": row["entity_type"],
                "entity_id": row["entity_id"],
                "action_type": row["action_type"],
                "ip_address": row["ip_address"],
                "session_id": row["session_id"],
            }
        )
    return rows, output.getvalue()


def create_access_review(
    review_period_start,
    review_period_end,
    generated_by: str,
    tenant_id: UUID | None = None,
) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """INSERT INTO app.access_review_tasks
               (tenant_id, review_period_start, review_period_end, generated_by)
               VALUES (%s, %s, %s, %s)
               RETURNING review_id, status, created_at""",
            (
                str(tenant_id) if tenant_id else None,
                review_period_start,
                review_period_end,
                generated_by,
            ),
        )
        row = cur.fetchone()
    log_event(
        "access_review",
        str(row["review_id"]),
        "created",
        generated_by,
        None,
        {"status": row["status"]},
        tenant_id=tenant_id,
    )
    return row


def signoff_access_review(
    review_id: UUID, reviewer: str, signoff_notes: str | None = None
) -> dict:
    with get_cursor() as cur:
        cur.execute(
            "SELECT status FROM app.access_review_tasks WHERE review_id = %s",
            (str(review_id),),
        )
        before = cur.fetchone()
        if not before:
            raise LookupError("Access review task not found")

        cur.execute(
            """UPDATE app.access_review_tasks
               SET status = 'approved', reviewer = %s, signoff_notes = %s, signed_off_at = now()
               WHERE review_id = %s
               RETURNING review_id, status, signed_off_at""",
            (reviewer, signoff_notes, str(review_id)),
        )
        row = cur.fetchone()

    log_event("access_review", str(review_id), "approved", reviewer, before, row)
    return row


def record_backup_verification(
    environment: str,
    backup_tested_at: datetime,
    restore_confirmed: bool,
    evidence_notes: str | None,
    recorded_by: str,
) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """INSERT INTO app.backup_verification_log
               (environment, backup_tested_at, restore_confirmed, evidence_notes, recorded_by)
               VALUES (%s, %s, %s, %s, %s)
               RETURNING backup_verification_id, created_at""",
            (
                environment,
                backup_tested_at,
                restore_confirmed,
                evidence_notes,
                recorded_by,
            ),
        )
        row = cur.fetchone()
    log_event(
        "backup_verification",
        str(row["backup_verification_id"]),
        "recorded",
        recorded_by,
        None,
        {"environment": environment, "restore_confirmed": restore_confirmed},
    )
    return row


def create_incident(
    title: str, severity: str, created_by: str, tenant_id: UUID | None = None
) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """INSERT INTO app.incidents (tenant_id, title, severity, created_by)
               VALUES (%s, %s, %s, %s)
               RETURNING incident_id, status, created_at""",
            (str(tenant_id) if tenant_id else None, title, severity, created_by),
        )
        row = cur.fetchone()

        cur.execute(
            """INSERT INTO app.incident_timeline (incident_id, actor, note)
               VALUES (%s, %s, %s)""",
            (str(row["incident_id"]), created_by, "Incident created"),
        )

    log_event(
        "incident",
        str(row["incident_id"]),
        "created",
        created_by,
        None,
        {"severity": severity},
        tenant_id=tenant_id,
    )
    return row


def add_incident_timeline(incident_id: UUID, actor: str, note: str) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """INSERT INTO app.incident_timeline (incident_id, actor, note)
               VALUES (%s, %s, %s)
               RETURNING timeline_id, event_time""",
            (str(incident_id), actor, note),
        )
        row = cur.fetchone()
    log_event(
        "incident", str(incident_id), "timeline_event", actor, None, {"note": note}
    )
    return row


def record_config_change(
    changed_by: str,
    config_type: str,
    config_key: str,
    before_state: dict | None,
    after_state: dict | None,
    tenant_id: UUID | None = None,
) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """INSERT INTO app.configuration_change_log
               (tenant_id, changed_by, config_type, config_key, before_state, after_state)
               VALUES (%s, %s, %s, %s, %s, %s)
               RETURNING configuration_change_id, created_at""",
            (
                str(tenant_id) if tenant_id else None,
                changed_by,
                config_type,
                config_key,
                json.dumps(before_state) if before_state else None,
                json.dumps(after_state) if after_state else None,
            ),
        )
        row = cur.fetchone()
    log_event(
        "configuration",
        str(row["configuration_change_id"]),
        "changed",
        changed_by,
        before_state,
        after_state,
        tenant_id=tenant_id,
    )
    return row


def log_deployment(commit_hash: str, environment: str, deployed_by: str) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """INSERT INTO app.deployment_log (commit_hash, environment, deployed_by)
               VALUES (%s, %s, %s)
               RETURNING id, timestamp""",
            (commit_hash, environment, deployed_by),
        )
        row = cur.fetchone()
    log_event(
        "deployment",
        str(row["id"]),
        "deployed",
        deployed_by,
        None,
        {"commit_hash": commit_hash, "environment": environment},
    )
    return row


def list_event_log(
    user_id: str | None = None,
    entity_type: str | None = None,
    from_date: datetime | None = None,
    to_date: datetime | None = None,
    limit: int = 200,
) -> list[dict]:
    conditions = ["TRUE"]
    params: list = []
    if user_id:
        conditions.append("user_id = %s")
        params.append(user_id)
    if entity_type:
        conditions.append("entity_type = %s")
        params.append(entity_type)
    if from_date:
        conditions.append("timestamp >= %s")
        params.append(from_date)
    if to_date:
        conditions.append("timestamp <= %s")
        params.append(to_date)
    params.append(limit)
    where = " AND ".join(conditions)
    with get_cursor() as cur:
        cur.execute(
            f"""SELECT id, timestamp, user_id, entity_type, entity_id, action_type, before_state, after_state, ip_address, session_id
                   FROM app.event_log
                   WHERE {where}
                   ORDER BY timestamp DESC
                   LIMIT %s""",
            params,
        )
        return cur.fetchall()
