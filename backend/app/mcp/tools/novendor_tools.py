"""Novendor Operator MCP Tools.

6 families of narrow, composable business actions for operating the Novendor
outreach pipeline from Claude Desktop / Claude Code.

All reads are instant. All writes require confirm=True.
All ranking and scoring delegates to nv_outreach_engine — never reimplemented.

Tool naming: novendor.{family}.{action}
"""
from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal
from uuid import UUID

from app.db import get_cursor
from app.mcp.auth import McpContext
from app.mcp.registry import ToolDef, registry
from app.mcp.schemas.novendor_tools import (
    ArchiveAccountInput,
    AdvanceOpportunityStageInput,
    AttachProofAssetInput,
    CompleteTaskInput,
    CreateExecutionTaskInput,
    CreateOpportunityNVInput,
    CreateSignalFromResearchInput,
    DraftOutreachMessageInput,
    FindMissingContactFieldsInput,
    GenerateOfferSheetContextInput,
    GetAccountBriefInput,
    GetOutreachQueueInput,
    LinkContactToAccountInput,
    LinkSignalToOutreachAngleInput,
    ListPipelineAccountsInput,
    ListRequiredProofAssetsInput,
    ListTasksDueTodayInput,
    LogOutreachTouchInput,
    MarkProofAssetStatusInput,
    PromoteSignalToAccountInput,
    PromoteToOutreachReadyInput,
    RecordReplyNVInput,
    RefreshPriorityScoresInput,
    RescheduleTaskInput,
    ScoreContactRelevanceInput,
    ScheduleFollowUpInput,
    SetNextActionNVInput,
    UpsertContactNVInput,
)
from app.services import nv_outreach_engine, cro_next_actions, cro_proof_assets


# ── Helpers ───────────────────────────────────────────────────────────────────

def _confirm_required(confirm: bool, action: str) -> dict | None:
    if not confirm:
        return {
            "error": "confirm_required",
            "message": f"{action} requires confirm=true to execute.",
        }
    return None


# ═══════════════════════════════════════════════════════════════════════
# Family 1: novendor.pipeline.*
# ═══════════════════════════════════════════════════════════════════════

def _list_pipeline_accounts(ctx: McpContext, inp: ListPipelineAccountsInput) -> dict:
    """List active strategic leads with readiness scores."""
    with get_cursor() as cur:
        conditions = ["sl.env_id = %s", "sl.business_id = %s"]
        params: list = [inp.env_id, str(inp.business_id)]

        if inp.status_filter:
            conditions.append("sl.status = %s")
            params.append(inp.status_filter)
        else:
            conditions.append("sl.status = ANY(%s)")
            params.append(list(nv_outreach_engine.ACTIVE_STATUSES))

        where = " AND ".join(conditions)
        cur.execute(
            f"""
            SELECT sl.id AS strategic_lead_id,
                   sl.lead_profile_id,
                   sl.crm_account_id,
                   sl.status,
                   sl.composite_priority_score,
                   a.name AS company_name,
                   a.industry
              FROM cro_strategic_lead sl
              JOIN cro_lead_profile lp ON lp.id = sl.lead_profile_id
              JOIN crm_account a ON a.crm_account_id = sl.crm_account_id
             WHERE {where}
             ORDER BY sl.composite_priority_score DESC
             LIMIT %s
            """,
            params + [inp.limit],
        )
        leads = cur.fetchall()

        accounts = []
        for lead in leads:
            readiness = nv_outreach_engine.compute_readiness(
                cur,
                inp.env_id,
                inp.business_id,
                lead["lead_profile_id"],
                lead["crm_account_id"],
            )
            if inp.min_readiness is not None and readiness["score"] < inp.min_readiness:
                continue

            cur.execute(
                "SELECT primary_wedge_angle FROM cro_lead_hypothesis WHERE lead_profile_id = %s LIMIT 1",
                (str(lead["lead_profile_id"]),),
            )
            hyp = cur.fetchone()

            accounts.append({
                "crm_account_id": str(lead["crm_account_id"]),
                "strategic_lead_id": str(lead["strategic_lead_id"]),
                "company_name": lead["company_name"],
                "industry": lead["industry"],
                "status": lead["status"],
                "composite_priority_score": lead["composite_priority_score"],
                "readiness_score": readiness["score"],
                "missing_signals": readiness["missing"],
                "filter_bucket": readiness["filter_bucket"],
                "primary_wedge": hyp["primary_wedge_angle"] if hyp else None,
            })

    return {"count": len(accounts), "accounts": accounts}


def _get_account_brief(ctx: McpContext, inp: GetAccountBriefInput) -> dict:
    """Full outreach brief for a single account."""
    with get_cursor() as cur:
        brief = nv_outreach_engine.get_account_brief(
            cur, inp.env_id, inp.business_id, inp.crm_account_id
        )
    if not brief:
        return {"error": "not_found", "message": f"No strategic lead found for account {inp.crm_account_id}"}
    return brief


def _create_opportunity_nv(ctx: McpContext, inp: CreateOpportunityNVInput) -> dict:
    err = _confirm_required(inp.confirm, "novendor.pipeline.create_opportunity")
    if err:
        return err

    with get_cursor() as cur:
        # Resolve pipeline stage
        cur.execute(
            "SELECT crm_pipeline_stage_id, stage_label FROM crm_pipeline_stage "
            "WHERE business_id = %s AND stage_key = %s LIMIT 1",
            (str(inp.business_id), inp.initial_stage_key),
        )
        stage = cur.fetchone()
        if not stage:
            return {"error": "stage_not_found", "message": f"Pipeline stage '{inp.initial_stage_key}' not found"}

        cur.execute(
            """
            INSERT INTO crm_opportunity
              (business_id, crm_account_id, name, amount, crm_pipeline_stage_id, status)
            VALUES (%s, %s, %s, %s, %s, 'open')
            RETURNING crm_opportunity_id, name, status
            """,
            (str(inp.business_id), str(inp.crm_account_id), inp.name,
             Decimal(inp.amount), str(stage["crm_pipeline_stage_id"])),
        )
        row = cur.fetchone()

    return {
        "crm_opportunity_id": str(row["crm_opportunity_id"]),
        "name": row["name"],
        "stage": inp.initial_stage_key,
        "created": True,
    }


def _advance_opportunity_stage(ctx: McpContext, inp: AdvanceOpportunityStageInput) -> dict:
    err = _confirm_required(inp.confirm, "novendor.pipeline.advance_opportunity_stage")
    if err:
        return err

    with get_cursor() as cur:
        cur.execute(
            "SELECT business_id FROM crm_opportunity WHERE crm_opportunity_id = %s LIMIT 1",
            (str(inp.crm_opportunity_id),),
        )
        opp = cur.fetchone()
        if not opp:
            return {"error": "not_found", "message": f"Opportunity {inp.crm_opportunity_id} not found"}

        cur.execute(
            "SELECT crm_pipeline_stage_id FROM crm_pipeline_stage "
            "WHERE business_id = %s AND stage_key = %s LIMIT 1",
            (str(inp.business_id), inp.to_stage_key),
        )
        stage = cur.fetchone()
        if not stage:
            return {"error": "stage_not_found", "message": f"Stage '{inp.to_stage_key}' not found"}

        cur.execute(
            "UPDATE crm_opportunity SET crm_pipeline_stage_id = %s, updated_at = now() "
            "WHERE crm_opportunity_id = %s",
            (str(stage["crm_pipeline_stage_id"]), str(inp.crm_opportunity_id)),
        )
        if inp.note:
            cur.execute(
                "INSERT INTO crm_activity (business_id, crm_opportunity_id, activity_type, notes) "
                "VALUES (%s, %s, 'note', %s)",
                (str(inp.business_id), str(inp.crm_opportunity_id), inp.note),
            )

    return {"crm_opportunity_id": str(inp.crm_opportunity_id), "new_stage": inp.to_stage_key, "advanced": True}


def _set_next_action_nv(ctx: McpContext, inp: SetNextActionNVInput) -> dict:
    err = _confirm_required(inp.confirm, "novendor.pipeline.set_next_action")
    if err:
        return err

    row = cro_next_actions.create_next_action(
        env_id=inp.env_id,
        business_id=inp.business_id,
        entity_type=inp.entity_type,
        entity_id=inp.entity_id,
        action_type=inp.action_type,
        description=inp.description,
        due_date=inp.due_date,
        priority=inp.priority,
    )
    return {"next_action_id": str(row["id"]), "due_date": str(inp.due_date), "created": True}


def _archive_account(ctx: McpContext, inp: ArchiveAccountInput) -> dict:
    err = _confirm_required(inp.confirm, "novendor.pipeline.archive_account")
    if err:
        return err

    with get_cursor() as cur:
        cur.execute(
            "UPDATE cro_strategic_lead SET status = 'Closed', updated_at = now() "
            "WHERE id = %s AND env_id = %s AND business_id = %s",
            (str(inp.strategic_lead_id), inp.env_id, str(inp.business_id)),
        )
        updated = cur.rowcount > 0

    return {"strategic_lead_id": str(inp.strategic_lead_id), "archived": updated, "reason": inp.reason}


# ═══════════════════════════════════════════════════════════════════════
# Family 2: novendor.contacts.*
# ═══════════════════════════════════════════════════════════════════════

def _find_missing_contact_fields(ctx: McpContext, inp: FindMissingContactFieldsInput) -> dict:
    with get_cursor() as cur:
        # Resolve lead_profile_id for this account
        cur.execute(
            "SELECT sl.lead_profile_id, a.name AS company_name "
            "FROM cro_strategic_lead sl "
            "JOIN crm_account a ON a.crm_account_id = sl.crm_account_id "
            "WHERE sl.crm_account_id = %s AND sl.env_id = %s AND sl.business_id = %s LIMIT 1",
            (str(inp.crm_account_id), inp.env_id, str(inp.business_id)),
        )
        lead = cur.fetchone()
        if not lead:
            return {
                "crm_account_id": str(inp.crm_account_id),
                "company_name": None,
                "contacts": [],
                "readiness_blocker": "No strategic lead record for this account",
                "suggested_research": f"Create a strategic lead record first",
            }

        cur.execute(
            "SELECT id, name, title, email, linkedin_url FROM cro_strategic_contact "
            "WHERE lead_profile_id = %s ORDER BY created_at ASC",
            (str(lead["lead_profile_id"]),),
        )
        contacts_raw = cur.fetchall()

    contacts = []
    for c in contacts_raw:
        missing_fields = [
            f for f in ["name", "title", "email", "linkedin_url"]
            if not c.get(f)
        ]
        contacts.append({
            "id": str(c["id"]),
            "name": c["name"],
            "title": c["title"],
            "email": c["email"],
            "linkedin_url": c["linkedin_url"],
            "missing_fields": missing_fields,
        })

    if not contacts:
        blocker = "No contact exists"
        suggestion = f"Search LinkedIn for COO, CFO, or VP Operations at {lead['company_name']}"
    elif any("email" in c["missing_fields"] and "linkedin_url" in c["missing_fields"] for c in contacts):
        blocker = "Contact missing channel (no email or LinkedIn)"
        suggestion = f"Find LinkedIn profile or email for {contacts[0]['name']} at {lead['company_name']}"
    elif any("title" in c["missing_fields"] for c in contacts):
        blocker = "Contact missing title"
        suggestion = f"Confirm title for {contacts[0]['name']} via LinkedIn"
    else:
        blocker = None
        suggestion = None

    return {
        "crm_account_id": str(inp.crm_account_id),
        "company_name": lead["company_name"],
        "contacts": contacts,
        "readiness_blocker": blocker,
        "suggested_research": suggestion,
    }


def _upsert_contact_nv(ctx: McpContext, inp: UpsertContactNVInput) -> dict:
    err = _confirm_required(inp.confirm, "novendor.contacts.upsert_contact")
    if err:
        return err

    with get_cursor() as cur:
        cur.execute(
            "SELECT sl.lead_profile_id FROM cro_strategic_lead sl "
            "WHERE sl.crm_account_id = %s AND sl.env_id = %s AND sl.business_id = %s LIMIT 1",
            (str(inp.crm_account_id), inp.env_id, str(inp.business_id)),
        )
        lead = cur.fetchone()
        if not lead:
            return {"error": "no_strategic_lead", "message": f"No strategic lead for account {inp.crm_account_id}"}

        # Check for existing contact with same name
        cur.execute(
            "SELECT id FROM cro_strategic_contact WHERE lead_profile_id = %s AND lower(name) = lower(%s) LIMIT 1",
            (str(lead["lead_profile_id"]), inp.name),
        )
        existing = cur.fetchone()

        if existing:
            cur.execute(
                """
                UPDATE cro_strategic_contact
                   SET title = %s, email = %s, linkedin_url = %s,
                       buyer_type = %s, authority_level = %s
                 WHERE id = %s
                RETURNING id
                """,
                (inp.title, inp.email, inp.linkedin_url,
                 inp.buyer_type, inp.authority_level, str(existing["id"])),
            )
            contact_id = existing["id"]
            upserted = False
        else:
            cur.execute(
                """
                INSERT INTO cro_strategic_contact
                  (env_id, business_id, lead_profile_id, name, title, email, linkedin_url, buyer_type, authority_level)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id
                """,
                (inp.env_id, str(inp.business_id), str(lead["lead_profile_id"]),
                 inp.name, inp.title, inp.email, inp.linkedin_url,
                 inp.buyer_type, inp.authority_level),
            )
            contact_id = cur.fetchone()["id"]
            upserted = True

    return {"contact_id": str(contact_id), "upserted": upserted, "updated": not upserted}


def _link_contact_to_account(ctx: McpContext, inp: LinkContactToAccountInput) -> dict:
    err = _confirm_required(inp.confirm, "novendor.contacts.link_contact_to_account")
    if err:
        return err

    with get_cursor() as cur:
        # Resolve new lead_profile_id for target account
        cur.execute(
            "SELECT lead_profile_id FROM cro_strategic_lead WHERE crm_account_id = %s LIMIT 1",
            (str(inp.crm_account_id),),
        )
        row = cur.fetchone()
        if not row:
            return {"error": "no_strategic_lead", "message": f"No strategic lead for account {inp.crm_account_id}"}

        cur.execute(
            "UPDATE cro_strategic_contact SET lead_profile_id = %s WHERE id = %s",
            (str(row["lead_profile_id"]), str(inp.strategic_contact_id)),
        )
        linked = cur.rowcount > 0

    return {"linked": linked}


def _score_contact_relevance(ctx: McpContext, inp: ScoreContactRelevanceInput) -> dict:
    """Pure computation — no DB."""
    return nv_outreach_engine.score_contact_relevance(
        title=inp.title,
        company_industry=inp.company_industry,
        company_size=inp.company_size,
    )


# ═══════════════════════════════════════════════════════════════════════
# Family 3: novendor.outreach.*
# ═══════════════════════════════════════════════════════════════════════

def _get_outreach_queue(ctx: McpContext, inp: GetOutreachQueueInput) -> dict:
    brief = nv_outreach_engine.build_daily_brief(env_id=inp.env_id, business_id=inp.business_id)
    queue = brief["message_queue"]

    if inp.filter == "send_ready":
        queue = [q for q in queue if q["send_ready"]]
    elif inp.filter == "needs_approval":
        queue = [q for q in queue if not q["send_ready"]]

    return {"count": len(queue), "queue": queue}


def _draft_outreach_message(ctx: McpContext, inp: DraftOutreachMessageInput) -> dict:
    err = _confirm_required(inp.confirm, "novendor.outreach.draft_outreach_message")
    if err:
        return err

    with get_cursor() as cur:
        # Get lead + context
        brief = nv_outreach_engine.get_account_brief(
            cur, inp.env_id, inp.business_id, inp.crm_account_id
        )
        if not brief:
            return {"error": "not_found", "message": f"No strategic lead for account {inp.crm_account_id}"}

        # Check if sequence row exists for this stage
        cur.execute(
            "SELECT id, draft_message, approved_message FROM cro_outreach_sequence "
            "WHERE lead_profile_id = %s AND sequence_stage = %s LIMIT 1",
            (brief["lead_profile_id"], inp.sequence_stage),
        )
        existing_seq = cur.fetchone()

        # Assemble personalization elements
        elements_used = []
        draft_parts = []

        contact = brief["contacts"][0] if brief["contacts"] else None
        hyp = brief["hypothesis"]
        triggers = brief["triggers"]

        greeting_name = contact["name"].split()[0] if contact and contact["name"] else "there"
        elements_used.append("contact_name" if contact and contact["name"] else "generic_greeting")

        wedge = hyp["primary_wedge_angle"] if hyp else None
        if wedge:
            elements_used.append("wedge_angle")

        trigger_summary = triggers[0]["summary"] if triggers else None
        if trigger_summary:
            elements_used.append("trigger_summary")

        # Compose draft
        company = brief["company_name"]
        if inp.sequence_stage == 1:
            subject = f"Operational efficiency at {company}"
            body = f"Hi {greeting_name},\n\n"
            if trigger_summary:
                body += f"{trigger_summary}\n\n"
            if wedge:
                body += f"We help firms like {company} address {wedge.lower()} — typically through a focused 2-4 week sprint.\n\n"
            else:
                body += f"We work with operational teams at firms like {company} to reduce coordination overhead and reporting drag.\n\n"
            body += "If there's a current priority worth exploring, I'm happy to send a one-page outline.\n\nBest,\nPaul"
        elif inp.sequence_stage == 2:
            subject = f"RE: Follow-up — {company}"
            body = f"Hi {greeting_name},\n\nFollowing up on my earlier note. "
            if wedge:
                body += f"The core question I was raising is around {wedge.lower()}. "
            body += "Happy to send over a concise scope example if that would be useful.\n\nPaul"
        else:
            subject = f"Last note — {company}"
            body = f"Hi {greeting_name},\n\nOne last follow-up. If the timing isn't right, I understand. "
            if wedge:
                body += f"We'll be here when {wedge.lower()} becomes a priority."
            body += "\n\nPaul"

        if existing_seq:
            cur.execute(
                "UPDATE cro_outreach_sequence SET draft_message = %s, updated_at = now() WHERE id = %s RETURNING id",
                (body, str(existing_seq["id"])),
            )
            seq_id = existing_seq["id"]
        else:
            cur.execute(
                """
                INSERT INTO cro_outreach_sequence
                  (env_id, business_id, lead_profile_id, sequence_stage, draft_message)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING id
                """,
                (inp.env_id, str(inp.business_id), brief["lead_profile_id"],
                 inp.sequence_stage, body),
            )
            seq_id = cur.fetchone()["id"]

    return {
        "outreach_sequence_id": str(seq_id),
        "channel": "email",
        "subject": subject,
        "draft_message": body,
        "personalization_elements": elements_used,
        "review_required": True,
    }


def _log_outreach_touch(ctx: McpContext, inp: LogOutreachTouchInput) -> dict:
    err = _confirm_required(inp.confirm, "novendor.outreach.log_outreach_touch")
    if err:
        return err

    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO cro_outreach_log
              (env_id, business_id, crm_account_id, channel, direction, subject,
               body_preview, sent_at, sent_by)
            VALUES (%s, %s, %s, %s, 'outbound', %s, %s, now(), %s)
            RETURNING id
            """,
            (inp.env_id, str(inp.business_id), str(inp.crm_account_id),
             inp.channel, inp.subject, inp.body_preview, inp.sent_by or ctx.actor),
        )
        outreach_log_id = cur.fetchone()["id"]

    return {"outreach_log_id": str(outreach_log_id), "logged": True}


def _record_reply_nv(ctx: McpContext, inp: RecordReplyNVInput) -> dict:
    err = _confirm_required(inp.confirm, "novendor.outreach.record_reply")
    if err:
        return err

    with get_cursor() as cur:
        cur.execute(
            """
            UPDATE cro_outreach_log
               SET replied_at = now(), reply_sentiment = %s, meeting_booked = %s
             WHERE id = %s
            """,
            (inp.sentiment, inp.meeting_booked, str(inp.outreach_log_id)),
        )
        updated = cur.rowcount > 0

    suggestion = (
        "Schedule a discovery call" if inp.meeting_booked
        else "Send Stage 2 follow-up within 3 days" if inp.sentiment == "positive"
        else "Log notes and monitor; send Stage 3 in 2 weeks" if inp.sentiment == "neutral"
        else "Note objection and pause sequence for 30 days"
    )

    return {"updated": updated, "next_action_suggestion": suggestion}


def _schedule_follow_up(ctx: McpContext, inp: ScheduleFollowUpInput) -> dict:
    err = _confirm_required(inp.confirm, "novendor.outreach.schedule_follow_up")
    if err:
        return err

    with get_cursor() as cur:
        # Determine entity_id (crm_account_id used directly)
        row = cro_next_actions.create_next_action(
            env_id=inp.env_id,
            business_id=inp.business_id,
            entity_type="account",
            entity_id=inp.crm_account_id,
            action_type="follow_up_outreach",
            description=f"Follow-up via {inp.channel}",
            due_date=inp.follow_up_date,
            priority="high",
        )

        # Determine next sequence stage
        cur.execute(
            """
            SELECT MAX(sequence_stage) AS max_stage
              FROM cro_outreach_sequence os
              JOIN cro_strategic_lead sl ON sl.lead_profile_id = os.lead_profile_id
             WHERE sl.crm_account_id = %s AND sl.env_id = %s
            """,
            (str(inp.crm_account_id), inp.env_id),
        )
        stage_row = cur.fetchone()
        current_stage = stage_row["max_stage"] or 0
        next_stage = min(current_stage + 1, 3)

    return {
        "next_action_id": str(row["id"]),
        "sequence_stage": next_stage,
        "follow_up_date": str(inp.follow_up_date),
    }


def _promote_to_outreach_ready(ctx: McpContext, inp: PromoteToOutreachReadyInput) -> dict:
    err = _confirm_required(inp.confirm, "novendor.outreach.promote_account_to_outreach_ready")
    if err:
        return err

    with get_cursor() as cur:
        cur.execute(
            "SELECT crm_account_id, lead_profile_id, status, env_id FROM cro_strategic_lead "
            "WHERE id = %s AND business_id = %s LIMIT 1",
            (str(inp.strategic_lead_id), str(inp.business_id)),
        )
        lead = cur.fetchone()
        if not lead:
            return {"error": "not_found", "message": f"Strategic lead {inp.strategic_lead_id} not found"}

        readiness = nv_outreach_engine.compute_readiness(
            cur,
            lead["env_id"],
            inp.business_id,
            lead["lead_profile_id"],
            lead["crm_account_id"],
        )

        if readiness["score"] < 5:
            return {
                "promoted": False,
                "new_status": lead["status"],
                "readiness_score": readiness["score"],
                "blocker": f"Readiness score {readiness['score']}/8 too low (min 5). Missing: {', '.join(readiness['missing'][:3])}",
            }

        cur.execute(
            "UPDATE cro_strategic_lead SET status = 'Outreach Drafted', updated_at = now() "
            "WHERE id = %s",
            (str(inp.strategic_lead_id),),
        )

    return {
        "promoted": True,
        "new_status": "Outreach Drafted",
        "readiness_score": readiness["score"],
        "blocker": None,
    }


# ═══════════════════════════════════════════════════════════════════════
# Family 4: novendor.proof_assets.*
# ═══════════════════════════════════════════════════════════════════════

def _list_required_proof_assets(ctx: McpContext, inp: ListRequiredProofAssetsInput) -> dict:
    existing = cro_proof_assets.list_proof_assets(
        env_id=inp.env_id,
        business_id=inp.business_id,
    )
    asset_by_type = {a["asset_type"]: a for a in existing}

    assets = []
    blocker_count = 0
    for asset_type in nv_outreach_engine.REQUIRED_PROOF_ASSET_TYPES:
        asset = asset_by_type.get(asset_type)
        status = asset["status"] if asset else "missing"
        if status != "ready":
            blocker_count += 1
        action = {
            "ready": None, "draft": "Finalize",
            "needs_update": "Review", "missing": "Create",
        }.get(status, "Review")
        assets.append({
            "asset_type": asset_type,
            "title": asset["title"] if asset else nv_outreach_engine.REQUIRED_PROOF_ASSET_LABELS.get(asset_type, asset_type),
            "status": status,
            "action_label": action,
            "linked_offer_type": asset["linked_offer_type"] if asset else None,
            "required_for_outreach": True,
        })

    # Add any non-required extras
    for asset in existing:
        if asset["asset_type"] not in nv_outreach_engine.REQUIRED_PROOF_ASSET_TYPES:
            assets.append({
                "asset_type": asset["asset_type"],
                "title": asset["title"],
                "status": asset["status"],
                "action_label": None,
                "linked_offer_type": asset["linked_offer_type"],
                "required_for_outreach": False,
            })

    return {"assets": assets, "outreach_blocker_count": blocker_count}


def _attach_proof_asset(ctx: McpContext, inp: AttachProofAssetInput) -> dict:
    err = _confirm_required(inp.confirm, "novendor.proof_assets.attach_proof_asset_to_account")
    if err:
        return err

    with get_cursor() as cur:
        cur.execute(
            "UPDATE cro_outreach_sequence SET proof_asset_id = %s, updated_at = now() "
            "WHERE id = %s AND env_id = %s AND business_id = %s",
            (str(inp.proof_asset_id), str(inp.outreach_sequence_id),
             inp.env_id, str(inp.business_id)),
        )
        linked = cur.rowcount > 0

    return {"linked": linked}


def _mark_proof_asset_status(ctx: McpContext, inp: MarkProofAssetStatusInput) -> dict:
    err = _confirm_required(inp.confirm, "novendor.proof_assets.mark_proof_asset_status")
    if err:
        return err

    with get_cursor() as cur:
        cur.execute(
            "UPDATE cro_proof_asset SET status = %s, updated_at = now() WHERE id = %s AND business_id = %s",
            (inp.status, str(inp.proof_asset_id), str(inp.business_id)),
        )
        updated = cur.rowcount > 0

    return {"updated": updated, "new_status": inp.status}


def _generate_offer_sheet_context(ctx: McpContext, inp: GenerateOfferSheetContextInput) -> dict:
    with get_cursor() as cur:
        brief = nv_outreach_engine.get_account_brief(
            cur, inp.env_id, inp.business_id, inp.crm_account_id
        )
    if not brief:
        return {"error": "not_found", "message": f"No strategic lead for account {inp.crm_account_id}"}

    hyp = brief.get("hypothesis") or {}
    contact = brief["contacts"][0] if brief["contacts"] else {}
    triggers = brief.get("triggers", [])

    return {
        "company_name":        brief["company_name"],
        "industry":            brief.get("industry"),
        "contact_name":        contact.get("name"),
        "contact_title":       contact.get("title"),
        "pain_thesis":         hyp.get("ai_roi_leakage_notes") or hyp.get("reconciliation_fragility_notes"),
        "primary_wedge":       hyp.get("primary_wedge_angle"),
        "top_capabilities":    hyp.get("top_2_capabilities", []),
        "governance_gap":      hyp.get("governance_gap_notes"),
        "vendor_fatigue":      hyp.get("vendor_fatigue_exposure"),
        "key_trigger":         triggers[0]["summary"] if triggers else None,
        "trigger_type":        triggers[0]["trigger_type"] if triggers else None,
        "employee_range":      brief.get("employee_range"),
        "multi_entity":        brief.get("multi_entity_flag"),
        "readiness_score":     brief["readiness"]["score"],
        "composite_score":     brief["composite_priority_score"],
        "instruction": (
            "Use the above fields to draft a one-page offer sheet. "
            "Lead with the pain_thesis and primary_wedge. "
            "Frame the offer around the top_capabilities. "
            "Reference the key_trigger as the reason-to-act-now."
        ),
    }


# ═══════════════════════════════════════════════════════════════════════
# Family 5: novendor.tasks.*
# ═══════════════════════════════════════════════════════════════════════

def _create_execution_task(ctx: McpContext, inp: CreateExecutionTaskInput) -> dict:
    err = _confirm_required(inp.confirm, "novendor.tasks.create_execution_task")
    if err:
        return err

    row = cro_next_actions.create_next_action(
        env_id=inp.env_id,
        business_id=inp.business_id,
        entity_type=inp.entity_type,
        entity_id=inp.entity_id,
        action_type=inp.action_type,
        description=inp.description,
        due_date=inp.due_date,
        priority=inp.priority,
    )
    return {"task_id": str(row["id"]), "due_date": str(inp.due_date)}


def _complete_task(ctx: McpContext, inp: CompleteTaskInput) -> dict:
    err = _confirm_required(inp.confirm, "novendor.tasks.complete_task")
    if err:
        return err

    with get_cursor() as cur:
        cur.execute(
            "UPDATE cro_next_action SET status = 'completed', notes = %s, updated_at = now() "
            "WHERE id = %s AND business_id = %s RETURNING entity_type, entity_id, env_id",
            (inp.outcome_notes, str(inp.next_action_id), str(inp.business_id)),
        )
        row = cur.fetchone()
        completed = row is not None

        followup_id = None
        if completed and inp.create_followup and inp.followup_due_date:
            followup = cro_next_actions.create_next_action(
                env_id=row["env_id"],
                business_id=inp.business_id,
                entity_type=row["entity_type"],
                entity_id=row["entity_id"],
                action_type="follow_up",
                description=inp.followup_description or "Follow up",
                due_date=inp.followup_due_date,
            )
            followup_id = str(followup["id"])

    return {"completed": completed, "followup_id": followup_id}


def _reschedule_task(ctx: McpContext, inp: RescheduleTaskInput) -> dict:
    err = _confirm_required(inp.confirm, "novendor.tasks.reschedule_task")
    if err:
        return err

    with get_cursor() as cur:
        notes_append = f" [Snoozed to {inp.new_due_date}: {inp.snooze_reason}]" if inp.snooze_reason else f" [Snoozed to {inp.new_due_date}]"
        cur.execute(
            "UPDATE cro_next_action SET due_date = %s, "
            "notes = COALESCE(notes, '') || %s, updated_at = now() "
            "WHERE id = %s AND business_id = %s",
            (inp.new_due_date, notes_append, str(inp.next_action_id), str(inp.business_id)),
        )
        rescheduled = cur.rowcount > 0

    return {"rescheduled": rescheduled, "new_due_date": str(inp.new_due_date)}


def _list_tasks_due_today(ctx: McpContext, inp: ListTasksDueTodayInput) -> dict:
    today = date.today()
    with get_cursor() as cur:
        conditions = ["na.env_id = %s", "na.business_id = %s", "na.status = 'pending'"]
        params: list = [inp.env_id, str(inp.business_id)]

        if inp.include_overdue:
            conditions.append("na.due_date <= %s")
            params.append(today)
        else:
            conditions.append("na.due_date = %s")
            params.append(today)

        where = " AND ".join(conditions)
        cur.execute(
            f"""
            SELECT na.id, na.entity_type, na.entity_id, na.action_type,
                   na.description, na.due_date, na.priority, na.notes
              FROM cro_next_action na
             WHERE {where}
             ORDER BY na.due_date ASC, na.priority DESC
             LIMIT 50
            """,
            params,
        )
        rows = cur.fetchall()

    today_tasks = [r for r in rows if r["due_date"] == today]
    overdue_tasks = [r for r in rows if r["due_date"] < today]

    def _serialize_task(r) -> dict:
        return {
            "id": str(r["id"]),
            "entity_type": r["entity_type"],
            "entity_id": str(r["entity_id"]),
            "action_type": r["action_type"],
            "description": r["description"],
            "due_date": str(r["due_date"]),
            "priority": r["priority"],
        }

    return {
        "today_count": len(today_tasks),
        "overdue_count": len(overdue_tasks),
        "tasks": [_serialize_task(r) for r in rows],
    }


# ═══════════════════════════════════════════════════════════════════════
# Family 6: novendor.signals.*
# ═══════════════════════════════════════════════════════════════════════

def _create_signal_from_research(ctx: McpContext, inp: CreateSignalFromResearchInput) -> dict:
    err = _confirm_required(inp.confirm, "novendor.signals.create_signal_from_research")
    if err:
        return err

    with get_cursor() as cur:
        detected = inp.detected_at or datetime.now(tz=timezone.utc).isoformat()
        source_url = inp.source_url or "manual_research"
        cur.execute(
            """
            INSERT INTO cro_trigger_signal
              (env_id, business_id, lead_profile_id, trigger_type, summary, source_url, detected_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            RETURNING id
            """,
            (inp.env_id, str(inp.business_id), str(inp.lead_profile_id),
             inp.trigger_type, inp.summary, source_url, detected),
        )
        trigger_signal_id = cur.fetchone()["id"]

    return {"trigger_signal_id": str(trigger_signal_id), "created": True}


def _promote_signal_to_account(ctx: McpContext, inp: PromoteSignalToAccountInput) -> dict:
    err = _confirm_required(inp.confirm, "novendor.signals.promote_signal_to_account")
    if err:
        return err

    with get_cursor() as cur:
        # Get lead_profile_id for this signal to reset any existing primary
        cur.execute(
            "SELECT lead_profile_id FROM cro_trigger_signal WHERE id = %s AND business_id = %s LIMIT 1",
            (str(inp.trigger_signal_id), str(inp.business_id)),
        )
        row = cur.fetchone()
        if not row:
            return {"error": "not_found", "message": f"Signal {inp.trigger_signal_id} not found"}

        # Clear existing primary on this lead
        cur.execute(
            "UPDATE cro_trigger_signal SET is_primary_trigger = false WHERE lead_profile_id = %s",
            (str(row["lead_profile_id"]),),
        )
        # Set new primary
        cur.execute(
            "UPDATE cro_trigger_signal SET is_primary_trigger = true WHERE id = %s",
            (str(inp.trigger_signal_id),),
        )
        promoted = cur.rowcount > 0

    return {"promoted": promoted}


def _link_signal_to_outreach_angle(ctx: McpContext, inp: LinkSignalToOutreachAngleInput) -> dict:
    err = _confirm_required(inp.confirm, "novendor.signals.link_signal_to_outreach_angle")
    if err:
        return err

    with get_cursor() as cur:
        # Resolve lead_profile_id for this account
        cur.execute(
            "SELECT lead_profile_id FROM cro_strategic_lead "
            "WHERE crm_account_id = %s AND env_id = %s AND business_id = %s LIMIT 1",
            (str(inp.crm_account_id), inp.env_id, str(inp.business_id)),
        )
        lead = cur.fetchone()
        if not lead:
            return {"error": "no_strategic_lead", "message": f"No strategic lead for account {inp.crm_account_id}"}

        # Append outreach angle notes to hypothesis
        cur.execute(
            """
            INSERT INTO cro_lead_hypothesis (env_id, business_id, lead_profile_id, primary_wedge_angle)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (lead_profile_id) DO UPDATE
              SET primary_wedge_angle = EXCLUDED.primary_wedge_angle
            """,
            (inp.env_id, str(inp.business_id), str(lead["lead_profile_id"]), inp.outreach_angle_notes),
        )
        # Mark the trigger as primary
        cur.execute(
            "UPDATE cro_trigger_signal SET is_primary_trigger = true WHERE id = %s",
            (str(inp.trigger_signal_id),),
        )

    return {"linked": True}


def _refresh_priority_scores(ctx: McpContext, inp: RefreshPriorityScoresInput) -> dict:
    err = _confirm_required(inp.confirm, "novendor.signals.refresh_priority_scores")
    if err:
        return err

    with get_cursor() as cur:
        cur.execute(
            "SELECT id, lead_profile_id, crm_account_id, composite_priority_score, company_name "
            "FROM cro_strategic_lead sl "
            "JOIN crm_account a ON a.crm_account_id = sl.crm_account_id "
            "WHERE sl.env_id = %s AND sl.business_id = %s AND sl.status = ANY(%s)",
            (inp.env_id, str(inp.business_id), list(nv_outreach_engine.ACTIVE_STATUSES)),
        )
        leads = cur.fetchall()

        rescored = 0
        scored_accounts: list[tuple[float, str]] = []
        for lead in leads:
            readiness = nv_outreach_engine.compute_readiness(
                cur, inp.env_id, inp.business_id,
                lead["lead_profile_id"], lead["crm_account_id"],
            )
            rank = nv_outreach_engine._combined_rank(
                lead["composite_priority_score"], readiness["score"]
            )
            scored_accounts.append((rank, lead["company_name"]))
            rescored += 1

        # Sort to get top 3
        scored_accounts.sort(key=lambda x: x[0], reverse=True)
        top_3 = [name for _, name in scored_accounts[:3]]

    return {"accounts_rescored": rescored, "top_3_accounts": top_3}


# ═══════════════════════════════════════════════════════════════════════
# Registration
# ═══════════════════════════════════════════════════════════════════════

def register_novendor_tools() -> None:
    """Register all novendor.* MCP tools."""

    _pipeline = [
        ToolDef(name="novendor.pipeline.list_pipeline_accounts",
                description="List active Novendor strategic leads with readiness scores, filter_bucket, and current stage. Returns ranked list.",
                module="novendor", permission="read",
                input_model=ListPipelineAccountsInput, handler=_list_pipeline_accounts,
                tags=frozenset({"novendor", "pipeline", "read"})),

        ToolDef(name="novendor.pipeline.get_account_brief",
                description="Get full outreach brief for a single Novendor account: contact, hypothesis, triggers, sequences, next action, and readiness signals.",
                module="novendor", permission="read",
                input_model=GetAccountBriefInput, handler=_get_account_brief,
                tags=frozenset({"novendor", "pipeline", "read"})),

        ToolDef(name="novendor.pipeline.create_opportunity",
                description="Create a CRM opportunity for a Novendor account and set initial pipeline stage. Requires confirm=true.",
                module="novendor", permission="write",
                input_model=CreateOpportunityNVInput, handler=_create_opportunity_nv,
                tags=frozenset({"novendor", "pipeline", "write"})),

        ToolDef(name="novendor.pipeline.advance_opportunity_stage",
                description="Move a Novendor opportunity to a new pipeline stage with an optional note. Requires confirm=true.",
                module="novendor", permission="write",
                input_model=AdvanceOpportunityStageInput, handler=_advance_opportunity_stage,
                tags=frozenset({"novendor", "pipeline", "write"})),

        ToolDef(name="novendor.pipeline.set_next_action",
                description="Create a next action for any Novendor account, opportunity, or lead. Requires confirm=true.",
                module="novendor", permission="write",
                input_model=SetNextActionNVInput, handler=_set_next_action_nv,
                tags=frozenset({"novendor", "pipeline", "write"})),

        ToolDef(name="novendor.pipeline.archive_account",
                description="Archive a Novendor strategic lead (sets status to Closed). Requires confirm=true.",
                module="novendor", permission="write",
                input_model=ArchiveAccountInput, handler=_archive_account,
                tags=frozenset({"novendor", "pipeline", "write"})),
    ]

    _contacts = [
        ToolDef(name="novendor.contacts.find_missing_contact_fields",
                description="For a Novendor account, return which contact fields are missing and what research is needed to fill them.",
                module="novendor", permission="read",
                input_model=FindMissingContactFieldsInput, handler=_find_missing_contact_fields,
                tags=frozenset({"novendor", "contacts", "read"})),

        ToolDef(name="novendor.contacts.upsert_contact",
                description="Create or update a strategic contact for a Novendor account. Replaces existing contact with same name. Requires confirm=true.",
                module="novendor", permission="write",
                input_model=UpsertContactNVInput, handler=_upsert_contact_nv,
                tags=frozenset({"novendor", "contacts", "write"})),

        ToolDef(name="novendor.contacts.link_contact_to_account",
                description="Associate a Novendor strategic contact with a different account. Requires confirm=true.",
                module="novendor", permission="write",
                input_model=LinkContactToAccountInput, handler=_link_contact_to_account,
                tags=frozenset({"novendor", "contacts", "write"})),

        ToolDef(name="novendor.contacts.score_contact_relevance",
                description="Score a contact's relevance for Novendor outreach based on title and industry. Pure computation — no database access.",
                module="novendor", permission="read",
                input_model=ScoreContactRelevanceInput, handler=_score_contact_relevance,
                tags=frozenset({"novendor", "contacts", "read"})),
    ]

    _outreach = [
        ToolDef(name="novendor.outreach.get_outreach_queue",
                description="Return current Novendor message queue — sequences with drafted or approved messages, ordered by priority.",
                module="novendor", permission="read",
                input_model=GetOutreachQueueInput, handler=_get_outreach_queue,
                tags=frozenset({"novendor", "outreach", "read"})),

        ToolDef(name="novendor.outreach.draft_outreach_message",
                description="Draft a personalized outreach message for a Novendor account using hypothesis, contact, and trigger. Human approval required before sending. Requires confirm=true.",
                module="novendor", permission="write",
                input_model=DraftOutreachMessageInput, handler=_draft_outreach_message,
                tags=frozenset({"novendor", "outreach", "write"})),

        ToolDef(name="novendor.outreach.log_outreach_touch",
                description="Record that an outreach message was sent. Creates a cro_outreach_log entry. Requires confirm=true.",
                module="novendor", permission="write",
                input_model=LogOutreachTouchInput, handler=_log_outreach_touch,
                tags=frozenset({"novendor", "outreach", "write"})),

        ToolDef(name="novendor.outreach.record_reply",
                description="Record a reply from a Novendor prospect. Sets sentiment, meeting_booked, and returns a suggested next action. Requires confirm=true.",
                module="novendor", permission="write",
                input_model=RecordReplyNVInput, handler=_record_reply_nv,
                tags=frozenset({"novendor", "outreach", "write"})),

        ToolDef(name="novendor.outreach.schedule_follow_up",
                description="Create a follow-up next action for a Novendor account and advance the outreach sequence stage. Requires confirm=true.",
                module="novendor", permission="write",
                input_model=ScheduleFollowUpInput, handler=_schedule_follow_up,
                tags=frozenset({"novendor", "outreach", "write"})),

        ToolDef(name="novendor.outreach.promote_account_to_outreach_ready",
                description="Advance a Novendor strategic lead to 'Outreach Drafted' status. Validates readiness score >= 5 — returns blocker if not met. Requires confirm=true.",
                module="novendor", permission="write",
                input_model=PromoteToOutreachReadyInput, handler=_promote_to_outreach_ready,
                tags=frozenset({"novendor", "outreach", "write"})),
    ]

    _proof = [
        ToolDef(name="novendor.proof_assets.list_required_proof_assets",
                description="Return the Novendor proof asset checklist with current status. Counts outreach-blocking gaps.",
                module="novendor", permission="read",
                input_model=ListRequiredProofAssetsInput, handler=_list_required_proof_assets,
                tags=frozenset({"novendor", "proof_assets", "read"})),

        ToolDef(name="novendor.proof_assets.attach_proof_asset_to_account",
                description="Link a proof asset to a Novendor outreach sequence. Requires confirm=true.",
                module="novendor", permission="write",
                input_model=AttachProofAssetInput, handler=_attach_proof_asset,
                tags=frozenset({"novendor", "proof_assets", "write"})),

        ToolDef(name="novendor.proof_assets.mark_proof_asset_status",
                description="Update the status of a Novendor proof asset (draft → ready, etc.). Requires confirm=true.",
                module="novendor", permission="write",
                input_model=MarkProofAssetStatusInput, handler=_mark_proof_asset_status,
                tags=frozenset({"novendor", "proof_assets", "write"})),

        ToolDef(name="novendor.proof_assets.generate_offer_sheet_context",
                description="For a Novendor account, return structured context needed to draft a one-page offer sheet: pain, wedge, capabilities, ROI framing, trigger.",
                module="novendor", permission="read",
                input_model=GenerateOfferSheetContextInput, handler=_generate_offer_sheet_context,
                tags=frozenset({"novendor", "proof_assets", "read"})),
    ]

    _tasks = [
        ToolDef(name="novendor.tasks.create_execution_task",
                description="Create a next action task for any Novendor entity. Requires confirm=true.",
                module="novendor", permission="write",
                input_model=CreateExecutionTaskInput, handler=_create_execution_task,
                tags=frozenset({"novendor", "tasks", "write"})),

        ToolDef(name="novendor.tasks.complete_task",
                description="Mark a Novendor next action as completed. Optionally creates a follow-up. Requires confirm=true.",
                module="novendor", permission="write",
                input_model=CompleteTaskInput, handler=_complete_task,
                tags=frozenset({"novendor", "tasks", "write"})),

        ToolDef(name="novendor.tasks.reschedule_task",
                description="Move a Novendor next action's due date forward. Adds a snooze note. Requires confirm=true.",
                module="novendor", permission="write",
                input_model=RescheduleTaskInput, handler=_reschedule_task,
                tags=frozenset({"novendor", "tasks", "write"})),

        ToolDef(name="novendor.tasks.list_tasks_due_today",
                description="Return all pending Novendor next actions due today and optionally overdue, with entity context.",
                module="novendor", permission="read",
                input_model=ListTasksDueTodayInput, handler=_list_tasks_due_today,
                tags=frozenset({"novendor", "tasks", "read"})),
    ]

    _signals = [
        ToolDef(name="novendor.signals.create_signal_from_research",
                description="Log a new trigger signal for a Novendor account (e.g. leadership hire, press release, funding round). Requires confirm=true.",
                module="novendor", permission="write",
                input_model=CreateSignalFromResearchInput, handler=_create_signal_from_research,
                tags=frozenset({"novendor", "signals", "write"})),

        ToolDef(name="novendor.signals.promote_signal_to_account",
                description="Mark a trigger signal as the primary why-now signal for a Novendor account. Clears previous primary. Requires confirm=true.",
                module="novendor", permission="write",
                input_model=PromoteSignalToAccountInput, handler=_promote_signal_to_account,
                tags=frozenset({"novendor", "signals", "write"})),

        ToolDef(name="novendor.signals.link_signal_to_outreach_angle",
                description="Connect a trigger signal to the outreach angle it should inform. Updates the account hypothesis. Requires confirm=true.",
                module="novendor", permission="write",
                input_model=LinkSignalToOutreachAngleInput, handler=_link_signal_to_outreach_angle,
                tags=frozenset({"novendor", "signals", "write"})),

        ToolDef(name="novendor.signals.refresh_priority_scores",
                description="Recompute readiness and rank scores for all active Novendor accounts. Call after bulk research updates. Requires confirm=true.",
                module="novendor", permission="write",
                input_model=RefreshPriorityScoresInput, handler=_refresh_priority_scores,
                tags=frozenset({"novendor", "signals", "write"})),
    ]

    for tool in _pipeline + _contacts + _outreach + _proof + _tasks + _signals:
        registry.register(tool)
