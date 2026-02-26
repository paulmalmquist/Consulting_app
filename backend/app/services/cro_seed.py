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

from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from uuid import UUID

from app.db import get_cursor
from app.observability.logger import emit_log
from app.services.reporting_common import normalize_key, resolve_tenant_id


_SEED_LEADS = [
    {"name": "Meridian Health Systems", "industry": "healthcare", "ai": "piloting", "pain": "ai_roi", "size": "200_1000", "budget": 250000, "source": "referral"},
    {"name": "TechForge Solutions", "industry": "saas", "ai": "exploring", "pain": "erp_failure", "size": "50_200", "budget": 150000, "source": "inbound"},
    {"name": "Atlas Capital Partners", "industry": "finance", "ai": "scaling", "pain": "reporting_chaos", "size": "200_1000", "budget": 500000, "source": "partner"},
    {"name": "Greenfield Construction", "industry": "construction", "ai": "none", "pain": "efficiency", "size": "50_200", "budget": 80000, "source": "event"},
    {"name": "Pinnacle Legal Group", "industry": "legal", "ai": "exploring", "pain": "governance_gap", "size": "10_50", "budget": 120000, "source": "referral"},
    {"name": "Quantum Retail Corp", "industry": "retail", "ai": "piloting", "pain": "revenue", "size": "1000_plus", "budget": 300000, "source": "outbound"},
    {"name": "Nexus Manufacturing", "industry": "manufacturing", "ai": "none", "pain": "compliance", "size": "200_1000", "budget": 200000, "source": "research_loop"},
    {"name": "Coastal Logistics", "industry": "logistics", "ai": "exploring", "pain": "growth", "size": "50_200", "budget": None, "source": "scrape"},
    {"name": "Brightpath Education", "industry": "education", "ai": "embedded", "pain": "ai_roi", "size": "10_50", "budget": 60000, "source": "inbound"},
    {"name": "Ironclad Insurance", "industry": "insurance", "ai": "scaling", "pain": "risk", "size": "1000_plus", "budget": 400000, "source": "partner"},
]

_SEED_CONTACTS = [
    {"lead_idx": 0, "name": "Dr. Sarah Chen", "email": "s.chen@meridianhealth.com", "title": "CTO", "linkedin": "linkedin.com/in/sarahchen", "role": "decision_maker", "strength": "warm"},
    {"lead_idx": 1, "name": "Marcus Rivera", "email": "m.rivera@techforge.io", "title": "VP Engineering", "linkedin": "linkedin.com/in/marcusrivera", "role": "champion", "strength": "hot"},
    {"lead_idx": 2, "name": "Alexandra Petrov", "email": "a.petrov@atlascap.com", "title": "Managing Director", "linkedin": "linkedin.com/in/alexandrapetrov", "role": "decision_maker", "strength": "warm"},
    {"lead_idx": 4, "name": "James Torres", "email": "j.torres@pinnaclelegal.com", "title": "COO", "linkedin": None, "role": "influencer", "strength": "cold"},
    {"lead_idx": 5, "name": "Priya Sharma", "email": "p.sharma@quantumretail.com", "title": "Chief Digital Officer", "linkedin": "linkedin.com/in/priyasharma", "role": "champion", "strength": "hot"},
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

            from app.services.cro_leads import _compute_lead_score
            score = _compute_lead_score(
                ai_maturity=lead["ai"], pain_category=lead["pain"],
                company_size=lead["size"],
                estimated_budget=Decimal(str(lead["budget"])) if lead["budget"] else None,
                lead_source=lead["source"],
            )

            cur.execute(
                """
                INSERT INTO cro_lead_profile
                  (crm_account_id, env_id, business_id, ai_maturity, pain_category,
                   lead_score, lead_source, company_size, estimated_budget)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (crm_account_id) DO NOTHING
                """,
                (
                    str(acct["crm_account_id"]), env_id, str(business_id),
                    lead["ai"], lead["pain"], score, lead["source"], lead["size"],
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
        stages_for_opps = ["discovery", "proposal", "negotiation", "closed_won", "closed_won"]
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

    emit_log(
        level="info",
        service="backend",
        action="cro.seed.completed",
        message=f"Seeded consulting environment {env_id}",
        context=counts,
    )

    return {"status": "seeded", **counts}
