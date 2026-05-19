"""Consulting Revenue OS – Execution Board CRUD.

Daily-action Kanban tasks. Status transitions: today | this_week | waiting | done.
Every task carries a required next_action and why_now. Done tasks are kept for
7 days (frontend filter) so the recent-completion window stays visible.
"""
from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID, uuid4

from app.db import get_cursor


_ALLOWED_TYPES = {"outreach", "product", "proof_asset", "research", "follow_up"}
_ALLOWED_STATUS = {"today", "this_week", "waiting", "done"}
_ALLOWED_REVENUE_TAG = {"low", "mid", "high"}
_ALLOWED_OUTCOME = {"moved_deal", "got_response", "no_effect", "blocked", "unknown"}

# Hard ceiling. Above this, drag/create into TODAY is rejected with TodayFullError.
TODAY_HARD_CAP = 8


class TodayFullError(Exception):
    """Raised when creating or moving into TODAY would exceed TODAY_HARD_CAP.

    Why: TODAY without a cap drifts into THIS WEEK in disguise. The user has
    explicitly asked for forced prioritization here.
    """

    def __init__(self, today_count: int):
        super().__init__(f"TODAY is full ({today_count}/{TODAY_HARD_CAP})")
        self.today_count = today_count


_SELECT_TASK_COLUMNS = """
    t.id, t.env_id, t.business_id, t.title, t.description, t.expected_outcome,
    t.next_action, t.why_now, t.type, t.status, t.linked_deal_id, t.linked_contact_id,
    t.impact, t.revenue_tag, t.due_date, t.auto_source, t.auto_source_ref,
    t.sequence_group, t.sequence_position, t.outcome, t.outcome_note,
    t.completed_at, t.re_engage_at, t.blocked_reason, t.created_at, t.updated_at,
    d.name AS deal_name,
    c.full_name AS contact_name,
    t.domain_key, t.initiative_key, t.workstream_key, t.parent_task_id,
    t.source_kind, t.related_entity_type, t.related_entity_id, t.related_url,
    t.last_reviewed_at,
    od.label AS domain_label,
    ini.label AS initiative_label,
    ws.label AS workstream_label
"""


def _today_count(*, env_id: str, business_id: UUID) -> int:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT COUNT(*)::int AS n
              FROM cro_execution_task
             WHERE env_id = %s AND business_id = %s AND status = 'today'
            """,
            (env_id, str(business_id)),
        )
        row = cur.fetchone() or {}
        return int(row.get("n") or 0)

_FROM_TASK = """
    FROM cro_execution_task t
    LEFT JOIN crm_opportunity d ON d.crm_opportunity_id = t.linked_deal_id
    LEFT JOIN crm_contact c ON c.crm_contact_id = t.linked_contact_id
    LEFT JOIN cro_operating_domain od
           ON od.env_id = t.env_id AND od.domain_key = t.domain_key
    LEFT JOIN cro_initiative ini
           ON ini.env_id = t.env_id
          AND ini.domain_key = t.domain_key
          AND ini.initiative_key = t.initiative_key
    LEFT JOIN cro_workstream ws
           ON ws.env_id = t.env_id
          AND ws.domain_key = t.domain_key
          AND ws.initiative_key = t.initiative_key
          AND ws.workstream_key = t.workstream_key
"""


def _validate_type(value: str) -> None:
    if value not in _ALLOWED_TYPES:
        raise ValueError(f"invalid task type: {value}")


def _validate_status(value: str) -> None:
    if value not in _ALLOWED_STATUS:
        raise ValueError(f"invalid task status: {value}")


class HierarchyValidationError(ValueError):
    """Raised when a domain/initiative/workstream key is not in the seeded
    reference tables for the env. Surfaced as a clean 400 (not a 500) — never
    write an unvalidated key to cro_execution_task."""


def validate_hierarchy(
    *,
    env_id: str,
    business_id: UUID,
    domain_key: str | None,
    initiative_key: str | None,
    workstream_key: str | None,
) -> None:
    """Fail-closed validation against the seeded reference tables.

    Rules:
      - NULL hierarchy is allowed (flat / Ungrouped task).
      - initiative_key requires a domain_key; workstream_key requires both.
      - Each key must exist in its reference table for THIS env, scoped by
        the parent key(s). Unknown keys raise HierarchyValidationError.
    Does not fabricate or coerce — rejects, leaving the field unset.
    """
    if initiative_key and not domain_key:
        raise HierarchyValidationError(
            "initiative_key requires a domain_key"
        )
    if workstream_key and not (domain_key and initiative_key):
        raise HierarchyValidationError(
            "workstream_key requires a domain_key and initiative_key"
        )

    # NULL / flat hierarchy: nothing to look up. Return before touching the
    # DB — a flat (Ungrouped) task must validate without a cursor. (The
    # dependency rules above already rejected orphan initiative/workstream.)
    if not domain_key:
        return

    with get_cursor() as cur:
        if domain_key:
            cur.execute(
                """
                SELECT 1 FROM cro_operating_domain
                 WHERE env_id = %s AND business_id = %s AND domain_key = %s
                 LIMIT 1
                """,
                (env_id, str(business_id), domain_key),
            )
            if cur.fetchone() is None:
                raise HierarchyValidationError(
                    f"unknown domain_key: {domain_key}"
                )
        if initiative_key:
            cur.execute(
                """
                SELECT 1 FROM cro_initiative
                 WHERE env_id = %s AND business_id = %s
                   AND domain_key = %s AND initiative_key = %s
                 LIMIT 1
                """,
                (env_id, str(business_id), domain_key, initiative_key),
            )
            if cur.fetchone() is None:
                raise HierarchyValidationError(
                    f"unknown initiative_key '{initiative_key}' for domain "
                    f"'{domain_key}'"
                )
        if workstream_key:
            cur.execute(
                """
                SELECT 1 FROM cro_workstream
                 WHERE env_id = %s AND business_id = %s
                   AND domain_key = %s AND initiative_key = %s
                   AND workstream_key = %s
                 LIMIT 1
                """,
                (
                    env_id,
                    str(business_id),
                    domain_key,
                    initiative_key,
                    workstream_key,
                ),
            )
            if cur.fetchone() is None:
                raise HierarchyValidationError(
                    f"unknown workstream_key '{workstream_key}' for "
                    f"initiative '{initiative_key}'"
                )


def list_hierarchy_options(*, env_id: str, business_id: UUID) -> dict:
    """Seeded domain/initiative/workstream options for the env's task form.

    Read-only; returns honest empty lists if nothing is seeded (the form
    degrades cleanly rather than fabricating choices)."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT domain_key AS key, label
              FROM cro_operating_domain
             WHERE env_id = %s AND business_id = %s AND status = 'active'
             ORDER BY sort_order, label
            """,
            (env_id, str(business_id)),
        )
        domains = [dict(r) for r in cur.fetchall()]
        cur.execute(
            """
            SELECT initiative_key AS key, label, domain_key
              FROM cro_initiative
             WHERE env_id = %s AND business_id = %s AND status = 'active'
             ORDER BY domain_key, sort_order, label
            """,
            (env_id, str(business_id)),
        )
        initiatives = [dict(r) for r in cur.fetchall()]
        cur.execute(
            """
            SELECT workstream_key AS key, label, domain_key, initiative_key
              FROM cro_workstream
             WHERE env_id = %s AND business_id = %s AND status = 'active'
             ORDER BY domain_key, initiative_key, sort_order, label
            """,
            (env_id, str(business_id)),
        )
        workstreams = [dict(r) for r in cur.fetchall()]
    return {
        "domains": domains,
        "initiatives": initiatives,
        "workstreams": workstreams,
    }


def _validate_revenue_tag(value: str) -> None:
    if value not in _ALLOWED_REVENUE_TAG:
        raise ValueError(f"invalid revenue_tag: {value}")


def list_tasks(
    *,
    env_id: str,
    business_id: UUID,
    status_filter: str | None = None,
    type_filter: str | None = None,
    deal_filter: UUID | None = None,
    revenue_tag_filter: str | None = None,
    include_archived_done: bool = False,
) -> list[dict]:
    """Return the board's tasks. Done tasks older than 7 days are hidden by default."""
    where = ["t.env_id = %s", "t.business_id = %s"]
    params: list = [env_id, str(business_id)]

    if status_filter:
        _validate_status(status_filter)
        where.append("t.status = %s")
        params.append(status_filter)
    if type_filter:
        _validate_type(type_filter)
        where.append("t.type = %s")
        params.append(type_filter)
    if deal_filter:
        where.append("t.linked_deal_id = %s")
        params.append(str(deal_filter))
    if revenue_tag_filter:
        _validate_revenue_tag(revenue_tag_filter)
        where.append("t.revenue_tag = %s")
        params.append(revenue_tag_filter)
    if not include_archived_done:
        where.append(
            "(t.status <> 'done' OR t.updated_at >= now() - interval '7 days')"
        )

    sql = f"SELECT {_SELECT_TASK_COLUMNS} {_FROM_TASK} WHERE {' AND '.join(where)} " \
          f"ORDER BY CASE t.status " \
          f"WHEN 'today' THEN 1 WHEN 'this_week' THEN 2 " \
          f"WHEN 'waiting' THEN 3 WHEN 'done' THEN 4 END, " \
          f"t.impact DESC, t.due_date NULLS LAST, t.created_at"

    with get_cursor() as cur:
        cur.execute(sql, params)
        return [dict(r) for r in cur.fetchall()]


def get_task(*, task_id: UUID) -> dict | None:
    with get_cursor() as cur:
        cur.execute(
            f"SELECT {_SELECT_TASK_COLUMNS} {_FROM_TASK} WHERE t.id = %s",
            (str(task_id),),
        )
        row = cur.fetchone()
        return dict(row) if row else None


def create_task(
    *,
    env_id: str,
    business_id: UUID,
    title: str,
    next_action: str,
    why_now: str,
    type: str,
    status: str = "today",
    description: str | None = None,
    expected_outcome: str | None = None,
    linked_deal_id: UUID | None = None,
    linked_contact_id: UUID | None = None,
    impact: int = 3,
    revenue_tag: str = "mid",
    due_date=None,
    auto_source: str | None = None,
    auto_source_ref: UUID | None = None,
    sequence_group: UUID | None = None,
    sequence_position: int | None = None,
) -> dict:
    # Next action / why-now are surfaced as card-health signals, never enforced as gates.
    # Title is the only hard requirement on a task.
    title = (title or "").strip()
    next_action = (next_action or "").strip()
    why_now = (why_now or "").strip()
    if not title:
        raise ValueError("title is required")
    _validate_type(type)
    _validate_status(status)
    _validate_revenue_tag(revenue_tag)
    if impact < 1 or impact > 5:
        raise ValueError("impact must be between 1 and 5")

    # Cap TODAY at TODAY_HARD_CAP. The system pressure passes (no_outreach,
    # stale_3d, etc.) bypass the cap — blocking them would hide pipeline
    # pressure from the user, which is the opposite of what we want. User-
    # initiated paths (manual, quick_capture, ai_generated) respect the cap.
    _SYSTEM_PASSES = {
        "pipeline_no_next_action",
        "pipeline_stale_3d",
        "pipeline_no_outreach",
        "pipeline_proposal_sent_no_followup",
        "outreach_no_reply_2d",
        "email_inbound_reply",
        "proof_backlog_top",
    }
    if status == "today" and auto_source not in _SYSTEM_PASSES:
        if _today_count(env_id=env_id, business_id=business_id) >= TODAY_HARD_CAP:
            raise TodayFullError(_today_count(env_id=env_id, business_id=business_id))

    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO cro_execution_task
              (env_id, business_id, title, description, expected_outcome,
               next_action, why_now, type, status, linked_deal_id, linked_contact_id,
               impact, revenue_tag, due_date, auto_source, auto_source_ref,
               sequence_group, sequence_position)
            VALUES
              (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id
            """,
            (
                env_id, str(business_id), title, description, expected_outcome,
                next_action, why_now, type, status,
                str(linked_deal_id) if linked_deal_id else None,
                str(linked_contact_id) if linked_contact_id else None,
                impact, revenue_tag, due_date, auto_source,
                str(auto_source_ref) if auto_source_ref else None,
                str(sequence_group) if sequence_group else None,
                sequence_position,
            ),
        )
        new_id = cur.fetchone()["id"]

    task = get_task(task_id=new_id)
    if task is None:
        raise RuntimeError("failed to load created task")
    return task


def update_task(
    *,
    task_id: UUID,
    title: str | None = None,
    description: str | None = None,
    expected_outcome: str | None = None,
    next_action: str | None = None,
    why_now: str | None = None,
    type: str | None = None,
    status: str | None = None,
    linked_deal_id: UUID | None = None,
    linked_contact_id: UUID | None = None,
    impact: int | None = None,
    revenue_tag: str | None = None,
    due_date=None,
    re_engage_at=None,
    blocked_reason: str | None = None,
    domain_key: str | None = None,
    initiative_key: str | None = None,
    workstream_key: str | None = None,
    source_kind: str | None = None,
    related_entity_type: str | None = None,
    related_entity_id: UUID | None = None,
    related_url: str | None = None,
    last_reviewed_at=None,
    _due_date_set: bool = False,
    _linked_deal_set: bool = False,
    _linked_contact_set: bool = False,
    _re_engage_at_set: bool = False,
    _blocked_reason_set: bool = False,
    _domain_key_set: bool = False,
    _initiative_key_set: bool = False,
    _workstream_key_set: bool = False,
    _source_kind_set: bool = False,
    _related_entity_type_set: bool = False,
    _related_entity_id_set: bool = False,
    _related_url_set: bool = False,
    _last_reviewed_at_set: bool = False,
) -> dict | None:
    # Enforce TODAY cap when moving an existing task INTO today. We need the
    # current row to know whether it's already in today (no-op) or coming from
    # another column (counts against the cap).
    if status == "today":
        existing = get_task(task_id=task_id)
        if existing is not None and existing.get("status") != "today":
            env_id = existing["env_id"]
            biz_id = existing["business_id"]
            n = _today_count(env_id=env_id, business_id=biz_id)
            if n >= TODAY_HARD_CAP:
                raise TodayFullError(n)

    sets: list[str] = []
    params: list = []

    if title is not None:
        title = title.strip()
        if not title:
            raise ValueError("title cannot be empty")
        sets.append("title = %s")
        params.append(title)
    if description is not None:
        sets.append("description = %s")
        params.append(description)
    if expected_outcome is not None:
        sets.append("expected_outcome = %s")
        params.append(expected_outcome)
    if next_action is not None:
        # Empty next_action is allowed — it's a soft signal, not a gate.
        next_action = next_action.strip()
        sets.append("next_action = %s")
        params.append(next_action)
    if why_now is not None:
        # Empty why_now is allowed — same reason.
        why_now = why_now.strip()
        sets.append("why_now = %s")
        params.append(why_now)
    if type is not None:
        _validate_type(type)
        sets.append("type = %s")
        params.append(type)
    if status is not None:
        _validate_status(status)
        sets.append("status = %s")
        params.append(status)
        if status == "done":
            sets.append("completed_at = COALESCE(completed_at, now())")
    if linked_deal_id is not None or _linked_deal_set:
        sets.append("linked_deal_id = %s")
        params.append(str(linked_deal_id) if linked_deal_id else None)
    if linked_contact_id is not None or _linked_contact_set:
        sets.append("linked_contact_id = %s")
        params.append(str(linked_contact_id) if linked_contact_id else None)
    if impact is not None:
        if impact < 1 or impact > 5:
            raise ValueError("impact must be between 1 and 5")
        sets.append("impact = %s")
        params.append(impact)
    if revenue_tag is not None:
        _validate_revenue_tag(revenue_tag)
        sets.append("revenue_tag = %s")
        params.append(revenue_tag)
    if _due_date_set:
        sets.append("due_date = %s")
        params.append(due_date)
    if _re_engage_at_set:
        sets.append("re_engage_at = %s")
        params.append(re_engage_at)
    if _blocked_reason_set:
        sets.append("blocked_reason = %s")
        params.append(blocked_reason)

    # Hierarchy write-path (Ticket 5). Validate the RESULTING hierarchy against
    # the seeded reference tables before writing — fail closed on unknown keys.
    hierarchy_touched = (
        _domain_key_set or _initiative_key_set or _workstream_key_set
    )
    if hierarchy_touched:
        existing = get_task(task_id=task_id)
        if existing is None:
            return None
        eff_domain = domain_key if _domain_key_set else existing.get("domain_key")
        eff_initiative = (
            initiative_key if _initiative_key_set else existing.get("initiative_key")
        )
        eff_workstream = (
            workstream_key if _workstream_key_set else existing.get("workstream_key")
        )
        validate_hierarchy(
            env_id=existing["env_id"],
            business_id=existing["business_id"],
            domain_key=eff_domain,
            initiative_key=eff_initiative,
            workstream_key=eff_workstream,
        )
    if _domain_key_set:
        sets.append("domain_key = %s")
        params.append(domain_key)
    if _initiative_key_set:
        sets.append("initiative_key = %s")
        params.append(initiative_key)
    if _workstream_key_set:
        sets.append("workstream_key = %s")
        params.append(workstream_key)
    if _source_kind_set:
        sets.append("source_kind = %s")
        params.append(source_kind)
    if _related_entity_type_set:
        sets.append("related_entity_type = %s")
        params.append(related_entity_type)
    if _related_entity_id_set:
        sets.append("related_entity_id = %s")
        params.append(str(related_entity_id) if related_entity_id else None)
    if _related_url_set:
        sets.append("related_url = %s")
        params.append(related_url)
    if _last_reviewed_at_set:
        sets.append("last_reviewed_at = %s")
        params.append(last_reviewed_at)

    if not sets:
        return get_task(task_id=task_id)

    sets.append("updated_at = %s")
    params.append(datetime.now(timezone.utc))
    params.append(str(task_id))

    with get_cursor() as cur:
        cur.execute(
            f"UPDATE cro_execution_task SET {', '.join(sets)} WHERE id = %s RETURNING id",
            params,
        )
        row = cur.fetchone()
        if not row:
            return None

    return get_task(task_id=task_id)


def delete_task(*, task_id: UUID) -> bool:
    with get_cursor() as cur:
        cur.execute(
            "DELETE FROM cro_execution_task WHERE id = %s RETURNING id",
            (str(task_id),),
        )
        return cur.fetchone() is not None


def complete_task(
    *,
    task_id: UUID,
    outcome: str = "unknown",
    outcome_note: str | None = None,
) -> dict | None:
    if outcome not in _ALLOWED_OUTCOME:
        raise ValueError(f"invalid outcome: {outcome}")
    with get_cursor() as cur:
        cur.execute(
            """
            UPDATE cro_execution_task
               SET status = 'done',
                   outcome = %s,
                   outcome_note = %s,
                   completed_at = COALESCE(completed_at, now()),
                   updated_at = now()
             WHERE id = %s
            RETURNING id
            """,
            (outcome, outcome_note, str(task_id)),
        )
        row = cur.fetchone()
        if not row:
            return None
    return get_task(task_id=task_id)


def board_summary(*, env_id: str, business_id: UUID) -> dict:
    """Counts for the sticky-header pressure indicators.

    moved_deal_7d / completed_7d back the "Moved deals X/Y" feedback ratio
    in the top bar — the loop that tells the user which task types pay off.
    """
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT
              SUM(CASE WHEN status = 'today' THEN 1 ELSE 0 END)::int     AS today_count,
              SUM(CASE WHEN status = 'this_week' THEN 1 ELSE 0 END)::int AS this_week_count,
              SUM(CASE WHEN status = 'waiting' THEN 1 ELSE 0 END)::int   AS waiting_count,
              SUM(CASE WHEN status = 'done' AND updated_at >= now() - interval '7 days' THEN 1 ELSE 0 END)::int
                                                                         AS done_visible_count,
              SUM(CASE WHEN status IN ('today','this_week') AND due_date IS NOT NULL AND due_date < current_date THEN 1 ELSE 0 END)::int
                                                                         AS overdue_count,
              SUM(CASE WHEN status = 'done' AND completed_at >= now() - interval '7 days' THEN 1 ELSE 0 END)::int
                                                                         AS completed_7d,
              SUM(CASE WHEN status = 'done' AND outcome = 'moved_deal' AND completed_at >= now() - interval '7 days' THEN 1 ELSE 0 END)::int
                                                                         AS moved_deal_7d
              FROM cro_execution_task
             WHERE env_id = %s AND business_id = %s
            """,
            (env_id, str(business_id)),
        )
        row = cur.fetchone() or {}
    return {
        "today_count": row.get("today_count") or 0,
        "this_week_count": row.get("this_week_count") or 0,
        "waiting_count": row.get("waiting_count") or 0,
        "done_visible_count": row.get("done_visible_count") or 0,
        "overdue_count": row.get("overdue_count") or 0,
        "completed_7d": row.get("completed_7d") or 0,
        "moved_deal_7d": row.get("moved_deal_7d") or 0,
    }


def create_ai_batch(
    *,
    env_id: str,
    business_id: UUID,
    items: list[dict],
    linked_deal_id: UUID | None = None,
) -> tuple[UUID, list[dict]]:
    """Persist a sequenced AI-generated batch under a shared sequence_group."""
    sequence_group = uuid4()
    created: list[dict] = []
    for idx, item in enumerate(items, start=1):
        task = create_task(
            env_id=env_id,
            business_id=business_id,
            title=item["title"],
            next_action=item["next_action"],
            why_now=item["why_now"],
            type=item.get("type", "outreach"),
            status=item.get("status", "this_week"),
            description=item.get("description"),
            expected_outcome=item.get("expected_outcome"),
            linked_deal_id=item.get("linked_deal_id") or linked_deal_id,
            impact=item.get("impact", 3),
            revenue_tag=item.get("revenue_tag", "mid"),
            due_date=item.get("due_date"),
            auto_source="ai_generated",
            sequence_group=sequence_group,
            sequence_position=item.get("sequence_position", idx),
        )
        created.append(task)
    return sequence_group, created
