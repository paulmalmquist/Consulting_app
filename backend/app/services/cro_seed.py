"""Consulting Revenue OS – Seed data service.

Seeds a consulting environment with realistic demo data:
- 10 leads (crm_account + cro_lead_profile)
- 5 contacts with profiles
- 3 outreach templates
- 15 outreach log entries
- 5 proposals
- 3 clients with engagements + revenue schedules
- Initial metrics snapshot
"""
from __future__ import annotations

import json
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from uuid import UUID

from app.db import get_cursor
from app.observability.logger import emit_log
from app.services import cro_loops
from app.services.reporting_common import normalize_key, resolve_tenant_id


_SEED_LEADS = [
    # ── Client-hunting Tier 1 + Tier 2 targets ──
    {"name": "ZRS Management", "industry": "real_estate", "ai": "none", "pain": "reporting_chaos", "size": "1000_plus", "budget": 180000, "source": "research_loop"},
    {"name": "13th Floor Investments", "industry": "real_estate", "ai": "exploring", "pain": "reporting_chaos", "size": "10_50", "budget": 150000, "source": "research_loop"},
    {"name": "Bay Property Management Group", "industry": "real_estate", "ai": "none", "pain": "efficiency", "size": "200_1000", "budget": 120000, "source": "research_loop"},
    {"name": "Bilzin Sumberg", "industry": "legal", "ai": "exploring", "pain": "governance_gap", "size": "200_1000", "budget": 100000, "source": "research_loop"},
    {"name": "Pebb Capital", "industry": "real_estate", "ai": "exploring", "pain": "reporting_chaos", "size": "10_50", "budget": 75000, "source": "research_loop"},
    # ── Construction PDS targets ──
    {"name": "McAlvain Construction", "industry": "construction", "ai": "none", "pain": "erp_failure", "size": "200_1000", "budget": 100000, "source": "research_loop"},
    {"name": "Kaufman Lynn Construction", "industry": "construction", "ai": "none", "pain": "governance_gap", "size": "200_1000", "budget": 80000, "source": "research_loop"},
    {"name": "Galaxy Builders", "industry": "construction", "ai": "none", "pain": "erp_failure", "size": "50_200", "budget": 60000, "source": "research_loop"},
    # ── Law firm targets ──
    {"name": "Weiss Serota Helfman Cole & Bierman", "industry": "legal", "ai": "none", "pain": "governance_gap", "size": "200_1000", "budget": 200000, "source": "research_loop"},
    {"name": "Stearns Weaver Miller", "industry": "legal", "ai": "exploring", "pain": "reporting_chaos", "size": "200_1000", "budget": 100000, "source": "research_loop"},
]

_SEED_CONTACTS = [
    {"lead_idx": 0, "name": "Jackie Impellitier", "email": "jfi@zrsmanagement.com", "title": "COO", "linkedin": None, "role": "decision_maker", "strength": "warm"},
    {"lead_idx": 1, "name": "Rey Melendi", "email": "rmelendi@13fi.com", "title": "COO & Principal", "linkedin": "linkedin.com/in/rey-melendi-850a9a12", "role": "decision_maker", "strength": "cold"},
    {"lead_idx": 2, "name": "Tony Cook", "email": "tcook@baymgmtgroup.com", "title": "COO", "linkedin": None, "role": "decision_maker", "strength": "warm"},
    {"lead_idx": 3, "name": "Michelle Weber", "email": "mweber@bilzin.com", "title": "COO", "linkedin": "linkedin.com/in/michelle-weber-5270275", "role": "decision_maker", "strength": "cold"},
    {"lead_idx": 4, "name": "Lori Worman", "email": "lworman@pebbcap.com", "title": "MD Operations", "linkedin": None, "role": "decision_maker", "strength": "cold"},
]

_SEED_TEMPLATES = [
    {"name": "AI Maturity Assessment", "channel": "email", "category": "cold_outreach", "subject": "AI readiness assessment for {{company}}", "body": "Hi {{name}}, I noticed {{company}} is {{ai_stage}} in AI adoption. We help companies like yours accelerate their AI journey with a structured maturity assessment..."},
    {"name": "ERP Pain Discovery", "channel": "email", "category": "pain_driven", "subject": "Re: {{pain_point}} at {{company}}", "body": "Hi {{name}}, many {{industry}} companies face {{pain_point}}. Our consulting team has helped 20+ firms transform their operations..."},
    {"name": "LinkedIn Connection", "channel": "linkedin", "category": "social", "subject": None, "body": "Hi {{name}}, I lead the consulting practice at Novendor. Would love to connect and share insights on {{topic}}..."},
]


def seed_consulting_environment(*, env_id: str, business_id: UUID) -> dict:
    """Seed a consulting environment with demo data."""
    counts = {
        "pipeline_stages_seeded": 0,
        "leads_seeded": 0,
        "contacts_seeded": 0,
        "outreach_templates_seeded": 0,
        "outreach_logs_seeded": 0,
        "proposals_seeded": 0,
        "clients_seeded": 0,
        "engagements_seeded": 0,
        "revenue_entries_seeded": 0,
        "loops_seeded": 0,
    }

    with get_cursor() as cur:
        tenant_id = resolve_tenant_id(cur, business_id)

        # ── 1. Pipeline stages ────────────────────────────────────────
        from app.services.cro_pipeline import _CONSULTING_STAGES
        for key, label, order, prob, closed, won in _CONSULTING_STAGES:
            cur.execute(
                """
                INSERT INTO crm_pipeline_stage
                  (tenant_id, business_id, key, label, stage_order, win_probability, is_closed, is_won)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (tenant_id, business_id, key) DO NOTHING
                """,
                (tenant_id, str(business_id), key, label, order, prob, closed, won),
            )
        counts["pipeline_stages_seeded"] = len(_CONSULTING_STAGES)

        # Get stage IDs for later use
        cur.execute(
            "SELECT crm_pipeline_stage_id, key FROM crm_pipeline_stage WHERE tenant_id = %s AND business_id = %s",
            (tenant_id, str(business_id)),
        )
        stage_map = {r["key"]: r["crm_pipeline_stage_id"] for r in cur.fetchall()}

        # ── 2. Leads ──────────────────────────────────────────────────
        account_ids = []
        for lead in _SEED_LEADS:
            cur.execute(
                """
                INSERT INTO crm_account (tenant_id, business_id, external_key, name, account_type, industry)
                VALUES (%s, %s, %s, %s, 'prospect', %s)
                ON CONFLICT (tenant_id, external_key) DO UPDATE SET name = EXCLUDED.name
                RETURNING crm_account_id
                """,
                (tenant_id, str(business_id), normalize_key(lead["name"]), lead["name"], lead["industry"]),
            )
            acct = cur.fetchone()
            account_ids.append(acct["crm_account_id"])

            from app.services.cro_leads import _compute_lead_score_with_breakdown
            score, breakdown = _compute_lead_score_with_breakdown(
                ai_maturity=lead["ai"], pain_category=lead["pain"],
                company_size=lead["size"],
                estimated_budget=Decimal(str(lead["budget"])) if lead["budget"] else None,
                lead_source=lead["source"],
            )

            # Assign pipeline stages to leads based on position
            lead_stages = [
                "engaged", "meeting", "contacted", "identified", "proposal",
                "qualified", "research", "research", "identified", "meeting",
            ]
            lead_stage = lead_stages[len(account_ids) - 1]

            cur.execute(
                """
                INSERT INTO cro_lead_profile
                  (crm_account_id, env_id, business_id, ai_maturity, pain_category,
                   lead_score, score_breakdown, pipeline_stage, lead_source, company_size, estimated_budget)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (crm_account_id) DO NOTHING
                """,
                (
                    str(acct["crm_account_id"]), env_id, str(business_id),
                    lead["ai"], lead["pain"], score, json.dumps(breakdown),
                    lead_stage, lead["source"], lead["size"],
                    str(lead["budget"]) if lead["budget"] else None,
                ),
            )
            counts["leads_seeded"] += 1

        # ── 3. Contacts ───────────────────────────────────────────────
        contact_ids = []
        for c in _SEED_CONTACTS:
            acct_id = account_ids[c["lead_idx"]]
            cur.execute(
                """
                INSERT INTO crm_contact (tenant_id, business_id, crm_account_id, full_name, email, title)
                VALUES (%s, %s, %s, %s, %s, %s)
                RETURNING crm_contact_id
                """,
                (tenant_id, str(business_id), str(acct_id), c["name"], c["email"], c["title"]),
            )
            contact = cur.fetchone()
            contact_ids.append(contact["crm_contact_id"])

            cur.execute(
                """
                INSERT INTO cro_contact_profile
                  (crm_contact_id, env_id, business_id, linkedin_url, decision_role, relationship_strength)
                VALUES (%s, %s, %s, %s, %s, %s)
                ON CONFLICT (crm_contact_id) DO NOTHING
                """,
                (str(contact["crm_contact_id"]), env_id, str(business_id), c["linkedin"], c["role"], c["strength"]),
            )
            counts["contacts_seeded"] += 1

        # ── 4. Outreach templates ─────────────────────────────────────
        template_ids = []
        for t in _SEED_TEMPLATES:
            cur.execute(
                """
                INSERT INTO cro_outreach_template
                  (env_id, business_id, name, channel, category, subject_template, body_template)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                RETURNING id
                """,
                (env_id, str(business_id), t["name"], t["channel"], t["category"], t["subject"], t["body"]),
            )
            template_ids.append(cur.fetchone()["id"])
            counts["outreach_templates_seeded"] += 1

        # ── 5. Outreach log entries ───────────────────────────────────
        import random
        random.seed(42)  # deterministic for demo
        channels = ["email", "linkedin", "phone"]
        sentiments = ["positive", "neutral", "negative"]
        now = datetime.now(timezone.utc)
        for i in range(15):
            acct_idx = i % len(account_ids)
            contact_idx = i % len(contact_ids) if contact_ids else None
            tmpl_idx = i % len(template_ids)
            sent_at = now - timedelta(days=random.randint(1, 30))
            replied = random.random() > 0.6
            booked = replied and random.random() > 0.7

            cur.execute(
                """
                INSERT INTO cro_outreach_log
                  (env_id, business_id, crm_account_id, crm_contact_id, template_id,
                   channel, direction, subject, body_preview, sent_at,
                   replied_at, reply_sentiment, meeting_booked, sent_by)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    env_id, str(business_id),
                    str(account_ids[acct_idx]),
                    str(contact_ids[contact_idx]) if contact_idx is not None else None,
                    str(template_ids[tmpl_idx]),
                    channels[i % 3], "outbound",
                    f"Outreach #{i+1}", f"Preview for touch #{i+1}",
                    sent_at,
                    (sent_at + timedelta(days=random.randint(1, 5))) if replied else None,
                    random.choice(sentiments) if replied else None,
                    booked, "seed@novendor.co",
                ),
            )
            counts["outreach_logs_seeded"] += 1

        # ── 6. Opportunities + Proposals ──────────────────────────────
        stages_for_opps = ["meeting", "proposal", "qualified", "closed_won", "closed_won"]
        for i in range(5):
            acct_id = account_ids[i]
            stage_key = stages_for_opps[i]
            opp_status = "won" if stage_key == "closed_won" else "open"
            amount = Decimal(str([150000, 200000, 80000, 120000, 300000][i]))

            cur.execute(
                """
                INSERT INTO crm_opportunity
                  (tenant_id, business_id, crm_account_id, crm_pipeline_stage_id,
                   name, status, amount, expected_close_date)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING crm_opportunity_id
                """,
                (
                    tenant_id, str(business_id), str(acct_id),
                    str(stage_map[stage_key]),
                    f"{_SEED_LEADS[i]['name']} - AI Engagement",
                    opp_status, str(amount),
                    (date.today() + timedelta(days=30 * (i + 1))).isoformat(),
                ),
            )
            opp = cur.fetchone()

            cost = amount * Decimal("0.55")
            margin = round((amount - cost) / amount, 4)
            status = "accepted" if stage_key == "closed_won" else "sent"

            cur.execute(
                """
                INSERT INTO cro_proposal
                  (env_id, business_id, crm_opportunity_id, crm_account_id,
                   title, status, pricing_model, total_value, cost_estimate, margin_pct,
                   valid_until, scope_summary)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id
                """,
                (
                    env_id, str(business_id), str(opp["crm_opportunity_id"]), str(acct_id),
                    f"Proposal: {_SEED_LEADS[i]['name']}",
                    status, "fixed", str(amount), str(cost), str(margin),
                    (date.today() + timedelta(days=60)).isoformat(),
                    f"AI consulting engagement for {_SEED_LEADS[i]['name']}",
                ),
            )
            proposal = cur.fetchone()
            counts["proposals_seeded"] += 1

            # ── 7. Convert won opps to clients ────────────────────────
            if stage_key == "closed_won":
                cur.execute(
                    """
                    UPDATE crm_account SET account_type = 'customer' WHERE crm_account_id = %s
                    """,
                    (str(acct_id),),
                )
                cur.execute(
                    """
                    INSERT INTO cro_client
                      (env_id, business_id, crm_account_id, crm_opportunity_id, proposal_id,
                       account_owner, start_date)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    RETURNING id
                    """,
                    (
                        env_id, str(business_id), str(acct_id),
                        str(opp["crm_opportunity_id"]),
                        str(proposal["id"]),
                        "seed@novendor.co",
                        (date.today() - timedelta(days=30 * (5 - i))).isoformat(),
                    ),
                )
                client_row = cur.fetchone()
                counts["clients_seeded"] += 1

                # ── 8. Create engagements ─────────────────────────────
                eng_types = ["strategy", "implementation"]
                for etype in eng_types:
                    budget = amount * Decimal("0.50") if etype == "strategy" else amount * Decimal("0.50")
                    spend = budget * Decimal("0.6")
                    margin_e = round((budget - spend) / budget, 4) if budget > 0 else None

                    cur.execute(
                        """
                        INSERT INTO cro_engagement
                          (env_id, business_id, client_id, name, engagement_type,
                           budget, actual_spend, margin_pct, start_date)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                        RETURNING id
                        """,
                        (
                            env_id, str(business_id), str(client_row["id"]),
                            f"{etype.title()} for {_SEED_LEADS[i]['name']}",
                            etype, str(budget), str(spend),
                            str(margin_e) if margin_e else None,
                            (date.today() - timedelta(days=30)).isoformat(),
                        ),
                    )
                    eng = cur.fetchone()
                    counts["engagements_seeded"] += 1

                    # ── 9. Revenue schedule entries ───────────────────
                    for month_offset in range(3):
                        period = date.today().replace(day=1) + timedelta(days=30 * month_offset)
                        inv_status = "paid" if month_offset == 0 else "scheduled"
                        cur.execute(
                            """
                            INSERT INTO cro_revenue_schedule
                              (env_id, business_id, engagement_id, client_id, period_date, amount,
                               invoice_status, paid_at)
                            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                            """,
                            (
                                env_id, str(business_id), str(eng["id"]), str(client_row["id"]),
                                period.isoformat(), str(budget / 3),
                                inv_status,
                                datetime.now(timezone.utc).isoformat() if inv_status == "paid" else None,
                            ),
                        )
                        counts["revenue_entries_seeded"] += 1

        # ── 10. Activities for each lead ──────────────────────────────
        activity_templates = [
            ("note", "Lead created via seed", "Initial prospect identified and added to pipeline"),
            ("email", "Introduction email sent", "Sent initial outreach based on AI maturity assessment"),
            ("call", "Discovery call completed", "Discussed pain points and current technology stack"),
            ("meeting", "Strategy session scheduled", "Meeting set to review consulting proposal"),
            ("note", "Research completed", "Completed background research on company and decision makers"),
        ]
        counts["activities_seeded"] = 0
        for idx, acct_id in enumerate(account_ids):
            # Each lead gets 1-2 activities depending on position
            num_activities = 2 if idx < 5 else 1
            for act_offset in range(num_activities):
                act_type, act_subject, act_notes = activity_templates[(idx + act_offset) % len(activity_templates)]
                act_date = now - timedelta(days=random.randint(1, 14))
                cur.execute(
                    """
                    INSERT INTO crm_activity
                      (tenant_id, business_id, crm_account_id, activity_type, subject, notes, activity_date)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    """,
                    (tenant_id, str(business_id), str(acct_id), act_type, act_subject, act_notes, act_date),
                )
                counts["activities_seeded"] += 1

        # ── 11. Next actions for each lead ─────────���──────────────────
        action_templates = [
            ("account", "email", "Send follow-up email with AI maturity assessment", "high"),
            ("account", "call", "Schedule discovery call to discuss pain points", "normal"),
            ("account", "research", "Research company background and identify key contacts", "normal"),
            ("account", "meeting", "Prepare for strategy session", "high"),
            ("account", "follow_up", "Follow up on proposal sent last week", "urgent"),
            ("account", "linkedin", "Connect with decision maker on LinkedIn", "low"),
            ("account", "proposal", "Draft initial consulting proposal", "high"),
            ("account", "task", "Review company's recent press releases", "normal"),
            ("account", "follow_up", "Check in after initial introduction", "normal"),
            ("account", "research", "Analyze competitor landscape for account", "low"),
        ]
        counts["next_actions_seeded"] = 0
        today = date.today()
        for idx, acct_id in enumerate(account_ids):
            entity_type, action_type, description, priority = action_templates[idx]
            # Spread due dates: some overdue, some today, some future
            if idx < 3:
                due = today - timedelta(days=random.randint(1, 5))  # overdue
            elif idx < 5:
                due = today  # due today
            else:
                due = today + timedelta(days=random.randint(1, 7))  # upcoming
            cur.execute(
                """
                INSERT INTO cro_next_action
                  (env_id, business_id, entity_type, entity_id,
                   action_type, description, due_date, priority)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (env_id, str(business_id), entity_type, str(acct_id),
                 action_type, description, due, priority),
            )
            counts["next_actions_seeded"] += 1

    counts["loops_seeded"] = cro_loops.seed_default_loops(env_id=env_id, business_id=business_id)

    # ── 12. Proof assets ─────────────────────────────────────────
    counts["proof_assets_seeded"] = 0
    _SEED_PROOF_ASSETS = [
        {"type": "diagnostic_questionnaire", "title": "AI Operations Diagnostic Questionnaire", "desc": "Structured 30-minute assessment covering AI maturity, reporting workflows, vendor landscape, and governance gaps. Used as first meeting leave-behind.", "status": "draft"},
        {"type": "offer_sheet", "title": "Consulting Offer Sheet — One Page", "desc": "Single-page overview of Novendor consulting services: AI operations assessment, workflow automation, vendor consolidation, and ongoing advisory retainer.", "status": "draft"},
        {"type": "workflow_example", "title": "Workflow: Replace Spreadsheet Reporting", "desc": "Before/after showing how a 40-hour monthly close process was reduced to 8 hours via automated data pipeline and dashboard generation.", "status": "draft"},
        {"type": "workflow_example", "title": "Workflow: AI-Assisted Operational Assessment", "desc": "Walkthrough of the AI-assisted assessment process: intake questionnaire, automated gap analysis, prioritized recommendation deck.", "status": "draft"},
        {"type": "case_study", "title": "REPE Pilot Summary", "desc": "Summary of the REPE intelligence platform pilot: problem statement, approach, 12-week timeline, outcomes, and ROI metrics.", "status": "draft"},
    ]
    with get_cursor() as cur:
        for pa in _SEED_PROOF_ASSETS:
            cur.execute(
                """
                INSERT INTO cro_proof_asset
                  (env_id, business_id, asset_type, title, description, status)
                VALUES (%s, %s, %s, %s, %s, %s)
                ON CONFLICT DO NOTHING
                """,
                (env_id, str(business_id), pa["type"], pa["title"], pa["desc"], pa["status"]),
            )
            counts["proof_assets_seeded"] += 1

    # ── 13. Demo readiness ───────────────────────────────────────
    counts["demo_readiness_seeded"] = 0
    _SEED_DEMO_READINESS = [
        {"name": "REPE Intelligence Platform", "vertical": "real_estate", "status": "needs_refresh", "blockers": ["Lane A narration-only regression", "scenario engine health unverified"], "notes": "Core demo asset. Needs narration fix and scenario engine smoke test."},
        {"name": "PDS Enterprise OS", "vertical": "professional_services", "status": "blocked", "blockers": ["NaN bugs in Stone PDS", "analytics dashboard incomplete"], "notes": "Blocked on Stone PDS data quality. Do not demo until NaN resolved."},
        {"name": "Trading Platform", "vertical": "finance", "status": "needs_refresh", "blockers": ["Lane B latency", "stale seed data"], "notes": "Latency makes live demo risky. Pre-record or fix before scheduling."},
    ]
    with get_cursor() as cur:
        for dr in _SEED_DEMO_READINESS:
            cur.execute(
                """
                INSERT INTO cro_demo_readiness
                  (env_id, business_id, demo_name, vertical, status, blockers, notes)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (env_id, business_id, demo_name) DO NOTHING
                """,
                (env_id, str(business_id), dr["name"], dr["vertical"], dr["status"], dr["blockers"], dr["notes"]),
            )
            counts["demo_readiness_seeded"] += 1

    # ── 14. Objections ───────────────────────────────────────────
    counts["objections_seeded"] = 0
    _SEED_OBJECTIONS = [
        {"type": "trust", "summary": "How do I know Winston can handle our data securely?", "strategy": "Walk through SOC 2 readiness, data isolation per environment, and RLS policies. Offer sandbox trial.", "confidence": 3, "outcome": "pending"},
        {"type": "pricing", "summary": "Your retainer seems high for a firm our size.", "strategy": "Reframe as cost-per-insight vs. cost-per-seat. Show ROI from pilot outcomes. Offer phased engagement.", "confidence": 4, "outcome": "pending"},
        {"type": "need", "summary": "We already have Yardi for reporting.", "strategy": "Acknowledge Yardi strength in property management. Position Winston as the AI layer that sits on top, not replaces. Show integration demo.", "confidence": 4, "outcome": "pending"},
        {"type": "timing", "summary": "We're in the middle of a fund raise, bad timing.", "strategy": "Offer lightweight diagnostic now, full engagement post-raise. Use raise timeline as urgency — investors want AI story.", "confidence": 2, "outcome": "deferred"},
    ]
    with get_cursor() as cur:
        for obj in _SEED_OBJECTIONS:
            cur.execute(
                """
                INSERT INTO cro_objection
                  (env_id, business_id, objection_type, summary, response_strategy, confidence, outcome)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                """,
                (env_id, str(business_id), obj["type"], obj["summary"], obj["strategy"], obj["confidence"], obj["outcome"]),
            )
            counts["objections_seeded"] += 1

    emit_log(
        level="info",
        service="backend",
        action="cro.seed.completed",
        message=f"Seeded consulting environment {env_id}",
        context=counts,
    )

    return {"status": "seeded", **counts}
