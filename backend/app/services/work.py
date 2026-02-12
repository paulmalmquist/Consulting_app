"""Work (Ownership) service — single source of truth for work items."""

from uuid import UUID

from app.db import get_cursor
from app.services import compliance as compliance_svc

# Statuses that require a rationale comment
_RATIONALE_REQUIRED = {"waiting", "blocked", "resolved", "closed"}


def create_item(
    business_id: UUID,
    title: str,
    owner: str,
    item_type: str,
    created_by: str,
    tenant_id: UUID | None = None,
    department_id: UUID | None = None,
    capability_id: UUID | None = None,
    priority: int | None = None,
    description: str | None = None,
) -> dict:
    with get_cursor() as cur:
        # Resolve tenant_id from business if not provided
        if not tenant_id:
            cur.execute(
                "SELECT tenant_id FROM app.businesses WHERE business_id = %s",
                (str(business_id),),
            )
            biz = cur.fetchone()
            if not biz:
                raise LookupError("Business not found")
            tenant_id = biz["tenant_id"]

        cur.execute(
            """INSERT INTO app.work_items
               (tenant_id, business_id, department_id, capability_id,
                type, owner, priority, title, description, created_by)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
               RETURNING work_item_id, status::text as status, created_at""",
            (
                str(tenant_id),
                str(business_id),
                str(department_id) if department_id else None,
                str(capability_id) if capability_id else None,
                item_type,
                owner,
                priority,
                title,
                description,
                created_by,
            ),
        )
        row = cur.fetchone()

    compliance_svc.log_event(
        entity_type="work_item",
        entity_id=str(row["work_item_id"]),
        action_type="create",
        user_id=created_by,
        before_state=None,
        after_state={"status": row["status"], "title": title, "owner": owner},
        tenant_id=tenant_id,
        business_id=business_id,
    )
    return {
        "work_item_id": row["work_item_id"],
        "status": row["status"],
        "created_at": row["created_at"],
    }


def get_item(work_item_id: UUID) -> dict | None:
    with get_cursor() as cur:
        cur.execute(
            """SELECT wi.work_item_id, wi.tenant_id, wi.business_id,
                      wi.department_id, wi.capability_id,
                      wi.type::text as type, wi.status::text as status,
                      wi.owner, wi.priority, wi.title, wi.description,
                      wi.created_by, wi.updated_by, wi.created_at, wi.updated_at
               FROM app.work_items wi
               WHERE wi.work_item_id = %s""",
            (str(work_item_id),),
        )
        item = cur.fetchone()
        if not item:
            return None

        # Fetch comments
        cur.execute(
            """SELECT comment_id, comment_type::text as comment_type,
                      author, body, created_at
               FROM app.work_comments
               WHERE work_item_id = %s
               ORDER BY created_at ASC""",
            (str(work_item_id),),
        )
        item["comments"] = cur.fetchall()

        # Fetch resolution
        cur.execute(
            """SELECT resolution_id, summary, outcome::text as outcome,
                      linked_documents, linked_executions,
                      created_by, created_at
               FROM app.work_resolutions
               WHERE work_item_id = %s""",
            (str(work_item_id),),
        )
        item["resolution"] = cur.fetchone()

        return item


def list_items(
    business_id: UUID,
    owner: str | None = None,
    status: str | None = None,
    item_type: str | None = None,
    department_id: UUID | None = None,
    capability_id: UUID | None = None,
    limit: int = 50,
    cursor_after: str | None = None,
) -> list[dict]:
    with get_cursor() as cur:
        conditions = ["wi.business_id = %s"]
        params: list = [str(business_id)]

        if owner:
            conditions.append("wi.owner = %s")
            params.append(owner)
        if status:
            conditions.append("wi.status = %s")
            params.append(status)
        if item_type:
            conditions.append("wi.type = %s")
            params.append(item_type)
        if department_id:
            conditions.append("wi.department_id = %s")
            params.append(str(department_id))
        if capability_id:
            conditions.append("wi.capability_id = %s")
            params.append(str(capability_id))
        if cursor_after:
            conditions.append("wi.created_at < %s")
            params.append(cursor_after)

        params.append(limit)
        where = " AND ".join(conditions)

        cur.execute(
            f"""SELECT wi.work_item_id, wi.business_id,
                       wi.department_id, wi.capability_id,
                       wi.type::text as type, wi.status::text as status,
                       wi.owner, wi.priority, wi.title,
                       wi.created_by, wi.created_at, wi.updated_at
                FROM app.work_items wi
                WHERE {where}
                ORDER BY wi.created_at DESC
                LIMIT %s""",
            params,
        )
        return cur.fetchall()


def add_comment(
    work_item_id: UUID,
    comment_type: str,
    author: str,
    body: str,
) -> dict:
    with get_cursor() as cur:
        cur.execute(
            "SELECT tenant_id FROM app.work_items WHERE work_item_id = %s",
            (str(work_item_id),),
        )
        item = cur.fetchone()
        if not item:
            raise LookupError("Work item not found")

        cur.execute(
            """INSERT INTO app.work_comments
               (tenant_id, work_item_id, comment_type, author, body)
               VALUES (%s, %s, %s, %s, %s)
               RETURNING comment_id, created_at""",
            (str(item["tenant_id"]), str(work_item_id), comment_type, author, body),
        )
        row = cur.fetchone()
        return {"comment_id": row["comment_id"], "created_at": row["created_at"]}


def update_status(
    work_item_id: UUID,
    new_status: str,
    actor: str,
    rationale: str | None = None,
) -> dict:
    if new_status in _RATIONALE_REQUIRED and not rationale:
        raise ValueError(f"Rationale is required when setting status to '{new_status}'")

    with get_cursor() as cur:
        cur.execute(
            "SELECT tenant_id, status::text as status FROM app.work_items WHERE work_item_id = %s",
            (str(work_item_id),),
        )
        item = cur.fetchone()
        if not item:
            raise LookupError("Work item not found")

        compliance_svc.validate_transition("work_item", item["status"], new_status)

        cur.execute(
            """UPDATE app.work_items
               SET status = %s, updated_by = %s
               WHERE work_item_id = %s""",
            (new_status, actor, str(work_item_id)),
        )

        # Record status_update comment
        comment_body = f"Status changed from {item['status']} to {new_status}"
        if rationale:
            comment_body += f": {rationale}"

        cur.execute(
            """INSERT INTO app.work_comments
               (tenant_id, work_item_id, comment_type, author, body)
               VALUES (%s, %s, 'status_update', %s, %s)
               RETURNING comment_id, created_at""",
            (str(item["tenant_id"]), str(work_item_id), actor, comment_body),
        )
        comment_row = cur.fetchone()

    compliance_svc.log_event(
        entity_type="work_item",
        entity_id=str(work_item_id),
        action_type="status_transition",
        user_id=actor,
        before_state={"status": item["status"]},
        after_state={"status": new_status},
    )

    return {
        "work_item_id": work_item_id,
        "new_status": new_status,
        "comment_id": comment_row["comment_id"],
    }


def resolve_item(
    work_item_id: UUID,
    summary: str,
    outcome: str,
    created_by: str,
    linked_documents: list | None = None,
    linked_executions: list | None = None,
) -> dict:
    with get_cursor() as cur:
        cur.execute(
            "SELECT tenant_id, status::text as status FROM app.work_items WHERE work_item_id = %s",
            (str(work_item_id),),
        )
        item = cur.fetchone()
        if not item:
            raise LookupError("Work item not found")

        if item["status"] == "closed":
            raise ValueError("Cannot resolve a closed work item")

        compliance_svc.validate_transition("work_item", item["status"], "resolved")

        import json

        cur.execute(
            """INSERT INTO app.work_resolutions
               (tenant_id, work_item_id, summary, outcome, linked_documents, linked_executions, created_by)
               VALUES (%s, %s, %s, %s, %s, %s, %s)
               ON CONFLICT (work_item_id) DO UPDATE
               SET summary = EXCLUDED.summary, outcome = EXCLUDED.outcome,
                   linked_documents = EXCLUDED.linked_documents,
                   linked_executions = EXCLUDED.linked_executions,
                   created_by = EXCLUDED.created_by
               RETURNING resolution_id, created_at""",
            (
                str(item["tenant_id"]),
                str(work_item_id),
                summary,
                outcome,
                json.dumps(linked_documents or []),
                json.dumps(linked_executions or []),
                created_by,
            ),
        )
        res_row = cur.fetchone()

        # Set status to resolved
        cur.execute(
            """UPDATE app.work_items
               SET status = 'resolved', updated_by = %s
               WHERE work_item_id = %s""",
            (created_by, str(work_item_id)),
        )

        # Record status_update comment
        cur.execute(
            """INSERT INTO app.work_comments
               (tenant_id, work_item_id, comment_type, author, body)
               VALUES (%s, %s, 'status_update', %s, %s)""",
            (
                str(item["tenant_id"]),
                str(work_item_id),
                created_by,
                f"Resolved ({outcome}): {summary}",
            ),
        )

    compliance_svc.log_event(
        entity_type="work_item",
        entity_id=str(work_item_id),
        action_type="resolve",
        user_id=created_by,
        before_state={"status": item["status"]},
        after_state={"status": "resolved", "outcome": outcome},
    )

    return {
        "resolution_id": res_row["resolution_id"],
        "created_at": res_row["created_at"],
    }


def search_resolutions(
    business_id: UUID,
    outcome: str | None = None,
    limit: int = 50,
) -> list[dict]:
    with get_cursor() as cur:
        conditions = ["wi.business_id = %s"]
        params: list = [str(business_id)]

        if outcome:
            conditions.append("wr.outcome = %s")
            params.append(outcome)

        params.append(limit)
        where = " AND ".join(conditions)

        cur.execute(
            f"""SELECT wr.resolution_id, wr.work_item_id, wi.title,
                       wr.summary, wr.outcome::text as outcome,
                       wr.linked_documents, wr.linked_executions,
                       wr.created_by, wr.created_at
                FROM app.work_resolutions wr
                JOIN app.work_items wi ON wi.work_item_id = wr.work_item_id
                WHERE {where}
                ORDER BY wr.created_at DESC
                LIMIT %s""",
            params,
        )
        return cur.fetchall()
