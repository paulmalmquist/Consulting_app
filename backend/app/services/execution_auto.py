"""Execution Board – auto-generation pressure engine.

Runs on every board load. Eight passes, each idempotent via the partial unique
index uq_cro_execution_task_auto_open (pass 6 also moves rather than inserts):

  1. Promote overdue This Week → Today.
  2. Open deals with no committed next action → Today task.
  3. Open deals stale > 3 days (no activity, no outreach, no completed task)
     → Today follow-up task.
  4. Outbound outreach sent > 2 days ago with no reply → Today follow-up.
  5. Top of proof backlog → This Week pinned task.
  6. Waiting tasks whose re_engage_at has hit → flip to Today.
  7. Open deals never touched (no outreach + created > 12h ago) → Today
     "send first outreach" pressure.
  8. Stage = proposal AND last touch > 2d ago → Today "check response".

Returns counts per source so the UI can surface "Auto-added N" pills.
"""
from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from app.db import get_cursor


def _safe_insert_auto(
    cur,
    *,
    env_id: str,
    business_id: UUID,
    title: str,
    next_action: str,
    why_now: str,
    type_: str,
    status: str,
    auto_source: str,
    auto_source_ref: str,
    linked_deal_id: str | None = None,
    linked_contact_id: str | None = None,
    impact: int = 4,
    revenue_tag: str = "mid",
) -> bool:
    """Insert one auto-task. ON CONFLICT DO NOTHING via the partial unique index."""
    cur.execute(
        """
        INSERT INTO cro_execution_task
          (env_id, business_id, title, next_action, why_now, type, status,
           linked_deal_id, linked_contact_id, impact, revenue_tag,
           auto_source, auto_source_ref)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (env_id, auto_source, auto_source_ref)
        WHERE status <> 'done' AND auto_source IS NOT NULL AND auto_source_ref IS NOT NULL
        DO NOTHING
        RETURNING id
        """,
        (
            env_id, str(business_id), title, next_action, why_now, type_, status,
            linked_deal_id, linked_contact_id, impact, revenue_tag,
            auto_source, auto_source_ref,
        ),
    )
    return cur.fetchone() is not None


def run_auto_generation(*, env_id: str, business_id: UUID) -> dict:
    """Run all five passes. Returns AutoGenerateReport-shaped dict."""
    report = {
        "pipeline_no_next_action": 0,
        "pipeline_stale_3d": 0,
        "pipeline_no_outreach": 0,
        "pipeline_proposal_sent_no_followup": 0,
        "outreach_no_reply_2d": 0,
        "proof_backlog_top": 0,
        "promoted_to_today": 0,
        "waiting_re_engaged": 0,
    }

    with get_cursor() as cur:
        # ── 1. Promote overdue This Week → Today ────────────────────────────
        cur.execute(
            """
            UPDATE cro_execution_task
               SET status = 'today', updated_at = now()
             WHERE env_id = %s AND business_id = %s
               AND status = 'this_week'
               AND due_date IS NOT NULL
               AND due_date < current_date
            RETURNING id
            """,
            (env_id, str(business_id)),
        )
        report["promoted_to_today"] = len(cur.fetchall())

        # ── 2. Open deals with no committed next action ──────────────────────
        # An open deal has no open execution task. (Deals that already have a
        # task in today/this_week/waiting are considered to have a next move.)
        cur.execute(
            """
            SELECT o.crm_opportunity_id, o.name, a.name AS account_name
              FROM crm_opportunity o
         LEFT JOIN crm_account a ON a.crm_account_id = o.crm_account_id
             WHERE o.business_id = %s
               AND o.status = 'open'
               AND NOT EXISTS (
                   SELECT 1 FROM cro_execution_task t
                    WHERE t.env_id = %s
                      AND t.linked_deal_id = o.crm_opportunity_id
                      AND t.status <> 'done'
               )
            """,
            (str(business_id), env_id),
        )
        for row in cur.fetchall():
            deal_id = str(row["crm_opportunity_id"])
            label = row.get("account_name") or row.get("name") or "deal"
            inserted = _safe_insert_auto(
                cur,
                env_id=env_id,
                business_id=business_id,
                title=f"Set next move on {label}",
                next_action="Decide and write the single next move on this deal.",
                why_now="Deal is open with no committed next action.",
                type_="outreach",
                status="today",
                auto_source="pipeline_no_next_action",
                auto_source_ref=deal_id,
                linked_deal_id=deal_id,
                impact=4,
                revenue_tag="high",
            )
            if inserted:
                report["pipeline_no_next_action"] += 1

        # ── 3. Open deals stale > 3 days ─────────────────────────────────────
        # "Stale" = max(crm_activity.activity_at, cro_outreach_log.sent_at,
        # cro_execution_task.completed_at, crm_opportunity.created_at) was
        # > 3 days ago. Only fire when an open task isn't already pressuring
        # the deal (the partial unique index handles dedupe per deal).
        cur.execute(
            """
            WITH last_activity AS (
                SELECT o.crm_opportunity_id, o.name, a.name AS account_name,
                       GREATEST(
                         o.created_at,
                         COALESCE((SELECT MAX(activity_at) FROM crm_activity
                                    WHERE crm_opportunity_id = o.crm_opportunity_id), o.created_at),
                         COALESCE((SELECT MAX(sent_at) FROM cro_outreach_log
                                    WHERE crm_account_id = o.crm_account_id
                                      AND env_id = %s), o.created_at),
                         COALESCE((SELECT MAX(completed_at) FROM cro_execution_task
                                    WHERE linked_deal_id = o.crm_opportunity_id
                                      AND env_id = %s), o.created_at)
                       ) AS last_touch
                  FROM crm_opportunity o
             LEFT JOIN crm_account a ON a.crm_account_id = o.crm_account_id
                 WHERE o.business_id = %s
                   AND o.status = 'open'
            )
            SELECT crm_opportunity_id, name, account_name, last_touch
              FROM last_activity
             WHERE last_touch < now() - interval '3 days'
            """,
            (env_id, env_id, str(business_id)),
        )
        for row in cur.fetchall():
            deal_id = str(row["crm_opportunity_id"])
            label = row.get("account_name") or row.get("name") or "deal"
            inserted = _safe_insert_auto(
                cur,
                env_id=env_id,
                business_id=business_id,
                title=f"Re-engage {label}",
                next_action="Send a follow-up — message, call, or meeting request.",
                why_now="No activity, outreach, or completed task in 3+ days.",
                type_="follow_up",
                status="today",
                auto_source="pipeline_stale_3d",
                auto_source_ref=deal_id,
                linked_deal_id=deal_id,
                impact=4,
                revenue_tag="high",
            )
            if inserted:
                report["pipeline_stale_3d"] += 1

        # ── 4. Outbound outreach with no reply in 2 days ────────────────────
        cur.execute(
            """
            SELECT ol.id AS outreach_id, ol.crm_account_id, ol.crm_contact_id,
                   ol.sent_at, a.name AS account_name, c.full_name AS contact_name,
                   o.crm_opportunity_id AS deal_id
              FROM cro_outreach_log ol
         LEFT JOIN crm_account a ON a.crm_account_id = ol.crm_account_id
         LEFT JOIN crm_contact c ON c.crm_contact_id = ol.crm_contact_id
         LEFT JOIN LATERAL (
                 SELECT crm_opportunity_id FROM crm_opportunity o2
                  WHERE o2.crm_account_id = ol.crm_account_id
                    AND o2.business_id = ol.business_id
                    AND o2.status = 'open'
                  ORDER BY o2.created_at DESC LIMIT 1
              ) o ON true
             WHERE ol.env_id = %s AND ol.business_id = %s
               AND ol.direction = 'outbound'
               AND ol.replied_at IS NULL
               AND ol.bounce = false
               AND ol.sent_at < now() - interval '2 days'
            """,
            (env_id, str(business_id)),
        )
        for row in cur.fetchall():
            outreach_id = str(row["outreach_id"])
            label = row.get("contact_name") or row.get("account_name") or "contact"
            sent_days = None
            sent_at = row.get("sent_at")
            if sent_at:
                if not sent_at.tzinfo:
                    sent_at = sent_at.replace(tzinfo=timezone.utc)
                sent_days = (datetime.now(timezone.utc) - sent_at).days
            why_suffix = f" {sent_days}d ago" if sent_days else ""
            inserted = _safe_insert_auto(
                cur,
                env_id=env_id,
                business_id=business_id,
                title=f"Follow up with {label}",
                next_action="Send a follow-up message referencing the prior thread.",
                why_now=f"Outreach sent{why_suffix}, no reply.",
                type_="follow_up",
                status="today",
                auto_source="outreach_no_reply_2d",
                auto_source_ref=outreach_id,
                linked_deal_id=str(row["deal_id"]) if row.get("deal_id") else None,
                linked_contact_id=str(row["crm_contact_id"]) if row.get("crm_contact_id") else None,
                impact=3,
                revenue_tag="mid",
            )
            if inserted:
                report["outreach_no_reply_2d"] += 1

        # ── 5. Top of proof backlog ──────────────────────────────────────────
        cur.execute(
            """
            SELECT id, title
              FROM cro_proof_asset
             WHERE env_id = %s AND business_id = %s
               AND status IN ('draft', 'needs_update')
             ORDER BY (status = 'draft') DESC, use_count ASC, created_at ASC
             LIMIT 1
            """,
            (env_id, str(business_id)),
        )
        row = cur.fetchone()
        if row:
            inserted = _safe_insert_auto(
                cur,
                env_id=env_id,
                business_id=business_id,
                title=f"Finish proof asset: {row['title']}",
                next_action="Pick this up and ship it to ready status.",
                why_now="Top of the proof backlog. Nothing else is moving until this exists.",
                type_="proof_asset",
                status="this_week",
                auto_source="proof_backlog_top",
                auto_source_ref=str(row["id"]),
                impact=4,
                revenue_tag="mid",
            )
            if inserted:
                report["proof_backlog_top"] += 1

        # ── 6. Waiting → Today when re_engage_at hits ───────────────────────
        # The engine that keeps WAITING from becoming a graveyard. When the
        # date the user picked at drag-to-WAITING arrives, the card returns
        # to TODAY and re_engage_at is cleared so it doesn't bounce again.
        cur.execute(
            """
            UPDATE cro_execution_task
               SET status = 'today',
                   re_engage_at = NULL,
                   updated_at = now()
             WHERE env_id = %s AND business_id = %s
               AND status = 'waiting'
               AND re_engage_at IS NOT NULL
               AND re_engage_at <= now()
            RETURNING id
            """,
            (env_id, str(business_id)),
        )
        report["waiting_re_engaged"] = len(cur.fetchall())

        # ── 7. Open deals never touched ─────────────────────────────────────
        # 12h grace before we nag — the user may have just created the deal.
        cur.execute(
            """
            SELECT o.crm_opportunity_id, o.name, a.name AS account_name
              FROM crm_opportunity o
         LEFT JOIN crm_account a ON a.crm_account_id = o.crm_account_id
             WHERE o.business_id = %s
               AND o.status = 'open'
               AND o.created_at < now() - interval '12 hours'
               AND NOT EXISTS (
                   SELECT 1 FROM cro_outreach_log ol
                    WHERE ol.crm_account_id = o.crm_account_id
                      AND ol.business_id = o.business_id
               )
               AND NOT EXISTS (
                   SELECT 1 FROM crm_activity ca
                    WHERE ca.crm_opportunity_id = o.crm_opportunity_id
               )
            """,
            (str(business_id),),
        )
        for row in cur.fetchall():
            deal_id = str(row["crm_opportunity_id"])
            label = row.get("account_name") or row.get("name") or "deal"
            inserted = _safe_insert_auto(
                cur,
                env_id=env_id,
                business_id=business_id,
                title=f"Send first outreach to {label}",
                next_action="Open the contact list and send the first message.",
                why_now="Deal is open and has never been touched.",
                type_="outreach",
                status="today",
                auto_source="pipeline_no_outreach",
                auto_source_ref=deal_id,
                linked_deal_id=deal_id,
                impact=4,
                revenue_tag="high",
            )
            if inserted:
                report["pipeline_no_outreach"] += 1

        # ── 8. Stage = proposal AND last touch > 2d → check response ────────
        # Stage is a FK: crm_opportunity.crm_pipeline_stage_id → crm_pipeline_stage.
        # There is no crm_opportunity.stage column; the proposal stage is
        # crm_pipeline_stage.key = 'proposal' (stable machine key, not label).
        # The 2-day window matches the no-reply pass; together they form a tight
        # follow-up loop on the most-revenue-sensitive part of the funnel.
        cur.execute(
            """
            WITH proposal_deals AS (
                SELECT o.crm_opportunity_id, o.name, a.name AS account_name,
                       GREATEST(
                         o.created_at,
                         COALESCE((SELECT MAX(activity_at) FROM crm_activity
                                    WHERE crm_opportunity_id = o.crm_opportunity_id), o.created_at),
                         COALESCE((SELECT MAX(sent_at) FROM cro_outreach_log
                                    WHERE crm_account_id = o.crm_account_id
                                      AND env_id = %s), o.created_at)
                       ) AS last_touch
                  FROM crm_opportunity o
             LEFT JOIN crm_account a ON a.crm_account_id = o.crm_account_id
                  JOIN crm_pipeline_stage s
                    ON s.crm_pipeline_stage_id = o.crm_pipeline_stage_id
                 WHERE o.business_id = %s
                   AND o.status = 'open'
                   AND lower(s.key) = 'proposal'
            )
            SELECT crm_opportunity_id, name, account_name, last_touch
              FROM proposal_deals
             WHERE last_touch < now() - interval '2 days'
            """,
            (env_id, str(business_id)),
        )
        for row in cur.fetchall():
            deal_id = str(row["crm_opportunity_id"])
            label = row.get("account_name") or row.get("name") or "deal"
            inserted = _safe_insert_auto(
                cur,
                env_id=env_id,
                business_id=business_id,
                title=f"Check response on {label} proposal",
                next_action="Ping the prospect for a decision or schedule a review call.",
                why_now="Proposal sent, no reply in 2+ days.",
                type_="follow_up",
                status="today",
                auto_source="pipeline_proposal_sent_no_followup",
                auto_source_ref=deal_id,
                linked_deal_id=deal_id,
                impact=5,
                revenue_tag="high",
            )
            if inserted:
                report["pipeline_proposal_sent_no_followup"] += 1

    return report
