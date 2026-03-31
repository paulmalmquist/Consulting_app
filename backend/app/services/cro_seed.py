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
    # ── Client-hunting Tier 1 (high-score targets) ──
    {"name": "ZRS Management", "industry": "real_estate", "ai": "scaling", "pain": "reporting_chaos", "size": "1000_plus", "budget": 500000, "source": "referral"},       # score: 16+20+12+20+20 = 88
    {"name": "13th Floor Investments", "industry": "real_estate", "ai": "piloting", "pain": "governance_gap", "size": "200_1000", "budget": 250000, "source": "event"},     # score: 12+20+20+16+16 = 84
    {"name": "Bay Property Management Group", "industry": "real_estate", "ai": "exploring", "pain": "reporting_chaos", "size": "200_1000", "budget": 150000, "source": "inbound"},  # score: 8+20+20+16+12 = 76
    # ── Client-hunting Tier 2 (mid-score targets) ──
    {"name": "Bilzin Sumberg", "industry": "legal", "ai": "exploring", "pain": "governance_gap", "size": "200_1000", "budget": 100000, "source": "partner"},               # score: 8+20+20+16+16 = 80
    {"name": "Pebb Capital", "industry": "real_estate", "ai": "piloting", "pain": "ai_roi", "size": "50_200", "budget": 200000, "source": "research_loop"},                 # score: 12+16+16+16+10 = 70
    # ── Construction PDS targets (varied) ──
    {"name": "McAlvain Construction", "industry": "construction", "ai": "none", "pain": "erp_failure", "size": "200_1000", "budget": 80000, "source": "outbound"},          # score: 4+16+20+10+8 = 58
    {"name": "Kaufman Lynn Construction", "industry": "construction", "ai": "exploring", "pain": "efficiency", "size": "50_200", "budget": 60000, "source": "research_loop"},  # score: 8+8+16+10+10 = 52
    {"name": "Galaxy Builders", "industry": "construction", "ai": "none", "pain": "erp_failure", "size": "10_50", "budget": 20000, "source": "outbound"},                   # score: 4+16+8+4+8 = 40
    # ── Law firm targets (diverse scoring) ──
    {"name": "Weiss Serota Helfman Cole & Bierman", "industry": "legal", "ai": "embedded", "pain": "compliance", "size": "1000_plus", "budget": 300000, "source": "referral"},  # score: 20+10+12+16+20 = 78
    {"name": "Stearns Weaver Miller", "industry": "legal", "ai": "none", "pain": "other", "size": "10_50", "budget": 15000, "source": "scrape"},                            # score: 4+4+8+4+4 = 24
]

_SEED_CONTACTS = [
    {"lead_idx": 0, "name": "Jackie Impellitier", "email": "jfi@zrsmanagement.com", "title": "COO", "linkedin": None, "role": "decision_maker", "strength": "warm"},
    {"lead_idx": 1, "name": "Rey Melendi", "email": "rmelendi@13fi.com", "title": "COO & Principal", "linkedin": "linkedin.com/in/rey-melendi-850a9a12", "role": "decision_maker", "strength": "cold"},
    {"lead_idx": 2, "name": "Tony Cook", "email": "tcook@baymgmtgroup.com", "title": "COO", "linkedin": None, "role": "decision_maker", "strength": "warm"},
    {"lead_idx": 3, "name": "Michelle Weber", "email": "mweber@bilzin.com", "title": "COO", "linkedin": "linkedin.com/in/michelle-weber-5270275", "role": "decision_maker", "strength": "cold"},
    {"lead_idx": 4, "name": "Lori Worman", "email": "lworman@pebbcap.com", "title": "MD Operations", "linkedin": None, "role": "decision_maker", "strength": "cold"},
]

_SEED_TEMPLATES = [
    {
        "name": "Touch 1 — Centralized Ops at Scale (ZRS / PM)",
        "channel": "email",
        "category": "cold_outreach",
        "subject": "Building centralized operations at 100K units",
        "body": "Hi {{name}},\n\nThe Centralized Services Department you built at ZRS is a significant infrastructure move — it's not easy to maintain standardization across 100K+ units while still letting local markets operate.\n\nWhat I've noticed working with institutional multifamily platforms is that centralization is smooth until reporting to the client side becomes the constraint. At 100K units, quarterly investor reporting typically pulls data from a dozen different systems. The more centralized your operations, the more important a unified visibility layer becomes.\n\nWe help firms build that layer — a single source of truth that feeds investor dashboards, reduces reporting prep time, and surfaces operational issues before they reach the client.\n\nWould you be open to a 20-minute call to talk through how other platforms your size have tackled this?\n\nBest,\nPaul",
    },
    {
        "name": "Touch 1 — Vertically Integrated RE Ops (13th Floor)",
        "channel": "email",
        "category": "cold_outreach",
        "subject": "Investor reporting and portfolio visibility — vertically integrated RE",
        "body": "Hi {{name}},\n\nThe challenge of vertically integrated RE is unique: your deal team, development, construction, and asset management teams all generate data the others need, but it's rarely connected in real time.\n\nThe result: quarterly investor reporting becomes a data collection sprint across 4–5 different systems. It's a bottleneck that gets worse as you scale.\n\nWe help vertically integrated firms build a single operational backbone that connects sourcing, development, construction, and asset management. It reduces reporting prep time dramatically and surfaces issues in real time instead of at quarterly close.\n\nWould you be open to a 20-minute call to walk through how other platforms your size approach this?\n\nBest,\nPaul",
    },
    {
        "name": "Touch 1 — First COO Hire (Weiss Serota / Law)",
        "channel": "email",
        "category": "cold_outreach",
        "subject": "Joining a firm mid-transformation",
        "body": "Hi {{name}},\n\nCongratulations on taking the COO role at Weiss Serota — that's a significant step for the firm.\n\nI've worked with several government-focused law practices across multiple offices, and there's a pattern I've noticed: when someone steps into that COO seat, the first 90 days usually reveal 3–4 workflows that become genuine bottlenecks as the firm scales. For government practices specifically, it tends to be conflict checks across 4 offices, cross-office matter coordination, and the administrative burden of compliance deadline tracking.\n\nWe help firms build systems around exactly those workflows — not replacing your tools, but connecting them so information flows without constant manual intervention.\n\nWould you be open to a 20-minute call in the next couple weeks to compare notes?\n\nBest,\nPaul",
    },
    {
        "name": "Touch 1 — Commercial RE Law Operations (Bilzin)",
        "channel": "email",
        "category": "cold_outreach",
        "subject": "Operations at a commercial real estate law firm",
        "body": "Hi {{name}},\n\nBilzin has a strong reputation for handling complex RE transactions and structured finance work — the kind of matters that involve multiple parties, tight deadlines, and heavy document coordination.\n\nFrom working with similar commercial practices, I've noticed that operational leverage doesn't come from billing optimization. It comes from reducing the friction in matter coordination, document tracking, and the administrative burden that comes with high-value multi-party deals.\n\nWe work with law firms to build systems that connect those workflows without replacing what you already have. The result is less firefighting, faster closings, and better clarity on matter profitability.\n\nWould you be open to a 20-minute conversation about what that looks like?\n\nBest,\nPaul",
    },
    {
        "name": "Touch 1 — Multi-Strategy Portfolio Ops (Pebb)",
        "channel": "email",
        "category": "cold_outreach",
        "subject": "Multi-strategy portfolio operations in Boca",
        "body": "Hi {{name}},\n\nRunning a $2B+ portfolio across student housing, retail, lending, and hospitality under one platform is operationally complex. Each strategy has different investor groups, different KPIs, and different reporting cadences. The result: visibility becomes fragmented unless your operational system is built specifically for multi-strategy portfolios.\n\nWhat makes Pebb particularly interesting is the lending arm — loan servicing adds a layer most RE platforms don't have to manage. That's a separate data flow, a separate compliance framework, and completely different reporting requirements.\n\nWe work with multi-strategy platforms to build a unified operational system that handles that complexity — different reporting for each investor group, but all fed from a single source of truth.\n\nWould you be open to a 20-minute conversation?\n\nBest,\nPaul",
    },
    {
        "name": "Touch 2 — LinkedIn Follow-up",
        "channel": "linkedin",
        "category": "social",
        "subject": None,
        "body": "Hi {{name}}, just connected — I work with {{industry}} firms on operational systems. Curious what your operational priorities look like right now.",
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

            # Assign pipeline stages based on actual outreach status per company
            # 0=ZRS(engaged), 1=13th Floor(meeting), 2=Bay PMG(contacted),
            # 3=Bilzin(identified), 4=Pebb(research), 5=McAlvain(research),
            # 6=Kaufman Lynn(research), 7=Galaxy(research), 8=Weiss Serota(identified), 9=Stearns(research)
            lead_stages = [
                "engaged", "meeting", "contacted", "identified", "research",
                "research", "research", "research", "identified", "research",
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

        # (acct_idx, contact_idx, tmpl_idx, channel, subject, body_preview, days_ago, replied, sentiment)
        _OUTREACH_LOG_ENTRIES = [
            # ZRS Management — Touch 1 sent, reply received, meeting booked
            (0, 0, 0, "email", "Building centralized operations at 100K units",
             "The Centralized Services Department you built at ZRS is a significant infrastructure move...",
             7, True, "positive", True),
            # ZRS Management — Touch 2 LinkedIn
            (0, 0, 5, "linkedin", "LinkedIn connection — ZRS operational priorities",
             "Congrats on stepping into the COO role at ZRS. Curious what the priority is now...",
             5, True, "positive", False),
            # 13th Floor — Touch 1 sent
            (1, 1, 1, "email", "Investor reporting and portfolio visibility — vertically integrated RE",
             "The challenge of vertically integrated RE is unique: your deal team, development...",
             5, False, None, False),
            # Bay PMG — Touch 1 sent, neutral reply
            (2, 2, 0, "email", "Building centralized operations at 100K units",
             "What I've noticed working with institutional multifamily platforms is that centralization...",
             10, True, "neutral", False),
            # Bilzin Sumberg — Touch 1 sent
            (3, 3, 3, "email", "Operations at a commercial real estate law firm",
             "Bilzin has a strong reputation for handling complex RE transactions and structured finance...",
             4, False, None, False),
            # Pebb Capital — not yet contacted, placeholder research
            (4, 4, 4, "email", "Multi-strategy portfolio operations in Boca",
             "Running a $2B+ portfolio across student housing, retail, lending, and hospitality...",
             2, False, None, False),
            # Weiss Serota — Touch 1 drafted, COO name TBD, not yet sent
            (8, None, 2, "email", "Joining a firm mid-transformation",
             "Congratulations on taking the COO role at Weiss Serota — that's a significant step...",
             14, False, None, False),
        ]

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
        # Realistic deal values from priority-hit-list.md estimates
        # ZRS: $150K (good retainer candidate, PM), 13th Floor: $100K (multi-entity, $50K–$150K)
        # Bay PMG: $75K (PM retainer), Bilzin: $100K (mid-range), Pebb: $50K (start small)
        _OPP_DATA = [
            ("meeting",    150000, "ZRS Management — Centralized Reporting Infrastructure",
             "Unified investor reporting layer across 100K+ units. Centralized data pipeline, automated monthly packages, real-time operational visibility for institutional clients. Foundation Sprint + Reporting Module."),
            ("identified", 100000, "13th Floor Investments — Vertically Integrated Ops Engine",
             "Single operational backbone connecting sourcing, development, construction, and asset management. Quarterly investor reporting automation, construction draw processing, cross-entity visibility."),
            ("contacted",   75000, "Bay Property Management Group — Owner Reporting Automation",
             "Automated owner reporting pipeline replacing 40+ hours/month of manual report assembly. Maintenance dispatch integration, tenant communication tracking, centralized ops dashboard."),
            ("identified", 100000, "Bilzin Sumberg — Matter Operations & Profitability Visibility",
             "Matter coordination workflow automation, document tracking across multi-party transactions, AFA billing profitability dashboard. Reduces firefighting and surfaces matter-level margin."),
            ("research",    50000, "Pebb Capital — Multi-Strategy Investor Reporting System",
             "Unified reporting across student housing, retail, lending, and hospitality strategies. Different investor group dashboards fed from single source of truth. Lending arm compliance reporting integration."),
        ]
        stages_for_opps = [d[0] for d in _OPP_DATA]
        for i in range(5):
            acct_id = account_ids[i]
            stage_key, amount_int, opp_name, scope_text = _OPP_DATA[i]
            stage_key = stages_for_opps[i]
            opp_status = "won" if stage_key == "closed_won" else "open"
            amount = Decimal(str(amount_int))

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
                    opp_name,
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
        # Real activity history per company matching actual outreach status
        _LEAD_ACTIVITIES = [
            # 0 — ZRS Management
            [
                ("email", "Touch 1 sent — Building centralized operations at 100K units", "Sent initial outreach to Jackie Impellitier (COO). Referenced CSD buildout and investor reporting at scale.", 7),
                ("note", "Positive reply received from Jackie Impellitier", "Jackie replied within 48 hours. Expressed interest. Scheduling 20-minute call.", 5),
                ("email", "Touch 2 LinkedIn — ZRS follow-up", "Sent LinkedIn connection message referencing COO role transition and operational priorities.", 5),
            ],
            # 1 — 13th Floor Investments
            [
                ("email", "Touch 1 sent — Investor reporting, vertically integrated RE", "Sent to Rey Melendi (COO & Principal). Focused on cross-department data flow and quarterly reporting bottleneck.", 5),
                ("note", "Research: vertically integrated structure confirmed", "Confirmed 44 employees, in-house sourcing / dev / construction / PM. rmelendi@13fi.com high confidence.", 6),
            ],
            # 2 — Bay Property Management Group
            [
                ("email", "Touch 1 sent — Centralized ops outreach", "Sent to Tony Cook (COO). tcook@baymgmtgroup.com confirmed. Focused on multi-state reporting and maintenance dispatch.", 10),
                ("note", "Neutral reply — not ready to explore yet", "Tony replied saying they are mid-implementation on a new PM platform. Flagged for follow-up in 60 days.", 8),
            ],
            # 3 — Bilzin Sumberg
            [
                ("email", "Touch 1 sent — Commercial RE law firm operations", "Sent to Michelle Weber (COO). mweber@bilzin.com inferred. Focused on matter coordination and AFA billing visibility.", 4),
                ("note", "Research: Bilzin scope confirmed", "238 staff, 57 partners, Brickell Ave. Heavy RE transaction volume. No response yet.", 4),
            ],
            # 4 — Pebb Capital
            [
                ("note", "Research: multi-strategy portfolio confirmed", "$2B+ AUM across student housing, retail, lending, hospitality. Lending arm adds compliance layer.", 3),
                ("email", "Touch 1 sent — Multi-strategy portfolio ops in Boca", "Sent to Lori Worman (MD Operations). lworman@pebbcap.com inferred. Highlighted lending arm complexity.", 2),
            ],
            # 5 — McAlvain Construction
            [
                ("note", "Research: McAlvain scoped for construction PDS vertical", "Family-owned GC, Southeast. Torry McAlvain Jr. (President). Pre-construction reporting and job cost tracking are likely pain points.", 5),
            ],
            # 6 — Kaufman Lynn Construction
            [
                ("note", "Research: hiring signals detected", "LinkedIn: hiring project controls engineer. Signals investment in reporting infrastructure. Michael Kaufman (Founder/CEO).", 4),
            ],
            # 7 — Galaxy Builders
            [
                ("note", "Research: smaller GC, lower priority", "Cara DeAnda contact identified. Smaller deal potential. ERP pain likely but deal size limits priority.", 6),
            ],
            # 8 — Weiss Serota Helfman Cole & Bierman
            [
                ("note", "Research: first-ever COO hired", "94-attorney firm, 4 offices, government/municipal/RE law. COO name not yet confirmed. Best entry timing in entire list.", 14),
                ("note", "Action: identify COO name via LinkedIn", "Searching 'COO Weiss Serota' on LinkedIn and via South Florida Bar Association directory. Touch 1 on hold pending name.", 10),
            ],
            # 9 — Stearns Weaver Miller
            [
                ("note", "Research: Rick Schatz (MD) identified", "318-person firm, multi-practice. rschatz@stearnsweaver.com likely. Lower urgency — no specific trigger event.", 7),
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
        # Real next steps per company from priority-hit-list.md action plan
        today = date.today()
        _LEAD_NEXT_ACTIONS = [
            # 0 — ZRS Management — engaged, reply received → schedule call
            ("account", "call", "Schedule 20-minute discovery call with Jackie Impellitier — she replied positively to Touch 1", "urgent", today - timedelta(days=2)),
            # 1 — 13th Floor Investments — Touch 1 sent 5 days ago → send Touch 2 LinkedIn
            ("account", "linkedin", "Send Touch 2 LinkedIn message to Rey Melendi (linkedin.com/in/rey-melendi-850a9a12) — 5 days after Touch 1", "high", today),
            # 2 — Bay PMG — replied not ready → schedule follow-up for 60 days
            ("account", "follow_up", "Tony Cook said mid-implementation on PM platform — schedule follow-up for June 2026 check-in", "normal", today + timedelta(days=55)),
            # 3 — Bilzin Sumberg — Touch 1 sent 4 days ago → send Touch 2 LinkedIn at Day 7
            ("account", "linkedin", "Send Touch 2 LinkedIn message to Michelle Weber — due Day 7 after Touch 1 (mweber@bilzin.com sent 4 days ago)", "high", today + timedelta(days=3)),
            # 4 — Pebb Capital — Touch 1 just sent → wait for reply, prep one-pager
            ("account", "task", "Draft multi-strategy one-pager for Pebb Capital — reference lending arm complexity as differentiated angle", "normal", today + timedelta(days=5)),
            # 5 — McAlvain Construction — research phase → identify contact
            ("account", "research", "Confirm Torry McAlvain Jr. contact info and identify construction PDS demo fit for McAlvain", "normal", today + timedelta(days=7)),
            # 6 — Kaufman Lynn Construction — hiring signal → outreach
            ("account", "email", "Draft Touch 1 for Kaufman Lynn — reference project controls hire as entry angle for reporting infrastructure pitch", "normal", today + timedelta(days=7)),
            # 7 — Galaxy Builders — low priority, research only
            ("account", "research", "Confirm deal size potential for Galaxy Builders before investing in sequence — likely smaller engagement", "low", today + timedelta(days=14)),
            # 8 — Weiss Serota — waiting on COO name → identify then send
            ("account", "research", "Identify Weiss Serota first-ever COO name via LinkedIn ('COO Weiss Serota') — send Touch 1 within 30 days of their start date", "urgent", today - timedelta(days=3)),
            # 9 — Stearns Weaver — low urgency, sequence prep
            ("account", "email", "Queue Touch 1 for Rick Schatz at Stearns Weaver — confirm rschatz@stearnsweaver.com before sending", "low", today + timedelta(days=14)),
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
