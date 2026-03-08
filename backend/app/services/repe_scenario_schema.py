"""Scenario Request Schema — bridges REPE intent classification to engine execution.

Converts classified intents with extracted parameters into a structured request
that deterministic finance engines can execute directly.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

from app.schemas.ai_gateway import AssistantContextEnvelope, ResolvedAssistantScope
from app.services.repe_intent import RepeIntent


@dataclass
class ScenarioRequest:
    """Structured scenario request ready for engine execution."""
    intent_family: str

    # ── Context (auto-resolved) ────────────────────────────────────────
    env_id: str | None = None
    business_id: str | None = None
    fund_id: str | None = None
    deal_id: str | None = None
    asset_id: str | None = None
    quarter: str | None = None  # defaults to current

    # ── Scenario-specific params ───────────────────────────────────────
    sale_price: Decimal | None = None
    exit_cap_rate: Decimal | None = None
    cap_rate_delta_bps: int | None = None
    value_haircut_pct: Decimal | None = None
    sale_date: date | None = None
    buyer_costs: Decimal = Decimal("0")
    disposition_fee_pct: Decimal = Decimal("0")

    # ── Scenario references ────────────────────────────────────────────
    scenario_id: str | None = None
    scenario_name: str | None = None
    scenario_ids: list[str] | None = None  # for comparisons
    baseline_scenario_id: str | None = None

    # ── Output control ─────────────────────────────────────────────────
    outputs_requested: list[str] = field(default_factory=lambda: ["fund_impact"])
    comparison_mode: str = "base_case"

    # ── Resolution metadata ────────────────────────────────────────────
    resolved_from: dict[str, str] = field(default_factory=dict)
    missing_critical: list[str] = field(default_factory=list)

    # ── Fund name hint (for display) ───────────────────────────────────
    fund_name_hint: str | None = None
    entity_name: str | None = None


def _current_quarter() -> str:
    """Return the current calendar quarter as YYYYQN."""
    today = date.today()
    q = (today.month - 1) // 3 + 1
    return f"{today.year}Q{q}"


def resolve_scenario_params(
    intent: RepeIntent,
    resolved_scope: ResolvedAssistantScope,
    context_envelope: AssistantContextEnvelope,
) -> ScenarioRequest:
    """Convert a classified intent into a fully-resolved scenario request.

    Resolution priority chain for each parameter:
    1. Extracted from message text (highest)
    2. Page context (page_entity_id, page_entity_type)
    3. Visible data entities
    4. Session/thread context
    5. Database defaults (current quarter, latest scenario)
    """
    p = intent.extracted_params
    sources: dict[str, str] = {}

    # ── Context resolution ─────────────────────────────────────────────
    env_id = p.get("env_id")
    if env_id:
        sources["env_id"] = p.get("_source_env_id", "extracted")

    business_id = p.get("business_id")
    if business_id:
        sources["business_id"] = p.get("_source_business_id", "extracted")

    fund_id = p.get("fund_id")
    if fund_id:
        sources["fund_id"] = p.get("_source_fund_id", "extracted")

    deal_id = p.get("deal_id")
    if deal_id:
        sources["deal_id"] = p.get("_source_deal_id", "extracted")

    asset_id = p.get("asset_id")
    if asset_id:
        sources["asset_id"] = p.get("_source_asset_id", "extracted")

    # Quarter: use extracted or default to current
    quarter = p.get("quarter") or _current_quarter()
    sources["quarter"] = p.get("_source_quarter", "default_current")

    # Entity name for display
    entity_name = resolved_scope.entity_name

    # ── Determine outputs ──────────────────────────────────────────────
    outputs = _infer_outputs(intent)

    # ── Build request ──────────────────────────────────────────────────
    req = ScenarioRequest(
        intent_family=intent.family,
        env_id=env_id,
        business_id=business_id,
        fund_id=fund_id,
        deal_id=deal_id,
        asset_id=asset_id,
        quarter=quarter,
        sale_price=p.get("sale_price"),
        exit_cap_rate=p.get("exit_cap_rate"),
        cap_rate_delta_bps=p.get("cap_rate_delta_bps"),
        value_haircut_pct=p.get("value_haircut_pct"),
        fund_name_hint=p.get("fund_name_hint"),
        entity_name=entity_name,
        outputs_requested=outputs,
        resolved_from=sources,
        missing_critical=list(intent.missing_params),
    )

    return req


def _infer_outputs(intent: RepeIntent) -> list[str]:
    """Infer which output sections the user wants based on intent."""
    from app.services.repe_intent import (
        INTENT_COMPARE_SCENARIOS,
        INTENT_FUND_METRICS,
        INTENT_LP_SUMMARY,
        INTENT_RUN_FUND_IMPACT,
        INTENT_RUN_SALE_SCENARIO,
        INTENT_RUN_WATERFALL,
        INTENT_STRESS_CAP_RATE,
    )

    family = intent.family
    msg_lower = intent.original_message.lower()

    outputs = []

    if family == INTENT_RUN_SALE_SCENARIO:
        outputs.append("sale_analysis")
        outputs.append("fund_impact")
        # Add waterfall if mentioned
        if any(w in msg_lower for w in ("waterfall", "carry", "distribution", "lp", "gp")):
            outputs.append("waterfall")

    elif family == INTENT_RUN_FUND_IMPACT:
        outputs.append("fund_impact")

    elif family == INTENT_RUN_WATERFALL:
        outputs.append("waterfall")

    elif family == INTENT_COMPARE_SCENARIOS:
        outputs.append("scenario_comparison")

    elif family == INTENT_STRESS_CAP_RATE:
        outputs.append("stress_matrix")
        outputs.append("fund_impact")

    elif family == INTENT_FUND_METRICS:
        outputs.append("fund_metrics")

    elif family == INTENT_LP_SUMMARY:
        outputs.append("lp_summary")

    else:
        outputs.append("fund_impact")

    return outputs


def build_clarification_question(scenario: ScenarioRequest) -> str | None:
    """Build a single, finance-critical follow-up question.

    Returns None if no critical params are missing.
    Policy: ask at most ONE question. Include defaults that will be used
    if the user just says 'go ahead'.
    """
    missing = scenario.missing_critical

    # Infrastructure missing — can't proceed
    if "env_id" in missing or "business_id" in missing:
        return "I can't determine which environment or business to use. Could you navigate to a specific environment first?"

    if "fund_id" in missing:
        return "Which fund should I analyze? Navigate to a fund page or specify the fund name."

    if "pricing_basis" in missing:
        entity = scenario.entity_name or "the asset"
        return (
            f"How should I price the sale of {entity}? Options:\n"
            f"- **Current mark** (use latest NAV)\n"
            f"- **Exit cap rate** (e.g., 'at a 6.25 cap')\n"
            f"- **Specific price** (e.g., '$82 million')\n\n"
            f"If you say 'go ahead', I'll use the current mark."
        )

    if "cap_rate_delta" in missing:
        return (
            "How much should I stress the cap rate? For example:\n"
            "- '50 bps wider'\n"
            "- 'at a 6.5 cap'\n\n"
            "Default: +50bps expansion."
        )

    return None
