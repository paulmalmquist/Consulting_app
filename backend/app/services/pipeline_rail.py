"""Right-rail aggregation services for the Pipeline operating surface.

Reads existing data (cro_next_action, cro_outreach_log, cro_execution_profile,
crm_opportunity, crm_activity, cro_strategic_lead) and shapes it for the
frontend rail modules. No new tables.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from app.db import get_cursor


# ── today_moves ──────────────────────────────────────────────────────────────

_REASON_BASE = {
    "overdue_action_active_deal": 90,
    "no_action_active_stage": 80,
    "proposal_no_followup": 75,
    "high_value_idle": 60,
    "outreach_ready_for_next_touch": 55,
    "discovery_no_scheduled_step": 50,
}

_ACTIVE_STAGE_KEYS = {"engaged", "meeting", "qualified", "proposal"}


def _amount_modifier(amount: float | int | None) -> float:
    if not amount:
        return 0.0
    return min(float(amount) / 10_000.0, 20.0)


def _staleness_modifier(days: int | None) -> float:
    if days is None:
        return 0.0
    return min(float(days), 15.0)


def _pressure_modifier(pressure: str | None) -> float:
    if pressure == "critical":
        return 10.0
    if pressure == "high":
        return 5.0
    return 0.0


def _snooze_modifier(snoozed_until: datetime | None) -> float:
    if snoozed_until is None:
        return 0.0
    if snoozed_until > datetime.now(timezone.utc):
        return -30.0
    return 0.0


def _clamp(n: float) -> int:
    return int(max(0.0, min(100.0, n)))


def _move_text(reason_code: str, account_name: str, context: dict[str, Any]) -> str:
    acct = account_name or "Unknown"
    if reason_code == "overdue_action_active_deal":
        days = context.get("days_overdue") or 0
        return f"Follow up {acct} — {days}d overdue" if days else f"Follow up {acct}"
    if reason_code == "no_action_active_stage":
        stage = context.get("stage") or "active stage"
        return f"Define next step for {acct} ({stage})"
    if reason_code == "proposal_no_followup":
        return f"Write proposal follow-up for {acct}"
    if reason_code == "high_value_idle":
        days = context.get("days_idle") or 0
        amt = context.get("amount")
        amt_hint = f" — ${amt / 1000:.0f}K" if amt else ""
        return f"Re-engage {acct}{amt_hint} — {days}d idle"
    if reason_code == "outreach_ready_for_next_touch":
        return f"Send outreach to {acct}"
    if reason_code == "discovery_no_scheduled_step":
        return f"Schedule next step for {acct}"
    return f"Review {acct}"


def today_moves(*, env_id: str, business_id: UUID, limit: int = 6) -> list[dict[str, Any]]:
    """Build a priority-ranked list of next moves.

    Returns rows with `reason_code` + `priority_score` per the plan's spec.
    """
    today = date.today()
    biz = str(business_id)
    candidates: list[dict[str, Any]] = []

    with get_cursor() as cur:
        # 1. overdue_action_active_deal — pending/in_progress actions past due
        cur.execute(
            """
            SELECT na.entity_id AS deal_id,
                   na.description AS action,
                   na.action_type,
                   na.due_date,
                   na.priority,
                   o.name AS deal_name,
                   o.amount,
                   o.status,
                   a.name AS account_name,
                   sl.last_touch_at,
                   ep.execution_pressure,
                   ep.snoozed_until
              FROM cro_next_action na
              JOIN crm_opportunity o ON o.crm_opportunity_id = na.entity_id
              LEFT JOIN crm_account a ON a.crm_account_id = o.crm_account_id
              LEFT JOIN cro_strategic_lead sl ON sl.crm_account_id = o.crm_account_id
                                             AND sl.business_id = o.business_id
              LEFT JOIN cro_execution_profile ep ON ep.crm_opportunity_id = o.crm_opportunity_id
             WHERE na.env_id = %s AND na.business_id = %s::uuid
               AND na.entity_type = 'opportunity'
               AND na.status IN ('pending','in_progress')
               AND na.due_date < %s
               AND o.status NOT IN ('won','lost')
             ORDER BY na.due_date ASC
             LIMIT 20
            """,
            (env_id, biz, today),
        )
        for r in cur.fetchall():
            days_overdue = (today - r["due_date"]).days if r.get("due_date") else 0
            days_idle = (today - r["last_touch_at"].date()).days if r.get("last_touch_at") else None
            base = _REASON_BASE["overdue_action_active_deal"]
            score = _clamp(
                base
                + _amount_modifier(r.get("amount"))
                + _staleness_modifier(days_idle)
                + _pressure_modifier(r.get("execution_pressure"))
                + _snooze_modifier(r.get("snoozed_until"))
            )
            candidates.append({
                "id": f"move-overdue-{r['deal_id']}",
                "deal_id": str(r["deal_id"]),
                "account_name": r.get("account_name") or r.get("deal_name") or "Unknown",
                "amount": float(r["amount"]) if r.get("amount") is not None else None,
                "action": r.get("action"),
                "action_type": r.get("action_type"),
                "due": r["due_date"].isoformat() if r.get("due_date") else None,
                "priority_score": score,
                "reason_code": "overdue_action_active_deal",
                "reason_text": _move_text("overdue_action_active_deal", r.get("account_name") or "Unknown",
                                          {"days_overdue": days_overdue}),
            })

        # 2. no_action_active_stage — opp in active stage with zero pending action
        cur.execute(
            """
            SELECT o.crm_opportunity_id AS deal_id,
                   o.name AS deal_name,
                   o.amount,
                   o.status,
                   s.stage_key,
                   a.name AS account_name,
                   sl.last_touch_at,
                   ep.execution_pressure,
                   ep.snoozed_until
              FROM crm_opportunity o
              LEFT JOIN crm_pipeline_stage s ON s.crm_pipeline_stage_id = o.crm_pipeline_stage_id
              LEFT JOIN crm_account a ON a.crm_account_id = o.crm_account_id
              LEFT JOIN cro_strategic_lead sl ON sl.crm_account_id = o.crm_account_id
                                             AND sl.business_id = o.business_id
              LEFT JOIN cro_execution_profile ep ON ep.crm_opportunity_id = o.crm_opportunity_id
             WHERE o.business_id = %s::uuid
               AND o.status = 'open'
               AND s.stage_key = ANY(%s)
               AND NOT EXISTS (
                     SELECT 1 FROM cro_next_action na
                      WHERE na.entity_type = 'opportunity'
                        AND na.entity_id = o.crm_opportunity_id
                        AND na.status IN ('pending','in_progress')
                   )
             ORDER BY o.amount DESC NULLS LAST
             LIMIT 20
            """,
            (biz, list(_ACTIVE_STAGE_KEYS)),
        )
        for r in cur.fetchall():
            days_idle = (today - r["last_touch_at"].date()).days if r.get("last_touch_at") else None
            base = _REASON_BASE["no_action_active_stage"]
            reason_code = "no_action_active_stage"
            if r.get("stage_key") == "proposal":
                base = _REASON_BASE["proposal_no_followup"]
                reason_code = "proposal_no_followup"
            score = _clamp(
                base
                + _amount_modifier(r.get("amount"))
                + _staleness_modifier(days_idle)
                + _pressure_modifier(r.get("execution_pressure"))
                + _snooze_modifier(r.get("snoozed_until"))
            )
            candidates.append({
                "id": f"move-noaction-{r['deal_id']}",
                "deal_id": str(r["deal_id"]),
                "account_name": r.get("account_name") or r.get("deal_name") or "Unknown",
                "amount": float(r["amount"]) if r.get("amount") is not None else None,
                "action": None,
                "action_type": None,
                "due": None,
                "priority_score": score,
                "reason_code": reason_code,
                "reason_text": _move_text(
                    reason_code,
                    r.get("account_name") or "Unknown",
                    {"stage": r.get("stage_key") or "active"},
                ),
            })

        # 3. high_value_idle — amount >= 100k AND last_touch_at older than 7 days
        cur.execute(
            """
            SELECT o.crm_opportunity_id AS deal_id,
                   o.name AS deal_name,
                   o.amount,
                   a.name AS account_name,
                   sl.last_touch_at,
                   ep.execution_pressure,
                   ep.snoozed_until
              FROM crm_opportunity o
              LEFT JOIN crm_account a ON a.crm_account_id = o.crm_account_id
              LEFT JOIN cro_strategic_lead sl ON sl.crm_account_id = o.crm_account_id
                                             AND sl.business_id = o.business_id
              LEFT JOIN cro_execution_profile ep ON ep.crm_opportunity_id = o.crm_opportunity_id
             WHERE o.business_id = %s::uuid
               AND o.status = 'open'
               AND COALESCE(o.amount, 0) >= 100000
               AND (sl.last_touch_at IS NULL OR sl.last_touch_at < %s)
             ORDER BY o.amount DESC NULLS LAST
             LIMIT 20
            """,
            (biz, datetime.now(timezone.utc) - timedelta(days=7)),
        )
        for r in cur.fetchall():
            days_idle = (today - r["last_touch_at"].date()).days if r.get("last_touch_at") else 30
            base = _REASON_BASE["high_value_idle"]
            score = _clamp(
                base
                + _amount_modifier(r.get("amount"))
                + _staleness_modifier(days_idle)
                + _pressure_modifier(r.get("execution_pressure"))
                + _snooze_modifier(r.get("snoozed_until"))
            )
            candidates.append({
                "id": f"move-idle-{r['deal_id']}",
                "deal_id": str(r["deal_id"]),
                "account_name": r.get("account_name") or r.get("deal_name") or "Unknown",
                "amount": float(r["amount"]) if r.get("amount") is not None else None,
                "action": None,
                "action_type": None,
                "due": None,
                "priority_score": score,
                "reason_code": "high_value_idle",
                "reason_text": _move_text(
                    "high_value_idle",
                    r.get("account_name") or "Unknown",
                    {"days_idle": days_idle, "amount": float(r["amount"]) if r.get("amount") else None},
                ),
            })

    # Dedup by deal_id — keep highest-scoring row per deal.
    by_deal: dict[str, dict[str, Any]] = {}
    for c in candidates:
        prev = by_deal.get(c["deal_id"])
        if prev is None or c["priority_score"] > prev["priority_score"]:
            by_deal[c["deal_id"]] = c
    ranked = sorted(by_deal.values(), key=lambda x: x["priority_score"], reverse=True)

    # No Action Hotlist behavior: if fewer than 3 rows surface missing-action
    # deals, guarantee the module still leads with the missing-action pain.
    no_action_rows = [r for r in ranked if r["reason_code"] in ("no_action_active_stage", "proposal_no_followup")]
    if len([r for r in ranked[:limit] if r["reason_code"] != "no_action_active_stage"]) < 3 and no_action_rows:
        # Interleave so at least half the slots are missing-action
        others = [r for r in ranked if r["reason_code"] not in ("no_action_active_stage", "proposal_no_followup")]
        slot_half = max(1, limit // 2)
        ranked = no_action_rows[:slot_half] + others[: limit - slot_half]

    return ranked[:limit]


# ── risks_summary ────────────────────────────────────────────────────────────

def risks_summary(*, env_id: str, business_id: UUID) -> dict[str, Any]:
    biz = str(business_id)
    with get_cursor() as cur:
        cur.execute(
            """
            WITH open_opps AS (
                SELECT o.crm_opportunity_id, o.amount, o.business_id, o.crm_account_id,
                       s.stage_key
                  FROM crm_opportunity o
                  LEFT JOIN crm_pipeline_stage s ON s.crm_pipeline_stage_id = o.crm_pipeline_stage_id
                 WHERE o.business_id = %s::uuid AND o.status = 'open'
            )
            SELECT
              (SELECT COUNT(*) FROM open_opps o
                WHERE NOT EXISTS (SELECT 1 FROM cro_next_action na
                                  WHERE na.entity_type = 'opportunity'
                                    AND na.entity_id = o.crm_opportunity_id
                                    AND na.status IN ('pending','in_progress'))
              ) AS no_next_action,
              (SELECT COUNT(*) FROM open_opps o
                WHERE o.stage_key IN ('contacted','outreach','identified')
              ) AS stuck_in_outreach,
              (SELECT COUNT(*) FROM open_opps o
                WHERE o.stage_key = 'proposal'
                  AND NOT EXISTS (SELECT 1 FROM cro_next_action na
                                  WHERE na.entity_type = 'opportunity'
                                    AND na.entity_id = o.crm_opportunity_id
                                    AND na.status IN ('pending','in_progress'))
              ) AS in_proposal_no_followup,
              (SELECT COUNT(*) FROM open_opps o
                 LEFT JOIN cro_strategic_lead sl ON sl.crm_account_id = o.crm_account_id
                                                AND sl.business_id = o.business_id
                WHERE sl.last_touch_at IS NULL OR sl.last_touch_at < %s
              ) AS idle_gt_7d,
              (SELECT COUNT(*) FROM cro_execution_profile ep
                 JOIN open_opps o ON o.crm_opportunity_id = ep.crm_opportunity_id
                WHERE ep.deal_drift_status = 'drifting'
              ) AS drifting,
              (SELECT COUNT(*) FROM cro_execution_profile ep
                 JOIN open_opps o ON o.crm_opportunity_id = ep.crm_opportunity_id
                WHERE ep.deal_drift_status = 'at_risk'
              ) AS at_risk
            """,
            (biz, datetime.now(timezone.utc) - timedelta(days=7)),
        )
        counts_row = cur.fetchone() or {}

        cur.execute(
            """
            SELECT o.crm_opportunity_id AS deal_id,
                   a.name AS account_name,
                   o.amount,
                   s.stage_key AS stage,
                   EXTRACT(EPOCH FROM (now() - sl.last_touch_at)) / 86400 AS days_idle
              FROM crm_opportunity o
              LEFT JOIN crm_account a ON a.crm_account_id = o.crm_account_id
              LEFT JOIN crm_pipeline_stage s ON s.crm_pipeline_stage_id = o.crm_pipeline_stage_id
              LEFT JOIN cro_strategic_lead sl ON sl.crm_account_id = o.crm_account_id
                                             AND sl.business_id = o.business_id
             WHERE o.business_id = %s::uuid
               AND o.status = 'open'
               AND s.stage_key IN ('engaged','meeting','qualified','proposal')
               AND NOT EXISTS (SELECT 1 FROM cro_next_action na
                               WHERE na.entity_type = 'opportunity'
                                 AND na.entity_id = o.crm_opportunity_id
                                 AND na.status IN ('pending','in_progress'))
             ORDER BY o.amount DESC NULLS LAST, sl.last_touch_at ASC NULLS FIRST
             LIMIT 5
            """,
            (biz,),
        )
        hotlist = []
        for r in cur.fetchall():
            days_idle = int(r["days_idle"]) if r.get("days_idle") is not None else None
            hotlist.append({
                "deal_id": str(r["deal_id"]),
                "account_name": r.get("account_name") or "Unknown",
                "amount": float(r["amount"]) if r.get("amount") is not None else None,
                "stage": r.get("stage") or "—",
                "days_since_last_touch": days_idle,
            })

    return {
        "counts": {
            "no_next_action": int(counts_row.get("no_next_action") or 0),
            "stuck_in_outreach": int(counts_row.get("stuck_in_outreach") or 0),
            "in_proposal_no_followup": int(counts_row.get("in_proposal_no_followup") or 0),
            "idle_gt_7d": int(counts_row.get("idle_gt_7d") or 0),
            "drifting": int(counts_row.get("drifting") or 0),
            "at_risk": int(counts_row.get("at_risk") or 0),
        },
        "stage_conversion_weak": [],
        "no_action_hotlist": hotlist,
    }


# ── recent_activity ──────────────────────────────────────────────────────────

def recent_activity(*, env_id: str, business_id: UUID, limit: int = 20) -> list[dict[str, Any]]:
    """Return a whitelisted, per-kind-capped feed of operator-relevant events."""
    biz = str(business_id)
    per_kind = max(1, limit // 3)
    rows: list[dict[str, Any]] = []

    with get_cursor() as cur:
        # stage_advanced + closed_won/closed_lost (from stage history)
        cur.execute(
            """
            SELECT sh.changed_at AS ts,
                   sh.crm_opportunity_id AS deal_id,
                   a.name AS account_name,
                   new_stage.stage_key AS new_stage_key,
                   old_stage.stage_key AS old_stage_key
              FROM crm_opportunity_stage_history sh
              JOIN crm_opportunity o ON o.crm_opportunity_id = sh.crm_opportunity_id
              LEFT JOIN crm_account a ON a.crm_account_id = o.crm_account_id
              LEFT JOIN crm_pipeline_stage new_stage ON new_stage.crm_pipeline_stage_id = sh.to_stage_id
              LEFT JOIN crm_pipeline_stage old_stage ON old_stage.crm_pipeline_stage_id = sh.from_stage_id
             WHERE o.business_id = %s::uuid
             ORDER BY sh.changed_at DESC
             LIMIT %s
            """,
            (biz, per_kind * 2),
        )
        for r in cur.fetchall():
            stage = r.get("new_stage_key") or ""
            kind = "closed_won" if stage == "closed_won" else "closed_lost" if stage == "closed_lost" else "stage_advanced"
            desc = (
                f"Moved to {stage}"
                if kind == "stage_advanced"
                else "Deal won"
                if kind == "closed_won"
                else "Deal lost"
            )
            rows.append({
                "ts": r["ts"].isoformat() if r.get("ts") else None,
                "kind": kind,
                "deal_id": str(r["deal_id"]),
                "account_name": r.get("account_name") or "Unknown",
                "description": f"{desc} · {r.get('account_name') or ''}".strip(" ·"),
            })

        # outreach_sent + reply_received + meeting_booked
        cur.execute(
            """
            SELECT ol.sent_at, ol.replied_at, ol.meeting_booked, ol.channel,
                   ol.crm_account_id AS deal_id,
                   a.name AS account_name
              FROM cro_outreach_log ol
              LEFT JOIN crm_account a ON a.crm_account_id = ol.crm_account_id
             WHERE ol.business_id = %s::uuid
             ORDER BY GREATEST(COALESCE(ol.replied_at, ol.sent_at), ol.sent_at) DESC
             LIMIT %s
            """,
            (biz, per_kind * 2),
        )
        for r in cur.fetchall():
            acct = r.get("account_name") or "Unknown"
            if r.get("sent_at"):
                rows.append({
                    "ts": r["sent_at"].isoformat(),
                    "kind": "outreach_sent",
                    "deal_id": str(r["deal_id"]) if r.get("deal_id") else None,
                    "account_name": acct,
                    "description": f"Outreach sent via {r.get('channel')} to {acct}",
                })
            if r.get("replied_at"):
                rows.append({
                    "ts": r["replied_at"].isoformat(),
                    "kind": "reply_received",
                    "deal_id": str(r["deal_id"]) if r.get("deal_id") else None,
                    "account_name": acct,
                    "description": f"Reply received from {acct}",
                })
            if r.get("meeting_booked") and r.get("sent_at"):
                rows.append({
                    "ts": r["sent_at"].isoformat(),
                    "kind": "meeting_booked",
                    "deal_id": str(r["deal_id"]) if r.get("deal_id") else None,
                    "account_name": acct,
                    "description": f"Meeting booked with {acct}",
                })

        # next_action_completed + high-signal creates
        cur.execute(
            """
            SELECT na.completed_at AS ts, na.entity_id AS deal_id, na.description,
                   a.name AS account_name
              FROM cro_next_action na
              LEFT JOIN crm_opportunity o ON o.crm_opportunity_id = na.entity_id
              LEFT JOIN crm_account a ON a.crm_account_id = o.crm_account_id
             WHERE na.business_id = %s::uuid
               AND na.status = 'completed'
               AND na.completed_at IS NOT NULL
             ORDER BY na.completed_at DESC
             LIMIT %s
            """,
            (biz, per_kind),
        )
        for r in cur.fetchall():
            rows.append({
                "ts": r["ts"].isoformat() if r.get("ts") else None,
                "kind": "next_action_completed",
                "deal_id": str(r["deal_id"]) if r.get("deal_id") else None,
                "account_name": r.get("account_name") or "Unknown",
                "description": f"Completed: {r.get('description') or 'action'}",
            })

        cur.execute(
            """
            SELECT na.created_at AS ts, na.entity_id AS deal_id, na.description,
                   a.name AS account_name
              FROM cro_next_action na
              LEFT JOIN crm_opportunity o ON o.crm_opportunity_id = na.entity_id
              LEFT JOIN crm_account a ON a.crm_account_id = o.crm_account_id
             WHERE na.business_id = %s::uuid
               AND na.priority IN ('high','urgent')
             ORDER BY na.created_at DESC
             LIMIT %s
            """,
            (biz, per_kind),
        )
        for r in cur.fetchall():
            rows.append({
                "ts": r["ts"].isoformat() if r.get("ts") else None,
                "kind": "next_action_created",
                "deal_id": str(r["deal_id"]) if r.get("deal_id") else None,
                "account_name": r.get("account_name") or "Unknown",
                "description": f"New action: {r.get('description') or ''}",
            })

    # Sort newest first, drop rows without ts, limit
    rows = [r for r in rows if r.get("ts")]
    rows.sort(key=lambda r: r["ts"], reverse=True)
    return rows[:limit]


# ── recent_closes ────────────────────────────────────────────────────────────

def recent_closes(*, env_id: str, business_id: UUID, limit: int = 10) -> dict[str, Any]:
    biz = str(business_id)
    cutoff = date.today() - timedelta(days=30)
    wins: list[dict[str, Any]] = []
    losses: list[dict[str, Any]] = []
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT o.crm_opportunity_id AS deal_id,
                   o.name AS deal_name,
                   o.amount,
                   o.status,
                   o.actual_close_date,
                   a.name AS account_name,
                   o.payload_json
              FROM crm_opportunity o
              LEFT JOIN crm_account a ON a.crm_account_id = o.crm_account_id
             WHERE o.business_id = %s::uuid
               AND o.status IN ('won','lost')
               AND (o.actual_close_date IS NULL OR o.actual_close_date >= %s)
             ORDER BY o.actual_close_date DESC NULLS LAST
             LIMIT %s
            """,
            (biz, cutoff, limit * 2),
        )
        for r in cur.fetchall():
            payload = r.get("payload_json") or {}
            loss_reason = payload.get("loss_reason") if isinstance(payload, dict) else None
            entry = {
                "deal_id": str(r["deal_id"]),
                "account_name": r.get("account_name") or r.get("deal_name") or "Unknown",
                "amount": float(r["amount"]) if r.get("amount") is not None else None,
                "closed_at": r["actual_close_date"].isoformat() if r.get("actual_close_date") else None,
                "loss_reason": loss_reason,
            }
            if r["status"] == "won":
                wins.append(entry)
            else:
                losses.append(entry)

    wins = wins[:5]
    losses = losses[:5]
    return {
        "wins": wins,
        "losses": losses,
        "win_total": sum(w.get("amount") or 0 for w in wins),
        "loss_total": sum(loss.get("amount") or 0 for loss in losses),
    }


# ── outreach_brief ───────────────────────────────────────────────────────────

def outreach_brief(*, env_id: str, business_id: UUID) -> dict[str, Any]:
    """Returns the 5 structural rows for the Outreach Engine rail module."""
    biz = str(business_id)
    today = date.today()
    week_ago = datetime.now(timezone.utc) - timedelta(days=7)
    month_ago = datetime.now(timezone.utc) - timedelta(days=30)
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT COUNT(*) AS n FROM cro_next_action
             WHERE business_id = %s::uuid
               AND status IN ('pending','in_progress')
               AND action_type IN ('follow_up','email','call')
               AND due_date = %s
            """,
            (biz, today),
        )
        followups = int((cur.fetchone() or {}).get("n") or 0)

        cur.execute(
            """
            SELECT COUNT(*) AS n
              FROM crm_opportunity o
              LEFT JOIN crm_pipeline_stage s ON s.crm_pipeline_stage_id = o.crm_pipeline_stage_id
              LEFT JOIN cro_strategic_lead sl ON sl.crm_account_id = o.crm_account_id
                                             AND sl.business_id = o.business_id
             WHERE o.business_id = %s::uuid
               AND o.status = 'open'
               AND s.stage_key IN ('contacted','outreach','identified')
               AND (sl.last_touch_at IS NULL OR sl.last_touch_at < %s)
            """,
            (biz, week_ago),
        )
        no_touch = int((cur.fetchone() or {}).get("n") or 0)

        cur.execute(
            """
            SELECT COUNT(*) AS sent,
                   COUNT(*) FILTER (WHERE replied_at IS NOT NULL) AS replied
              FROM cro_outreach_log
             WHERE business_id = %s::uuid
               AND sent_at >= %s
            """,
            (biz, week_ago),
        )
        row = cur.fetchone() or {}
        touches_week = int(row.get("sent") or 0)
        replies_week = int(row.get("replied") or 0)

        # Top vertical by response rate, min 5 sends in 30d
        cur.execute(
            """
            SELECT COALESCE(a.industry, 'Other') AS vertical,
                   COUNT(*) AS sent,
                   COUNT(*) FILTER (WHERE ol.replied_at IS NOT NULL) AS replied
              FROM cro_outreach_log ol
              LEFT JOIN crm_account a ON a.crm_account_id = ol.crm_account_id
             WHERE ol.business_id = %s::uuid
               AND ol.sent_at >= %s
             GROUP BY vertical
             HAVING COUNT(*) >= 5
             ORDER BY (COUNT(*) FILTER (WHERE ol.replied_at IS NOT NULL))::float / COUNT(*) DESC
             LIMIT 1
            """,
            (biz, month_ago),
        )
        v_row = cur.fetchone()
        top_vertical = "—"
        if v_row and v_row.get("sent"):
            rate = (v_row.get("replied") or 0) / v_row["sent"] * 100
            top_vertical = f"{v_row['vertical']} ({rate:.0f}%)"

    return {
        "followups_due_today": followups,
        "no_touch_in_outreach": no_touch,
        "touches_this_week": touches_week,
        "replies_this_week": replies_week,
        "top_vertical_by_response": top_vertical,
    }
