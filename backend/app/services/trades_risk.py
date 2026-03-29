"""Risk evaluation helpers for the Winston execution layer."""

from __future__ import annotations

from decimal import Decimal, ROUND_DOWN
from typing import Any


def _decimal(value: Any, default: str = "0") -> Decimal:
    if value is None or value == "":
        return Decimal(default)
    return Decimal(str(value))


def _decision_rank(decision: str) -> int:
    return {"pass": 0, "reduce": 1, "block": 2}[decision]


def _merge_decision(*decisions: str) -> str:
    return max(decisions, key=_decision_rank)


def _confidence_modifier(confidence_score: Decimal) -> Decimal:
    base = Decimal("0.75") + (confidence_score / Decimal("100")) * Decimal("0.40")
    return min(Decimal("1.15"), max(Decimal("0.60"), base))


def _regime_modifier(regime_label: str | None) -> Decimal:
    mapping = {
        "risk_on": Decimal("1.00"),
        "transitional": Decimal("0.85"),
        "risk_off": Decimal("0.65"),
        "stress": Decimal("0.40"),
    }
    return mapping.get((regime_label or "").lower(), Decimal("0.60"))


def _trap_modifier(trap_risk_score: Decimal) -> Decimal:
    if trap_risk_score > Decimal("85"):
        return Decimal("0.00")
    if trap_risk_score > Decimal("70"):
        return Decimal("0.40")
    if trap_risk_score > Decimal("50"):
        return Decimal("0.65")
    if trap_risk_score > Decimal("25"):
        return Decimal("0.85")
    return Decimal("1.00")


def _liquidity_modifier(spread_bps: Decimal, adv: Decimal) -> Decimal:
    modifier = Decimal("1.00")
    if spread_bps > Decimal("100"):
        modifier -= Decimal("0.30")
    elif spread_bps > Decimal("30"):
        modifier -= Decimal("0.10")
    if adv and adv < Decimal("1000000"):
        modifier -= Decimal("0.25")
    elif adv and adv < Decimal("5000000"):
        modifier -= Decimal("0.10")
    return max(Decimal("0.20"), modifier)


def evaluate_trade_risk(
    *,
    trade_intent: dict[str, Any],
    control_state: dict[str, Any],
    limits: dict[str, Decimal],
    open_positions: list[dict[str, Any]],
    broker_status: dict[str, Any],
    regime_snapshot: dict[str, Any] | None,
    market_data: dict[str, Any],
) -> dict[str, Any]:
    metadata = trade_intent.get("metadata_json") or {}
    account_equity = _decimal(
        broker_status.get("NetLiquidation")
        or broker_status.get("equity_value")
        or metadata.get("account_equity")
        or "100000"
    )
    entry_price = _decimal(trade_intent.get("entry_price") or market_data.get("market_price"))
    invalidation_level = _decimal(
        trade_intent.get("invalidation_level")
        or trade_intent.get("stop_price")
        or metadata.get("invalidation_level")
    )
    if entry_price <= 0:
        max_loss_check = "block"
        per_unit_loss = Decimal("0")
    else:
        per_unit_loss = abs(entry_price - invalidation_level)
        max_loss_check = "pass" if per_unit_loss > 0 else "block"

    theme_key = str(metadata.get("theme_key") or trade_intent.get("source_ref_id") or "unclassified")
    cluster_count = sum(1 for pos in open_positions if str(pos.get("risk_bucket") or "unclassified") == theme_key)
    existing_gross_exposure = sum(abs(_decimal(pos.get("market_value") or pos.get("quantity"))) for pos in open_positions)
    exposure_pct = (existing_gross_exposure / account_equity * Decimal("100")) if account_equity > 0 else Decimal("0")

    max_open_positions = limits.get("max_open_positions", Decimal("20"))
    max_single_position_pct = limits.get("max_single_position_pct", Decimal("5"))
    max_trade_risk_pct = limits.get("max_trade_risk_pct", Decimal("0.5"))
    max_cluster = limits.get("max_correlation_cluster_exposure", Decimal("3"))

    portfolio_exposure_check = "pass"
    if len(open_positions) >= int(max_open_positions):
        portfolio_exposure_check = "block"
    elif exposure_pct > Decimal("90"):
        portfolio_exposure_check = "reduce"

    concentration_check = "pass"
    if cluster_count >= int(max_cluster):
        concentration_check = "block"
    elif cluster_count == int(max_cluster) - 1:
        concentration_check = "reduce"

    broker_connectivity_check = "pass" if broker_status.get("connected") else "block"

    regime_label = (regime_snapshot or {}).get("regime_label")
    regime_check = "pass"
    if not regime_snapshot or not regime_label:
        regime_check = "block"
    elif str(regime_label).lower() == "stress":
        regime_check = "block"
    elif str(regime_label).lower() == "risk_off":
        regime_check = "reduce"

    trap_risk_score = _decimal(trade_intent.get("trap_risk_score"))
    trap_risk_check = "pass"
    if trap_risk_score > Decimal("85"):
        trap_risk_check = "block"
    elif trap_risk_score > Decimal("60"):
        trap_risk_check = "reduce"

    live_gate_check = "pass"
    if control_state.get("kill_switch_active"):
        live_gate_check = "block"
    elif control_state.get("current_mode") == "live_enabled":
        live_gate_check = "reduce"

    adv = _decimal(market_data.get("average_daily_volume") or metadata.get("average_daily_volume"))
    spread_bps = _decimal(market_data.get("spread_bps") or metadata.get("spread_bps"))
    liquidity_check = "pass"
    if not adv and not spread_bps:
        liquidity_check = "block"
    elif spread_bps > Decimal("100") or (adv and adv < Decimal("1000000")):
        liquidity_check = "reduce"

    volatility_pct = _decimal(market_data.get("volatility_pct") or metadata.get("volatility_pct"))
    volatility_check = "pass"
    if volatility_pct > Decimal("8"):
        volatility_check = "reduce"
    if volatility_pct > Decimal("15"):
        volatility_check = "block"

    base_risk_budget = account_equity * (max_trade_risk_pct / Decimal("100"))
    confidence_modifier = _confidence_modifier(_decimal(trade_intent.get("confidence_score")))
    regime_modifier = _regime_modifier(regime_label)
    trap_modifier = _trap_modifier(trap_risk_score)
    liquidity_modifier = _liquidity_modifier(spread_bps, adv) if (adv or spread_bps) else Decimal("0")

    final_decision = _merge_decision(
        portfolio_exposure_check,
        concentration_check,
        max_loss_check,
        liquidity_check,
        volatility_check,
        broker_connectivity_check,
        regime_check,
        trap_risk_check,
        live_gate_check,
    )

    recommended_size = Decimal("0")
    recommended_notional = Decimal("0")
    expected_max_loss = Decimal("0")
    risk_budget_used_pct = Decimal("0")
    if final_decision != "block" and per_unit_loss > 0 and trap_modifier > 0:
        adjusted_budget = base_risk_budget * confidence_modifier * regime_modifier * trap_modifier * liquidity_modifier
        if final_decision == "reduce":
            adjusted_budget *= Decimal("0.50")
        recommended_size = (adjusted_budget / per_unit_loss).quantize(Decimal("0.000001"), rounding=ROUND_DOWN)
        desired_quantity = _decimal(trade_intent.get("desired_quantity"))
        if desired_quantity > 0:
            recommended_size = min(recommended_size, desired_quantity)
        recommended_notional = (recommended_size * entry_price).quantize(Decimal("0.01"))
        expected_max_loss = (recommended_size * per_unit_loss).quantize(Decimal("0.01"))
        if base_risk_budget > 0:
            risk_budget_used_pct = (expected_max_loss / base_risk_budget * Decimal("100")).quantize(Decimal("0.0001"))
        position_pct = (recommended_notional / account_equity * Decimal("100")) if account_equity > 0 else Decimal("0")
        if position_pct > max_single_position_pct:
            concentration_check = "block" if position_pct > (max_single_position_pct * Decimal("1.25")) else "reduce"
            final_decision = _merge_decision(final_decision, concentration_check)

    notes = [
        "Base risk budget {0:.2f} from equity {1:.2f} and max trade risk {2}.".format(base_risk_budget, account_equity, max_trade_risk_pct),
        "Sizing modifiers: confidence {0}, regime {1}, trap {2}, liquidity {3}.".format(confidence_modifier, regime_modifier, trap_modifier, liquidity_modifier),
    ]
    if recommended_size > 0:
        notes.append(
            "Recommended size {0} units at {1} with per-unit loss {2} for expected max loss {3}.".format(
                recommended_size,
                entry_price,
                per_unit_loss,
                expected_max_loss,
            )
        )
    else:
        notes.append("No executable size produced because a blocking condition remains or price/invalidation data is incomplete.")

    return {
        "portfolio_exposure_check": portfolio_exposure_check,
        "concentration_check": concentration_check,
        "max_loss_check": max_loss_check,
        "liquidity_check": liquidity_check,
        "volatility_check": volatility_check,
        "broker_connectivity_check": broker_connectivity_check,
        "regime_check": regime_check,
        "trap_risk_check": trap_risk_check,
        "live_gate_check": live_gate_check,
        "final_decision": final_decision,
        "adjustment_notes": " ".join(notes),
        "size_explanation": " ".join(notes),
        "recommended_size": recommended_size,
        "recommended_notional": recommended_notional,
        "expected_max_loss": expected_max_loss,
        "risk_budget_used_pct": risk_budget_used_pct,
        "stop_level": invalidation_level,
        "invalidation_level": invalidation_level,
        "take_profit_framework": metadata.get("take_profit_framework") or "Use staged exits and reassess after first fill.",
        "details_json": {
            "account_equity": str(account_equity),
            "existing_gross_exposure_pct": str(exposure_pct.quantize(Decimal("0.01"))),
            "theme_key": theme_key,
            "cluster_count": cluster_count,
            "market_data": market_data,
            "regime_label": regime_label,
            "entry_price": str(entry_price),
            "per_unit_loss": str(per_unit_loss),
            "modifiers": {
                "confidence_modifier": str(confidence_modifier),
                "regime_modifier": str(regime_modifier),
                "trap_modifier": str(trap_modifier),
                "liquidity_modifier": str(liquidity_modifier),
            },
        },
    }
