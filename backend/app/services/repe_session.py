"""REPE Session State — per-conversation finance state for multi-turn analysis.

Stored in-memory with 30-minute TTL. Enables follow-up queries like
"now stress the cap rate by 50bps" that continue from the last result.
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any


SESSION_TTL_SECONDS = 1800  # 30 minutes


@dataclass
class RepeSessionState:
    """Finance workflow state for a single conversation."""
    conversation_id: str
    active_scenario_id: str | None = None
    baseline_scenario_id: str | None = None
    analysis_mode: str | None = None  # "sale_scenario", "stress_test", "waterfall"
    last_result: dict[str, Any] | None = None
    accumulated_params: dict[str, Any] = field(default_factory=dict)
    waterfall_runs: list[dict[str, Any]] = field(default_factory=list)
    last_fund_id: str | None = None
    last_asset_id: str | None = None
    last_quarter: str | None = None
    updated_at: float = field(default_factory=time.time)


# ── In-memory store ──────────────────────────────────────────────────────────

_sessions: dict[str, RepeSessionState] = {}


def get_session(conversation_id: str | None) -> RepeSessionState | None:
    """Get session state for a conversation, or None if not found/expired."""
    if not conversation_id:
        return None

    key = str(conversation_id)
    session = _sessions.get(key)
    if session is None:
        return None

    # Check TTL
    if time.time() - session.updated_at > SESSION_TTL_SECONDS:
        _sessions.pop(key, None)
        return None

    return session


def update_session(
    conversation_id: str | None,
    *,
    active_scenario_id: str | None = None,
    baseline_scenario_id: str | None = None,
    analysis_mode: str | None = None,
    last_result: dict[str, Any] | None = None,
    accumulated_params: dict[str, Any] | None = None,
    waterfall_run: dict[str, Any] | None = None,
    last_fund_id: str | None = None,
    last_asset_id: str | None = None,
    last_quarter: str | None = None,
) -> RepeSessionState | None:
    """Update or create session state for a conversation."""
    if not conversation_id:
        return None

    key = str(conversation_id)
    session = _sessions.get(key)

    if session is None:
        session = RepeSessionState(conversation_id=key)
        _sessions[key] = session

    if active_scenario_id is not None:
        session.active_scenario_id = active_scenario_id
    if baseline_scenario_id is not None:
        session.baseline_scenario_id = baseline_scenario_id
    if analysis_mode is not None:
        session.analysis_mode = analysis_mode
    if last_result is not None:
        session.last_result = last_result
    if accumulated_params is not None:
        session.accumulated_params.update(accumulated_params)
    if waterfall_run is not None:
        run_id = str(waterfall_run.get("run_id") or "").strip()
        if run_id:
            session.waterfall_runs = [
                item for item in session.waterfall_runs
                if str(item.get("run_id")) != run_id
            ]
            session.waterfall_runs.append(waterfall_run)
            session.waterfall_runs = session.waterfall_runs[-20:]
    if last_fund_id is not None:
        session.last_fund_id = last_fund_id
    if last_asset_id is not None:
        session.last_asset_id = last_asset_id
    if last_quarter is not None:
        session.last_quarter = last_quarter

    session.updated_at = time.time()
    return session


def summarize_waterfall_run(
    *,
    result: dict[str, Any] | None,
    fund_id: str | None,
    fund_name: str | None = None,
    scenario_name: str | None = None,
    quarter: str | None = None,
    overrides: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    """Normalize a waterfall-like result into session memory shape."""
    if not result:
        return None

    run_id = result.get("run_id") or result.get("waterfall_run_id") or result.get("id")
    if not run_id:
        return None

    summary = result.get("summary") if isinstance(result.get("summary"), dict) else {}
    metrics = result.get("metrics") if isinstance(result.get("metrics"), dict) else {}
    scenario = result.get("scenario") if isinstance(result.get("scenario"), dict) else {}
    key_metrics = {
        "nav": summary.get("total_distributable") or summary.get("nav") or result.get("portfolio_nav"),
        "irr": summary.get("net_irr") or metrics.get("net_irr") or result.get("net_irr"),
        "tvpi": summary.get("net_tvpi") or metrics.get("net_tvpi") or result.get("net_tvpi"),
        "carry": summary.get("gp_carry") or result.get("carry_estimate") or result.get("gp_carry"),
    }
    return {
        "run_id": str(run_id),
        "fund_id": str(fund_id or result.get("fund_id") or ""),
        "fund_name": fund_name or result.get("fund_name"),
        "scenario_name": scenario_name or scenario.get("name") or result.get("scenario_name"),
        "quarter": quarter or result.get("quarter"),
        "key_metrics": key_metrics,
        "overrides": overrides or scenario.get("overrides") or result.get("overrides") or {},
        "created_at": result.get("created_at") or time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }


def clear_session(conversation_id: str | None) -> None:
    """Remove session state for a conversation."""
    if conversation_id:
        _sessions.pop(str(conversation_id), None)


def cleanup_expired() -> int:
    """Remove all expired sessions. Returns count of removed sessions."""
    now = time.time()
    expired = [k for k, v in _sessions.items() if now - v.updated_at > SESSION_TTL_SECONDS]
    for k in expired:
        del _sessions[k]
    return len(expired)
