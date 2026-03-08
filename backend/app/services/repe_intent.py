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
INTENT_ASSET_VALUATION = "asset_valuation"
INTENT_EXPLAIN_RETURNS = "explain_returns"
INTENT_LP_SUMMARY = "lp_summary"


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

    elif intent_family in (INTENT_RUN_FUND_IMPACT, INTENT_FUND_METRICS, INTENT_LP_SUMMARY):
        if not extracted.get("fund_id"):
            missing.append("fund_id")

    elif intent_family == INTENT_RUN_WATERFALL:
        if not extracted.get("fund_id"):
            missing.append("fund_id")

    elif intent_family == INTENT_COMPARE_SCENARIOS:
        if not extracted.get("fund_id"):
            missing.append("fund_id")

    return missing
