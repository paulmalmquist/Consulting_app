"""REPE Intent Classifier — regex-based classification of user messages into finance intent families.

Runs in <1ms. Bypasses the LLM for high-confidence REPE queries, routing directly
to deterministic finance engines via the fast-path in ai_gateway.py.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation
from typing import Any

from app.schemas.ai_gateway import AssistantContextEnvelope, ResolvedAssistantScope


# ── Intent families ──────────────────────────────────────────────────────────

INTENT_RUN_SALE_SCENARIO = "run_sale_scenario"
INTENT_RUN_FUND_IMPACT = "run_fund_impact"
INTENT_RUN_WATERFALL = "run_waterfall"
INTENT_COMPARE_SCENARIOS = "compare_scenarios"
INTENT_STRESS_CAP_RATE = "stress_cap_rate"
INTENT_FUND_METRICS = "fund_metrics"
INTENT_MONTE_CARLO_WATERFALL = "monte_carlo_waterfall"
INTENT_PORTFOLIO_WATERFALL = "portfolio_waterfall"
INTENT_PIPELINE_RADAR = "pipeline_radar"
INTENT_CAPITAL_CALL_IMPACT = "capital_call_impact"
INTENT_CLAWBACK_RISK = "clawback_risk"
INTENT_UW_VS_ACTUAL = "uw_vs_actual_waterfall"
INTENT_SENSITIVITY = "sensitivity_matrix"
INTENT_CONSTRUCTION_IMPACT = "construction_waterfall"
INTENT_SESSION_WATERFALL_QUERY = "session_waterfall_query"
INTENT_ASSET_VALUATION = "asset_valuation"
INTENT_EXPLAIN_RETURNS = "explain_returns"
INTENT_LP_SUMMARY = "lp_summary"
INTENT_GENERATE_DASHBOARD = "generate_dashboard"

# ── Analytics portal intent families ────────────────────────────────────────
INTENT_ANALYTICS_QUERY = "analytics_query"
INTENT_KNOWLEDGE_SEARCH = "knowledge_search"
INTENT_DATA_HEALTH = "data_health"
INTENT_BRIEFING_GENERATE = "briefing_generate"


@dataclass
class RepeIntent:
    """Classified REPE intent with extracted parameters."""
    family: str
    confidence: float
    extracted_params: dict[str, Any] = field(default_factory=dict)
    missing_params: list[str] = field(default_factory=list)
    original_message: str = ""


# ── Synonym patterns ─────────────────────────────────────────────────────────
# Each pattern is compiled once at module load for O(1) reuse.

_SALE_RE = re.compile(
    r"\b(sell|sold|exit|exiting|dispose|disposition|liquidat[ei]|"
    r"take\s+(?:off|out)|unwind|monetiz[ei]|harvest|realiz(?:e|ation)|"
    r"sale\s*(?:scenario|case|model)?)\b",
    re.IGNORECASE,
)
_CAP_RATE_RE = re.compile(
    r"\b(cap\s*rate|exit\s*cap|going[\s-]?in\s*cap|terminal\s*cap|"
    r"capitalization\s*rate)\b",
    re.IGNORECASE,
)
_WATERFALL_RE = re.compile(
    r"\b(waterfall|distribution(?:s)?|carry|catch[\s-]?up|"
    r"promot[ei]|profit\s*split|gp\s*share|lp\s*share|"
    r"lp[\s/]+gp\s*split|gp[\s/]+lp\s*split)\b",
    re.IGNORECASE,
)
_FUND_IMPACT_RE = re.compile(
    r"\b(fund\s*impact|impact\s*(?:on|to)\s*(?:the\s+)?fund|"
    r"(?:how|what)\s+(?:does|would|will)\s+(?:it|that|this)\s+(?:do|affect|impact|change)\s+(?:to\s+)?(?:the\s+)?fund|"
    r"fund[\s-]?level\s*(?:return|impact|delta|effect)|"
    r"nav\s*(?:change|impact|delta|effect))\b",
    re.IGNORECASE,
)
_STRESS_RE = re.compile(
    r"\b(stress|shock|downside|adverse|bear\s*case|"
    r"sensitiv(?:e|ity)|widen(?:s|ing)?|compress(?:es|ing)?|expand(?:s|ing)?|"
    r"(?:cap\s*rate|exit\s*cap)\s+(?:expansion|compression|widen|shock))\b",
    re.IGNORECASE,
)
_BPS_RE = re.compile(
    r"(\d+)\s*(?:bps|basis\s*points?)\b",
    re.IGNORECASE,
)
_METRICS_RE = re.compile(
    r"\b(irr|tvpi|dpi|rvpi|moic|multiple|gross\s*return|net\s*return|"
    r"cash[\s-]?on[\s-]?cash|fund\s*performance|fund\s*metrics|"
    r"fund\s*summary|performance\s*summary)\b",
    re.IGNORECASE,
)
_COMPARE_RE = re.compile(
    r"\b(compare|versus|vs\.?|side[\s-]?by[\s-]?side|"
    r"delta|differ(?:ence|ent)|relative\s*to|against\s*base|"
    r"base\s*case\s*vs|compare\s*(?:to|with)\s*base)\b",
    re.IGNORECASE,
)
_VALUATION_RE = re.compile(
    r"\b(valuation|what.s?\s+(?:it|this|the\s+(?:asset|property))\s+worth|"
    r"nav\s*impact|mark[\s-]?to[\s-]?market|apprai(?:se|sal)|"
    r"cap\s*rate\s*(?:impact|sensitiv))\b",
    re.IGNORECASE,
)
_EXPLAIN_RE = re.compile(
    r"\b(explain|why\s+(?:is|did|does)|what\s+(?:drove|drives|caused)|"
    r"driver(?:s)?|attribution|breakdown|decompos[ei]|walk\s*(?:me\s+)?through)\b",
    re.IGNORECASE,
)
_LP_RE = re.compile(
    r"\b(lp\s*(?:summary|update|report|returns|accounts?|capital)|"
    r"partner\s*(?:returns|summary|accounts?|capital)|capital\s*accounts?|"
    r"draft\s*(?:an?\s+)?lp\s*update)\b",
    re.IGNORECASE,
)
_WHAT_IF_RE = re.compile(
    r"\b(what\s*(?:if|happens?\s*(?:if|when))|if\s+we\s+(?:sell|exit|dispose|sold)|"
    r"assume\s+(?:we\s+)?(?:sell|exit|a\s+sale))\b",
    re.IGNORECASE,
)
_MC_WATERFALL_RE = re.compile(
    r"\b(monte\s*carlo\s*waterfall|probability.*waterfall|simulation.*distribution|p10.*p90.*waterfall)\b",
    re.IGNORECASE,
)
_PORTFOLIO_WATERFALL_RE = re.compile(
    r"\b(portfolio\s*waterfall|cross.*fund.*waterfall|aggregate.*carry|total.*carry.*exposure)\b",
    re.IGNORECASE,
)
_PIPELINE_RADAR_RE = re.compile(
    r"\b(deal\s*radar|pipeline.*score|score.*pipeline|rank.*deals|best.*opportunit(?:y|ies))\b",
    re.IGNORECASE,
)
_CAPITAL_CALL_RE = re.compile(
    r"\b(capital\s*call|call.*additional|what\s+if\s+we\s+call)\b",
    re.IGNORECASE,
)
_CLAWBACK_RE = re.compile(
    r"\b(clawback|promote.*risk|gp.*liability)\b",
    re.IGNORECASE,
)
_UW_ACTUAL_RE = re.compile(
    r"\b(uw.*vs.*actual|underwriting.*actual|thesis.*variance|how.*we.*tracking|vs.*underwriting|compare.*underwriting)\b",
    re.IGNORECASE,
)
_SENSITIVITY_MATRIX_RE = re.compile(
    r"\b(sensitivity|data\s*table|matrix|grid.*scenarios)\b",
    re.IGNORECASE,
)
_CONSTRUCTION_RE = re.compile(
    r"\b(construction|development.*waterfall|stabilization|draw.*schedule.*impact)\b",
    re.IGNORECASE,
)
_SESSION_WF_RE = re.compile(
    r"\b(which.*best|compare all.*runs|best.*scenario|worst.*scenario|summary of.*runs)\b",
    re.IGNORECASE,
)
_DASHBOARD_RE = re.compile(
    r"\b((?:build|show|create|generate)\s+(?:me\s+)?(?:a\s+)?(?:dashboard|report)|"
    r"monthly\s+operating\s+report|executive\s+summary\s+dashboard|"
    r"fund\s+(?:quarterly|performance)\s+(?:review|report|dashboard)|"
    r"watchlist\s+(?:dashboard|report)|portfolio\s+(?:overview|summary|dashboard)|"
    r"operating\s+review\s+(?:dashboard|report)|"
    r"(?:asset|property)\s+(?:operating|management)\s+report|"
    r"underwriting\s+dashboard)\b",
    re.IGNORECASE,
)
# Free-form chart requests that should also route to the dashboard composer
_CHART_INTENT_RE = re.compile(
    r"\b("
    r"(?:line|bar|stacked\s+bar|trend|scatter)\s+(?:chart|plot)|"
    r"heatmap|heat\s+map|histogram|distribution\s+(?:of|across)|"
    r"(?:trend|table|comparison)\s+(?:of|for|by|across|ranked)|"
    r"(?:NOI|DSCR|occupancy|revenue|expenses?|debt\s+maturity|"
    r"irr|tvpi|nav|noi\s+margin)\s+(?:over\s+time|trend|across\s+)|"
    r"compare\s+(?:revenue|noi|budget|expenses?|occupancy)|"
    r"(?:top\s+\d+|ranked\s+by)\s+\w+|"
    r"(?:budget|actual)\s+vs\s+(?:budget|actual)|"
    r"side\s+by\s+side"
    r")\b",
    re.IGNORECASE,
)

# ── Analytics portal patterns ───────────────────────────────────────────────
_ANALYTICS_QUERY_RE = re.compile(
    r"\b((?:run|execute|write|show\s+me)\s+(?:a\s+)?(?:sql\s+)?query|"
    r"query\s+(?:the\s+)?(?:data|database|table)|"
    r"how\s+many|total\s+(?:number|count|sum|amount)|"
    r"average\s+(?:noi|rent|occupancy|budget|spend)|"
    r"(?:list|show|get)\s+(?:all\s+)?(?:projects?|funds?|assets?|deals?|contracts?)|"
    r"(?:group|break(?:down)?|aggregate|sum(?:marize)?)\s+(?:by|per))\b",
    re.IGNORECASE,
)
_KNOWLEDGE_SEARCH_RE = re.compile(
    r"\b((?:find|search|look\s*up|locate)\s+(?:documents?|knowledge|information|policies?|procedures?)|"
    r"what\s+(?:is|are|do\s+we\s+know\s+about)|"
    r"(?:who|which\s+team)\s+(?:is|are|owns|manages)|"
    r"knowledge\s+(?:base|graph|search)|"
    r"search\s+(?:for|the)\s+(?:docs?|documents?|files?))\b",
    re.IGNORECASE,
)
_DATA_HEALTH_RE = re.compile(
    r"\b(data\s+(?:health|quality|freshness|staleness|completeness|accuracy)|"
    r"(?:is|are)\s+(?:the\s+)?data\s+(?:fresh|stale|up\s+to\s+date|current|accurate)|"
    r"when\s+was\s+(?:the\s+)?(?:data|table)\s+(?:last\s+)?updated|"
    r"data\s+(?:contract|sla)\s+(?:status|check|compliance)|"
    r"pipeline\s+(?:status|health|check))\b",
    re.IGNORECASE,
)
_BRIEFING_RE = re.compile(
    r"\b((?:generate|create|draft|prepare)\s+(?:an?\s+)?(?:executive\s+)?briefing|"
    r"executive\s+(?:briefing|summary|update|readout)|"
    r"(?:weekly|monthly|quarterly)\s+(?:briefing|update|readout|summary)|"
    r"brief\s+(?:me|the\s+(?:board|team|executives?))|"
    r"(?:kpi|key\s+metric)\s+(?:snapshot|summary|update))\b",
    re.IGNORECASE,
)

# ── Parameter extraction patterns ────────────────────────────────────────────

_DOLLAR_RE = re.compile(
    r"\$\s*([\d,]+(?:\.\d+)?)\s*(?:m(?:illion)?|mm|M)?",
    re.IGNORECASE,
)
_CAP_RATE_VALUE_RE = re.compile(
    r"(\d+\.?\d*)\s*%?\s*(?:cap\s*rate|exit\s*cap|cap)|"
    r"(?:cap\s*rate|exit\s*cap)\s*(?:of\s*)?(\d+\.?\d*)\s*%?",
    re.IGNORECASE,
)
_PCT_HAIRCUT_RE = re.compile(
    r"(\d+\.?\d*)\s*%\s*(?:below|haircut|discount|off|reduction)",
    re.IGNORECASE,
)
_QUARTER_RE = re.compile(
    r"\b(20\d{2})\s*[Qq]([1-4])\b|\b[Qq]([1-4])\s*(20\d{2})\b",
)
_YEAR_RE = re.compile(r"\b(next\s+year|in\s+(\d{4})|by\s+(20\d{2}))\b", re.IGNORECASE)
_TIMING_RE = re.compile(
    r"\b(next\s+(?:year|quarter)|in\s+(?:Q[1-4]|12\s+months?)|"
    r"(?:early|delayed)\s+exit|bring\s+forward|move\s+(?:sale\s+)?out)\b",
    re.IGNORECASE,
)
_NAMED_FUND_RE = re.compile(
    r"(?:fund|for)\s+([A-Z][A-Za-z\s]+?(?:Fund|fund)\s*(?:I{1,3}V?|VI{0,3}|[IVX]+|\d+))\b",
    re.IGNORECASE,
)


# ── Classification logic ─────────────────────────────────────────────────────

def classify_repe_intent(
    message: str,
    resolved_scope: ResolvedAssistantScope,
    context_envelope: AssistantContextEnvelope,
) -> RepeIntent | None:
    """Classify a user message into a REPE intent family.

    Returns None for non-REPE queries (confidence < threshold), which fall
    through to the existing LLM pipeline.
    """
    msg = message.strip()
    if not msg:
        return None

    # Score each intent family
    scores: dict[str, float] = {}
    extracted: dict[str, Any] = {}

    # ── Sale scenario ──────────────────────────────────────────────────
    sale_score = 0.0
    if _SALE_RE.search(msg):
        sale_score += 0.50
    if _WHAT_IF_RE.search(msg):
        sale_score += 0.25
    if _FUND_IMPACT_RE.search(msg):
        sale_score += 0.15
    if _CAP_RATE_RE.search(msg) and sale_score > 0:
        sale_score += 0.10
    # Context boost: on asset/investment page
    page_type = context_envelope.ui.page_entity_type or ""
    if page_type in ("asset", "investment", "deal") and sale_score > 0:
        sale_score += 0.10
    scores[INTENT_RUN_SALE_SCENARIO] = min(sale_score, 1.0)

    # ── Fund impact ────────────────────────────────────────────────────
    fi_score = 0.0
    if _FUND_IMPACT_RE.search(msg):
        fi_score += 0.55
    if _METRICS_RE.search(msg):
        fi_score += 0.20
    if page_type == "fund":
        fi_score += 0.10
    scores[INTENT_RUN_FUND_IMPACT] = min(fi_score, 1.0)

    # ── Waterfall ──────────────────────────────────────────────────────
    wf_score = 0.0
    if _WATERFALL_RE.search(msg):
        wf_score += 0.65
    if _FUND_IMPACT_RE.search(msg) and wf_score > 0:
        wf_score += 0.10
    if page_type == "fund":
        wf_score += 0.10
    scores[INTENT_RUN_WATERFALL] = min(wf_score, 1.0)

    # ── Compare scenarios ──────────────────────────────────────────────
    cmp_score = 0.0
    if _COMPARE_RE.search(msg):
        cmp_score += 0.55
    if _METRICS_RE.search(msg) and cmp_score > 0:
        cmp_score += 0.15
    if _SALE_RE.search(msg) and cmp_score > 0:
        cmp_score += 0.10
    scores[INTENT_COMPARE_SCENARIOS] = min(cmp_score, 1.0)

    # ── Stress cap rate ────────────────────────────────────────────────
    stress_score = 0.0
    if _STRESS_RE.search(msg):
        stress_score += 0.45
    if _CAP_RATE_RE.search(msg) and stress_score > 0:
        stress_score += 0.25
    if _BPS_RE.search(msg):
        stress_score += 0.20
    if _WHAT_IF_RE.search(msg) and (_CAP_RATE_RE.search(msg) or _BPS_RE.search(msg)):
        stress_score += 0.20
    scores[INTENT_STRESS_CAP_RATE] = min(stress_score, 1.0)

    # ── Fund metrics ───────────────────────────────────────────────────
    fm_score = 0.0
    if _METRICS_RE.search(msg) and not _SALE_RE.search(msg) and not _STRESS_RE.search(msg):
        fm_score += 0.60
    if page_type == "fund":
        fm_score += 0.10
    scores[INTENT_FUND_METRICS] = min(fm_score, 1.0)

    mc_score = 0.0
    if _MC_WATERFALL_RE.search(msg):
        mc_score += 0.9
    if _WATERFALL_RE.search(msg) and "p10" in msg.lower() and "p90" in msg.lower():
        mc_score += 0.1
    scores[INTENT_MONTE_CARLO_WATERFALL] = min(mc_score, 1.0)

    portfolio_wf_score = 0.0
    if _PORTFOLIO_WATERFALL_RE.search(msg):
        portfolio_wf_score += 0.9
    scores[INTENT_PORTFOLIO_WATERFALL] = min(portfolio_wf_score, 1.0)

    radar_score = 0.0
    if _PIPELINE_RADAR_RE.search(msg):
        radar_score += 0.9
    scores[INTENT_PIPELINE_RADAR] = min(radar_score, 1.0)

    capital_call_score = 0.0
    if _CAPITAL_CALL_RE.search(msg):
        capital_call_score += 0.9
    scores[INTENT_CAPITAL_CALL_IMPACT] = min(capital_call_score, 1.0)

    clawback_score = 0.0
    if _CLAWBACK_RE.search(msg):
        clawback_score += 0.85
    scores[INTENT_CLAWBACK_RISK] = min(clawback_score, 1.0)

    uw_actual_score = 0.0
    if _UW_ACTUAL_RE.search(msg):
        uw_actual_score += 0.9
    scores[INTENT_UW_VS_ACTUAL] = min(uw_actual_score, 1.0)

    sensitivity_score = 0.0
    if _SENSITIVITY_MATRIX_RE.search(msg) and _WATERFALL_RE.search(msg):
        sensitivity_score += 0.9
    scores[INTENT_SENSITIVITY] = min(sensitivity_score, 1.0)

    construction_score = 0.0
    if _CONSTRUCTION_RE.search(msg):
        construction_score += 0.85
    if _WATERFALL_RE.search(msg) and construction_score > 0:
        construction_score += 0.1
    scores[INTENT_CONSTRUCTION_IMPACT] = min(construction_score, 1.0)

    session_wf_score = 0.0
    if _SESSION_WF_RE.search(msg):
        session_wf_score += 0.9
    scores[INTENT_SESSION_WATERFALL_QUERY] = min(session_wf_score, 1.0)

    # ── Asset valuation ────────────────────────────────────────────────
    val_score = 0.0
    if _VALUATION_RE.search(msg):
        val_score += 0.55
    if _CAP_RATE_RE.search(msg) and val_score > 0:
        val_score += 0.15
    if page_type in ("asset", "investment"):
        val_score += 0.10
    scores[INTENT_ASSET_VALUATION] = min(val_score, 1.0)

    # ── Explain returns ────────────────────────────────────────────────
    exp_score = 0.0
    if _EXPLAIN_RE.search(msg) and _METRICS_RE.search(msg):
        exp_score += 0.65
    scores[INTENT_EXPLAIN_RETURNS] = min(exp_score, 1.0)

    # ── LP summary ─────────────────────────────────────────────────────
    lp_score = 0.0
    if _LP_RE.search(msg):
        lp_score += 0.70
    if page_type == "fund":
        lp_score += 0.10
    scores[INTENT_LP_SUMMARY] = min(lp_score, 1.0)

    # ── Generate dashboard ────────────────────────────────────────────
    dash_score = 0.0
    _has_chart_keywords = bool(_CHART_INTENT_RE.search(msg))
    if _DASHBOARD_RE.search(msg):
        dash_score += 0.90
    elif _has_chart_keywords:
        dash_score += 0.90
    # Suppress if a specific engine-level intent scored higher
    # BUT do NOT suppress when the user explicitly used chart language
    if not _has_chart_keywords:
        if scores.get(INTENT_RUN_WATERFALL, 0) > 0.6 and dash_score > 0:
            dash_score *= 0.3
        if scores.get(INTENT_PIPELINE_RADAR, 0) > 0.6 and dash_score > 0:
            dash_score *= 0.3
        if scores.get(INTENT_LP_SUMMARY, 0) > 0.6 and dash_score > 0:
            dash_score *= 0.3
    scores[INTENT_GENERATE_DASHBOARD] = min(dash_score, 1.0)

    # ── Analytics query ──────────────────────────────────────────────
    aq_score = 0.0
    if _ANALYTICS_QUERY_RE.search(msg):
        aq_score += 0.70
    # Suppress if a finance-specific intent already matched strongly
    if any(scores.get(k, 0) > 0.7 for k in (
        INTENT_RUN_SALE_SCENARIO, INTENT_RUN_WATERFALL, INTENT_FUND_METRICS,
        INTENT_GENERATE_DASHBOARD, INTENT_PIPELINE_RADAR,
    )):
        aq_score *= 0.2
    scores[INTENT_ANALYTICS_QUERY] = min(aq_score, 1.0)

    # ── Knowledge search ─────────────────────────────────────────────
    ks_score = 0.0
    if _KNOWLEDGE_SEARCH_RE.search(msg):
        ks_score += 0.80
    scores[INTENT_KNOWLEDGE_SEARCH] = min(ks_score, 1.0)

    # ── Data health ──────────────────────────────────────────────────
    dh_score = 0.0
    if _DATA_HEALTH_RE.search(msg):
        dh_score += 0.85
    scores[INTENT_DATA_HEALTH] = min(dh_score, 1.0)

    # ── Executive briefing ───────────────────────────────────────────
    br_score = 0.0
    if _BRIEFING_RE.search(msg):
        br_score += 0.90
    # Suppress briefing if "dashboard" appears — that should route to dashboard generator
    if "dashboard" in msg.lower() and br_score > 0:
        br_score *= 0.2
    # Suppress dashboard if briefing scored high and no "dashboard" keyword
    elif br_score > 0.5 and scores.get(INTENT_GENERATE_DASHBOARD, 0) > 0.5 and "dashboard" not in msg.lower():
        scores[INTENT_GENERATE_DASHBOARD] *= 0.3
    scores[INTENT_BRIEFING_GENERATE] = min(br_score, 1.0)

    # ── Pick best intent ───────────────────────────────────────────────
    if not scores:
        return None

    best_family = max(scores, key=lambda k: scores[k])
    best_score = scores[best_family]

    if best_score < 0.40:
        return None  # Not a REPE intent — fall through to LLM

    # ── Extract parameters ─────────────────────────────────────────────
    extracted = _extract_params(msg, best_family, resolved_scope, context_envelope)
    missing = _identify_missing_params(best_family, extracted, resolved_scope, context_envelope)

    return RepeIntent(
        family=best_family,
        confidence=best_score,
        extracted_params=extracted,
        missing_params=missing,
        original_message=msg,
    )


def _extract_params(
    message: str,
    intent_family: str,
    resolved_scope: ResolvedAssistantScope,
    context_envelope: AssistantContextEnvelope,
) -> dict[str, Any]:
    """Extract finance parameters from natural language and context."""
    params: dict[str, Any] = {}

    # ── Context-resolved params (always available) ─────────────────────
    if resolved_scope.environment_id:
        params["env_id"] = resolved_scope.environment_id
        params["_source_env_id"] = "scope"
    if resolved_scope.business_id:
        params["business_id"] = resolved_scope.business_id
        params["_source_business_id"] = "scope"

    # Resolve fund_id from page context or visible data
    _resolve_entity_ids(params, message, resolved_scope, context_envelope)

    # ── Message-extracted params ───────────────────────────────────────

    # Dollar amounts → sale_price
    dollar_match = _DOLLAR_RE.search(message)
    if dollar_match:
        raw = dollar_match.group(1).replace(",", "")
        try:
            val = Decimal(raw)
            # Check for M/MM suffix
            suffix = message[dollar_match.end():dollar_match.end() + 10].strip().lower()
            if suffix.startswith(("m", "mm")):
                val *= Decimal("1000000")
            elif val < 10000:
                # Likely already in millions notation (e.g., "$82 million")
                if "million" in message[dollar_match.start():dollar_match.end() + 20].lower():
                    val *= Decimal("1000000")
            params["sale_price"] = val
            params["_source_sale_price"] = "message"
        except InvalidOperation:
            pass

    # Cap rate values
    cap_match = _CAP_RATE_VALUE_RE.search(message)
    if cap_match:
        raw = cap_match.group(1) or cap_match.group(2)
        if raw:
            try:
                val = Decimal(raw)
                # Values like 6.25 → 0.0625
                if val > 1:
                    val = val / Decimal("100")
                params["exit_cap_rate"] = val
                params["_source_exit_cap_rate"] = "message"
            except InvalidOperation:
                pass

    # BPS delta
    bps_match = _BPS_RE.search(message)
    if bps_match:
        try:
            params["cap_rate_delta_bps"] = int(bps_match.group(1))
            params["_source_cap_rate_delta_bps"] = "message"
        except ValueError:
            pass

    if intent_family == INTENT_CAPITAL_CALL_IMPACT and "sale_price" in params:
        params["additional_call_amount"] = params["sale_price"]
        params["_source_additional_call_amount"] = params.get("_source_sale_price", "message")

    # Percentage haircut
    haircut_match = _PCT_HAIRCUT_RE.search(message)
    if haircut_match:
        try:
            params["value_haircut_pct"] = Decimal(haircut_match.group(1)) / Decimal("100")
            params["_source_value_haircut_pct"] = "message"
        except InvalidOperation:
            pass

    # Quarter
    quarter_match = _QUARTER_RE.search(message)
    if quarter_match:
        year = quarter_match.group(1) or quarter_match.group(4)
        q = quarter_match.group(2) or quarter_match.group(3)
        if year and q:
            params["quarter"] = f"{year}Q{q}"
            params["_source_quarter"] = "message"

    # Named fund
    fund_match = _NAMED_FUND_RE.search(message)
    if fund_match and "fund_id" not in params:
        params["fund_name_hint"] = fund_match.group(1).strip()
        params["_source_fund_name_hint"] = "message"

    try:
        from app.services.re_scenario_templates import resolve_template

        template = resolve_template(message, env_id=str(params.get("env_id") or ""))
        if template:
            params["scenario_template"] = template["name"]
            params["cap_rate_delta_bps"] = template.get("cap_rate_delta_bps")
            params["noi_stress_pct"] = template.get("noi_stress_pct")
            params["exit_date_shift_months"] = template.get("exit_date_shift_months")
    except Exception:
        pass

    return params


def _resolve_entity_ids(
    params: dict[str, Any],
    message: str,
    resolved_scope: ResolvedAssistantScope,
    context_envelope: AssistantContextEnvelope,
) -> None:
    """Resolve fund_id, asset_id, deal_id from scope and visible data."""
    entity_type = resolved_scope.entity_type
    entity_id = resolved_scope.entity_id

    if entity_type == "fund" and entity_id:
        params["fund_id"] = entity_id
        params["_source_fund_id"] = "page_context"
    elif entity_type == "asset" and entity_id:
        params["asset_id"] = entity_id
        params["_source_asset_id"] = "page_context"
    elif entity_type in ("investment", "deal") and entity_id:
        params["deal_id"] = entity_id
        params["_source_deal_id"] = "page_context"

    # Try visible data for fund_id if not already resolved
    if "fund_id" not in params:
        visible = context_envelope.ui.visible_data
        if visible and visible.funds and len(visible.funds) == 1:
            params["fund_id"] = visible.funds[0].entity_id
            params["_source_fund_id"] = "visible_data_single"

    # Try to match named fund in visible data
    fund_hint = params.get("fund_name_hint", "").lower()
    if fund_hint and "fund_id" not in params:
        visible = context_envelope.ui.visible_data
        if visible and visible.funds:
            for f in visible.funds:
                if fund_hint in f.name.lower():
                    params["fund_id"] = f.entity_id
                    params["_source_fund_id"] = "visible_data_name_match"
                    break


def _identify_missing_params(
    intent_family: str,
    extracted: dict[str, Any],
    resolved_scope: ResolvedAssistantScope,
    context_envelope: AssistantContextEnvelope,
) -> list[str]:
    """Identify critical missing parameters for a given intent.

    Finance clarification policy: at most ONE follow-up question.
    Non-critical params get defaults (never asked).
    """
    missing: list[str] = []

    # Common: env_id and business_id are always required
    if not extracted.get("env_id"):
        missing.append("env_id")
    if not extracted.get("business_id"):
        missing.append("business_id")

    if intent_family == INTENT_RUN_SALE_SCENARIO:
        if not extracted.get("fund_id"):
            missing.append("fund_id")
        # Must know pricing basis: sale_price, exit_cap_rate, or value_haircut_pct
        has_pricing = any(extracted.get(k) for k in ("sale_price", "exit_cap_rate", "value_haircut_pct"))
        if not has_pricing:
            missing.append("pricing_basis")

    elif intent_family == INTENT_STRESS_CAP_RATE:
        if not extracted.get("fund_id") and not extracted.get("asset_id"):
            missing.append("fund_id")
        if not extracted.get("cap_rate_delta_bps") and not extracted.get("exit_cap_rate"):
            missing.append("cap_rate_delta")

    elif intent_family in (INTENT_RUN_FUND_IMPACT, INTENT_FUND_METRICS, INTENT_LP_SUMMARY, INTENT_MONTE_CARLO_WATERFALL, INTENT_PORTFOLIO_WATERFALL, INTENT_UW_VS_ACTUAL, INTENT_SENSITIVITY, INTENT_CONSTRUCTION_IMPACT):
        if not extracted.get("fund_id"):
            missing.append("fund_id")

    elif intent_family == INTENT_RUN_WATERFALL:
        if not extracted.get("fund_id"):
            missing.append("fund_id")

    elif intent_family == INTENT_COMPARE_SCENARIOS:
        if not extracted.get("fund_id"):
            missing.append("fund_id")

    elif intent_family == INTENT_CAPITAL_CALL_IMPACT:
        if not extracted.get("fund_id"):
            missing.append("fund_id")
        if not extracted.get("additional_call_amount"):
            missing.append("additional_call_amount")

    elif intent_family == INTENT_CLAWBACK_RISK:
        if not extracted.get("fund_id"):
            missing.append("fund_id")

    elif intent_family == INTENT_GENERATE_DASHBOARD:
        pass  # Only env_id/business_id needed (checked above); dashboards are portfolio-wide

    return missing
