"""Novendor Outreach Engine.

Single source of truth for:
- 8-signal outreach readiness scoring
- Account brief assembly
- Daily outreach brief generation

Both the HTTP /daily-brief route and all MCP novendor.* tools import from here.
There is no second implementation of ranking or readiness logic.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from uuid import UUID

from app.db import get_cursor
from app.services import cro_metrics_engine, cro_objections, cro_proof_assets

# ── Constants ────────────────────────────────────────────────────────────────

ACTIVE_STATUSES = (
    "Identified",
    "Hypothesis Built",
    "Outreach Drafted",
    "Sent",
    "Engaged",
    "Diagnostic Scheduled",
    "Deliverable Sent",
)

# Required proof asset types — if any are not 'ready', they block outreach
REQUIRED_PROOF_ASSET_TYPES = [
    "diagnostic_questionnaire",
    "offer_sheet_one_page",
    "workflow_example",
    "case_study",
    "linkedin_sequence",
]

REQUIRED_PROOF_ASSET_LABELS = {
    "diagnostic_questionnaire": "AI Diagnostic Questionnaire",
    "offer_sheet_one_page": "One-Page Offer Sheet",
    "workflow_example": "Workflow Example",
    "case_study": "Case Study / Pilot Summary",
    "linkedin_sequence": "LinkedIn Sequence Template",
}

# Scoring weight: composite_priority_score 0-100 (0.5) + readiness 0-8 scaled to 0-50 (0.5)
def _combined_rank(composite: int, readiness: int) -> float:
    return composite * 0.5 + (readiness / 8) * 50


# ── Readiness Scoring ────────────────────────────────────────────────────────

def compute_readiness(
    cur,
    env_id: str,
    business_id: UUID,
    lead_profile_id: UUID,
    crm_account_id: UUID,
) -> dict:
    """Score 8 binary outreach readiness signals for a single account.

    Returns:
        {
          "score": int,               # 0-8
          "signals": dict[str, bool],
          "missing": list[str],       # signal keys that are False, priority order
          "filter_bucket": str,       # ready_now | followup_due | replied_awaiting | needs_asset | needs_research
        }
    """
    # ── Contact signals ──────────────────────────────────────────────────────
    cur.execute(
        """
        SELECT name, title, email, linkedin_url
          FROM cro_strategic_contact
         WHERE lead_profile_id = %s
         LIMIT 1
        """,
        (str(lead_profile_id),),
    )
    contact = cur.fetchone()

    named_contact   = bool(contact and contact["name"])
    titled_contact  = bool(contact and contact["title"])
    channel_avail   = bool(contact and (contact["email"] or contact["linkedin_url"]))

    # ── Warm intro path signal ────────────────────────────────────────────────
    cur.execute(
        """
        SELECT 1 FROM cro_trigger_signal
         WHERE lead_profile_id = %s
           AND trigger_type IN ('CFO_Hire', 'PE_Acquisition', 'AI_Initiative')
         LIMIT 1
        """,
        (str(lead_profile_id),),
    )
    warm_intro = cur.fetchone() is not None

    # ── Hypothesis signals ────────────────────────────────────────────────────
    cur.execute(
        """
        SELECT primary_wedge_angle, top_2_capabilities
          FROM cro_lead_hypothesis
         WHERE lead_profile_id = %s
         LIMIT 1
        """,
        (str(lead_profile_id),),
    )
    hyp = cur.fetchone()

    pain_thesis    = bool(hyp and hyp["primary_wedge_angle"])
    matched_offer  = bool(hyp and hyp["top_2_capabilities"] and len(hyp["top_2_capabilities"]) > 0)

    # ── Proof asset signal ────────────────────────────────────────────────────
    cur.execute(
        """
        SELECT 1 FROM cro_proof_asset
         WHERE env_id = %s AND business_id = %s AND status = 'ready'
         LIMIT 1
        """,
        (env_id, str(business_id)),
    )
    proof_asset = cur.fetchone() is not None

    # ── Next step signal ──────────────────────────────────────────────────────
    cutoff = date.today() + timedelta(days=7)
    cur.execute(
        """
        SELECT due_date FROM cro_next_action
         WHERE env_id = %s AND business_id = %s
           AND entity_id = %s
           AND status = 'pending'
           AND due_date <= %s
         ORDER BY due_date ASC
         LIMIT 1
        """,
        (env_id, str(business_id), str(crm_account_id), cutoff),
    )
    next_action_row = cur.fetchone()
    next_step_defined = next_action_row is not None

    # ── Assemble signals ──────────────────────────────────────────────────────
    signals = {
        "named_contact":    named_contact,
        "titled_contact":   titled_contact,
        "channel_available": channel_avail,
        "warm_intro_path":  warm_intro,
        "pain_thesis":      pain_thesis,
        "matched_offer":    matched_offer,
        "proof_asset":      proof_asset,
        "next_step_defined": next_step_defined,
    }

    # Missing signals in remediation-priority order
    PRIORITY_ORDER = [
        "named_contact",
        "titled_contact",
        "channel_available",
        "pain_thesis",
        "matched_offer",
        "proof_asset",
        "next_step_defined",
        "warm_intro_path",
    ]
    missing = [k for k in PRIORITY_ORDER if not signals[k]]
    score = sum(1 for v in signals.values() if v)

    # ── Filter bucket ─────────────────────────────────────────────────────────
    # Check if last outreach was replied but no meeting booked
    cur.execute(
        """
        SELECT replied_at, meeting_booked
          FROM cro_outreach_log
         WHERE env_id = %s AND business_id = %s AND crm_account_id = %s
           AND sent_at IS NOT NULL
         ORDER BY sent_at DESC
         LIMIT 1
        """,
        (env_id, str(business_id), str(crm_account_id)),
    )
    last_touch = cur.fetchone()

    overdue_action = False
    if next_action_row:
        overdue_action = next_action_row["due_date"] < date.today()

    if score >= 6 and next_step_defined and not overdue_action:
        bucket = "ready_now"
    elif overdue_action:
        bucket = "followup_due"
    elif last_touch and last_touch["replied_at"] and not last_touch["meeting_booked"]:
        bucket = "replied_awaiting"
    elif score == 7 and not proof_asset:
        bucket = "needs_asset"
    else:
        bucket = "needs_research"

    return {
        "score": score,
        "signals": signals,
        "missing": missing,
        "filter_bucket": bucket,
    }


# ── Account Brief Assembly ────────────────────────────────────────────────────

def get_account_brief(
    cur,
    env_id: str,
    business_id: UUID,
    crm_account_id: UUID,
) -> dict | None:
    """Full outreach brief for a single account.

    Returns None if the account has no strategic lead record.
    """
    # Core lead record
    cur.execute(
        """
        SELECT sl.id AS strategic_lead_id,
               sl.lead_profile_id,
               sl.status,
               sl.composite_priority_score,
               sl.employee_range,
               sl.multi_entity_flag,
               sl.pe_backed_flag,
               a.name AS company_name,
               a.industry,
               a.website_url
          FROM cro_strategic_lead sl
          JOIN cro_lead_profile lp ON lp.id = sl.lead_profile_id
          JOIN crm_account a ON a.crm_account_id = sl.crm_account_id
         WHERE sl.crm_account_id = %s
           AND sl.env_id = %s AND sl.business_id = %s
         LIMIT 1
        """,
        (str(crm_account_id), env_id, str(business_id)),
    )
    lead = cur.fetchone()
    if not lead:
        return None

    lead_profile_id = lead["lead_profile_id"]

    # Contact
    cur.execute(
        """
        SELECT id, name, title, email, linkedin_url, buyer_type, authority_level
          FROM cro_strategic_contact
         WHERE lead_profile_id = %s
         ORDER BY created_at ASC
        """,
        (str(lead_profile_id),),
    )
    contacts = [dict(r) for r in cur.fetchall()]

    # Hypothesis
    cur.execute(
        """
        SELECT primary_wedge_angle, top_2_capabilities,
               ai_roi_leakage_notes, erp_integration_risk_notes,
               reconciliation_fragility_notes, governance_gap_notes,
               vendor_fatigue_exposure
          FROM cro_lead_hypothesis
         WHERE lead_profile_id = %s
         LIMIT 1
        """,
        (str(lead_profile_id),),
    )
    hyp = cur.fetchone()

    # Most recent trigger signal
    cur.execute(
        """
        SELECT id, trigger_type, summary, source_url, detected_at
          FROM cro_trigger_signal
         WHERE lead_profile_id = %s
         ORDER BY detected_at DESC
         LIMIT 5
        """,
        (str(lead_profile_id),),
    )
    triggers = [dict(r) for r in cur.fetchall()]

    # Outreach sequences
    cur.execute(
        """
        SELECT id, sequence_stage, draft_message, approved_message,
               sent_timestamp, response_status, followup_due_date
          FROM cro_outreach_sequence
         WHERE lead_profile_id = %s
         ORDER BY sequence_stage ASC
        """,
        (str(lead_profile_id),),
    )
    sequences = [dict(r) for r in cur.fetchall()]

    # Next action
    cur.execute(
        """
        SELECT id, action_type, description, due_date, status, priority
          FROM cro_next_action
         WHERE env_id = %s AND business_id = %s
           AND entity_id = %s AND status = 'pending'
         ORDER BY due_date ASC
         LIMIT 1
        """,
        (env_id, str(business_id), str(crm_account_id)),
    )
    next_action = cur.fetchone()

    # Readiness
    readiness = compute_readiness(
        cur, env_id, business_id, lead_profile_id, crm_account_id
    )

    return {
        "crm_account_id": str(crm_account_id),
        "strategic_lead_id": str(lead["strategic_lead_id"]),
        "lead_profile_id": str(lead_profile_id),
        "company_name": lead["company_name"],
        "industry": lead["industry"],
        "website_url": lead["website_url"],
        "status": lead["status"],
        "composite_priority_score": lead["composite_priority_score"],
        "employee_range": lead["employee_range"],
        "multi_entity_flag": lead["multi_entity_flag"],
        "pe_backed_flag": lead["pe_backed_flag"],
        "contacts": contacts,
        "hypothesis": dict(hyp) if hyp else None,
        "triggers": triggers,
        "sequences": sequences,
        "next_action": dict(next_action) if next_action else None,
        "readiness": readiness,
    }


# ── Best Shot Row Builder ─────────────────────────────────────────────────────

def _build_best_shot(
    cur,
    env_id: str,
    business_id: UUID,
    lead_profile_id: UUID,
    crm_account_id: UUID,
    company_name: str,
    industry: str | None,
    composite_priority_score: int,
    hypothesis_row,
    contact_row,
    trigger_row,
) -> dict:
    readiness = compute_readiness(cur, env_id, business_id, lead_profile_id, crm_account_id)

    # Determine recommended channel
    if contact_row and contact_row.get("email"):
        recommended_channel = "email"
    elif contact_row and contact_row.get("linkedin_url"):
        recommended_channel = "linkedin"
    else:
        recommended_channel = "research_needed"

    # Determine CTA from sequence state
    cur.execute(
        """
        SELECT sequence_stage, response_status, approved_message, draft_message
          FROM cro_outreach_sequence
         WHERE lead_profile_id = %s
         ORDER BY sequence_stage ASC
         LIMIT 1
        """,
        (str(lead_profile_id),),
    )
    seq = cur.fetchone()

    if not seq:
        cta = "Draft Stage 1 outreach"
    elif seq["response_status"] == "pending" and seq["draft_message"] and not seq["approved_message"]:
        cta = f"Review & approve Stage {seq['sequence_stage']} draft"
    elif seq["response_status"] == "approved":
        cta = f"Send Stage {seq['sequence_stage']} {recommended_channel}"
    elif seq["response_status"] == "sent":
        cta = "Log reply / schedule follow-up"
    elif seq["response_status"] in ("engaged", "no_response"):
        cta = "Send Stage 2 follow-up"
    else:
        cta = "Review account"

    return {
        "crm_account_id": str(crm_account_id),
        "company_name": company_name,
        "contact_name": contact_row["name"] if contact_row else None,
        "contact_title": contact_row["title"] if contact_row else None,
        "vertical": industry,
        "matched_offer": (
            hypothesis_row["top_2_capabilities"][0] if hypothesis_row and hypothesis_row["top_2_capabilities"] else None
        ),
        "why_now_trigger": trigger_row["summary"] if trigger_row else None,
        "recommended_channel": recommended_channel,
        "cta": cta,
        "readiness_score": readiness["score"],
        "readiness_signals": readiness["signals"],
        "missing_signals": readiness["missing"],
        "composite_priority_score": composite_priority_score,
        "rank_score": _combined_rank(composite_priority_score, readiness["score"]),
    }


# ── Daily Brief ───────────────────────────────────────────────────────────────

def build_daily_brief(env_id: str, business_id: UUID) -> dict:
    """Assemble the complete daily outreach brief.

    Called by both the HTTP /daily-brief route and MCP tools.
    """
    with get_cursor() as cur:
        # ── Fetch all active leads ────────────────────────────────────────────
        cur.execute(
            """
            SELECT sl.id AS strategic_lead_id,
                   sl.lead_profile_id,
                   sl.crm_account_id,
                   sl.status,
                   sl.composite_priority_score,
                   sl.employee_range,
                   a.name AS company_name,
                   a.industry
              FROM cro_strategic_lead sl
              JOIN cro_lead_profile lp ON lp.id = sl.lead_profile_id
              JOIN crm_account a ON a.crm_account_id = sl.crm_account_id
             WHERE sl.env_id = %s AND sl.business_id = %s
               AND sl.status = ANY(%s)
             ORDER BY sl.composite_priority_score DESC
            """,
            (env_id, str(business_id), list(ACTIVE_STATUSES)),
        )
        leads = [dict(r) for r in cur.fetchall()]

        if not leads:
            return _empty_brief(env_id, business_id)

        # ── Pre-fetch hypothesis, contact, trigger for all leads (N+1 guard) ──
        lead_profile_ids = [str(l["lead_profile_id"]) for l in leads]
        crm_account_ids  = [str(l["crm_account_id"]) for l in leads]

        cur.execute(
            "SELECT lead_profile_id, primary_wedge_angle, top_2_capabilities "
            "FROM cro_lead_hypothesis WHERE lead_profile_id = ANY(%s)",
            (lead_profile_ids,),
        )
        hyp_map: dict[str, dict] = {str(r["lead_profile_id"]): dict(r) for r in cur.fetchall()}

        cur.execute(
            "SELECT lead_profile_id, name, title, email, linkedin_url "
            "FROM cro_strategic_contact WHERE lead_profile_id = ANY(%s) "
            "ORDER BY created_at ASC",
            (lead_profile_ids,),
        )
        # Keep first contact per lead
        contact_map: dict[str, dict] = {}
        for r in cur.fetchall():
            key = str(r["lead_profile_id"])
            if key not in contact_map:
                contact_map[key] = dict(r)

        cur.execute(
            "SELECT DISTINCT ON (lead_profile_id) lead_profile_id, trigger_type, summary, detected_at "
            "FROM cro_trigger_signal WHERE lead_profile_id = ANY(%s) "
            "ORDER BY lead_profile_id, detected_at DESC",
            (lead_profile_ids,),
        )
        trigger_map: dict[str, dict] = {str(r["lead_profile_id"]): dict(r) for r in cur.fetchall()}

        # ── Score and rank ────────────────────────────────────────────────────
        scored: list[dict] = []
        blocking_buckets: dict[str, list[dict]] = {
            "missing_contact":    [],
            "missing_channel":    [],
            "missing_pain_thesis":[],
            "missing_matched_offer": [],
            "missing_proof_asset":[],
            "no_followup_scheduled": [],
        }

        for lead in leads:
            lpid = str(lead["lead_profile_id"])
            acct_id = lead["crm_account_id"]

            hyp     = hyp_map.get(lpid)
            contact = contact_map.get(lpid)
            trigger = trigger_map.get(lpid)

            shot = _build_best_shot(
                cur,
                env_id,
                business_id,
                lead["lead_profile_id"],
                acct_id,
                lead["company_name"],
                lead.get("industry"),
                lead["composite_priority_score"],
                hyp,
                contact,
                trigger,
            )
            scored.append(shot)

            # Blocking bucket aggregation
            item = {"crm_account_id": str(acct_id), "company_name": lead["company_name"]}
            missing = shot["missing_signals"]
            if "named_contact" in missing or "titled_contact" in missing:
                blocking_buckets["missing_contact"].append(item)
            if "channel_available" in missing:
                blocking_buckets["missing_channel"].append(item)
            if "pain_thesis" in missing:
                blocking_buckets["missing_pain_thesis"].append(item)
            if "matched_offer" in missing:
                blocking_buckets["missing_matched_offer"].append(item)
            if "proof_asset" in missing:
                blocking_buckets["missing_proof_asset"].append(item)
            if "next_step_defined" in missing:
                blocking_buckets["no_followup_scheduled"].append(item)

        # Sort by combined rank score
        scored.sort(key=lambda x: x["rank_score"], reverse=True)
        best_shots = scored[:3]

        # ── Message queue ─────────────────────────────────────────────────────
        cur.execute(
            """
            SELECT os.id AS outreach_sequence_id,
                   os.lead_profile_id,
                   os.sequence_stage,
                   os.draft_message,
                   os.approved_message,
                   os.response_status,
                   os.followup_due_date,
                   a.name AS company_name,
                   sc.name AS contact_name,
                   sc.email,
                   sc.linkedin_url
              FROM cro_outreach_sequence os
              JOIN cro_strategic_lead sl ON sl.lead_profile_id = os.lead_profile_id
              JOIN crm_account a ON a.crm_account_id = sl.crm_account_id
              LEFT JOIN cro_strategic_contact sc ON sc.lead_profile_id = os.lead_profile_id
             WHERE os.env_id = %s AND os.business_id = %s
               AND os.response_status IN ('pending', 'approved')
               AND (os.draft_message IS NOT NULL OR os.approved_message IS NOT NULL)
             ORDER BY sl.composite_priority_score DESC, os.sequence_stage ASC
             LIMIT 10
            """,
            (env_id, str(business_id)),
        )
        queue_rows = cur.fetchall()
        message_queue = []
        for row in queue_rows:
            msg = row["approved_message"] or row["draft_message"] or ""
            channel = "email" if row.get("email") else "linkedin"
            message_queue.append({
                "crm_account_id": None,  # not directly on sequence; resolved via lead_profile_id above
                "lead_profile_id": str(row["lead_profile_id"]),
                "outreach_sequence_id": str(row["outreach_sequence_id"]),
                "company_name": row["company_name"],
                "contact_name": row["contact_name"],
                "channel": channel,
                "sequence_stage": row["sequence_stage"],
                "draft_preview": msg[:120] if msg else "",
                "proof_asset_attached": False,  # extended by attach_proof_asset_to_account
                "send_ready": row["response_status"] == "approved",
                "followup_due_date": str(row["followup_due_date"]) if row["followup_due_date"] else None,
            })

        # ── Objection radar ───────────────────────────────────────────────────
        objections_raw = cro_objections.list_objections(
            env_id=env_id,
            business_id=business_id,
            outcome_filter=None,
        )
        objection_radar = [
            {
                "id": str(o["id"]),
                "objection_type": o["objection_type"],
                "summary": o["summary"],
                "response_strategy": o.get("response_strategy"),
                "confidence": o.get("confidence"),
                "outcome": o.get("outcome"),
            }
            for o in objections_raw[:8]
        ]

        # ── Proof readiness ───────────────────────────────────────────────────
        existing_assets = cro_proof_assets.list_proof_assets(
            env_id=env_id,
            business_id=business_id,
        )
        asset_by_type = {a["asset_type"]: a for a in existing_assets}
        proof_readiness = []
        for asset_type in REQUIRED_PROOF_ASSET_TYPES:
            asset = asset_by_type.get(asset_type)
            status = asset["status"] if asset else "missing"
            label  = REQUIRED_PROOF_ASSET_LABELS.get(asset_type, asset_type)
            action = {
                "ready":        None,
                "draft":        "Finalize",
                "needs_update": "Review",
                "missing":      "Create",
            }.get(status, "Review")
            proof_readiness.append({
                "asset_type":           asset_type,
                "title":                asset["title"] if asset else label,
                "status":               status,
                "action_label":         action,
                "linked_offer_type":    asset["linked_offer_type"] if asset else None,
                "required_for_outreach": True,
            })

        # ── Weekly strip ──────────────────────────────────────────────────────
        outreach_stats = cro_metrics_engine.compute_outreach_30d(
            cur, env_id, business_id
        )

        # Count proposals sent (last 7 days)
        week_start = date.today() - timedelta(days=date.today().weekday())
        cur.execute(
            """
            SELECT COUNT(*) AS proposals_sent
              FROM cro_proposal
             WHERE env_id = %s AND business_id = %s
               AND sent_at >= %s
            """,
            (env_id, str(business_id), week_start),
        )
        proposal_row = cur.fetchone()
        proposals_this_week = proposal_row["proposals_sent"] if proposal_row else 0

        # Weekly sent / replied (current week)
        cur.execute(
            """
            SELECT
                COUNT(*) FILTER (WHERE direction = 'outbound') AS sent,
                COUNT(*) FILTER (WHERE replied_at IS NOT NULL) AS replies,
                COUNT(*) FILTER (WHERE meeting_booked = true) AS meetings
              FROM cro_outreach_log
             WHERE env_id = %s AND business_id = %s
               AND sent_at >= %s
            """,
            (env_id, str(business_id), week_start),
        )
        week_row = cur.fetchone()
        weekly_sent    = week_row["sent"]     if week_row else 0
        weekly_replies = week_row["replies"]  if week_row else 0
        weekly_meetings= week_row["meetings"] if week_row else 0
        reply_rate     = (
            round(weekly_replies / weekly_sent * 100, 1)
            if weekly_sent > 0 else None
        )

        weekly_strip = {
            "week_start":       str(week_start),
            "touches_target":   15,
            "sent":             weekly_sent,
            "replies":          weekly_replies,
            "meetings_booked":  weekly_meetings,
            "proposals_sent":   proposals_this_week,
            "reply_rate_pct":   reply_rate,
        }

        # ── Blocking issues summary ───────────────────────────────────────────
        blocking_issues = {
            "missing_contact":       len(blocking_buckets["missing_contact"]),
            "missing_channel":       len(blocking_buckets["missing_channel"]),
            "missing_pain_thesis":   len(blocking_buckets["missing_pain_thesis"]),
            "missing_matched_offer": len(blocking_buckets["missing_matched_offer"]),
            "missing_proof_asset":   len(blocking_buckets["missing_proof_asset"]),
            "no_followup_scheduled": len(blocking_buckets["no_followup_scheduled"]),
            "total_blocked":         sum(
                1 for s in scored if s["readiness_score"] < 6
            ),
            "by_bucket": blocking_buckets,
        }

    return {
        "generated_at":   datetime.now(tz=timezone.utc).isoformat(),
        "env_id":         env_id,
        "business_id":    str(business_id),
        "best_shots":     best_shots,
        "blocking_issues": blocking_issues,
        "message_queue":  message_queue,
        "objection_radar": objection_radar,
        "proof_readiness": proof_readiness,
        "weekly_strip":   weekly_strip,
        "total_active_leads": len(leads),
        "ready_now_count": sum(1 for s in scored if s["filter_bucket"] == "ready_now"),
    }


def _empty_brief(env_id: str, business_id: UUID) -> dict:
    """Return a valid empty brief when no strategic leads exist."""
    week_start = date.today() - timedelta(days=date.today().weekday())
    return {
        "generated_at":   datetime.now(tz=timezone.utc).isoformat(),
        "env_id":         env_id,
        "business_id":    str(business_id),
        "best_shots":     [],
        "blocking_issues": {
            "missing_contact": 0, "missing_channel": 0,
            "missing_pain_thesis": 0, "missing_matched_offer": 0,
            "missing_proof_asset": 0, "no_followup_scheduled": 0,
            "total_blocked": 0, "by_bucket": {},
        },
        "message_queue":  [],
        "objection_radar": [],
        "proof_readiness": [
            {
                "asset_type": t, "title": REQUIRED_PROOF_ASSET_LABELS[t],
                "status": "missing", "action_label": "Create",
                "linked_offer_type": None, "required_for_outreach": True,
            }
            for t in REQUIRED_PROOF_ASSET_TYPES
        ],
        "weekly_strip": {
            "week_start": str(week_start), "touches_target": 15,
            "sent": 0, "replies": 0, "meetings_booked": 0,
            "proposals_sent": 0, "reply_rate_pct": None,
        },
        "total_active_leads": 0,
        "ready_now_count": 0,
    }


# ── Contact Relevance Scoring (pure computation, no DB) ────────────────────────

_TITLE_RULES: list[tuple[list[str], str, str, int]] = [
    # (keywords, buyer_type, authority_level, relevance_score)
    (["chief operating officer", "coo"], "COO", "High", 9),
    (["chief financial officer", "cfo", "chief finance"], "CFO", "High", 8),
    (["chief technology officer", "cto", "chief information officer", "cio"], "CIO", "High", 7),
    (["chief executive officer", "ceo", "president", "managing director", "managing partner"], "Other", "High", 7),
    (["vp operations", "vp of operations", "vice president operations", "director of operations", "head of operations"], "VP_Ops", "Medium", 7),
    (["vp finance", "vp of finance", "director of finance", "director finance", "controller"], "CFO", "Medium", 6),
    (["vp technology", "director of technology", "it director", "head of it"], "CIO", "Medium", 5),
    (["operations manager", "senior director operations"], "VP_Ops", "Medium", 5),
    (["executive vice president", "evp", "senior vice president", "svp"], "Other", "Medium", 5),
    (["project manager", "project director", "senior manager"], "Other", "Low", 3),
]

def score_contact_relevance(title: str, company_industry: str, company_size: str | None) -> dict:
    """Score contact relevance for Novendor outreach. Pure computation, no DB."""
    title_lower = title.lower().strip()
    for keywords, buyer_type, authority_level, base_score in _TITLE_RULES:
        if any(kw in title_lower for kw in keywords):
            # Small boost for operational titles in operational industries
            score = base_score
            if company_industry in ("real_estate", "construction", "legal") and buyer_type in ("COO", "VP_Ops"):
                score = min(10, score + 1)
            return {
                "buyer_type":      buyer_type,
                "authority_level": authority_level,
                "relevance_score": score,
                "rationale": f"Title '{title}' matches {buyer_type} pattern (authority: {authority_level})",
            }
    return {
        "buyer_type":      "Other",
        "authority_level": "Low",
        "relevance_score": 2,
        "rationale": f"Title '{title}' does not match a known decision-maker pattern for Novendor outreach",
    }
