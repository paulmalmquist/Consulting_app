"""Winston Assist — AI-powered deal execution recommendations.

Analyzes a deal's current state and generates:
- Structured assessment (state, problem, next step)
- Category classification (RESEARCH, OUTREACH, BUILD, CLOSE)
- Confidence score
- Copyable prompt for immediate execution
- Deal scoring (Fit + Pain + Reachability + Momentum + Revenue)
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from uuid import UUID

import openai

from app.config import OPENAI_API_KEY, OPENAI_CHAT_MODEL_FAST
from app.db import get_cursor
from app.observability.logger import emit_log
from app.services.reporting_common import resolve_tenant_id

# ── Stage → Category mapping ────────────────────────────────────────────────

_STAGE_CATEGORY: dict[str, str] = {
    "research": "RESEARCH",
    "identified": "RESEARCH",
    "contacted": "OUTREACH",
    "engaged": "BUILD",
    "meeting": "BUILD",
    "qualified": "BUILD",
    "proposal": "CLOSE",
}

# ── System prompts ───────────────────────────────────────────────────────────

_MASTER_PROMPT = """You are Winston, an execution-focused AI for closing consulting deals.
You are not a generic CRM assistant.
Your job is to evaluate a deal and determine the single highest-leverage next move.

Rules:
- Be decisive
- Prefer action over analysis
- If the deal lacks a real contact, push toward research
- If the deal has a contact but no outreach, push toward outreach
- If the deal is engaged, push toward demo / diagnostic / solution shaping
- If the deal is in proposal or negotiation, push toward close
- Do not give multiple next steps unless absolutely necessary
- Do not be vague
- Do not give motivational language"""

_CATEGORY_PROMPTS: dict[str, str] = {
    "RESEARCH": """Analyze this early-stage lead.
Goal: Turn this from a raw target into a research-ready opportunity.
Determine: whether this is a real fit, what operational pain is most likely,
who the most relevant buyer is, and what research should be done next.
The copyable prompt should instruct another AI to research the company,
identify likely buyer roles and pain points, connect those to Novendor/Winston capabilities,
and recommend whether to pursue, hold, or drop.""",

    "OUTREACH": """Generate the most effective next outreach move.
Goal: Get a response or meeting booked.
Determine: whether the company is ready for first touch or follow-up,
what angle is strongest, what pain point should lead, and what channel to use.
The copyable prompt should produce one highly specific outreach message.
Avoid generic AI hype. Keep tone sharp, credible, and concise.""",

    "BUILD": """Analyze this deal as an active consulting opportunity.
Goal: Figure out what should be built, demonstrated, or packaged next.
Determine: what the buyer likely needs to see, whether the best move is a demo,
diagnostic, architecture sketch, proof asset, or ROI framing.
The copyable prompt should design the exact demo/proof asset/diagnostic concept,
tie it to the buyer's likely pain, and frame the business value clearly.""",

    "CLOSE": """Analyze this deal as a closing-stage opportunity.
Goal: Identify the next move most likely to improve close probability.
Determine: what is blocking the deal (trust, scope, pricing, urgency, or internal buy-in),
and what specific close move should happen next.
The copyable prompt should help address objections, refine offer positioning,
strengthen pricing logic, or draft a reply/call outline.""",
}


def _compute_deal_score(
    *,
    stage_key: str | None,
    has_contact: bool,
    has_outreach: bool,
    has_activity: bool,
    days_since_activity: int | None,
    amount: float | None,
    industry: str | None,
    pain_category: str | None,
    ai_maturity: str | None,
) -> int:
    """Compute deal score 0-100: Fit(25) + Pain(25) + Reachability(20) + Momentum(20) + Revenue(10)."""

    # Fit (0-25): industry relevance, operational complexity
    fit = 10  # base
    if industry and industry.lower() in (
        "real estate", "private equity", "financial services", "construction",
        "asset management", "insurance", "healthcare", "legal",
    ):
        fit = 20
    if ai_maturity and ai_maturity.lower() in ("low", "emerging"):
        fit += 5  # more opportunity to add value
    fit = min(fit, 25)

    # Pain (0-25): specificity and urgency
    pain = 8  # base
    if pain_category:
        pain = 18
        if pain_category.lower() in ("operational", "reporting", "compliance", "data"):
            pain = 22
    pain = min(pain, 25)

    # Reachability (0-20)
    reach = 0
    if has_contact:
        reach = 15
        if has_outreach:
            reach = 20
    elif stage_key in ("identified", "contacted"):
        reach = 8  # role known

    # Momentum (0-20)
    momentum = 0
    if stage_key == "research":
        momentum = 3
    elif stage_key == "identified":
        momentum = 5
    elif stage_key == "contacted":
        momentum = 10
    elif stage_key in ("engaged", "meeting"):
        momentum = 15
    elif stage_key in ("qualified", "proposal"):
        momentum = 20

    # Penalize staleness
    if days_since_activity is not None and days_since_activity > 7:
        momentum = max(0, momentum - 5)

    # Revenue Potential (0-10)
    rev = 3
    if amount:
        if amount >= 50_000:
            rev = 10
        elif amount >= 25_000:
            rev = 8
        elif amount >= 10_000:
            rev = 5

    return min(fit + pain + reach + momentum + rev, 100)


def generate_assist(
    *,
    deal_id: UUID,
    env_id: str,
    business_id: UUID,
) -> dict:
    """Generate a Winston Assist recommendation for a deal."""

    if not OPENAI_API_KEY:
        raise RuntimeError("OPENAI_API_KEY not configured — Winston Assist requires AI gateway")

    # ── 1. Gather deal context ───────────────────────────────────────────────
    with get_cursor() as cur:
        resolve_tenant_id(cur, business_id)

        # Deal details
        cur.execute(
            """
            SELECT o.crm_opportunity_id, o.name, o.amount, o.status,
                   o.expected_close_date, o.crm_account_id,
                   a.name AS account_name, a.industry,
                   s.key AS stage_key, s.label AS stage_label
            FROM crm_opportunity o
            LEFT JOIN crm_account a ON a.crm_account_id = o.crm_account_id
            LEFT JOIN crm_pipeline_stage s ON s.crm_pipeline_stage_id = o.crm_pipeline_stage_id
            WHERE o.crm_opportunity_id = %s AND o.business_id = %s
            """,
            (str(deal_id), str(business_id)),
        )
        deal = cur.fetchone()
        if not deal:
            raise LookupError(f"Opportunity {deal_id} not found")

        account_id = deal.get("crm_account_id")

        # Lead profile (pain, ai_maturity)
        pain_category = None
        ai_maturity = None
        if account_id:
            cur.execute(
                """
                SELECT pain_category, ai_maturity FROM cro_lead_profile
                WHERE crm_account_id = %s LIMIT 1
                """,
                (str(account_id),),
            )
            lp = cur.fetchone()
            if lp:
                pain_category = lp.get("pain_category")
                ai_maturity = lp.get("ai_maturity")

        # Contacts
        contacts = []
        if account_id:
            cur.execute(
                """
                SELECT c.full_name, c.title, c.email,
                       cp.decision_role, cp.relationship_strength
                FROM crm_contact c
                LEFT JOIN cro_contact_profile cp ON cp.crm_contact_id = c.crm_contact_id
                WHERE c.crm_account_id = %s
                ORDER BY c.created_at
                LIMIT 5
                """,
                (str(account_id),),
            )
            contacts = cur.fetchall()

        # Recent activities (last 10)
        cur.execute(
            """
            SELECT activity_type, subject, notes, activity_date
            FROM crm_activity
            WHERE crm_opportunity_id = %s
            ORDER BY activity_date DESC
            LIMIT 10
            """,
            (str(deal_id),),
        )
        activities = cur.fetchall()

        # Current next action
        cur.execute(
            """
            SELECT description, due_date, action_type, status
            FROM cro_next_action
            WHERE entity_type = 'opportunity' AND entity_id = %s
              AND status IN ('pending', 'in_progress')
            ORDER BY due_date ASC LIMIT 1
            """,
            (str(deal_id),),
        )
        next_action = cur.fetchone()

        # Outreach check
        has_outreach = False
        if account_id:
            cur.execute(
                "SELECT count(*) AS cnt FROM cro_outreach_log WHERE crm_account_id = %s AND business_id = %s",
                (str(account_id), str(business_id)),
            )
            has_outreach = (cur.fetchone() or {}).get("cnt", 0) > 0

    # ── 2. Compute deal score ────────────────────────────────────────────────
    days_since = None
    if activities:
        last_act = activities[0].get("activity_date")
        if last_act:
            if isinstance(last_act, str):
                last_act = datetime.fromisoformat(last_act.replace("Z", "+00:00"))
            elif not last_act.tzinfo:
                last_act = last_act.replace(tzinfo=timezone.utc)
            days_since = (datetime.now(timezone.utc) - last_act).days

    deal_score = _compute_deal_score(
        stage_key=deal.get("stage_key"),
        has_contact=len(contacts) > 0,
        has_outreach=has_outreach,
        has_activity=len(activities) > 0,
        days_since_activity=days_since,
        amount=float(deal.get("amount") or 0),
        industry=deal.get("industry"),
        pain_category=pain_category,
        ai_maturity=ai_maturity,
    )

    # ── 3. Determine category from stage ─────────────────────────────────────
    stage_key = deal.get("stage_key") or "research"
    category = _STAGE_CATEGORY.get(stage_key, "RESEARCH")

    # ── 4. Build prompt context ──────────────────────────────────────────────
    contact_list = ", ".join(
        f"{c.get('full_name', '?')} ({c.get('title', '?')}, {c.get('decision_role', '?')})"
        for c in contacts
    ) or "No contacts identified"

    activity_summary = "; ".join(
        f"{a.get('activity_type', '?')}: {a.get('subject', '')}"
        for a in activities[:5]
    ) or "No activities recorded"

    deal_context = f"""Deal: {deal.get('name', '?')} | Account: {deal.get('account_name', '?')}
Stage: {deal.get('stage_label', '?')} | Amount: ${deal.get('amount', 0):,.0f}
Industry: {deal.get('industry', 'Unknown')} | Pain: {pain_category or 'Unknown'}
AI Maturity: {ai_maturity or 'Unknown'} | Deal Score: {deal_score}/100
Current next action: {next_action.get('description', 'None') if next_action else 'None'} (due {next_action.get('due_date', 'N/A') if next_action else 'N/A'})
Contacts: {contact_list}
Recent activities: {activity_summary}
Outreach sent: {'Yes' if has_outreach else 'No'}"""

    category_prompt = _CATEGORY_PROMPTS.get(category, _CATEGORY_PROMPTS["RESEARCH"])

    user_message = f"""{deal_context}

{category_prompt}

Respond in exactly this JSON format (no markdown, no code fences):
{{
  "state": ["point 1", "point 2", "point 3"],
  "problem": "What is blocking progress (1-2 sentences)",
  "next_step": "Specific recommended action (1-2 sentences)",
  "category": "{category}",
  "confidence": 0-100,
  "copyable_prompt": "Ready-to-use email/message/script/prompt"
}}"""

    # ── 5. Call OpenAI ───────────────────────────────────────────────────────
    client = openai.OpenAI(api_key=OPENAI_API_KEY)
    response = client.chat.completions.create(
        model=OPENAI_CHAT_MODEL_FAST,
        messages=[
            {"role": "system", "content": _MASTER_PROMPT},
            {"role": "user", "content": user_message},
        ],
        max_completion_tokens=1000,
        response_format={"type": "json_object"},
    )

    raw = response.choices[0].message.content or "{}"
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        parsed = {
            "state": ["Could not parse AI response"],
            "problem": "AI returned invalid JSON",
            "next_step": "Try again",
            "category": category,
            "confidence": 0,
            "copyable_prompt": raw,
        }

    emit_log(
        level="info",
        service="backend",
        action="winston.assist.generated",
        message=f"Assist for deal {deal_id}: {parsed.get('category', '?')} / {parsed.get('confidence', '?')}%",
        context={"deal_id": str(deal_id), "category": parsed.get("category")},
    )

    # Ensure state is always a list
    state = parsed.get("state", [])
    if isinstance(state, str):
        state = [state]

    return {
        "state": state,
        "problem": parsed.get("problem", ""),
        "next_step": parsed.get("next_step", ""),
        "category": parsed.get("category", category),
        "confidence": int(parsed.get("confidence", 50)),
        "copyable_prompt": parsed.get("copyable_prompt", ""),
        "deal_id": str(deal_id),
        "deal_name": deal.get("name", ""),
        "deal_score": deal_score,
    }
