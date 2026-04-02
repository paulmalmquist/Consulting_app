"""Tasks service layer (projects, issues, boards, sprints, analytics, metrics)."""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
import json
import os
from typing import Any
from uuid import UUID

from app.db import get_cursor


DEFAULT_STATUS_ROWS: list[dict[str, Any]] = [
    {
        "key": "todo",
        "name": "To Do",
        "category": "todo",
        "order_index": 10,
        "color_token": "status.todo",
        "is_default": True,
    },
    {
        "key": "in_progress",
        "name": "In Progress",
        "category": "doing",
        "order_index": 20,
        "color_token": "status.in_progress",
        "is_default": False,
    },
    {
        "key": "blocked",
        "name": "Blocked",
        "category": "doing",
        "order_index": 30,
        "color_token": "status.blocked",
        "is_default": False,
    },
    {
        "key": "review",
        "name": "Review",
        "category": "doing",
        "order_index": 40,
        "color_token": "status.review",
        "is_default": False,
    },
    {
        "key": "done",
        "name": "Done",
        "category": "done",
        "order_index": 50,
        "color_token": "status.done",
        "is_default": False,
    },
]


ISSUE_SELECT = """
SELECT i.id,
       i.project_id,
       p.key AS project_key,
       i.issue_key,
       i.type,
       i.title,
       i.description_md,
       i.status_id,
       s.key AS status_key,
       s.name AS status_name,
       s.category AS status_category,
       i.priority,
       i.assignee,
       i.reporter,
       i.labels,
       i.estimate_points,
       i.due_date,
       i.sprint_id,
       sp.name AS sprint_name,
       i.backlog_rank,
       i.created_at,
       i.updated_at
FROM app.task_issue i
JOIN app.task_project p ON p.id = i.project_id
JOIN app.task_status s ON s.id = i.status_id
LEFT JOIN app.task_sprint sp ON sp.id = i.sprint_id
"""


def _is_seed_allowed() -> bool:
    """Seed endpoints are allowed unless explicitly disabled via BM_DISABLE_SEED=1."""
    return os.getenv("BM_DISABLE_SEED") != "1"


def _normalize_project_key(value: str) -> str:
    cleaned = "".join(ch if ch.isalnum() or ch == "_" else "_" for ch in value.strip().upper())
    while "__" in cleaned:
        cleaned = cleaned.replace("__", "_")
    return cleaned[:12]


def _normalize_labels(labels: list[str] | None) -> list[str]:
    if not labels:
        return []
    seen: set[str] = set()
    result: list[str] = []
    for raw in labels:
        lbl = (raw or "").strip()
        if not lbl:
            continue
        if lbl in seen:
            continue
        seen.add(lbl)
        result.append(lbl)
    return result


def _to_json(value: Any) -> str:
    return json.dumps(value, default=str)


def _normalize_issue_row(row: dict[str, Any]) -> dict[str, Any]:
    if row is None:
        return row
    labels = row.get("labels")
    row["labels"] = labels if isinstance(labels, list) else []
    if row.get("backlog_rank") is not None:
        row["backlog_rank"] = float(row["backlog_rank"])
    return row


def _fetch_issue_row(cur, issue_id: UUID | str) -> dict[str, Any] | None:
    cur.execute(
        ISSUE_SELECT + " WHERE i.id = %s",
        (str(issue_id),),
    )
    row = cur.fetchone()
    if not row:
        return None
    return _normalize_issue_row(row)


def _record_activity(
    cur,
    issue_id: UUID | str,
    actor: str,
    action: str,
    before: dict[str, Any] | None = None,
    after: dict[str, Any] | None = None,
) -> None:
    cur.execute(
        """INSERT INTO app.task_activity
           (issue_id, actor, action, before_json, after_json)
           VALUES (%s, %s, %s, %s, %s)""",
        (
            str(issue_id),
            actor,
            action,
            _to_json(before) if before is not None else None,
            _to_json(after) if after is not None else None,
        ),
    )


def _ensure_default_board(cur, project_id: UUID | str, board_type: str = "scrum") -> None:
    cur.execute(
        """INSERT INTO app.task_board (project_id, name, board_type)
           VALUES (%s, %s, %s)
           ON CONFLICT (project_id, name) DO NOTHING""",
        (str(project_id), "Default Board", board_type),
    )


def _ensure_default_statuses(cur, project_id: UUID | str) -> None:
    for status in DEFAULT_STATUS_ROWS:
        cur.execute(
            """INSERT INTO app.task_status
               (project_id, key, name, category, order_index, color_token, is_default)
               VALUES (%s, %s, %s, %s, %s, %s, %s)
               ON CONFLICT (project_id, key) DO UPDATE
               SET name = EXCLUDED.name,
                   category = EXCLUDED.category,
                   order_index = EXCLUDED.order_index,
                   color_token = EXCLUDED.color_token,
                   is_default = EXCLUDED.is_default""",
            (
                str(project_id),
                status["key"],
                status["name"],
                status["category"],
                status["order_index"],
                status["color_token"],
                status["is_default"],
            ),
        )


def _resolve_status_id(cur, project_id: UUID | str, status_id: UUID | str | None) -> UUID:
    if status_id:
        cur.execute(
            "SELECT id FROM app.task_status WHERE id = %s AND project_id = %s",
            (str(status_id), str(project_id)),
        )
        row = cur.fetchone()
        if not row:
            raise ValueError("status_id is not valid for this project")
        return row["id"]

    cur.execute(
        """SELECT id
           FROM app.task_status
           WHERE project_id = %s
           ORDER BY is_default DESC, order_index ASC
           LIMIT 1""",
        (str(project_id),),
    )
    row = cur.fetchone()
    if not row:
        raise LookupError("Project has no statuses configured")
    return row["id"]


def _validate_sprint_id(cur, project_id: UUID | str, sprint_id: UUID | str | None) -> None:
    if sprint_id is None:
        return
    cur.execute(
        "SELECT id FROM app.task_sprint WHERE id = %s AND project_id = %s",
        (str(sprint_id), str(project_id)),
    )
    if not cur.fetchone():
        raise ValueError("sprint_id is not valid for this project")


def _next_backlog_rank(cur, project_id: UUID | str) -> float:
    cur.execute(
        "SELECT COALESCE(MAX(backlog_rank), 0) + 1 AS next_rank FROM app.task_issue WHERE project_id = %s",
        (str(project_id),),
    )
    row = cur.fetchone()
    return float(row["next_rank"] or 1)


def _next_issue_key(cur, project_id: UUID | str, project_key: str) -> str:
    cur.execute(
        """
        SELECT COALESCE(
          MAX(
            CASE
              WHEN issue_key ~ '-[0-9]+$' THEN (regexp_match(issue_key, '-([0-9]+)$'))[1]::int
              ELSE 0
            END
          ),
          0
        ) + 1 AS next_seq
        FROM app.task_issue
        WHERE project_id = %s
        """,
        (str(project_id),),
    )
    seq = int(cur.fetchone()["next_seq"])
    return f"{project_key}-{seq}"


def _create_issue_with_cursor(
    cur,
    *,
    project_id: UUID | str,
    project_key: str,
    issue_type: str,
    title: str,
    description_md: str,
    status_id: UUID | str | None,
    priority: str,
    assignee: str | None,
    reporter: str,
    labels: list[str] | None,
    estimate_points: int | None,
    due_date: date | None,
    sprint_id: UUID | str | None,
    backlog_rank: float | None,
    actor: str,
) -> dict[str, Any]:
    resolved_status_id = _resolve_status_id(cur, project_id, status_id)
    _validate_sprint_id(cur, project_id, sprint_id)

    rank = float(backlog_rank) if backlog_rank is not None else _next_backlog_rank(cur, project_id)
    normalized_labels = _normalize_labels(labels)
    issue_key = _next_issue_key(cur, project_id, project_key)

    cur.execute(
        """INSERT INTO app.task_issue
           (project_id, issue_key, type, title, description_md,
            status_id, priority, assignee, reporter, labels,
            estimate_points, due_date, sprint_id, backlog_rank)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
           RETURNING id""",
        (
            str(project_id),
            issue_key,
            issue_type,
            title,
            description_md,
            str(resolved_status_id),
            priority,
            assignee,
            reporter,
            normalized_labels,
            estimate_points,
            due_date,
            str(sprint_id) if sprint_id else None,
            rank,
        ),
    )
    issue_id = cur.fetchone()["id"]
    issue = _fetch_issue_row(cur, issue_id)
    if issue is None:
        raise LookupError("Created issue could not be loaded")

    _record_activity(
        cur,
        issue_id,
        actor=actor,
        action="created",
        before=None,
        after={
            "issue_key": issue["issue_key"],
            "title": issue["title"],
            "status_key": issue["status_key"],
            "priority": issue["priority"],
            "sprint_id": issue["sprint_id"],
        },
    )
    return issue


def list_projects() -> list[dict[str, Any]]:
    with get_cursor() as cur:
        cur.execute(
            """SELECT id, name, key, description, created_at, updated_at
               FROM app.task_project
               ORDER BY created_at DESC"""
        )
        return cur.fetchall()


def get_project(project_id: UUID) -> dict[str, Any] | None:
    with get_cursor() as cur:
        cur.execute(
            """SELECT id, name, key, description, created_at, updated_at
               FROM app.task_project
               WHERE id = %s""",
            (str(project_id),),
        )
        return cur.fetchone()


def get_project_by_key(project_key: str) -> dict[str, Any] | None:
    with get_cursor() as cur:
        cur.execute(
            """SELECT id, name, key, description, created_at, updated_at
               FROM app.task_project
               WHERE key = %s""",
            (_normalize_project_key(project_key),),
        )
        return cur.fetchone()


def create_project(
    name: str,
    key: str,
    description: str | None = None,
    board_type: str = "scrum",
) -> dict[str, Any]:
    normalized_key = _normalize_project_key(key)
    if len(normalized_key) < 2:
        raise ValueError("Project key must be at least 2 characters after normalization")

    with get_cursor() as cur:
        cur.execute(
            """INSERT INTO app.task_project (name, key, description)
               VALUES (%s, %s, %s)
               RETURNING id, name, key, description, created_at, updated_at""",
            (name.strip(), normalized_key, description),
        )
        row = cur.fetchone()
        _ensure_default_board(cur, row["id"], board_type)
        _ensure_default_statuses(cur, row["id"])
        return row


def list_boards(project_id: UUID) -> list[dict[str, Any]]:
    with get_cursor() as cur:
        cur.execute(
            """SELECT id, project_id, name, board_type, created_at
               FROM app.task_board
               WHERE project_id = %s
               ORDER BY created_at ASC""",
            (str(project_id),),
        )
        return cur.fetchall()


def list_statuses(project_id: UUID) -> list[dict[str, Any]]:
    with get_cursor() as cur:
        cur.execute(
            """SELECT id, project_id, key, name, category, order_index, color_token, is_default
               FROM app.task_status
               WHERE project_id = %s
               ORDER BY order_index ASC, created_at ASC""",
            (str(project_id),),
        )
        return cur.fetchall()


def create_status(
    project_id: UUID,
    *,
    key: str,
    name: str,
    category: str,
    order_index: int | None,
    color_token: str | None,
    is_default: bool,
) -> dict[str, Any]:
    with get_cursor() as cur:
        cur.execute("SELECT id FROM app.task_project WHERE id = %s", (str(project_id),))
        if not cur.fetchone():
            raise LookupError("Project not found")

        resolved_order = order_index
        if resolved_order is None:
            cur.execute(
                "SELECT COALESCE(MAX(order_index), 0) + 10 AS next_order FROM app.task_status WHERE project_id = %s",
                (str(project_id),),
            )
            resolved_order = int(cur.fetchone()["next_order"])

        if is_default:
            cur.execute(
                "UPDATE app.task_status SET is_default = false WHERE project_id = %s",
                (str(project_id),),
            )

        cur.execute(
            """INSERT INTO app.task_status
               (project_id, key, name, category, order_index, color_token, is_default)
               VALUES (%s, %s, %s, %s, %s, %s, %s)
               RETURNING id, project_id, key, name, category, order_index, color_token, is_default""",
            (str(project_id), key, name, category, resolved_order, color_token, is_default),
        )
        return cur.fetchone()


def list_issues(
    project_id: UUID,
    *,
    status: str | None = None,
    sprint: str | None = None,
    assignee: str | None = None,
    q: str | None = None,
    label: str | None = None,
    priority: str | None = None,
) -> list[dict[str, Any]]:
    with get_cursor() as cur:
        conditions = ["i.project_id = %s"]
        params: list[Any] = [str(project_id)]

        if status:
            conditions.append("(s.key = %s OR i.status_id::text = %s)")
            params.extend([status, status])
        if sprint:
            lowered = sprint.strip().lower()
            if lowered in {"none", "backlog", "null"}:
                conditions.append("i.sprint_id IS NULL")
            else:
                conditions.append("i.sprint_id::text = %s")
                params.append(sprint)
        if assignee:
            conditions.append("i.assignee = %s")
            params.append(assignee)
        if q:
            q_like = f"%{q.strip()}%"
            conditions.append("(i.issue_key ILIKE %s OR i.title ILIKE %s OR i.description_md ILIKE %s)")
            params.extend([q_like, q_like, q_like])
        if label:
            conditions.append("%s = ANY(i.labels)")
            params.append(label)
        if priority:
            conditions.append("i.priority = %s")
            params.append(priority)

        where_sql = " AND ".join(conditions)
        cur.execute(
            ISSUE_SELECT
            + f" WHERE {where_sql} ORDER BY i.backlog_rank ASC, i.created_at ASC",
            params,
        )
        rows = cur.fetchall()
        return [_normalize_issue_row(r) for r in rows]


def create_issue(
    project_id: UUID,
    *,
    issue_type: str,
    title: str,
    description_md: str | None,
    status_id: UUID | None,
    priority: str,
    assignee: str | None,
    reporter: str,
    labels: list[str] | None,
    estimate_points: int | None,
    due_date: date | None,
    sprint_id: UUID | None,
    backlog_rank: float | None,
) -> dict[str, Any]:
    with get_cursor() as cur:
        cur.execute(
            "SELECT id, key FROM app.task_project WHERE id = %s FOR UPDATE",
            (str(project_id),),
        )
        project = cur.fetchone()
        if not project:
            raise LookupError("Project not found")

        return _create_issue_with_cursor(
            cur,
            project_id=project["id"],
            project_key=project["key"],
            issue_type=issue_type,
            title=title.strip(),
            description_md=(description_md or "").strip(),
            status_id=status_id,
            priority=priority,
            assignee=assignee,
            reporter=reporter.strip(),
            labels=labels,
            estimate_points=estimate_points,
            due_date=due_date,
            sprint_id=sprint_id,
            backlog_rank=backlog_rank,
            actor=reporter.strip(),
        )


def get_issue(issue_id: UUID) -> dict[str, Any] | None:
    with get_cursor() as cur:
        issue = _fetch_issue_row(cur, issue_id)
        if not issue:
            return None

        cur.execute(
            """SELECT id, issue_id, author, body_md, created_at
               FROM app.task_comment
               WHERE issue_id = %s
               ORDER BY created_at ASC""",
            (str(issue_id),),
        )
        comments = cur.fetchall()

        cur.execute(
            """SELECT l.id,
                      l.from_issue_id,
                      fi.issue_key AS from_issue_key,
                      l.to_issue_id,
                      ti.issue_key AS to_issue_key,
                      l.link_type
               FROM app.task_issue_link l
               JOIN app.task_issue fi ON fi.id = l.from_issue_id
               JOIN app.task_issue ti ON ti.id = l.to_issue_id
               WHERE l.from_issue_id = %s OR l.to_issue_id = %s
               ORDER BY l.id ASC""",
            (str(issue_id), str(issue_id)),
        )
        links = cur.fetchall()

        cur.execute(
            """SELECT a.id,
                      a.issue_id,
                      a.document_id,
                      d.title AS document_title,
                      d.virtual_path AS document_virtual_path,
                      a.created_at
               FROM app.task_issue_attachment a
               LEFT JOIN app.documents d ON d.document_id = a.document_id
               WHERE a.issue_id = %s
               ORDER BY a.created_at ASC""",
            (str(issue_id),),
        )
        attachments = cur.fetchall()

        cur.execute(
            """SELECT id, issue_id, link_kind, link_ref, link_label
               FROM app.task_issue_context_link
               WHERE issue_id = %s
               ORDER BY id ASC""",
            (str(issue_id),),
        )
        context_links = cur.fetchall()

        cur.execute(
            """SELECT id, issue_id, actor, action, before_json, after_json, created_at
               FROM app.task_activity
               WHERE issue_id = %s
               ORDER BY created_at DESC""",
            (str(issue_id),),
        )
        activity = cur.fetchall()

        issue["comments"] = comments
        issue["links"] = links
        issue["attachments"] = attachments
        issue["context_links"] = context_links
        issue["activity"] = activity
        return issue


def update_issue(issue_id: UUID, patch: dict[str, Any]) -> dict[str, Any]:
    if not patch:
        item = get_issue(issue_id)
        if not item:
            raise LookupError("Issue not found")
        return item

    allowed = {
        "type",
        "title",
        "description_md",
        "status_id",
        "priority",
        "assignee",
        "reporter",
        "labels",
        "estimate_points",
        "due_date",
        "sprint_id",
        "backlog_rank",
    }
    actor = str((patch.pop("actor", None) or "system")).strip() or "system"
    updates = {k: v for k, v in patch.items() if k in allowed}
    if not updates:
        item = get_issue(issue_id)
        if not item:
            raise LookupError("Issue not found")
        return item

    with get_cursor() as cur:
        current = _fetch_issue_row(cur, issue_id)
        if not current:
            raise LookupError("Issue not found")

        if "status_id" in updates and updates["status_id"] is not None:
            _resolve_status_id(cur, current["project_id"], updates["status_id"])

        if "sprint_id" in updates:
            _validate_sprint_id(cur, current["project_id"], updates["sprint_id"])

        if "labels" in updates:
            updates["labels"] = _normalize_labels(updates["labels"])
        if "title" in updates and updates["title"] is not None:
            updates["title"] = str(updates["title"]).strip()
        if "description_md" in updates and updates["description_md"] is None:
            updates["description_md"] = ""
        if "reporter" in updates and updates["reporter"] is not None:
            updates["reporter"] = str(updates["reporter"]).strip()

        set_sql = ", ".join(f"{field} = %s" for field in updates.keys())
        params = []
        for value in updates.values():
            if isinstance(value, UUID):
                params.append(str(value))
            else:
                params.append(value)
        params.append(str(issue_id))

        cur.execute(
            f"UPDATE app.task_issue SET {set_sql} WHERE id = %s",
            params,
        )

        updated = _fetch_issue_row(cur, issue_id)
        if not updated:
            raise LookupError("Issue not found")

        before: dict[str, Any] = {}
        after: dict[str, Any] = {}
        for key in updates.keys():
            if current.get(key) != updated.get(key):
                before[key] = current.get(key)
                after[key] = updated.get(key)

        if before or after:
            _record_activity(cur, issue_id, actor=actor, action="field_updated", before=before, after=after)

        return updated


def move_issue(
    issue_id: UUID,
    *,
    status_id: UUID | None,
    status_specified: bool,
    sprint_id: UUID | None,
    sprint_specified: bool,
    backlog_rank: float | None,
    backlog_rank_specified: bool,
    actor: str,
) -> dict[str, Any]:
    with get_cursor() as cur:
        current = _fetch_issue_row(cur, issue_id)
        if not current:
            raise LookupError("Issue not found")

        if status_specified:
            if status_id is None:
                raise ValueError("status_id cannot be null when provided")
            new_status_id = _resolve_status_id(cur, current["project_id"], status_id)
        else:
            new_status_id = current["status_id"]

        if sprint_specified:
            _validate_sprint_id(cur, current["project_id"], sprint_id)
            new_sprint_id = sprint_id
        else:
            new_sprint_id = current["sprint_id"]

        if backlog_rank_specified:
            new_backlog_rank = float(backlog_rank) if backlog_rank is not None else _next_backlog_rank(cur, current["project_id"])
        else:
            new_backlog_rank = current["backlog_rank"]

        cur.execute(
            """UPDATE app.task_issue
               SET status_id = %s,
                   sprint_id = %s,
                   backlog_rank = %s
               WHERE id = %s""",
            (
                str(new_status_id),
                str(new_sprint_id) if new_sprint_id else None,
                new_backlog_rank,
                str(issue_id),
            ),
        )

        updated = _fetch_issue_row(cur, issue_id)
        if not updated:
            raise LookupError("Issue not found")

        before = {
            "status_id": str(current["status_id"]) if current["status_id"] else None,
            "sprint_id": str(current["sprint_id"]) if current["sprint_id"] else None,
            "backlog_rank": current["backlog_rank"],
        }
        after = {
            "status_id": str(updated["status_id"]) if updated["status_id"] else None,
            "sprint_id": str(updated["sprint_id"]) if updated["sprint_id"] else None,
            "backlog_rank": updated["backlog_rank"],
        }

        action = "moved"
        if before["status_id"] != after["status_id"]:
            action = "status_changed"
        elif before["sprint_id"] != after["sprint_id"]:
            action = "sprint_changed"
        elif before["backlog_rank"] != after["backlog_rank"]:
            action = "rank_changed"

        _record_activity(cur, issue_id, actor=actor or "system", action=action, before=before, after=after)
        return updated


def add_comment(issue_id: UUID, *, author: str, body_md: str) -> dict[str, Any]:
    with get_cursor() as cur:
        cur.execute("SELECT id FROM app.task_issue WHERE id = %s", (str(issue_id),))
        if not cur.fetchone():
            raise LookupError("Issue not found")

        cur.execute(
            """INSERT INTO app.task_comment (issue_id, author, body_md)
               VALUES (%s, %s, %s)
               RETURNING id, issue_id, author, body_md, created_at""",
            (str(issue_id), author.strip(), body_md.strip()),
        )
        comment = cur.fetchone()
        _record_activity(
            cur,
            issue_id,
            actor=author.strip(),
            action="commented",
            before=None,
            after={"comment_id": str(comment["id"])},
        )
        return comment


def add_issue_link(
    issue_id: UUID,
    *,
    to_issue_id: UUID,
    link_type: str,
    actor: str | None = None,
) -> dict[str, Any]:
    with get_cursor() as cur:
        source = _fetch_issue_row(cur, issue_id)
        if not source:
            raise LookupError("Issue not found")
        target = _fetch_issue_row(cur, to_issue_id)
        if not target:
            raise LookupError("Target issue not found")
        if source["project_id"] != target["project_id"]:
            raise ValueError("Issue links must stay inside a project")

        cur.execute(
            """INSERT INTO app.task_issue_link (from_issue_id, to_issue_id, link_type)
               VALUES (%s, %s, %s)
               ON CONFLICT (from_issue_id, to_issue_id, link_type) DO NOTHING
               RETURNING id, from_issue_id, to_issue_id, link_type""",
            (str(issue_id), str(to_issue_id), link_type),
        )
        row = cur.fetchone()
        if not row:
            cur.execute(
                """SELECT id, from_issue_id, to_issue_id, link_type
                   FROM app.task_issue_link
                   WHERE from_issue_id = %s AND to_issue_id = %s AND link_type = %s""",
                (str(issue_id), str(to_issue_id), link_type),
            )
            row = cur.fetchone()

        out = {
            "id": row["id"],
            "from_issue_id": row["from_issue_id"],
            "from_issue_key": source["issue_key"],
            "to_issue_id": row["to_issue_id"],
            "to_issue_key": target["issue_key"],
            "link_type": row["link_type"],
        }

        _record_activity(
            cur,
            issue_id,
            actor=(actor or "system"),
            action="linked",
            before=None,
            after={"to_issue_id": str(to_issue_id), "link_type": link_type},
        )
        return out


def add_attachment(
    issue_id: UUID,
    *,
    document_id: UUID,
    actor: str | None = None,
) -> dict[str, Any]:
    with get_cursor() as cur:
        cur.execute("SELECT id FROM app.task_issue WHERE id = %s", (str(issue_id),))
        if not cur.fetchone():
            raise LookupError("Issue not found")

        cur.execute(
            """SELECT document_id, title, virtual_path
               FROM app.documents
               WHERE document_id = %s""",
            (str(document_id),),
        )
        doc = cur.fetchone()
        if not doc:
            raise LookupError("Document not found")

        cur.execute(
            """INSERT INTO app.task_issue_attachment (issue_id, document_id)
               VALUES (%s, %s)
               ON CONFLICT (issue_id, document_id) DO NOTHING
               RETURNING id, issue_id, document_id, created_at""",
            (str(issue_id), str(document_id)),
        )
        row = cur.fetchone()
        if not row:
            cur.execute(
                """SELECT id, issue_id, document_id, created_at
                   FROM app.task_issue_attachment
                   WHERE issue_id = %s AND document_id = %s""",
                (str(issue_id), str(document_id)),
            )
            row = cur.fetchone()

        out = {
            "id": row["id"],
            "issue_id": row["issue_id"],
            "document_id": row["document_id"],
            "document_title": doc["title"],
            "document_virtual_path": doc["virtual_path"],
            "created_at": row["created_at"],
        }
        _record_activity(
            cur,
            issue_id,
            actor=(actor or "system"),
            action="attachment_added",
            before=None,
            after={"document_id": str(document_id)},
        )
        return out


def add_context_link(
    issue_id: UUID,
    *,
    link_kind: str,
    link_ref: str,
    link_label: str,
    actor: str | None = None,
) -> dict[str, Any]:
    with get_cursor() as cur:
        cur.execute("SELECT id FROM app.task_issue WHERE id = %s", (str(issue_id),))
        if not cur.fetchone():
            raise LookupError("Issue not found")

        cur.execute(
            """INSERT INTO app.task_issue_context_link
               (issue_id, link_kind, link_ref, link_label)
               VALUES (%s, %s, %s, %s)
               ON CONFLICT (issue_id, link_kind, link_ref) DO UPDATE
               SET link_label = EXCLUDED.link_label
               RETURNING id, issue_id, link_kind, link_ref, link_label""",
            (str(issue_id), link_kind, link_ref.strip(), link_label.strip()),
        )
        row = cur.fetchone()
        _record_activity(
            cur,
            issue_id,
            actor=(actor or "system"),
            action="context_linked",
            before=None,
            after={"link_kind": link_kind, "link_ref": link_ref, "link_label": link_label},
        )
        return row


def list_sprints(project_id: UUID) -> list[dict[str, Any]]:
    with get_cursor() as cur:
        cur.execute(
            """SELECT id, project_id, name, start_date, end_date, status, created_at
               FROM app.task_sprint
               WHERE project_id = %s
               ORDER BY created_at DESC""",
            (str(project_id),),
        )
        return cur.fetchall()


def create_sprint(
    project_id: UUID,
    *,
    name: str,
    start_date: date | None,
    end_date: date | None,
    status: str = "planned",
) -> dict[str, Any]:
    with get_cursor() as cur:
        cur.execute("SELECT id FROM app.task_project WHERE id = %s", (str(project_id),))
        if not cur.fetchone():
            raise LookupError("Project not found")

        cur.execute(
            """INSERT INTO app.task_sprint (project_id, name, start_date, end_date, status)
               VALUES (%s, %s, %s, %s, %s)
               RETURNING id, project_id, name, start_date, end_date, status, created_at""",
            (str(project_id), name.strip(), start_date, end_date, status),
        )
        return cur.fetchone()


def start_sprint(sprint_id: UUID) -> dict[str, Any]:
    with get_cursor() as cur:
        cur.execute(
            "SELECT id, project_id FROM app.task_sprint WHERE id = %s",
            (str(sprint_id),),
        )
        sprint = cur.fetchone()
        if not sprint:
            raise LookupError("Sprint not found")

        cur.execute(
            """UPDATE app.task_sprint
               SET status = 'planned'
               WHERE project_id = %s AND status = 'active' AND id <> %s""",
            (str(sprint["project_id"]), str(sprint_id)),
        )
        cur.execute(
            """UPDATE app.task_sprint
               SET status = 'active',
                   start_date = COALESCE(start_date, CURRENT_DATE)
               WHERE id = %s""",
            (str(sprint_id),),
        )
        cur.execute(
            """SELECT id, project_id, name, start_date, end_date, status, created_at
               FROM app.task_sprint
               WHERE id = %s""",
            (str(sprint_id),),
        )
        return cur.fetchone()


def close_sprint(sprint_id: UUID) -> dict[str, Any]:
    with get_cursor() as cur:
        cur.execute(
            "SELECT id, project_id FROM app.task_sprint WHERE id = %s",
            (str(sprint_id),),
        )
        sprint = cur.fetchone()
        if not sprint:
            raise LookupError("Sprint not found")

        cur.execute(
            """SELECT i.id
               FROM app.task_issue i
               JOIN app.task_status s ON s.id = i.status_id
               WHERE i.sprint_id = %s
                 AND s.category <> 'done'""",
            (str(sprint_id),),
        )
        unfinished = [row["id"] for row in cur.fetchall()]
        cur.execute(
            "UPDATE app.task_issue SET sprint_id = NULL WHERE sprint_id = %s",
            (str(sprint_id),),
        )
        for issue_id in unfinished:
            _record_activity(
                cur,
                issue_id,
                actor="system",
                action="sprint_closed_moved_to_backlog",
                before={"sprint_id": str(sprint_id)},
                after={"sprint_id": None},
            )

        cur.execute(
            "UPDATE app.task_sprint SET status = 'closed' WHERE id = %s",
            (str(sprint_id),),
        )
        cur.execute(
            """SELECT id, project_id, name, start_date, end_date, status, created_at
               FROM app.task_sprint
               WHERE id = %s""",
            (str(sprint_id),),
        )
        return cur.fetchone()


def get_project_analytics(project_id: UUID) -> dict[str, Any]:
    with get_cursor() as cur:
        cur.execute("SELECT id FROM app.task_project WHERE id = %s", (str(project_id),))
        if not cur.fetchone():
            raise LookupError("Project not found")

        cur.execute("SELECT COUNT(*) AS cnt FROM app.task_issue WHERE project_id = %s", (str(project_id),))
        created_count = int(cur.fetchone()["cnt"] or 0)

        cur.execute(
            """SELECT COUNT(*) AS cnt
               FROM app.task_issue i
               JOIN app.task_status s ON s.id = i.status_id
               WHERE i.project_id = %s AND s.category = 'done'""",
            (str(project_id),),
        )
        completed_count = int(cur.fetchone()["cnt"] or 0)

        cur.execute(
            """SELECT COUNT(*) AS cnt
               FROM app.task_issue i
               JOIN app.task_status s ON s.id = i.status_id
               WHERE i.project_id = %s AND s.category = 'doing'""",
            (str(project_id),),
        )
        wip_count = int(cur.fetchone()["cnt"] or 0)

        cur.execute(
            """SELECT AVG(EXTRACT(EPOCH FROM (i.updated_at - i.created_at)) / 86400.0) AS avg_days
               FROM app.task_issue i
               JOIN app.task_status s ON s.id = i.status_id
               WHERE i.project_id = %s
                 AND s.category = 'done'
                 AND i.updated_at >= i.created_at""",
            (str(project_id),),
        )
        cycle_time_days = float(cur.fetchone()["avg_days"] or 0.0)

        cur.execute(
            """SELECT s.key AS status_key,
                      s.name AS status_name,
                      s.category,
                      COUNT(i.id) AS count
               FROM app.task_status s
               LEFT JOIN app.task_issue i
                 ON i.status_id = s.id
                AND i.project_id = s.project_id
               WHERE s.project_id = %s
               GROUP BY s.key, s.name, s.category, s.order_index
               ORDER BY s.order_index ASC""",
            (str(project_id),),
        )
        by_status = [
            {
                "status_key": row["status_key"],
                "status_name": row["status_name"],
                "category": row["category"],
                "count": int(row["count"] or 0),
            }
            for row in cur.fetchall()
        ]

        cur.execute(
            """SELECT to_char(date_trunc('week', i.updated_at), 'YYYY-MM-DD') AS week,
                      COUNT(*) AS completed_count
               FROM app.task_issue i
               JOIN app.task_status s ON s.id = i.status_id
               WHERE i.project_id = %s
                 AND s.category = 'done'
               GROUP BY 1
               ORDER BY 1 ASC""",
            (str(project_id),),
        )
        throughput_by_week = [
            {"week": row["week"], "completed_count": int(row["completed_count"] or 0)}
            for row in cur.fetchall()
        ]

        cur.execute(
            """SELECT EXTRACT(EPOCH FROM (i.updated_at - i.created_at)) / 86400.0 AS cycle_days
               FROM app.task_issue i
               JOIN app.task_status s ON s.id = i.status_id
               WHERE i.project_id = %s
                 AND s.category = 'done'
                 AND i.updated_at >= i.created_at""",
            (str(project_id),),
        )
        cycle_values = [float(row["cycle_days"]) for row in cur.fetchall()]

        histogram = {"0-2": 0, "3-7": 0, "8-14": 0, "15+": 0}
        for value in cycle_values:
            if value <= 2:
                histogram["0-2"] += 1
            elif value <= 7:
                histogram["3-7"] += 1
            elif value <= 14:
                histogram["8-14"] += 1
            else:
                histogram["15+"] += 1

        cur.execute(
            """SELECT label, COUNT(*) AS count
               FROM (
                 SELECT unnest(labels) AS label
                 FROM app.task_issue
                 WHERE project_id = %s
               ) lbl
               GROUP BY label
               ORDER BY count DESC, label ASC
               LIMIT 10""",
            (str(project_id),),
        )
        top_labels = [{"label": row["label"], "count": int(row["count"] or 0)} for row in cur.fetchall()]

        return {
            "project_id": project_id,
            "created_count": created_count,
            "completed_count": completed_count,
            "wip_count": wip_count,
            "cycle_time_days": round(cycle_time_days, 3),
            "by_status": by_status,
            "throughput_by_week": throughput_by_week,
            "cycle_time_histogram": histogram,
            "top_labels": top_labels,
        }


def get_task_metrics(project_id: UUID | None = None) -> dict[str, Any]:
    with get_cursor() as cur:
        where = ""
        params: tuple[Any, ...] = ()
        if project_id:
            where = "WHERE i.project_id = %s"
            params = (str(project_id),)

        cur.execute(f"SELECT COUNT(*) AS cnt FROM app.task_issue i {where}", params)
        created_count = int(cur.fetchone()["cnt"] or 0)

        cur.execute(
            f"""SELECT COUNT(*) AS cnt
                FROM app.task_issue i
                JOIN app.task_status s ON s.id = i.status_id
                {where + (' AND' if where else ' WHERE')} s.category = 'done'""",
            params,
        )
        completed_count = int(cur.fetchone()["cnt"] or 0)

        cur.execute(
            f"""SELECT AVG(EXTRACT(EPOCH FROM (i.updated_at - i.created_at)) / 86400.0) AS avg_days
                FROM app.task_issue i
                JOIN app.task_status s ON s.id = i.status_id
                {where + (' AND' if where else ' WHERE')} s.category = 'done'
                  AND i.updated_at >= i.created_at""",
            params,
        )
        cycle_time_days = float(cur.fetchone()["avg_days"] or 0.0)

        cur.execute(
            f"""SELECT COUNT(*) AS cnt
                FROM app.task_issue i
                JOIN app.task_status s ON s.id = i.status_id
                {where + (' AND' if where else ' WHERE')} s.category = 'doing'""",
            params,
        )
        wip_count = int(cur.fetchone()["cnt"] or 0)

        cur.execute(
            f"""SELECT s.key, COUNT(i.id) AS cnt
                FROM app.task_status s
                LEFT JOIN app.task_issue i
                  ON i.status_id = s.id
                 {'AND i.project_id = %s' if project_id else ''}
                {'WHERE s.project_id = %s' if project_id else ''}
                GROUP BY s.key
                ORDER BY s.key ASC""",
            (str(project_id), str(project_id)) if project_id else (),
        )
        by_status_rows = cur.fetchall()
        by_status: dict[str, int] = {row["key"]: int(row["cnt"] or 0) for row in by_status_rows}

        return {
            "generated_at": datetime.now(timezone.utc),
            "project_id": project_id,
            "data_points": [
                {"key": "tasks.created_count", "value": created_count, "unit": "count"},
                {"key": "tasks.completed_count", "value": completed_count, "unit": "count"},
                {"key": "tasks.cycle_time_days", "value": round(cycle_time_days, 3), "unit": "days"},
                {"key": "tasks.wip_count", "value": wip_count, "unit": "count"},
                {"key": "tasks.by_status", "value": by_status, "unit": None},
            ],
        }


def seed_novendor_winston_build() -> dict[str, Any]:
    if not _is_seed_allowed():
        raise PermissionError("Seed endpoint is disabled (BM_DISABLE_SEED=1)")

    with get_cursor() as cur:
        cur.execute(
            """SELECT id, key
               FROM app.task_project
               WHERE key = 'WIN'
               LIMIT 1""",
        )
        project = cur.fetchone()
        created_project = False
        if not project:
            cur.execute(
                """INSERT INTO app.task_project (name, key, description)
                   VALUES (%s, %s, %s)
                   RETURNING id, key""",
                (
                    "Winston Build (NoVendor)",
                    "WIN",
                    "Self-referential project for building Winston inside Winston Tasks.",
                ),
            )
            project = cur.fetchone()
            created_project = True

        project_id = project["id"]
        project_key = project["key"]
        _ensure_default_board(cur, project_id, "scrum")
        _ensure_default_statuses(cur, project_id)

        cur.execute(
            """SELECT id FROM app.task_sprint
               WHERE project_id = %s AND name = %s""",
            (str(project_id), "Sprint 1 - Winston Foundations"),
        )
        sprint_row = cur.fetchone()
        if sprint_row:
            sprint_id = sprint_row["id"]
        else:
            cur.execute(
                """INSERT INTO app.task_sprint
                   (project_id, name, start_date, end_date, status)
                   VALUES (%s, %s, %s, %s, 'planned')
                   RETURNING id""",
                (
                    str(project_id),
                    "Sprint 1 - Winston Foundations",
                    date.today(),
                    date.today() + timedelta(days=14),
                ),
            )
            sprint_id = cur.fetchone()["id"]

        status_keys = ["todo", "in_progress", "blocked", "review", "done"]
        cur.execute(
            """SELECT id, key
               FROM app.task_status
               WHERE project_id = %s
                 AND key = ANY(%s)""",
            (str(project_id), status_keys),
        )
        status_map = {row["key"]: row["id"] for row in cur.fetchall()}
        todo_status = status_map.get("todo")
        in_progress_status = status_map.get("in_progress") or todo_status

        seed_issues = [
            {
                "type": "story",
                "title": "Branding module: apply Winston token system across surfaces",
                "description_md": "Unify typography, spacing, and interaction states across BOS + Lab + Tasks.",
                "status_id": in_progress_status,
                "priority": "high",
                "assignee": "design_lead",
                "reporter": "novendor_pm",
                "labels": ["branding", "ui", "winston-core"],
                "sprint_id": sprint_id,
            },
            {
                "type": "story",
                "title": "Report Creator: build metric query composer and saved views",
                "description_md": "Enable metrics + report artifacts to be assembled from deterministic data points.",
                "status_id": todo_status,
                "priority": "high",
                "assignee": "analytics_team",
                "reporter": "novendor_pm",
                "labels": ["reports", "metrics", "analytics"],
                "sprint_id": sprint_id,
            },
            {
                "type": "story",
                "title": "Metrics module: wire tasks, throughput, and cycle-time feeds",
                "description_md": "Expose task datapoints and ensure Report Creator can chart them.",
                "status_id": todo_status,
                "priority": "high",
                "assignee": "data_engineering",
                "reporter": "novendor_pm",
                "labels": ["metrics", "tasks", "reporting"],
                "sprint_id": sprint_id,
            },
            {
                "type": "story",
                "title": "Ingestion pipeline: deterministic source-version lineage on uploads",
                "description_md": "Track schema versions and replay ingest runs with full auditability.",
                "status_id": in_progress_status,
                "priority": "critical",
                "assignee": "platform_ingestion",
                "reporter": "novendor_pm",
                "labels": ["ingestion", "lineage", "audit"],
                "sprint_id": sprint_id,
            },
            {
                "type": "task",
                "title": "Accounting capability: AP invoice approval automation",
                "description_md": "Map work items to accounting journal events and payment workflows.",
                "status_id": todo_status,
                "priority": "high",
                "assignee": "finance_ops",
                "reporter": "novendor_pm",
                "labels": ["accounting", "ap", "workflow"],
                "sprint_id": sprint_id,
            },
            {
                "type": "story",
                "title": "Deal Pipeline: tighten kanban stage SLA and board interactions",
                "description_md": "Improve drag interactions and visibility into stale pipeline stages.",
                "status_id": todo_status,
                "priority": "medium",
                "assignee": "sales_platform",
                "reporter": "novendor_pm",
                "labels": ["deals", "pipeline", "kanban"],
                "sprint_id": None,
            },
            {
                "type": "bug",
                "title": "Waterfall model: reconcile tier ledger rounding edge-cases",
                "description_md": "Fix deterministic rounding mismatches between summary and tier ledgers.",
                "status_id": todo_status,
                "priority": "critical",
                "assignee": "finance_engine",
                "reporter": "novendor_pm",
                "labels": ["waterfall", "finance", "bugfix"],
                "sprint_id": None,
            },
            {
                "type": "task",
                "title": "Admin module: enforce department-level permission-lite guardrails",
                "description_md": "Ship role checks for key write actions with auditable events.",
                "status_id": todo_status,
                "priority": "high",
                "assignee": "security_team",
                "reporter": "novendor_pm",
                "labels": ["admin", "rbac", "security"],
                "sprint_id": None,
            },
            {
                "type": "story",
                "title": "Environment orchestration: one-click NoVendor lab bootstrap",
                "description_md": "Create seeded environments with deterministic starter datasets.",
                "status_id": todo_status,
                "priority": "medium",
                "assignee": "platform_ops",
                "reporter": "novendor_pm",
                "labels": ["environment", "bootstrap", "lab"],
                "sprint_id": None,
            },
            {
                "type": "task",
                "title": "Documents integration: attach PRDs and screenshots directly to issues",
                "description_md": "Allow existing documents to be linked and surfaced in issue drawer.",
                "status_id": todo_status,
                "priority": "medium",
                "assignee": "docs_team",
                "reporter": "novendor_pm",
                "labels": ["documents", "attachments", "ux"],
                "sprint_id": None,
            },
            {
                "type": "task",
                "title": "Executions integration: cross-link model runs to delivery issues",
                "description_md": "Issue context should include run and execution references.",
                "status_id": todo_status,
                "priority": "medium",
                "assignee": "platform_exec",
                "reporter": "novendor_pm",
                "labels": ["executions", "lineage", "integration"],
                "sprint_id": None,
            },
            {
                "type": "story",
                "title": "Mobile polish: validate board/backlog/sprint UX on iPhone viewport",
                "description_md": "Touch ergonomics, drawer behavior, and quick-add must remain fast.",
                "status_id": todo_status,
                "priority": "high",
                "assignee": "frontend_team",
                "reporter": "novendor_pm",
                "labels": ["mobile", "ux", "tasks"],
                "sprint_id": sprint_id,
            },
        ]

        cur.execute("SELECT env_id::text AS env_id FROM app.environments ORDER BY created_at ASC LIMIT 1")
        env_row = cur.fetchone()
        env_ref = env_row["env_id"] if env_row else None

        cur.execute("SELECT document_id::text AS document_id FROM app.documents ORDER BY created_at ASC LIMIT 1")
        doc_row = cur.fetchone()
        doc_ref = doc_row["document_id"] if doc_row else None

        cur.execute("SELECT execution_id::text AS execution_id FROM app.executions ORDER BY created_at ASC LIMIT 1")
        exe_row = cur.fetchone()
        execution_ref = exe_row["execution_id"] if exe_row else None

        created_issues = 0
        for issue_payload in seed_issues:
            cur.execute(
                "SELECT id FROM app.task_issue WHERE project_id = %s AND title = %s",
                (str(project_id), issue_payload["title"]),
            )
            exists = cur.fetchone()
            if exists:
                issue_id = exists["id"]
            else:
                created = _create_issue_with_cursor(
                    cur,
                    project_id=project_id,
                    project_key=project_key,
                    issue_type=issue_payload["type"],
                    title=issue_payload["title"],
                    description_md=issue_payload["description_md"],
                    status_id=issue_payload["status_id"],
                    priority=issue_payload["priority"],
                    assignee=issue_payload["assignee"],
                    reporter=issue_payload["reporter"],
                    labels=issue_payload["labels"],
                    estimate_points=None,
                    due_date=None,
                    sprint_id=issue_payload["sprint_id"],
                    backlog_rank=None,
                    actor=issue_payload["reporter"],
                )
                issue_id = created["id"]
                created_issues += 1

            if env_ref:
                cur.execute(
                    """INSERT INTO app.task_issue_context_link
                       (issue_id, link_kind, link_ref, link_label)
                       VALUES (%s, 'environment', %s, %s)
                       ON CONFLICT (issue_id, link_kind, link_ref) DO NOTHING""",
                    (str(issue_id), env_ref, "NoVendor Demo Environment"),
                )
            if doc_ref:
                cur.execute(
                    """INSERT INTO app.task_issue_context_link
                       (issue_id, link_kind, link_ref, link_label)
                       VALUES (%s, 'document', %s, %s)
                       ON CONFLICT (issue_id, link_kind, link_ref) DO NOTHING""",
                    (str(issue_id), doc_ref, "Seed Document"),
                )
            if execution_ref:
                cur.execute(
                    """INSERT INTO app.task_issue_context_link
                       (issue_id, link_kind, link_ref, link_label)
                       VALUES (%s, 'execution', %s, %s)
                       ON CONFLICT (issue_id, link_kind, link_ref) DO NOTHING""",
                    (str(issue_id), execution_ref, "Seed Execution"),
                )

        cur.execute("SELECT COUNT(*) AS cnt FROM app.task_issue WHERE project_id = %s", (str(project_id),))
        total_issues = int(cur.fetchone()["cnt"] or 0)

        return {
            "project_id": project_id,
            "project_key": project_key,
            "created_project": created_project,
            "created_issues": created_issues,
            "total_issues": total_issues,
        }
