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
    # ── Real target accounts from signal discovery (2026-03-26 to 2026-03-30) ──
    {"name": "Marcus Partners", "industry": "real_estate", "ai": "exploring", "pain": "reporting_chaos", "size": "50_200", "budget": 35000, "source": "research_loop"},
    {"name": "GAIA Real Estate", "industry": "real_estate", "ai": "exploring", "pain": "efficiency", "size": "50_200", "budget": 7500, "source": "research_loop"},
    {"name": "Comvest Private Equity", "industry": "financial_services", "ai": "piloting", "pain": "reporting_chaos", "size": "200_1000", "budget": 7500, "source": "research_loop"},
    {"name": "ACG South Florida", "industry": "professional_services", "ai": "exploring", "pain": "other", "size": "10_50", "budget": 5000, "source": "event"},
    {"name": "Canopy Real Estate Partners", "industry": "real_estate", "ai": "none", "pain": "reporting_chaos", "size": "10_50", "budget": 35000, "source": "research_loop"},
    {"name": "Hidden Harbor Capital", "industry": "financial_services", "ai": "exploring", "pain": "efficiency", "size": "50_200", "budget": 7500, "source": "research_loop"},
    {"name": "Apex Service Partners", "industry": "professional_services", "ai": "exploring", "pain": "reporting_chaos", "size": "1000_plus", "budget": 7500, "source": "research_loop"},
    {"name": "FIU College of Business", "industry": "education", "ai": "exploring", "pain": "other", "size": "1000_plus", "budget": 5000, "source": "event"},
    {"name": "Greystar Investment Group", "industry": "real_estate", "ai": "scaling", "pain": "reporting_chaos", "size": "1000_plus", "budget": 35000, "source": "research_loop"},
]

_SEED_CONTACTS = [
    {"lead_idx": 0, "name": "Jay McNamara", "email": "jmcnamara@marcuspartners.com", "title": "Managing Director, Operations", "linkedin": "linkedin.com/in/jay-mcnamara-marcus", "role": "decision_maker", "strength": "cold"},
    {"lead_idx": 1, "name": "Pascual Korchmar", "email": "pkorchmar@gaiare.com", "title": "Managing Director", "linkedin": "linkedin.com/in/pascualkorchmar", "role": "decision_maker", "strength": "cold"},
    {"lead_idx": 4, "name": "Jay Rollins", "email": "jrollins@canopyrep.com", "title": "Founder & Managing Partner", "linkedin": "linkedin.com/in/jay-rollins-canopy", "role": "decision_maker", "strength": "cold"},
    {"lead_idx": 5, "name": "Justin Martino", "email": "jmartino@hh-cp.com", "title": "Managing Partner", "linkedin": "linkedin.com/in/justinmartino", "role": "decision_maker", "strength": "cold"},
]

_SEED_TEMPLATES = [
    {
        "name": "Touch 1 — REPE Fund LP Reporting (Marcus / Canopy)",
        "channel": "email",
        "category": "cold_outreach",
        "subject": "LP reporting after a major fund close",
        "body": "Hi {{name}},\n\nCongratulations on the fund close — that's a significant milestone.\n\nWhat I've seen working with mid-market REPE firms is that the LP reporting burden scales faster than anyone expects. New fund = new LP base = new reporting requirements. ILPA's Q1 2026 templates are now standard, which means quarterly packages that used to take 2 days now require 2 weeks of data assembly across multiple systems.\n\nWe help firms build automated LP reporting infrastructure — a single data pipeline that feeds standardized ILPA-compliant packages, investor dashboards, and portfolio analytics. The typical result is a 75% reduction in reporting prep time.\n\nWould you be open to a 20-minute call to compare notes on how other firms your size handle this?\n\nBest,\nPaul",
    },
    {
        "name": "Touch 1 — PE Portfolio Operations (Comvest / Hidden Harbor)",
        "channel": "email",
        "category": "cold_outreach",
        "subject": "Portfolio reporting across 20+ companies",
        "body": "Hi {{name}},\n\nManaging a portfolio with dozens of operating companies creates a specific kind of operational challenge: every add-on acquisition brings its own reporting stack, its own data formats, and its own definition of basic metrics.\n\nThe result is a value creation team spending more time collecting and normalizing data than actually analyzing performance. Integration complexity compounds with every new platform company.\n\nWe help PE firms build centralized portfolio visibility — standardized reporting across all portcos, automated performance dashboards, and early warning systems that surface underperformers before quarterly reviews.\n\nWould you be open to a 20-minute call to discuss how firms with similar portfolio sizes approach this?\n\nBest,\nPaul",
    },
    {
        "name": "Touch 1 — PE-Backed Roll-Up Operations (Apex)",
        "channel": "email",
        "category": "cold_outreach",
        "subject": "Operational visibility across 100+ brands",
        "body": "Hi {{name}},\n\nRunning 107 brands under one platform is operationally unique. Each brand has its own P&L, its own operational cadence, and its own definition of success metrics.\n\nWhat I've seen working with multi-brand platforms is that the reporting gap between what the sponsor needs and what each brand produces grows with every acquisition. The value creation team ends up building one-off Excel models for each review cycle.\n\nWe help multi-brand platforms build a centralized operational layer — real-time performance dashboards, standardized KPI definitions across all brands, and automated exception reporting that surfaces the 5 brands that need attention this week.\n\nWould you be open to a 20-minute conversation?\n\nBest,\nPaul",
    },
    {
        "name": "Touch 2 — LinkedIn Follow-up",
        "channel": "linkedin",
        "category": "social",
        "subject": None,
        "body": "Hi {{name}}, just connected — I work with {{industry}} firms on AI-powered operational systems. Curious what your biggest reporting or ops challenge looks like right now.",
    },
    {
        "name": "Touch 3 — One-Pager Offer",
        "channel": "email",
        "category": "follow_up",
        "subject": "RE: {{subject}} — one-pager",
        "body": "Hi {{name}},\n\nFollowing up on my email last week. I'd like to send you a one-pager on how firms like yours have structured operational systems around {{pain_area}}. Usually cuts 15–20 hours per reporting cycle. No strings attached if you're not exploring this right now.\n\nLet me know.\n\nPaul",
    },
]


def reset_and_reseed(*, env_id: str, business_id: UUID) -> dict:
    """Delete all CRM/CRO data for this env and reseed with current _SEED_LEADS."""
    with get_cursor() as cur:
        tenant_id = resolve_tenant_id(cur, business_id)
        # Tables keyed by business_id (env-scoped)
        for table in [
            "cro_next_action",
            "cro_outreach_log",
            "cro_proposal",
            "cro_lead_profile",
            "cro_outreach_template",
            "cro_proof_asset",
            "cro_objection",
            "cro_demo_readiness",
        ]:
            cur.execute(
                f"DELETE FROM {table} WHERE business_id = %s",  # noqa: S608
                (str(business_id),),
            )
        # Tables keyed by tenant_id (CRM native tables)
        for table in [
            "crm_activity",
            "crm_opportunity",
            "crm_contact",
            "crm_account",
        ]:
            cur.execute(
                f"DELETE FROM {table} WHERE tenant_id = %s",  # noqa: S608
                (str(tenant_id),),
            )
    return seed_consulting_environment(env_id=env_id, business_id=business_id)


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

            # Assign pipeline stages based on actual research/outreach status per company
            # 0=Marcus(identified), 1=GAIA(identified), 2=Comvest(research),
            # 3=ACG(research), 4=Canopy(identified), 5=Hidden Harbor(identified),
            # 6=Apex(research), 7=FIU(research), 8=Greystar(research)
            lead_stages = [
                "identified", "identified", "research", "research", "identified",
                "identified", "research", "research", "research",
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
        # Real outreach history matching the top-5 sequence drafts
        import random
        random.seed(42)  # deterministic for demo
        now = datetime.now(timezone.utc)

        # No outreach sent yet — these are all in research/identified stage
        # Outreach log will be populated as messages are actually sent
        _OUTREACH_LOG_ENTRIES = []

        for entry in _OUTREACH_LOG_ENTRIES:
            (ai, ci, ti, channel, subject, preview, days_ago, replied, sentiment, booked) = entry
            sent_at = now - timedelta(days=days_ago)
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
                    str(account_ids[ai]),
                    str(contact_ids[ci]) if ci is not None and ci < len(contact_ids) else None,
                    str(template_ids[ti]) if ti < len(template_ids) else None,
                    channel, "outbound", subject, preview,
                    sent_at,
                    (sent_at + timedelta(days=random.randint(1, 3))) if replied else None,
                    sentiment, booked, "paul@novendor.co",
                ),
            )
            counts["outreach_logs_seeded"] += 1

        # ── 6. Opportunities + Proposals ──────────────────────────────
        # Real deals spread across all active stages with next_actions and activities
        # Format: (stage, amount, name, scope, next_action_desc, next_action_type, due_offset_days, activity_type, activity_subject, activity_days_ago)
        _OPP_DATA = [
            ("contacted", 35000, "Marcus Partners — Winston REPE Pilot",
             "LP reporting automation for $875M Fund V. ILPA-compliant quarterly packages, investor dashboards, portfolio analytics.",
             "Send LinkedIn message to Jay McNamara", "linkedin", 0, "email", "Sent initial outreach email", 2),
            ("engaged", 7500, "GAIA Real Estate — AI Diagnostic",
             "Operational readiness assessment for South Florida expansion. Gap analysis across reporting and AI maturity.",
             "Schedule discovery call or demo", "meeting", 1, "call", "Intro call — discussed expansion pain", 1),
            ("research", 7500, "Comvest Private Equity — AI Diagnostic",
             "Portfolio operations assessment across 166 portfolio companies. Standardize reporting and integration bottlenecks.",
             "Identify decision maker and validate fit", "research", -2, "note", "Researched portfolio structure", 5),
            ("identified", 35000, "Canopy Real Estate Partners — Winston REPE Pilot",
             "Greenfield fund ops infrastructure for $75M inaugural fund. LP reporting, ILPA compliance, portfolio tracking.",
             "Enrich contact and find outreach angle", "email", 2, "note", "Reviewed fund filing and team", 4),
            ("qualified", 15000, "Hidden Harbor Capital — Ops Platform",
             "Centralized portfolio visibility layer across 12 portfolio companies. Automated performance dashboards.",
             "Draft and send proposal", "proposal", 3, "meeting", "Discovery call — mapped reporting stack", 1),
            ("proposal", 75000, "Apex Service Partners — Enterprise Data Layer",
             "Enterprise data layer across 107 service brands. Real-time KPI dashboards and exception reporting.",
             "Follow up and address objections", "follow_up", -1, "email", "Sent proposal v2 with revised pricing", 4),
            ("meeting", 5000, "FIU College of Business — Workshop",
             "AI workshop for executive MBA cohort. 3-hour session on operational AI for finance leaders.",
             "Prepare diagnostic or proof asset", "proposal", 2, "meeting", "Scoped workshop agenda and logistics", 3),
            ("contacted", 35000, "Greystar Investment Group — REPE Pilot",
             "Portfolio analytics and LP reporting for $2.4B multi-family portfolio. Asset-level dashboards.",
             "Send first outreach message", "follow_up", -3, "email", "Initial outreach sent via LinkedIn", 8),
        ]
        for i in range(min(len(_OPP_DATA), len(account_ids))):
            acct_id = account_ids[i]
            (stage_key, amount_int, opp_name, scope_text,
             na_desc, na_type, na_due_offset,
             act_type, act_subject, act_days_ago) = _OPP_DATA[i]
            opp_status = "won" if stage_key == "closed_won" else "open"
            amount = Decimal(str(amount_int))

            _thesis = "Operational data platform for investment decision-making"
            _pain = _SEED_LEADS[i].get("pain", "reporting_chaos")
            _angle = "AI-enabled execution system replaces manual workflow and reduces headcount dependency"

            # Set primary_contact_id if contact exists for this account
            primary_contact = None
            for ci, sc in enumerate(_SEED_CONTACTS):
                if sc["lead_idx"] == i and ci < len(contact_ids):
                    primary_contact = contact_ids[ci]
                    break

            cur.execute(
                """
                INSERT INTO crm_opportunity
                  (tenant_id, business_id, crm_account_id, crm_pipeline_stage_id,
                   name, status, amount, expected_close_date,
                   primary_contact_id,
                   thesis, pain, winston_angle)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING crm_opportunity_id
                """,
                (
                    tenant_id, str(business_id), str(acct_id),
                    str(stage_map[stage_key]),
                    opp_name,
                    opp_status, str(amount),
                    (date.today() + timedelta(days=30 * (i + 1))).isoformat(),
                    str(primary_contact) if primary_contact else None,
                    _thesis, _pain, _angle,
                ),
            )
            opp = cur.fetchone()
            opp_id = opp["crm_opportunity_id"]

            # ── Seed next_action for this opportunity ────────────────
            cur.execute(
                """
                INSERT INTO cro_next_action
                  (env_id, business_id, entity_type, entity_id,
                   action_type, description, due_date, priority)
                VALUES (%s, %s, 'opportunity', %s, %s, %s, %s, %s)
                """,
                (
                    env_id, str(business_id), str(opp_id),
                    na_type, na_desc,
                    (date.today() + timedelta(days=na_due_offset)).isoformat(),
                    "high" if na_due_offset <= 0 else "normal",
                ),
            )

            # ── Seed activity for this opportunity ────────────────────
            act_date = datetime.now(timezone.utc) - timedelta(days=act_days_ago)
            cur.execute(
                """
                INSERT INTO crm_activity
                  (tenant_id, business_id, crm_account_id, crm_opportunity_id,
                   activity_type, subject, activity_date)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    tenant_id, str(business_id), str(acct_id), str(opp_id),
                    act_type, act_subject, act_date,
                ),
            )

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
                    scope_text,
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
        # Real research activity per company — all in early stage
        _LEAD_ACTIVITIES = [
            # 0 — Marcus Partners
            [
                ("note", "Research: $875M Fund V closed, ILPA compliance pressure", "Marcus Partners completed fundraising for largest fund to date ($875M). East Coast expansion. ILPA Q1 2026 templates now required — creates LP reporting urgency.", 5),
                ("note", "Contact identified: Jay McNamara, MD Operations", "Found via LinkedIn. Managing Director of Operations. Responsible for fund operations and LP reporting. jmcnamara@marcuspartners.com (inferred).", 3),
            ],
            # 1 — GAIA Real Estate
            [
                ("note", "Research: New MD hire, SoFla expansion", "GAIA hired Pascual Korchmar as Managing Director. Expanding into South Florida multifamily. Local presence = warm path for Novendor.", 5),
                ("note", "Contact confirmed: Pascual Korchmar, MD", "LinkedIn profile confirmed. Recently joined GAIA from prior REPE role. SoFla based. pkorchmar@gaiare.com (inferred from domain).", 3),
            ],
            # 2 — Comvest Private Equity
            [
                ("note", "Research: $10.4B AUM, 166 portfolio companies", "Comvest: West Palm Beach HQ. 166 portfolio companies. Jan 2026 invested in Corvid Technologies. Active FL add-ons (Bland Landscaping, CSS). Massive portco reporting challenge.", 4),
                ("note", "Action needed: find value creation team contact", "No named contact yet. Need to search LinkedIn for VP Value Creation or equivalent at Comvest Partners.", 2),
            ],
            # 3 — ACG South Florida
            [
                ("note", "Research: AI + PE events, DealMAX 2026", "ACG South Florida runs quarterly events focused on middle-market PE. AI + PE ops workshop = pipeline opportunity. DealMAX 2026 on calendar.", 5),
            ],
            # 4 — Canopy Real Estate Partners
            [
                ("note", "Research: $75M inaugural fund closed Mar 18", "Canopy RE Partners: Denver-based. Jay Rollins founder. $75M inaugural fund closed March 18, 2026. Emerging sponsor = greenfield ops. No legacy systems.", 4),
                ("note", "Contact identified: Jay Rollins, Founder", "LinkedIn confirmed. Jay Rollins is Founder & Managing Partner. Need warm intro — checking mutual connections.", 2),
            ],
            # 5 — Hidden Harbor Capital
            [
                ("note", "Research: active FL roll-up, 24 portcos", "Hidden Harbor: Boca Raton. 24 portfolio companies. Just acquired Paramount Painting. Active roll-up = compounding integration complexity. Justin Martino is MP.", 4),
                ("note", "Contact identified: Justin Martino, Managing Partner", "LinkedIn confirmed. Justin Martino, Managing Partner at Hidden Harbor Capital Partners. jmartino@hh-cp.com (inferred).", 3),
            ],
            # 6 — Apex Service Partners
            [
                ("note", "Research: 107 brands, $1.3B revenue, Alpine-backed", "Apex Service Partners: Tampa HQ. 107 service brands. $1.3B revenue. Backed by Alpine Investors. Massive multi-brand ops challenge.", 5),
                ("note", "Action needed: find VP Ops or COO", "No named contact yet. Check Alpine Investors operating partner network for intro path.", 2),
            ],
            # 7 — FIU College of Business
            [
                ("note", "Research: AI Strategy program, AI 305 Conference", "FIU College of Business runs AI Strategy for Business Leaders exec ed program. AI 305 Conference October 2026. Guest speaking opportunity.", 5),
            ],
            # 8 — Greystar Investment Group
            [
                ("note", "Research: GEP XII fund raise, 893K+ units globally", "Greystar: largest apartment operator globally. GEP XII fund raise active. 893K+ units. LP reporting burden across multiple fund vehicles is massive.", 3),
                ("note", "Action needed: find fund ops contact", "No named contact. Need to identify VP Fund Operations or similar at Greystar via LinkedIn.", 1),
            ],
        ]
        counts["activities_seeded"] = 0
        for idx, acct_id in enumerate(account_ids):
            activities = _LEAD_ACTIVITIES[idx] if idx < len(_LEAD_ACTIVITIES) else []
            for act_type, act_subject, act_notes, days_ago in activities:
                act_date = now - timedelta(days=days_ago)
                cur.execute(
                    """
                    INSERT INTO crm_activity
                      (tenant_id, business_id, crm_account_id, activity_type, subject, notes, activity_date)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    """,
                    (tenant_id, str(business_id), str(acct_id), act_type, act_subject, act_notes, act_date),
                )
                counts["activities_seeded"] += 1

        # ── 11. Next actions for each lead ────────────────────────────
        # Real next steps per company — all require action to advance
        today = date.today()
        _LEAD_NEXT_ACTIONS = [
            # 0 — Marcus Partners — contact found → send intro email
            ("account", "email", "Send intro email to Jay McNamara at Marcus Partners — reference $875M Fund V close + ILPA reporting pressure", "urgent", today + timedelta(days=1)),
            # 1 — GAIA Real Estate — contact found → LinkedIn connect + intro
            ("account", "linkedin", "LinkedIn connect with Pascual Korchmar at GAIA Real Estate — reference SoFla expansion + operational readiness", "urgent", today + timedelta(days=1)),
            # 2 — Comvest — need to find contact first
            ("account", "research", "Find VP Value Creation or equivalent at Comvest Partners on LinkedIn — 166 portcos need ops visibility", "high", today),
            # 3 — ACG South Florida — propose workshop
            ("account", "email", "Email ACG SoFla events team (southflorida@acg.org) — propose AI + PE ops workshop for Q2 2026", "high", today + timedelta(days=2)),
            # 4 — Canopy RE Partners — find warm intro
            ("account", "research", "Check LinkedIn mutual connections to Jay Rollins at Canopy RE Partners — need warm intro path", "high", today + timedelta(days=1)),
            # 5 — Hidden Harbor Capital — research Justin Martino
            ("account", "research", "Research Justin Martino background at Hidden Harbor Capital — draft personalized intro referencing Paramount Painting acquisition", "normal", today + timedelta(days=2)),
            # 6 — Apex Service Partners — find ops contact
            ("account", "research", "Find VP Ops or COO at Apex Service Partners — check Alpine Investors operating partner network for intro", "normal", today + timedelta(days=1)),
            # 7 — FIU — email exec ed team
            ("account", "email", "Email fiuExecEd@fiu.edu — propose guest lecture on AI operations in PE/RE for exec ed program", "normal", today + timedelta(days=2)),
            # 8 — Greystar — find fund ops contact
            ("account", "research", "Find VP Fund Operations at Greystar on LinkedIn — GEP XII fund raise = LP reporting conversation opener", "normal", today + timedelta(days=3)),
        ]
        counts["next_actions_seeded"] = 0
        for idx, acct_id in enumerate(account_ids):
            if idx >= len(_LEAD_NEXT_ACTIONS):
                break
            entity_type, action_type, description, priority, due = _LEAD_NEXT_ACTIONS[idx]
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
        {"type": "diagnostic_questionnaire", "title": "AI Operations Diagnostic Questionnaire", "desc": "Structured 30-minute assessment covering AI maturity, reporting workflows, vendor landscape, and governance gaps. Used as first meeting leave-behind.", "status": "ready"},
        {"type": "offer_sheet", "title": "Consulting Offer Sheet — One Page", "desc": "Single-page overview of Novendor consulting services: AI operations assessment, workflow automation, vendor consolidation, and ongoing advisory retainer.", "status": "ready"},
        {"type": "workflow_example", "title": "Workflow: Replace Spreadsheet Reporting", "desc": "Before/after showing how a 40-hour monthly close process was reduced to 8 hours via automated data pipeline and dashboard generation.", "status": "ready"},
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
