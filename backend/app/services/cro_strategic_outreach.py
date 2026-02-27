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
    {
        "company_name": "U.S. Oral Surgery Management",
        "industry": "healthcare",
        "employee_range": "1000_plus",
        "stack": ["NetSuite", "Workday", "Power BI"],
        "multi_entity": True,
        "pe_backed": True,
        "ai_pressure": 4,
        "reporting": 4,
        "governance": 5,
        "fragmentation": 4,
        "wedge": "Governance-first operator reporting",
        "capabilities": ["executive_reporting", "data_governance"],
        "hypothesis": "Multi-site oral surgery rollups typically accumulate definition drift across entity-level finance and operational reporting.",
    },
    {
        "company_name": "American Family Care",
        "industry": "healthcare",
        "employee_range": "1000_plus",
        "stack": ["Oracle", "Tableau", "Salesforce"],
        "multi_entity": True,
        "pe_backed": False,
        "ai_pressure": 4,
        "reporting": 5,
        "governance": 5,
        "fragmentation": 4,
        "wedge": "AI ROI measurement across clinics",
        "capabilities": ["ai_roi_controls", "reconciliation_map"],
        "hypothesis": "Urgent care networks face manual clinic-to-corporate reconciliation and weak accountability for AI ROI definitions.",
    },
    {
        "company_name": "Brasfield & Gorrie",
        "industry": "construction",
        "employee_range": "1000_plus",
        "stack": ["Procore", "SAP", "Power BI"],
        "multi_entity": True,
        "pe_backed": False,
        "ai_pressure": 3,
        "reporting": 4,
        "governance": 4,
        "fragmentation": 5,
        "wedge": "Project reporting alignment",
        "capabilities": ["job_cost_reporting", "vendor_control"],
        "hypothesis": "Major contractors accumulate vendor fatigue and manual project reconciliation across field and finance systems.",
    },
    {
        "company_name": "DPR Construction",
        "industry": "construction",
        "employee_range": "1000_plus",
        "stack": ["Oracle", "Procore", "Looker"],
        "multi_entity": True,
        "pe_backed": False,
        "ai_pressure": 4,
        "reporting": 4,
        "governance": 4,
        "fragmentation": 4,
        "wedge": "Controlled automation readiness",
        "capabilities": ["governance_map", "workflow_controls"],
        "hypothesis": "Automation pressure often outruns field-to-finance controls, creating governance gaps before ROI is provable.",
    },
    {
        "company_name": "Cortland",
        "industry": "real_estate",
        "employee_range": "1000_plus",
        "stack": ["Yardi", "NetSuite", "Snowflake"],
        "multi_entity": True,
        "pe_backed": True,
        "ai_pressure": 4,
        "reporting": 5,
        "governance": 5,
        "fragmentation": 4,
        "wedge": "Portfolio definition consistency",
        "capabilities": ["portfolio_reporting", "entity_controls"],
        "hypothesis": "Institutional multifamily operators face cross-entity reporting drift and AI pressure without stable governance baselines.",
    },
    {
        "company_name": "Hamilton Zanze",
        "industry": "real_estate",
        "employee_range": "200_1000",
        "stack": ["MRI", "Excel", "Power BI"],
        "multi_entity": True,
        "pe_backed": False,
        "ai_pressure": 3,
        "reporting": 4,
        "governance": 4,
        "fragmentation": 4,
        "wedge": "Reconciliation fragility containment",
        "capabilities": ["close_process_map", "reconciliation_controls"],
        "hypothesis": "Mid-size multifamily managers often carry fragile close processes across assets and third-party systems.",
    },
    {
        "company_name": "Ogletree Deakins",
        "industry": "legal",
        "employee_range": "1000_plus",
        "stack": ["Elite 3E", "Workday", "Power BI"],
        "multi_entity": False,
        "pe_backed": False,
        "ai_pressure": 4,
        "reporting": 4,
        "governance": 5,
        "fragmentation": 3,
        "wedge": "Governance-safe AI measurement",
        "capabilities": ["matter_reporting", "ai_governance"],
        "hypothesis": "Large law firms need executive-safe AI positioning without compromising governance or creating vendor fatigue.",
    },
    {
        "company_name": "Live Oak Bank",
        "industry": "banking",
        "employee_range": "200_1000",
        "stack": ["Jack Henry", "Salesforce", "Tableau"],
        "multi_entity": False,
        "pe_backed": False,
        "ai_pressure": 5,
        "reporting": 4,
        "governance": 5,
        "fragmentation": 3,
        "wedge": "Executive-safe control stack",
        "capabilities": ["risk_reporting", "control_alignment"],
        "hypothesis": "Banks face acute AI pressure, but governance-safe outreach must stay focused on control maturity, not product pitch.",
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
    for company in SEED_COMPANIES:
        lead_profile_id = _ensure_lead(
            env_id=env_id,
            business_id=business_id,
            company_name=company["company_name"],
            industry=company["industry"],
        )
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
            status="Hypothesis Built",
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
        create_contact(
            env_id=env_id,
            business_id=business_id,
            lead_profile_id=lead_profile_id,
            name="Office of the CFO",
            title="CFO",
            buyer_type="CFO",
            authority_level="High",
        )
        seeded += 1
    return {"status": "seeded", "leads_seeded": seeded}


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
