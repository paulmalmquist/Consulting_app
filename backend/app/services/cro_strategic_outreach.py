"""Strategic Outreach Engine.

Extends the consulting revenue OS with hypothesis-driven outbound planning.
It intentionally stops at draft generation and approval workflow; it never sends.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP
from uuid import UUID

from app.db import get_cursor
from app.observability.logger import emit_log
from app.services import cro_leads

ACTIVE_STATUSES = (
    "Identified",
    "Hypothesis Built",
    "Outreach Drafted",
    "Sent",
    "Engaged",
    "Diagnostic Scheduled",
    "Deliverable Sent",
)

DIAGNOSTIC_TEMPLATE = [
    "Where does reporting break between operational and financial systems?",
    "What reconciliation step requires manual intervention?",
    "Who owns AI ROI measurement?",
    "Where do definitions diverge across entities?",
    "Which vendor upgrade caused the most friction?",
    "If you automated one process today, what would break?",
]

SEED_COMPANIES = [
    # ── Tier 1: Act Now (Score 20+) ──────────────────────────────────────
    {
        "company_name": "Weiss Serota Helfman Cole & Bierman",
        "industry": "legal",
        "employee_range": "200_1000",
        "stack": ["Case Management", "iManage", "3E Billing", "Conflict Check Software"],
        "multi_entity": True,
        "pe_backed": False,
        "ai_pressure": 5,  # urgency: first-ever COO hire
        "reporting": 5,    # pain: no operational infrastructure
        "governance": 5,   # fit: exactly ICP
        "fragmentation": 5,  # deal size: foundation sprint + full modules
        "seed_status": "Diagnostic Scheduled",  # COO meeting booked
        "wedge": "Conflict management and government deadline tracking across multi-office structure",
        "capabilities": ["conflict_management", "deadline_tracking"],
        "hypothesis": "94-attorney firm with no COO until now — zero operational infrastructure. Multi-office conflict checks are labor-intensive and duplicated.",
        "contacts": [
            {"name": "COO (Recently Hired)", "title": "Chief Operating Officer", "buyer_type": "COO", "authority": "High"},
        ],
        "triggers": [
            {"type": "CFO_Hire", "summary": "First-ever COO hired — firm building operational infrastructure from scratch. Best possible timing for engagement."},
        ],
    },
    {
        "company_name": "ZRS Management",
        "industry": "real_estate",
        "employee_range": "1000_plus",
        "stack": ["Yardi", "Property PM Tools", "Excel Reporting", "Maintenance Dispatch"],
        "multi_entity": True,
        "pe_backed": False,
        "ai_pressure": 5,  # urgency: first COO hire, institutional clients demanding
        "reporting": 5,    # pain: 100K units, fragmented PM tools
        "governance": 5,   # fit: PM is sweet spot
        "fragmentation": 2,  # deal size: PM firms tend toward implementation
        "seed_status": "Sent",  # outreach already delivered
        "wedge": "Institutional reporting pipeline and centralized operations visibility at 100K+ units",
        "capabilities": ["investor_reporting", "maintenance_automation"],
        "hypothesis": "100K units managed — massive scale running on spreadsheets and fragmented PM tools. Quarterly investor reporting pulls from a dozen systems.",
        "contacts": [
            {"name": "Jackie Impellitier", "title": "COO", "email": "jfi@zrsmanagement.com", "buyer_type": "COO", "authority": "High"},
            {"name": "Darren Pierce", "title": "President", "buyer_type": "Other", "authority": "High"},
        ],
        "triggers": [
            {"type": "CFO_Hire", "summary": "Jackie Impellitier promoted to first-ever COO from VP Operations (2024). 25-year tenure. Created Centralized Services Department."},
        ],
        "outreach_sequences": [
            {"stage": 1, "channel": "email", "subject": "Building centralized operations at 100K units", "draft": "Hi Jackie,\n\nThe Centralized Services Department you built at ZRS is a significant infrastructure move. Maintaining standardization across 100K+ units while still letting local markets operate is genuinely hard.\n\nWhat I've noticed working with institutional multifamily platforms is that centralization is smooth until reporting to the client side becomes the constraint. At 100K units, quarterly investor reporting typically pulls data from a dozen different systems: property accounting, maintenance dispatch, tenant data, compliance tracking. The more centralized your operations, the more important a unified visibility layer becomes.\n\nWe help firms build that layer -- essentially a single source of truth that feeds investor dashboards, reduces reporting prep time, and surfaces operational issues before they reach the client.\n\nWould you be open to a 20-minute call to talk through how other platforms your size have tackled this? Happy to work around your schedule.\n\nBest,\nPaul"},
            {"stage": 2, "channel": "linkedin", "draft": "Hi Jackie, congrats on stepping into the COO role at ZRS. I've been impressed by the operational foundation you've built. Curious what the priority is now that centralization is in place -- reporting automation, maintenance efficiency, something else?"},
            {"stage": 3, "channel": "email", "subject": "RE: Building centralized operations at 100K units", "draft": "Hi Jackie,\n\nFollowing up on my email last week about centralized ops at scale. I mentioned the reporting piece -- specifically how institutional clients expect both speed and detail in their monthly/quarterly packages.\n\nI'd like to send you a one-pager on what an automated client reporting pipeline looks like for a portfolio your size. It usually cuts 15-20 hours per reporting cycle. No strings attached if you're not exploring this right now.\n\nLet me know.\n\nPaul"},
        ],
    },
    {
        "company_name": "13th Floor Investments",
        "industry": "real_estate",
        "employee_range": "10_50",
        "stack": ["Excel", "Procore", "QuickBooks/Yardi", "Dropbox/SharePoint"],
        "multi_entity": True,
        "pe_backed": True,
        "ai_pressure": 4,  # urgency: active deal flow
        "reporting": 4,    # pain: vertically integrated coordination
        "governance": 5,   # fit: 44 employees, PE + operating hybrid
        "fragmentation": 4,  # deal size: multi-entity = $50K-$150K
        "wedge": "Investor reporting pipeline and portfolio visibility for vertically integrated RE",
        "capabilities": ["investor_reporting", "construction_draw_workflow"],
        "hypothesis": "Vertically integrated RE firm with 44 employees managing sourcing, development, construction, asset management, and PE. Investor reporting is a manual data collection sprint across 4-5 systems.",
        "contacts": [
            {"name": "Rey Melendi", "title": "COO & Principal", "email": "rmelendi@13fi.com", "linkedin": "linkedin.com/in/rey-melendi-850a9a12", "buyer_type": "COO", "authority": "High"},
        ],
        "outreach_sequences": [
            {"stage": 1, "channel": "email", "subject": "Investor reporting and portfolio visibility -- vertically integrated RE", "draft": "Hi Rey,\n\nThe challenge of vertically integrated RE is unique: your deal team, development, construction, and asset management teams all generate data the others need, but it's rarely connected in real time. Construction is progressing while development costs are running ahead of forecast. Asset management is optimizing tenant mix, but capital deployment doesn't know until the quarterly review.\n\nThe result: quarterly investor reporting becomes a data collection sprint across 4-5 different systems. It's a bottleneck that gets worse as you scale.\n\nWe help vertically integrated firms build a single operational backbone that connects sourcing, development, construction, and asset management. It reduces reporting prep time and surfaces issues in real time instead of at quarterly close.\n\nWould you be open to a 20-minute call to walk through how other platforms your size approach this?\n\nBest,\nPaul"},
            {"stage": 2, "channel": "linkedin", "draft": "Hi Rey, just connected. I work with vertically integrated RE firms on operational systems. Your background in both development and investment management is exactly the kind of operator who'd find this relevant. Curious if this is on your roadmap."},
            {"stage": 3, "channel": "email", "subject": "RE: Investor reporting and portfolio visibility", "draft": "Hi Rey,\n\nFollowing up on my email last week about vertically integrated operations. Beyond investor reporting, construction draw processing is a secondary efficiency target for firms your size -- typically 10-15 hours per draw cycle for active development.\n\nI'd like to send a one-pager on how firms structure that. No expectation you'll need it, but given your development background, thought it might be worth a quick review.\n\nLet me know if a call makes sense.\n\nPaul"},
        ],
    },
    # ── Tier 2: High Potential (Score 17-19) ─────────────────────────────
    {
        "company_name": "Bilzin Sumberg",
        "industry": "legal",
        "employee_range": "200_1000",
        "stack": ["iManage/NetDocuments", "3E/Clio", "SharePoint", "CRM"],
        "multi_entity": False,
        "pe_backed": False,
        "ai_pressure": 3,  # urgency: no specific trigger
        "reporting": 4,    # pain: 238-person firm, complex closings
        "governance": 5,   # fit: law firm COO is ideal buyer
        "fragmentation": 3,  # deal size: mid-range
        "seed_status": "Engaged",  # COO responded positively
        "wedge": "Real estate closing coordination and AFA profitability tracking",
        "capabilities": ["closing_checklist_engine", "matter_profitability"],
        "hypothesis": "Complex multi-party RE closings involve 50-100+ item checklists requiring manual tracking across multiple parties, title companies, and lenders.",
        "contacts": [
            {"name": "Michelle Weber", "title": "COO", "email": "mweber@bilzin.com", "linkedin": "linkedin.com/in/michelle-weber-5270275", "buyer_type": "COO", "authority": "High"},
        ],
        "outreach_sequences": [
            {"stage": 1, "channel": "email", "subject": "Operations at a commercial real estate law firm", "draft": "Hi Michelle,\n\nBilzin has a strong reputation for handling complex RE transactions and structured finance work -- the kind of matters that involve multiple parties, tight deadlines, and heavy document coordination.\n\nFrom working with similar commercial practices, operational leverage doesn't come from billing optimization at this point. It comes from reducing friction in matter coordination, document tracking, and the administrative burden that comes with high-value multi-party deals.\n\nWe work with law firms to build systems that connect those workflows without replacing what you already have. The result is less firefighting, faster closings, and better visibility into matter profitability.\n\nWould you be open to a 20-minute conversation about what that looks like?\n\nBest,\nPaul"},
            {"stage": 2, "channel": "linkedin", "draft": "Hi Michelle, just wanted to connect. I've been working with law firms on operational systems and have noticed Bilzin's volume in RE transactions and structured deals. Curious about your operational priorities right now."},
            {"stage": 3, "channel": "email", "subject": "RE: Operations at a commercial real estate law firm", "draft": "Hi Michelle,\n\nFollowing up on the email from last week. One specific angle that comes up often for firms handling high-value deals: AFA billing performance tracking and matter profitability dashboards.\n\nI can send a one-pager on how firms structure that. Happy to do it if you're exploring this area.\n\nPaul"},
        ],
    },
    {
        "company_name": "Pebb Capital",
        "industry": "real_estate",
        "employee_range": "10_50",
        "stack": ["Yardi", "Lending Accounting", "Excel", "SharePoint", "Juniper Square"],
        "multi_entity": True,
        "pe_backed": True,
        "ai_pressure": 3,  # urgency: stable firm
        "reporting": 4,    # pain: multi-asset class $2B+
        "governance": 4,   # fit: South Florida RE PE, right size
        "fragmentation": 3,  # deal size: $25K-$75K to start
        "seed_status": "Sent",  # initial outreach delivered
        "wedge": "Multi-strategy investor reporting and cross-strategy portfolio visibility",
        "capabilities": ["portfolio_dashboard", "investor_reporting"],
        "hypothesis": "Each strategy (student housing, retail, lending, hospitality) has different metrics, reporting cadences, and investor groups. Consolidating into a unified view is a major manual effort.",
        "contacts": [
            {"name": "Lori Worman", "title": "Managing Director of Operations", "email": "lworman@pebbcap.com", "buyer_type": "COO", "authority": "High"},
            {"name": "Carlos Jimenez", "title": "Co-Founder & COO", "buyer_type": "COO", "authority": "High"},
        ],
        "outreach_sequences": [
            {"stage": 1, "channel": "email", "subject": "Multi-strategy portfolio operations in Boca", "draft": "Hi Lori,\n\nRunning a $2B+ portfolio across student housing, retail, lending, and hospitality under one platform is operationally complex. Each strategy has different investor groups, different KPIs, and different reporting cadences.\n\nWhat makes Pebb particularly interesting is the lending arm -- loan servicing adds a layer most RE platforms don't have to manage.\n\nWe work with multi-strategy platforms to build a unified operational system that handles that complexity: different reporting for each investor group, different KPI dashboards per strategy, but all fed from a single source of truth.\n\nWould you be open to a 20-minute conversation about what that looks like?\n\nBest,\nPaul"},
            {"stage": 2, "channel": "linkedin", "draft": "Hi Lori, just connected. I work with RE platforms on multi-strategy operations. Few platforms actually handle student housing, retail, lending, and hospitality together well. Curious if operational optimization is on the roadmap."},
            {"stage": 3, "channel": "email", "subject": "RE: Multi-strategy portfolio operations in Boca", "draft": "Hi Lori,\n\nFollowing up on my email from last week. Cross-strategy investor reporting is the highest-friction point I see with multi-strategy platforms. I'd like to send a one-pager on how firms structure that.\n\nLet me know if that would be helpful.\n\nPaul"},
        ],
    },
    {
        "company_name": "Bay Property Management Group",
        "industry": "real_estate",
        "employee_range": "200_1000",
        "stack": ["AppFolio/Buildium", "QuickBooks", "CRM", "Maintenance Ticketing"],
        "multi_entity": True,
        "pe_backed": False,
        "ai_pressure": 3,  # urgency: growth-oriented but no specific trigger
        "reporting": 4,    # pain: 200+ staff, multi-state PM
        "governance": 4,   # fit: PM ICP fit, right size
        "fragmentation": 2,  # deal size: PM firms often underbuy
        "wedge": "Maintenance triage automation and owner reporting latency reduction",
        "capabilities": ["maintenance_intelligence", "owner_reporting"],
        "hypothesis": "High-volume maintenance requests require manual classification and vendor matching. Emergency vs. routine decisions are judgment calls made by property managers already at capacity.",
        "contacts": [
            {"name": "Tony Cook", "title": "COO", "email": "tcook@baymgmtgroup.com", "buyer_type": "COO", "authority": "High"},
            {"name": "Patrick Freeze", "title": "CEO & Founder", "buyer_type": "Other", "authority": "High"},
        ],
        "outreach_sequences": [
            {"stage": 1, "channel": "email", "subject": "Multi-state property management operations", "draft": "Hi Tony,\n\nBay PMG's growth to 200+ staff across multiple markets puts you in a position where the coordination layer between your systems starts becoming the bottleneck. Maintenance dispatch, owner reporting, leasing workflows, and vendor management all generate data that's useful across the business, but rarely connected in real time.\n\nWe help property management companies build the connective layer across those systems so workflows run end-to-end without the manual bridging in the middle.\n\nWould you be open to a 20-minute call to walk through how other platforms your size have approached this?\n\nBest,\nPaul"},
            {"stage": 2, "channel": "linkedin", "draft": "Hi Tony, just connected. I work with property management companies on operational systems. Bay PMG's multi-state footprint is exactly where the coordination layer starts to strain. Curious if this is something you're looking at."},
            {"stage": 3, "channel": "email", "subject": "RE: Multi-state property management operations", "draft": "Hi Tony,\n\nFollowing up on my email last week. One specific angle that comes up often at your size: owner reporting prep time. Most multi-state PM firms are spending 8-12 hours per reporting cycle on data pulls that should be automated.\n\nHappy to send a one-pager on how firms structure that if it's relevant.\n\nPaul"},
        ],
    },
    {
        "company_name": "Franklin Street",
        "industry": "real_estate",
        "employee_range": "200_1000",
        "stack": ["Yardi/AppFolio", "Brokerage CRM", "Separate Accounting", "Separate Advisory System"],
        "multi_entity": True,
        "pe_backed": False,
        "ai_pressure": 3,  # urgency: no specific trigger
        "reporting": 5,    # pain: 5 service lines under one roof
        "governance": 4,   # fit: 462 employees, slightly large but multi-line justifies
        "fragmentation": 4,  # deal size: cross-department scope
        "wedge": "Cross-service data integration and opportunity identification across silos",
        "capabilities": ["client_intelligence", "cross_service_alerts"],
        "hypothesis": "Capital advisory, PM, brokerage, and insurance operate with separate client knowledge. Cross-selling opportunities are missed because each silo holds client data independently.",
        "contacts": [],
    },
    {
        "company_name": "Stearns Weaver Miller",
        "industry": "legal",
        "employee_range": "200_1000",
        "stack": ["iManage/NetDocuments", "3E", "HR/Compliance Tracking", "Microsoft 365"],
        "multi_entity": True,
        "pe_backed": False,
        "ai_pressure": 3,  # urgency: no specific trigger
        "reporting": 4,    # pain: 318-person, multi-practice
        "governance": 4,   # fit: right-sized law firm with ops lead
        "fragmentation": 3,  # deal size: mid-range
        "wedge": "Cross-office staffing and practice group financial reporting",
        "capabilities": ["practice_performance", "billing_acceleration"],
        "hypothesis": "Matching attorneys to matters across 5 offices requires manual coordination. Utilization imbalances between offices go undetected until quarterly reviews.",
        "contacts": [
            {"name": "Rick Schatz", "title": "Managing Director", "buyer_type": "Other", "authority": "High"},
        ],
    },
    # ── Construction PDS Targets ─────────────────────────────────────────
    {
        "company_name": "McAlvain Construction",
        "industry": "construction",
        "employee_range": "200_1000",
        "stack": ["Viewpoint Vista", "Procore", "Bluebeam", "Primavera/Outbuild"],
        "multi_entity": False,
        "pe_backed": False,
        "ai_pressure": 3,
        "reporting": 4,
        "governance": 4,
        "fragmentation": 4,
        "wedge": "Procurement approval workflow and PO intake automation for self-perform concrete",
        "capabilities": ["procurement_controls", "field_to_erp_handoff"],
        "hypothesis": "Self-perform concrete creates more coordination load than pure fee-based CM because purchasing and vendor management affect live field execution directly.",
        "contacts": [
            {"name": "Torry McAlvain Jr.", "title": "President", "buyer_type": "Other", "authority": "High"},
            {"name": "Tyler Resnick", "title": "Executive Vice President", "buyer_type": "COO", "authority": "High"},
            {"name": "Mason Hampton", "title": "Controller", "buyer_type": "CFO", "authority": "Medium"},
        ],
        "outreach_sequences": [
            {"stage": 1, "channel": "email", "subject": "Tightening procurement flow between field and Vista", "draft": "Hi Torry,\n\nThe most expensive operational drag in self-perform construction usually is not a lack of software. It is the handoff between field demand, approvals, vendor coordination, and ERP entry.\n\nMcAlvain is exactly the kind of builder where that handoff matters. With live field purchasing, concrete operations, and multiple systems in the mix, even small approval friction compounds into schedule drag and back-office cleanup.\n\nWe help contractors build lightweight internal workflow layers around one process at a time so field requests, approvals, and accounting controls move through one governed path.\n\nIf useful, I can send over a concise 1-page outline for a 2-4 week sprint focused only on procurement control and exception handling.\n\nBest,\nPaul"},
            {"stage": 2, "channel": "linkedin", "draft": "Hi Torry, I've been looking closely at where procurement and approval friction shows up in self-perform construction teams. McAlvain's mix of field execution and office controls is exactly where that handoff gets expensive. Curious whether procurement flow or job-cost visibility is the bigger ops priority right now."},
            {"stage": 3, "channel": "email", "subject": "RE: Tightening procurement flow between field and Vista", "draft": "Hi Torry,\n\nFollowing up on the note below. The narrow version of what I'm talking about is not 'automation' in the broad sense. It is getting one workflow under control so field requests, approvals, and ERP exceptions stop bouncing between people.\n\nIf helpful, I can send a sample sprint outline showing what we'd map, what we'd measure, and what the output looks like.\n\nPaul"},
        ],
    },
    {
        "company_name": "Kaufman Lynn Construction",
        "industry": "construction",
        "employee_range": "200_1000",
        "stack": ["Construction PM Tools", "DocuSign", "Spreadsheet Reporting"],
        "multi_entity": False,
        "pe_backed": False,
        "ai_pressure": 3,
        "reporting": 4,
        "governance": 4,
        "fragmentation": 3,
        "wedge": "Project controls visibility and SOP enforcement without system replacement",
        "capabilities": ["project_controls_review", "executive_briefing"],
        "hypothesis": "SOP maturity is catching up to growth. Growing pains and SOPs still being implemented indicate the firm has outrun its coordination discipline.",
        "contacts": [
            {"name": "Michael Kaufman", "title": "Founder & CEO", "buyer_type": "Other", "authority": "High"},
            {"name": "Stephen Haskins", "title": "EVP Financial Excellence", "buyer_type": "CFO", "authority": "High"},
        ],
        "triggers": [
            {"type": "Job_Posting", "summary": "Hiring project controls engineer — signals investment in reporting infrastructure and operational controls maturity."},
        ],
    },
    {
        "company_name": "Galaxy Builders",
        "industry": "construction",
        "employee_range": "50_200",
        "stack": ["Procore", "Separate Accounting", "Levelset", "Spreadsheets"],
        "multi_entity": False,
        "pe_backed": False,
        "ai_pressure": 3,
        "reporting": 4,
        "governance": 4,
        "fragmentation": 4,
        "wedge": "Procore-to-accounting reconciliation and variance visibility",
        "capabilities": ["project_finance_reconciliation", "variance_queue"],
        "hypothesis": "Project data and financial data are not traveling together. Accounting is still not fully integrated with Procore — the core reconciliation gap.",
        "contacts": [
            {"name": "Cara DeAnda", "title": "Chief Operating Officer", "buyer_type": "COO", "authority": "High"},
            {"name": "Neilesh Verma", "title": "Chief Executive Officer", "buyer_type": "Other", "authority": "High"},
        ],
    },
    {
        "company_name": "Embree Construction Group",
        "industry": "construction",
        "employee_range": "200_1000",
        "stack": ["Procore", "Levelset", "Finance/Accounting Stack", "Email/Spreadsheets"],
        "multi_entity": True,
        "pe_backed": False,
        "ai_pressure": 3,
        "reporting": 4,
        "governance": 4,
        "fragmentation": 4,
        "wedge": "Field-to-payment approval workflow and superintendent reporting standardization",
        "capabilities": ["payment_approval_workflow", "superintendent_reporting"],
        "hypothesis": "Field reporting and payment approvals are not one controlled flow. Slow-pay and lien signals suggest breakdowns in documentation and approval timing.",
        "contacts": [
            {"name": "Cory Delz", "title": "President", "buyer_type": "Other", "authority": "High"},
            {"name": "Rocky Hardin", "title": "CFO/EVP", "buyer_type": "CFO", "authority": "High"},
        ],
    },
    {
        "company_name": "Cadence McShane Construction",
        "industry": "construction",
        "employee_range": "200_1000",
        "stack": ["Construction PM Stack", "Office-Specific Reporting", "Spreadsheet Consolidation"],
        "multi_entity": True,
        "pe_backed": False,
        "ai_pressure": 3,
        "reporting": 4,
        "governance": 4,
        "fragmentation": 3,
        "wedge": "Cross-office operational consistency and field-to-leadership escalation",
        "capabilities": ["operations_consistency", "exception_dashboard"],
        "hypothesis": "Scale is outrunning coordination discipline. Overloaded teams and confusion around who owns what across Dallas, Austin, Houston, and San Antonio offices.",
        "contacts": [
            {"name": "Monica Schoenemann", "title": "SVP Chief Construction Officer", "buyer_type": "COO", "authority": "High"},
            {"name": "Will Hodges", "title": "President", "buyer_type": "Other", "authority": "High"},
        ],
    },
]


def _validate_score(name: str, value: int) -> int:
    if value < 1 or value > 5:
        raise ValueError(f"{name} must be between 1 and 5")
    return value


def compute_composite_priority_score(
    *,
    governance_risk_score: int,
    reporting_complexity_score: int,
    vendor_fragmentation_score: int,
    ai_pressure_score: int,
    multi_entity_flag: bool,
    trigger_boost_score: int = 0,
) -> int:
    governance_risk_score = _validate_score("governance_risk_score", governance_risk_score)
    reporting_complexity_score = _validate_score("reporting_complexity_score", reporting_complexity_score)
    vendor_fragmentation_score = _validate_score("vendor_fragmentation_score", vendor_fragmentation_score)
    ai_pressure_score = _validate_score("ai_pressure_score", ai_pressure_score)

    raw = (
        Decimal("0.30") * Decimal(governance_risk_score)
        + Decimal("0.25") * Decimal(reporting_complexity_score)
        + Decimal("0.20") * Decimal(vendor_fragmentation_score)
        + Decimal("0.15") * Decimal(ai_pressure_score)
        + Decimal("0.10") * Decimal(1 if multi_entity_flag else 0)
    )
    normalized = int(
        ((raw / Decimal("4.35")) * Decimal("100"))
        .quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    )
    return max(0, min(100, normalized + max(0, min(trigger_boost_score, 20))))


def _fetch_lead_context(cur, lead_profile_id: UUID, env_id: str, business_id: UUID) -> dict:
    cur.execute(
        """
        SELECT p.id AS lead_profile_id,
               p.crm_account_id,
               a.name AS company_name,
               a.industry,
               a.website
          FROM cro_lead_profile p
          JOIN crm_account a ON a.crm_account_id = p.crm_account_id
         WHERE p.id = %s
           AND p.env_id = %s
           AND p.business_id = %s
        """,
        (str(lead_profile_id), env_id, str(business_id)),
    )
    row = cur.fetchone()
    if not row:
        raise LookupError(f"Lead profile {lead_profile_id} not found")
    return row


def upsert_strategic_lead(
    *,
    env_id: str,
    business_id: UUID,
    lead_profile_id: UUID,
    employee_range: str,
    multi_entity_flag: bool,
    pe_backed_flag: bool,
    estimated_system_stack: list[str],
    ai_pressure_score: int,
    reporting_complexity_score: int,
    governance_risk_score: int,
    vendor_fragmentation_score: int,
    status: str = "Identified",
) -> dict:
    with get_cursor() as cur:
        lead = _fetch_lead_context(cur, lead_profile_id, env_id, business_id)
        cur.execute(
            "SELECT trigger_boost_score FROM cro_strategic_lead WHERE lead_profile_id = %s",
            (str(lead_profile_id),),
        )
        existing = cur.fetchone()
        trigger_boost_score = int(existing["trigger_boost_score"]) if existing else 0
        composite_priority_score = compute_composite_priority_score(
            governance_risk_score=governance_risk_score,
            reporting_complexity_score=reporting_complexity_score,
            vendor_fragmentation_score=vendor_fragmentation_score,
            ai_pressure_score=ai_pressure_score,
            multi_entity_flag=multi_entity_flag,
            trigger_boost_score=trigger_boost_score,
        )
        cur.execute(
            """
            INSERT INTO cro_strategic_lead (
                env_id, business_id, lead_profile_id, crm_account_id,
                employee_range, multi_entity_flag, pe_backed_flag,
                estimated_system_stack, ai_pressure_score, reporting_complexity_score,
                governance_risk_score, vendor_fragmentation_score,
                composite_priority_score, status, trigger_boost_score
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (lead_profile_id) DO UPDATE SET
                employee_range = EXCLUDED.employee_range,
                multi_entity_flag = EXCLUDED.multi_entity_flag,
                pe_backed_flag = EXCLUDED.pe_backed_flag,
                estimated_system_stack = EXCLUDED.estimated_system_stack,
                ai_pressure_score = EXCLUDED.ai_pressure_score,
                reporting_complexity_score = EXCLUDED.reporting_complexity_score,
                governance_risk_score = EXCLUDED.governance_risk_score,
                vendor_fragmentation_score = EXCLUDED.vendor_fragmentation_score,
                composite_priority_score = EXCLUDED.composite_priority_score,
                status = EXCLUDED.status,
                updated_at = now()
            RETURNING id, lead_profile_id, composite_priority_score, status
            """,
            (
                env_id,
                str(business_id),
                str(lead_profile_id),
                str(lead["crm_account_id"]),
                employee_range,
                multi_entity_flag,
                pe_backed_flag,
                _json_array(estimated_system_stack),
                ai_pressure_score,
                reporting_complexity_score,
                governance_risk_score,
                vendor_fragmentation_score,
                composite_priority_score,
                status,
                trigger_boost_score,
            ),
        )
        row = cur.fetchone()

    emit_log(
        level="info",
        service="backend",
        action="cro.strategic_outreach.lead_upserted",
        message=f"Strategic lead updated: {lead['company_name']}",
        context={"lead_profile_id": str(lead_profile_id), "priority": row["composite_priority_score"]},
    )
    return row


def advance_strategic_lead_status(*, strategic_lead_id: UUID, new_status: str) -> dict:
    """Update a strategic lead's pipeline status."""
    with get_cursor() as cur:
        cur.execute(
            """
            UPDATE cro_strategic_lead
            SET status = %s, updated_at = now()
            WHERE id = %s
            RETURNING id, lead_profile_id, composite_priority_score, status
            """,
            (new_status, str(strategic_lead_id)),
        )
        row = cur.fetchone()
        if not row:
            raise ValueError(f"Strategic lead {strategic_lead_id} not found")
    return row


def upsert_hypothesis(
    *,
    env_id: str,
    business_id: UUID,
    lead_profile_id: UUID,
    ai_roi_leakage_notes: str | None = None,
    erp_integration_risk_notes: str | None = None,
    reconciliation_fragility_notes: str | None = None,
    governance_gap_notes: str | None = None,
    vendor_fatigue_exposure: int | None = None,
    primary_wedge_angle: str | None = None,
    top_2_capabilities: list[str] | None = None,
) -> dict:
    with get_cursor() as cur:
        _fetch_lead_context(cur, lead_profile_id, env_id, business_id)
        cur.execute(
            """
            INSERT INTO cro_lead_hypothesis (
                env_id, business_id, lead_profile_id,
                ai_roi_leakage_notes, erp_integration_risk_notes,
                reconciliation_fragility_notes, governance_gap_notes,
                vendor_fatigue_exposure, primary_wedge_angle, top_2_capabilities
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb)
            ON CONFLICT (lead_profile_id) DO UPDATE SET
                ai_roi_leakage_notes = EXCLUDED.ai_roi_leakage_notes,
                erp_integration_risk_notes = EXCLUDED.erp_integration_risk_notes,
                reconciliation_fragility_notes = EXCLUDED.reconciliation_fragility_notes,
                governance_gap_notes = EXCLUDED.governance_gap_notes,
                vendor_fatigue_exposure = EXCLUDED.vendor_fatigue_exposure,
                primary_wedge_angle = EXCLUDED.primary_wedge_angle,
                top_2_capabilities = EXCLUDED.top_2_capabilities,
                updated_at = now()
            RETURNING id, lead_profile_id, primary_wedge_angle
            """,
            (
                env_id,
                str(business_id),
                str(lead_profile_id),
                ai_roi_leakage_notes,
                erp_integration_risk_notes,
                reconciliation_fragility_notes,
                governance_gap_notes,
                vendor_fatigue_exposure,
                primary_wedge_angle,
                _json_array(top_2_capabilities or []),
            ),
        )
        return cur.fetchone()


def create_contact(
    *,
    env_id: str,
    business_id: UUID,
    lead_profile_id: UUID,
    name: str,
    title: str,
    linkedin_url: str | None = None,
    email: str | None = None,
    buyer_type: str = "Other",
    authority_level: str = "Medium",
) -> dict:
    with get_cursor() as cur:
        _fetch_lead_context(cur, lead_profile_id, env_id, business_id)
        cur.execute(
            """
            INSERT INTO cro_strategic_contact (
                env_id, business_id, lead_profile_id,
                name, title, linkedin_url, email,
                buyer_type, authority_level
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id, lead_profile_id, name, title, buyer_type, authority_level, created_at
            """,
            (
                env_id,
                str(business_id),
                str(lead_profile_id),
                name,
                title,
                linkedin_url,
                email,
                buyer_type,
                authority_level,
            ),
        )
        return cur.fetchone()


def create_trigger_signal(
    *,
    env_id: str,
    business_id: UUID,
    lead_profile_id: UUID,
    trigger_type: str,
    source_url: str,
    summary: str,
    detected_at: datetime | None = None,
) -> dict:
    detected_at = detected_at or datetime.now(timezone.utc)
    with get_cursor() as cur:
        _fetch_lead_context(cur, lead_profile_id, env_id, business_id)
        cur.execute(
            """
            INSERT INTO cro_trigger_signal (
                env_id, business_id, lead_profile_id,
                trigger_type, source_url, summary, detected_at
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            RETURNING id, lead_profile_id, trigger_type, source_url, summary, detected_at
            """,
            (
                env_id,
                str(business_id),
                str(lead_profile_id),
                trigger_type,
                source_url,
                summary,
                detected_at,
            ),
        )
        row = cur.fetchone()
        cur.execute(
            """
            UPDATE cro_strategic_lead
               SET last_trigger_detected_at = %s,
                   trigger_boost_score = LEAST(20, trigger_boost_score + 10),
                   composite_priority_score = LEAST(100, composite_priority_score + 10),
                   updated_at = now()
             WHERE lead_profile_id = %s
            """,
            (detected_at, str(lead_profile_id)),
        )
        return row


def approve_outreach_sequence(*, sequence_id: UUID, approved_message: str) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            UPDATE cro_outreach_sequence
               SET approved_message = %s,
                   response_status = 'approved',
                   updated_at = now()
             WHERE id = %s
         RETURNING id, lead_profile_id, sequence_stage, draft_message,
                   approved_message, sent_timestamp, response_status,
                   followup_due_date, created_at
            """,
            (approved_message, str(sequence_id)),
        )
        row = cur.fetchone()
        if not row:
            raise LookupError(f"Outreach sequence {sequence_id} not found")
        return row


def create_diagnostic_session(
    *,
    env_id: str,
    business_id: UUID,
    lead_profile_id: UUID,
    scheduled_date: date,
    notes: str | None = None,
    governance_findings: str | None = None,
    ai_readiness_score: int | None = None,
    reconciliation_risk_score: int | None = None,
    recommended_first_intervention: str | None = None,
    question_responses: dict[str, str] | None = None,
) -> dict:
    with get_cursor() as cur:
        _fetch_lead_context(cur, lead_profile_id, env_id, business_id)
        cur.execute(
            """
            INSERT INTO cro_diagnostic_session (
                env_id, business_id, lead_profile_id,
                scheduled_date, notes, governance_findings,
                ai_readiness_score, reconciliation_risk_score,
                recommended_first_intervention, question_responses
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb)
            RETURNING id, lead_profile_id, scheduled_date, notes, governance_findings,
                      ai_readiness_score, reconciliation_risk_score,
                      recommended_first_intervention, question_responses, created_at
            """,
            (
                env_id,
                str(business_id),
                str(lead_profile_id),
                scheduled_date,
                notes,
                governance_findings,
                ai_readiness_score,
                reconciliation_risk_score,
                recommended_first_intervention,
                _json_object(question_responses or {}),
            ),
        )
        row = cur.fetchone()
        cur.execute(
            "UPDATE cro_strategic_lead SET status = 'Diagnostic Scheduled', updated_at = now() WHERE lead_profile_id = %s",
            (str(lead_profile_id),),
        )
        return row


def generate_deliverable(
    *,
    env_id: str,
    business_id: UUID,
    lead_profile_id: UUID,
    file_path: str,
    sent_date: date | None = None,
    followup_status: str = "pending",
) -> dict:
    sent_date = sent_date or date.today()
    with get_cursor() as cur:
        lead = _fetch_lead_context(cur, lead_profile_id, env_id, business_id)
        cur.execute(
            """
            SELECT governance_gap_notes, ai_roi_leakage_notes,
                   reconciliation_fragility_notes, primary_wedge_angle
              FROM cro_lead_hypothesis
             WHERE lead_profile_id = %s
            """,
            (str(lead_profile_id),),
        )
        hypothesis = cur.fetchone() or {}
        cur.execute(
            """
            SELECT governance_findings, recommended_first_intervention,
                   ai_readiness_score, reconciliation_risk_score
              FROM cro_diagnostic_session
             WHERE lead_profile_id = %s
             ORDER BY created_at DESC
             LIMIT 1
            """,
            (str(lead_profile_id),),
        )
        diagnostic = cur.fetchone() or {}
        summary = _build_deliverable_summary(lead, hypothesis, diagnostic)
        content_markdown = _build_deliverable_markdown(lead, hypothesis, diagnostic)
        cur.execute(
            """
            INSERT INTO cro_deliverable (
                env_id, business_id, lead_profile_id,
                file_path, summary, sent_date, followup_status, content_markdown
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id, lead_profile_id, file_path, summary, sent_date,
                      followup_status, content_markdown, created_at
            """,
            (
                env_id,
                str(business_id),
                str(lead_profile_id),
                file_path,
                summary,
                sent_date,
                followup_status,
                content_markdown,
            ),
        )
        row = cur.fetchone()
        cur.execute(
            "UPDATE cro_strategic_lead SET status = 'Deliverable Sent', updated_at = now() WHERE lead_profile_id = %s",
            (str(lead_profile_id),),
        )
        return row


def run_daily_monitor(*, env_id: str, business_id: UUID) -> dict:
    now = datetime.now(timezone.utc)
    created_drafts = 0
    reviewed_leads = 0

    with get_cursor() as cur:
        cur.execute(
            """
            SELECT COUNT(*) AS cnt
              FROM cro_outreach_sequence
             WHERE env_id = %s
               AND business_id = %s
               AND sequence_stage = 1
               AND sent_timestamp >= %s
            """,
            (env_id, str(business_id), now - timedelta(days=7)),
        )
        weekly_new_outreach = int(cur.fetchone()["cnt"])

        cur.execute(
            """
            SELECT COUNT(*) AS cnt
              FROM cro_outreach_sequence
             WHERE env_id = %s
               AND business_id = %s
               AND sent_timestamp IS NOT NULL
               AND response_status = 'no_response'
            """,
            (env_id, str(business_id)),
        )
        sent_no_response = int(cur.fetchone()["cnt"])

        cur.execute(
            """
            SELECT sl.lead_profile_id, sl.composite_priority_score, sl.status,
                   sl.ai_pressure_score, sl.reporting_complexity_score,
                   sl.governance_risk_score, sl.vendor_fragmentation_score,
                   sl.multi_entity_flag,
                   a.name AS company_name, a.industry
              FROM cro_strategic_lead sl
              JOIN cro_lead_profile lp ON lp.id = sl.lead_profile_id
              JOIN crm_account a ON a.crm_account_id = lp.crm_account_id
             WHERE sl.env_id = %s
               AND sl.business_id = %s
               AND sl.status = ANY(%s)
             ORDER BY sl.composite_priority_score DESC, sl.updated_at DESC
            """,
            (env_id, str(business_id), list(ACTIVE_STATUSES)),
        )
        leads = cur.fetchall()

        for lead in leads:
            reviewed_leads += 1
            cur.execute(
                """
                SELECT COUNT(*) AS cnt, MAX(detected_at) AS last_detected_at
                  FROM cro_trigger_signal
                 WHERE lead_profile_id = %s
                   AND detected_at >= %s
                """,
                (str(lead["lead_profile_id"]), now - timedelta(days=1)),
            )
            trigger_row = cur.fetchone()
            trigger_count = int(trigger_row["cnt"] or 0)
            trigger_boost = 10 if trigger_count > 0 else 0
            adjusted_score = compute_composite_priority_score(
                governance_risk_score=int(lead["governance_risk_score"]),
                reporting_complexity_score=int(lead["reporting_complexity_score"]),
                vendor_fragmentation_score=int(lead["vendor_fragmentation_score"]),
                ai_pressure_score=int(lead["ai_pressure_score"]),
                multi_entity_flag=bool(lead["multi_entity_flag"]),
                trigger_boost_score=trigger_boost,
            )
            cur.execute(
                """
                UPDATE cro_strategic_lead
                   SET trigger_boost_score = %s,
                       last_trigger_detected_at = %s,
                       composite_priority_score = %s,
                       updated_at = now()
                 WHERE lead_profile_id = %s
                """,
                (
                    trigger_boost,
                    trigger_row["last_detected_at"],
                    adjusted_score,
                    str(lead["lead_profile_id"]),
                ),
            )

            cur.execute(
                """
                SELECT COUNT(*) AS cnt
                  FROM cro_outreach_sequence
                 WHERE lead_profile_id = %s
                   AND sent_timestamp >= %s
                """,
                (str(lead["lead_profile_id"]), now - timedelta(days=30)),
            )
            sent_recently = int(cur.fetchone()["cnt"] or 0) > 0

            cur.execute(
                """
                SELECT id
                  FROM cro_outreach_sequence
                 WHERE lead_profile_id = %s
                   AND sequence_stage = 1
                 LIMIT 1
                """,
                (str(lead["lead_profile_id"]),),
            )
            existing_stage_one = cur.fetchone()

            if (
                adjusted_score > 70
                and not sent_recently
                and existing_stage_one is None
                and weekly_new_outreach < 3
                and sent_no_response <= 5
            ):
                cur.execute(
                    """
                    INSERT INTO cro_outreach_sequence (
                        env_id, business_id, lead_profile_id,
                        sequence_stage, draft_message, response_status,
                        followup_due_date
                    )
                    VALUES (%s, %s, %s, 1, %s, 'pending', %s)
                    """,
                    (
                        env_id,
                        str(business_id),
                        str(lead["lead_profile_id"]),
                        _generate_outreach_message(
                            company_name=lead["company_name"],
                            industry=lead["industry"],
                            wedge_angle=None,
                        ),
                        date.today() + timedelta(days=7),
                    ),
                )
                cur.execute(
                    "UPDATE cro_strategic_lead SET status = 'Outreach Drafted', updated_at = now() WHERE lead_profile_id = %s",
                    (str(lead["lead_profile_id"]),),
                )
                created_drafts += 1
                weekly_new_outreach += 1

    return {
        "status": "completed",
        "reviewed_leads": reviewed_leads,
        "triggered_drafts": created_drafts,
    }


def get_dashboard(*, env_id: str, business_id: UUID) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT sl.id, sl.lead_profile_id, sl.crm_account_id,
                   a.name AS company_name, a.industry,
                   sl.employee_range, sl.multi_entity_flag, sl.pe_backed_flag,
                   sl.estimated_system_stack, sl.ai_pressure_score,
                   sl.reporting_complexity_score, sl.governance_risk_score,
                   sl.vendor_fragmentation_score, sl.composite_priority_score,
                   sl.status, sl.created_at, sl.updated_at,
                   h.primary_wedge_angle, h.top_2_capabilities
              FROM cro_strategic_lead sl
              JOIN crm_account a ON a.crm_account_id = sl.crm_account_id
              LEFT JOIN cro_lead_hypothesis h ON h.lead_profile_id = sl.lead_profile_id
             WHERE sl.env_id = %s AND sl.business_id = %s
             ORDER BY sl.composite_priority_score DESC, sl.updated_at DESC
            """,
            (env_id, str(business_id)),
        )
        leads = cur.fetchall()

        cur.execute(
            """
            SELECT id, lead_profile_id, trigger_type, source_url, summary, detected_at
              FROM cro_trigger_signal
             WHERE env_id = %s AND business_id = %s
             ORDER BY detected_at DESC
             LIMIT 20
            """,
            (env_id, str(business_id)),
        )
        triggers = cur.fetchall()

        cur.execute(
            """
            SELECT id, lead_profile_id, sequence_stage, draft_message, approved_message,
                   sent_timestamp, response_status, followup_due_date, created_at
              FROM cro_outreach_sequence
             WHERE env_id = %s AND business_id = %s
               AND approved_message IS NULL
             ORDER BY created_at DESC
             LIMIT 20
            """,
            (env_id, str(business_id)),
        )
        queue = cur.fetchall()

        cur.execute(
            """
            SELECT id, lead_profile_id, scheduled_date, notes, governance_findings,
                   ai_readiness_score, reconciliation_risk_score,
                   recommended_first_intervention, question_responses, created_at
              FROM cro_diagnostic_session
             WHERE env_id = %s AND business_id = %s
             ORDER BY created_at DESC
             LIMIT 20
            """,
            (env_id, str(business_id)),
        )
        diagnostics = cur.fetchall()

        cur.execute(
            """
            SELECT id, lead_profile_id, file_path, summary, sent_date,
                   followup_status, content_markdown, created_at
              FROM cro_deliverable
             WHERE env_id = %s AND business_id = %s
             ORDER BY created_at DESC
             LIMIT 20
            """,
            (env_id, str(business_id)),
        )
        deliverables = cur.fetchall()

        cur.execute(
            """
            SELECT COUNT(*) AS cnt
              FROM cro_outreach_sequence
             WHERE env_id = %s AND business_id = %s
               AND sent_timestamp IS NOT NULL
            """,
            (env_id, str(business_id)),
        )
        sent_count = int(cur.fetchone()["cnt"] or 0)

    high_priority = sum(1 for row in leads if int(row["composite_priority_score"]) > 75)
    medium_priority = sum(1 for row in leads if 50 <= int(row["composite_priority_score"]) <= 75)
    low_priority = sum(1 for row in leads if int(row["composite_priority_score"]) < 50)

    status_counts: dict[str, int] = {}
    total_days = Decimal("0")
    for row in leads:
        status = row["status"]
        status_counts[status] = status_counts.get(status, 0) + 1
        updated_at = row["updated_at"] or row["created_at"]
        age_days = max(0, (datetime.now(timezone.utc) - updated_at).days)
        total_days += Decimal(age_days)

    engagement_numerator = sum(1 for row in leads if row["status"] in {"Engaged", "Diagnostic Scheduled", "Deliverable Sent", "Closed"})
    engagement_rate = None
    if leads:
        engagement_rate = (Decimal(engagement_numerator) / Decimal(len(leads))).quantize(Decimal("0.0001"))
    avg_time_in_stage = None
    if leads:
        avg_time_in_stage = (total_days / Decimal(len(leads))).quantize(Decimal("0.01"))

    return {
        "metrics": {
            "high_priority": high_priority,
            "medium_priority": medium_priority,
            "low_priority": low_priority,
            "time_in_stage_days": avg_time_in_stage,
            "engagement_rate": engagement_rate,
            "sent_count": sent_count,
            "diagnostic_questions": DIAGNOSTIC_TEMPLATE,
        },
        "status_funnel": [
            {"status": status, "count": count}
            for status, count in sorted(status_counts.items(), key=lambda item: item[0])
        ],
        "leads": leads,
        "trigger_signals": triggers,
        "outreach_queue": queue,
        "diagnostics": diagnostics,
        "deliverables": deliverables,
    }


def seed_novendor_strategic_outreach(*, env_id: str, business_id: UUID) -> dict:
    seeded = 0
    contacts_seeded = 0
    sequences_seeded = 0
    triggers_seeded = 0

    for company in SEED_COMPANIES:
        lead_profile_id = _ensure_lead(
            env_id=env_id,
            business_id=business_id,
            company_name=company["company_name"],
            industry=company["industry"],
        )

        # Determine status — spread leads across pipeline stages for demo realism
        has_sequences = bool(company.get("outreach_sequences"))
        explicit_status = company.get("seed_status")
        if explicit_status:
            status = explicit_status
        elif has_sequences:
            status = "Outreach Drafted"
        else:
            status = "Hypothesis Built"

        upsert_strategic_lead(
            env_id=env_id,
            business_id=business_id,
            lead_profile_id=lead_profile_id,
            employee_range=company["employee_range"],
            multi_entity_flag=company["multi_entity"],
            pe_backed_flag=company["pe_backed"],
            estimated_system_stack=list(company["stack"]),
            ai_pressure_score=int(company["ai_pressure"]),
            reporting_complexity_score=int(company["reporting"]),
            governance_risk_score=int(company["governance"]),
            vendor_fragmentation_score=int(company["fragmentation"]),
            status=status,
        )
        upsert_hypothesis(
            env_id=env_id,
            business_id=business_id,
            lead_profile_id=lead_profile_id,
            ai_roi_leakage_notes=company["hypothesis"],
            erp_integration_risk_notes="ERP and workflow controls are likely not aligned at executive reporting boundaries.",
            reconciliation_fragility_notes="Manual reconciliation likely persists between operating systems and financial close outputs.",
            governance_gap_notes="Definitions and approval paths may be inconsistent across entities or teams.",
            vendor_fatigue_exposure=4,
            primary_wedge_angle=company["wedge"],
            top_2_capabilities=list(company["capabilities"]),
        )

        # Seed real contacts from client-hunting research
        for contact in company.get("contacts", []):
            create_contact(
                env_id=env_id,
                business_id=business_id,
                lead_profile_id=lead_profile_id,
                name=contact["name"],
                title=contact["title"],
                email=contact.get("email"),
                linkedin_url=contact.get("linkedin"),
                buyer_type=contact.get("buyer_type", "Other"),
                authority_level=contact.get("authority", "Medium"),
            )
            contacts_seeded += 1

        # If no contacts provided, seed a placeholder
        if not company.get("contacts"):
            create_contact(
                env_id=env_id,
                business_id=business_id,
                lead_profile_id=lead_profile_id,
                name="Operations Leadership (TBD)",
                title="COO / VP Operations",
                buyer_type="COO",
                authority_level="High",
            )
            contacts_seeded += 1

        # Seed outreach sequences from drafted emails
        for seq in company.get("outreach_sequences", []):
            _seed_outreach_sequence(
                env_id=env_id,
                business_id=business_id,
                lead_profile_id=lead_profile_id,
                stage=seq["stage"],
                draft_message=seq["draft"],
            )
            sequences_seeded += 1

        # Seed trigger signals from identified events
        for trigger in company.get("triggers", []):
            create_trigger_signal(
                env_id=env_id,
                business_id=business_id,
                lead_profile_id=lead_profile_id,
                trigger_type=trigger["type"],
                source_url=trigger.get("source_url", "client-hunting/priority-hit-list.md"),
                summary=trigger["summary"],
            )
            triggers_seeded += 1

        seeded += 1

    return {
        "status": "seeded",
        "leads_seeded": seeded,
        "contacts_seeded": contacts_seeded,
        "sequences_seeded": sequences_seeded,
        "triggers_seeded": triggers_seeded,
    }


def _seed_outreach_sequence(
    *,
    env_id: str,
    business_id: UUID,
    lead_profile_id: UUID,
    stage: int,
    draft_message: str,
) -> None:
    """Insert a draft outreach sequence entry for seeding."""
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO cro_outreach_sequence
              (env_id, business_id, lead_profile_id, sequence_stage,
               draft_message, response_status)
            VALUES (%s, %s, %s, %s, %s, 'pending')
            ON CONFLICT DO NOTHING
            """,
            (env_id, str(business_id), str(lead_profile_id), stage, draft_message),
        )


def _ensure_lead(*, env_id: str, business_id: UUID, company_name: str, industry: str) -> UUID:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT p.id AS lead_profile_id
              FROM cro_lead_profile p
              JOIN crm_account a ON a.crm_account_id = p.crm_account_id
             WHERE p.env_id = %s
               AND p.business_id = %s
               AND a.name = %s
             LIMIT 1
            """,
            (env_id, str(business_id), company_name),
        )
        row = cur.fetchone()
        if row:
            return row["lead_profile_id"]

    created = cro_leads.create_lead(
        env_id=env_id,
        business_id=business_id,
        company_name=company_name,
        industry=industry,
        lead_source="research_loop",
        company_size="200_1000",
        contact_name="Office of the CFO",
        contact_title="CFO",
    )
    return created["lead_profile_id"]


def _generate_outreach_message(*, company_name: str, industry: str | None, wedge_angle: str | None) -> str:
    observation = f"Noticed {company_name} appears to be operating in a complex {industry or 'multi-system'} reporting environment."
    pattern = "Across operator-led teams, the pressure to layer AI and reporting upgrades on top of fragmented systems often creates quiet governance drag before anyone sees it in the numbers."
    positioning = "We do not sell software into that moment. We help leadership teams isolate where reporting, reconciliation, and AI accountability start to drift so they can intervene in a controlled way."
    invitation = f"If it would be useful, I am happy to compare notes on {wedge_angle or 'where governance risk tends to show up first'} and what tends to be worth stabilizing before more automation is added."
    return "\n\n".join([observation, pattern, positioning, invitation])


def _build_deliverable_summary(lead: dict, hypothesis: dict, diagnostic: dict) -> str:
    wedge = hypothesis.get("primary_wedge_angle") or "control alignment"
    return f"Executive-safe summary for {lead['company_name']} focused on {wedge}, governance gaps, and first controlled intervention."


def _build_deliverable_markdown(lead: dict, hypothesis: dict, diagnostic: dict) -> str:
    return f"""# Strategic Outreach Executive Summary\n\n## Observed Governance Gaps\n{diagnostic.get('governance_findings') or hypothesis.get('governance_gap_notes') or 'Governance gaps are emerging where operating and financial definitions are not aligned.'}\n\n## AI ROI Leakage Points\n{hypothesis.get('ai_roi_leakage_notes') or 'AI initiatives appear to lack a stable executive ROI baseline.'}\n\n## Reconciliation Fragility Zones\n{hypothesis.get('reconciliation_fragility_notes') or 'Manual reconciliation remains the most likely failure point before automation scales.'}\n\n## Recommended First Controlled Intervention\n{diagnostic.get('recommended_first_intervention') or 'Stabilize one shared reporting definition and one reconciliation handoff before automating further.'}\n\n## Do Not Automate Yet\nDo not automate workflows that still depend on contested definitions, manual reconciliations, or unclear executive ownership of AI outcomes.\n"""


def _json_array(values: list[str]) -> str:
    escaped = [value.replace('\\', '\\\\').replace('"', '\\"') for value in values]
    return "[" + ",".join(f'"{value}"' for value in escaped) + "]"


def _json_object(values: dict[str, str]) -> str:
    parts: list[str] = []
    for key, value in values.items():
        escaped_key = key.replace('\\', '\\\\').replace('"', '\\"')
        escaped_value = value.replace('\\', '\\\\').replace('"', '\\"')
        parts.append(f'"{escaped_key}":"{escaped_value}"')
    return "{" + ",".join(parts) + "}"
