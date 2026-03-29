"""Consulting Revenue OS – Outreach service.

Template management, outreach logging (creates cro_outreach_log + optionally crm_activity),
reply recording, and outreach analytics.
"""
from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from app.db import get_cursor
from app.observability.logger import emit_log
from app.services.reporting_common import resolve_tenant_id


# ── Templates ────────────────────────────────────────────────────────────────

def create_template(
    *,
    env_id: str,
    business_id: UUID,
    name: str,
    channel: str,
    category: str | None = None,
    subject_template: str | None = None,
    body_template: str,
) -> dict:
    """Create a reusable outreach template."""
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO cro_outreach_template
              (env_id, business_id, name, channel, category, subject_template, body_template)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            RETURNING id, env_id, business_id, name, channel, category,
                      subject_template, body_template, is_active,
                      use_count, reply_count, created_at
            """,
            (env_id, str(business_id), name, channel, category, subject_template, body_template),
        )
        return cur.fetchone()


def list_templates(*, env_id: str, business_id: UUID, active_only: bool = True) -> list[dict]:
    """List outreach templates."""
    with get_cursor() as cur:
        sql = """
            SELECT id, env_id, business_id, name, channel, category,
                   subject_template, body_template, is_active,
                   use_count, reply_count, created_at
            FROM cro_outreach_template
            WHERE env_id = %s AND business_id = %s
        """
        params: list = [env_id, str(business_id)]
        if active_only:
            sql += " AND is_active = true"
        sql += " ORDER BY created_at DESC"
        cur.execute(sql, tuple(params))
        return cur.fetchall()


# ── Outreach Logging ─────────────────────────────────────────────────────────

def log_outreach(
    *,
    env_id: str,
    business_id: UUID,
    crm_account_id: UUID,
    crm_contact_id: UUID | None = None,
    template_id: UUID | None = None,
    channel: str,
    direction: str = "outbound",
    subject: str | None = None,
    body_preview: str | None = None,
    meeting_booked: bool = False,
    sent_by: str | None = None,
) -> dict:
    """Log an outreach touch. Optionally creates a crm_activity and bumps template use_count."""
    with get_cursor() as cur:
        tenant_id = resolve_tenant_id(cur, business_id)

        # Optionally create a CRM activity
        crm_activity_id = None
        cur.execute(
            """
            INSERT INTO crm_activity
              (tenant_id, business_id, crm_account_id, crm_contact_id,
               activity_type, subject, notes, activity_date)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING crm_activity_id
            """,
            (
                tenant_id, str(business_id),
                str(crm_account_id),
                str(crm_contact_id) if crm_contact_id else None,
                channel, subject, body_preview,
                datetime.now(timezone.utc),
            ),
        )
        activity_row = cur.fetchone()
        if activity_row:
            crm_activity_id = activity_row["crm_activity_id"]

        # Create outreach log entry
        cur.execute(
            """
            INSERT INTO cro_outreach_log
              (crm_activity_id, env_id, business_id, crm_account_id, crm_contact_id,
               template_id, channel, direction, subject, body_preview,
               meeting_booked, sent_by)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id, crm_activity_id, env_id, business_id, crm_account_id,
                      crm_contact_id, template_id, channel, direction, subject,
                      body_preview, sent_at, replied_at, reply_sentiment,
                      meeting_booked, bounce, sent_by, created_at
            """,
            (
                str(crm_activity_id) if crm_activity_id else None,
                env_id, str(business_id),
                str(crm_account_id),
                str(crm_contact_id) if crm_contact_id else None,
                str(template_id) if template_id else None,
                channel, direction, subject, body_preview, meeting_booked, sent_by,
            ),
        )
        log_entry = cur.fetchone()

        # Bump template use_count
        if template_id:
            cur.execute(
                "UPDATE cro_outreach_template SET use_count = use_count + 1 WHERE id = %s",
                (str(template_id),),
            )

        # Update contact's last_outreach_at
        if crm_contact_id:
            cur.execute(
                """
                UPDATE cro_contact_profile
                SET last_outreach_at = %s, updated_at = now()
                WHERE crm_contact_id = %s
                """,
                (datetime.now(timezone.utc), str(crm_contact_id)),
            )

    emit_log(
        level="info",
        service="backend",
        action="cro.outreach.logged",
        message=f"Outreach logged to account {crm_account_id}",
        context={"channel": channel, "direction": direction},
    )

    # Auto-generate follow-up next action
    try:
        from datetime import date, timedelta
        from app.services import cro_next_actions

        if meeting_booked:
            cro_next_actions.create_next_action(
                env_id=env_id, business_id=business_id,
                entity_type="account", entity_id=crm_account_id,
                action_type="meeting",
                description="Prepare for scheduled meeting",
                due_date=date.today() + timedelta(days=1),
                priority="high",
            )
        elif direction == "outbound":
            cro_next_actions.create_next_action(
                env_id=env_id, business_id=business_id,
                entity_type="account", entity_id=crm_account_id,
                action_type="follow_up",
                description="Follow up if no reply to outreach",
                due_date=date.today() + timedelta(days=3),
                priority="normal",
            )
    except Exception:
        pass

    return log_entry


def list_outreach_log(
    *,
    env_id: str,
    business_id: UUID,
    crm_account_id: UUID | None = None,
    channel: str | None = None,
    limit: int = 50,
) -> list[dict]:
    """List outreach log entries with account/contact names."""
    with get_cursor() as cur:
        sql = """
            SELECT o.id, o.env_id, o.business_id, o.crm_account_id, o.crm_contact_id,
                   o.template_id, o.channel, o.direction, o.subject, o.body_preview,
                   o.sent_at, o.replied_at, o.reply_sentiment, o.meeting_booked,
                   o.bounce, o.sent_by,
                   a.name AS account_name,
                   c.full_name AS contact_name,
                   o.created_at
            FROM cro_outreach_log o
            LEFT JOIN crm_account a ON a.crm_account_id = o.crm_account_id
            LEFT JOIN crm_contact c ON c.crm_contact_id = o.crm_contact_id
            WHERE o.env_id = %s AND o.business_id = %s
        """
        params: list = [env_id, str(business_id)]

        if crm_account_id:
            sql += " AND o.crm_account_id = %s"
            params.append(str(crm_account_id))

        if channel:
            sql += " AND o.channel = %s"
            params.append(channel)

        sql += " ORDER BY o.sent_at DESC LIMIT %s"
        params.append(limit)

        cur.execute(sql, tuple(params))
        return cur.fetchall()


def record_reply(
    *,
    outreach_log_id: UUID,
    sentiment: str,
    meeting_booked: bool = False,
) -> dict:
    """Record a reply to an outreach entry."""
    with get_cursor() as cur:
        cur.execute(
            """
            UPDATE cro_outreach_log
            SET replied_at = %s, reply_sentiment = %s, meeting_booked = meeting_booked OR %s
            WHERE id = %s
            RETURNING id, replied_at, reply_sentiment, meeting_booked, template_id
            """,
            (datetime.now(timezone.utc), sentiment, meeting_booked, str(outreach_log_id)),
        )
        row = cur.fetchone()
        if not row:
            raise LookupError(f"Outreach log {outreach_log_id} not found")

        # Bump template reply_count
        if row.get("template_id"):
            cur.execute(
                "UPDATE cro_outreach_template SET reply_count = reply_count + 1 WHERE id = %s",
                (str(row["template_id"]),),
            )

        # Get account_id and env_id for next action generation
        cur.execute(
            "SELECT crm_account_id, env_id, business_id FROM cro_outreach_log WHERE id = %s",
            (str(outreach_log_id),),
        )
        log_row = cur.fetchone()

    # Auto-generate next action based on reply
    if log_row:
        try:
            from datetime import date, timedelta
            from app.services import cro_next_actions

            if sentiment == "positive" or meeting_booked:
                action_type = "meeting" if meeting_booked else "call"
                description = "Prepare discovery deck for meeting" if meeting_booked else "Schedule discovery call — positive reply received"
                cro_next_actions.create_next_action(
                    env_id=log_row["env_id"],
                    business_id=UUID(str(log_row["business_id"])),
                    entity_type="account",
                    entity_id=UUID(str(log_row["crm_account_id"])),
                    action_type=action_type,
                    description=description,
                    due_date=date.today() + timedelta(days=1 if meeting_booked else 2),
                    priority="high",
                )
        except Exception:
            pass

    return row


def get_outreach_analytics(*, env_id: str, business_id: UUID) -> dict:
    """Compute rolling 30-day outreach analytics."""
    with get_cursor() as cur:
        # Overall 30d stats
        cur.execute(
            """
            SELECT
                COUNT(*) AS total_sent_30d,
                COUNT(*) FILTER (WHERE replied_at IS NOT NULL) AS total_replied_30d,
                COUNT(*) FILTER (WHERE meeting_booked = true) AS meetings_booked_30d
            FROM cro_outreach_log
            WHERE env_id = %s AND business_id = %s
              AND sent_at >= now() - interval '30 days'
            """,
            (env_id, str(business_id)),
        )
        stats = cur.fetchone()

        total = stats["total_sent_30d"]
        replied = stats["total_replied_30d"]
        response_rate = round(replied / total, 4) if total > 0 else None

        # By channel
        cur.execute(
            """
            SELECT channel,
                   COUNT(*) AS sent,
                   COUNT(*) FILTER (WHERE replied_at IS NOT NULL) AS replied,
                   COUNT(*) FILTER (WHERE meeting_booked = true) AS meetings
            FROM cro_outreach_log
            WHERE env_id = %s AND business_id = %s
              AND sent_at >= now() - interval '30 days'
            GROUP BY channel ORDER BY sent DESC
            """,
            (env_id, str(business_id)),
        )
        by_channel = cur.fetchall()

        # By template
        cur.execute(
            """
            SELECT t.name AS template_name, t.id AS template_id,
                   COUNT(*) AS sent,
                   COUNT(*) FILTER (WHERE o.replied_at IS NOT NULL) AS replied
            FROM cro_outreach_log o
            JOIN cro_outreach_template t ON t.id = o.template_id
            WHERE o.env_id = %s AND o.business_id = %s
              AND o.sent_at >= now() - interval '30 days'
            GROUP BY t.id, t.name ORDER BY sent DESC
            """,
            (env_id, str(business_id)),
        )
        by_template = cur.fetchall()

    return {
        "total_sent_30d": total,
        "total_replied_30d": replied,
        "response_rate_30d": response_rate,
        "meetings_booked_30d": stats["meetings_booked_30d"],
        "by_channel": by_channel,
        "by_template": by_template,
    }
