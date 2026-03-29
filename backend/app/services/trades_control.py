"""Execution control helpers and trade-layer defaults."""

from __future__ import annotations

LIVE_CONFIRMATION_PHRASE = "ENABLE LIVE TRADING"

DEFAULT_RISK_LIMITS: dict[str, float] = {
    "max_trade_risk_pct": 0.5,
    "max_single_position_pct": 5.0,
    "max_open_positions": 20.0,
    "max_live_orders": 0.0,
    "max_daily_loss": 1.5,
    "max_correlation_cluster_exposure": 3.0,
}

PROMOTION_CHECKLIST_DEFAULTS: dict[str, float] = {
    "minimum_paper_trades": 20.0,
    "minimum_review_sample": 20.0,
    "max_execution_error_rate_pct": 5.0,
    "max_disconnect_events": 3.0,
    "required_brier_threshold": 0.22,
    "required_paper_days": 90.0,
}


def requires_live_confirmation(target_mode: str) -> bool:
    return target_mode == "live_enabled"


def is_valid_live_phrase(phrase: str | None) -> bool:
    return (phrase or "").strip().upper() == LIVE_CONFIRMATION_PHRASE
