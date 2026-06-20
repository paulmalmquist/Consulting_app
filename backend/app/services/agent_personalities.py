"""Agent Personalities (plan PR 13) — deterministic role lenses over existing cards.

Four fixed role agents (CFO, Operations, Data Quality, Risk). Each is a DETERMINISTIC
filter over the intelligence cards the analyzers/reels already persisted: it selects the
cards relevant to its role (by the card's real source_ref signals + severity + anomaly
flag), and upserts ONE role-tagged rollup card that references the matched source cards.

NO LLM, NO model call anywhere in this module — agents are role lenses, not narrators. An
agent never invents a finding; it only reads existing cards and restates which ones matter
to its role. The single-call executive summary is a deliberately separate later PR (13b).

Honest + fail closed: an agent with no matching cards writes nothing and reports an empty
result with a reason (never a fabricated card). Idempotent: the rollup card's source_ref
carries the sorted matched card ids, so re-running an agent updates its card in place.
Env-scoped throughout (no cross-env reads).
"""
from __future__ import annotations

import time
from uuid import UUID

from app.services import intelligence_cards

# Agent type -> created_by tag on the cards it produces.
AGENT_TYPES = ("cfo", "operations", "data_quality", "risk")
_CREATED_BY = {a: f"agent:{a}" for a in AGENT_TYPES}
_LABEL = {"cfo": "CFO", "operations": "Operations", "data_quality": "Data Quality", "risk": "Risk"}


def _haystack(card: dict) -> str:
    """Lowercased blob of the card's real provenance signals, for substring matching.

    Pulls only fields the analyzers/reels actually emit into source_ref (source, field,
    signal_type, analyzer_type) plus the title — never invents a signal.
    """
    ref = card.get("source_ref") or {}
    parts = [str(ref.get(k, "")) for k in ("source", "field", "signal_type", "analyzer_type", "type")]
    parts.append(str(card.get("title") or ""))
    return " ".join(parts).lower()


# Deterministic per-role predicates over REAL card signals (see the analyzers' source_ref
# vocabulary: cash_balance/calls_per_day/overdue_count/today_count/success_rate; signal_type
# bottleneck/leading_indicator/risk; sources accounting/cost/pipeline/stream/dq_assertions/
# error_rate; severity + anomaly_flag).
_CFO_TERMS = ("cash", "margin", "forecast", "cost", "budget", "burn", "accounting",
              "calls_per_day", "leading_indicator")
_OPS_TERMS = ("throughput", "bottleneck", "utilization", "workflow", "overdue", "today_count",
              "board_summary", "pipeline", "stream", "telemetry", "anomaly_rate", "psi")
_DQ_TERMS = ("dq_assertion", "dq_assertions", "schema_drift", "schema drift", "stale", "feed_stale",
             "lineage", "missing_source", "stream_health", "pipeline_status", "success_rate", "error_rate")


def _is_cfo(card: dict) -> bool:
    return any(t in _haystack(card) for t in _CFO_TERMS)


def _is_ops(card: dict) -> bool:
    return any(t in _haystack(card) for t in _OPS_TERMS)


def _is_dq(card: dict) -> bool:
    return any(t in _haystack(card) for t in _DQ_TERMS)


def _is_risk(card: dict) -> bool:
    # Risk is severity/anomaly driven, not vocabulary driven: an alert card, an anomaly
    # flag, or a 'risk' signal_type. (card_type 'alert' == critical severity from to_intel_card.)
    ref = card.get("source_ref") or {}
    return bool(
        card.get("anomaly_flag")
        or card.get("card_type") == "alert"
        or str(ref.get("signal_type")) == "risk"
        or any(t in _haystack(card) for t in ("exposure", "audit", "worsening"))
    )


_PREDICATES = {"cfo": _is_cfo, "operations": _is_ops, "data_quality": _is_dq, "risk": _is_risk}

# Cards an agent rolls up — the findings/alerts/reels, never another agent's card (avoids
# agents rolling up each other and never converging).
_SOURCE_CARD_TYPES = ("alert", "finding", "story")


def list_agents() -> list[dict]:
    """The fixed agent registry (code-defined; no table). Static metadata only."""
    return [{"agent_type": a, "label": _LABEL[a], "created_by": _CREATED_BY[a]} for a in AGENT_TYPES]


def _source_cards(env_id: str, business_id: str | UUID) -> list[dict]:
    """All non-dismissed finding/alert/reel cards for the env — the agent's input pool.

    Excludes agent-authored cards so agents never roll up each other.
    """
    cards: list[dict] = []
    for ct in _SOURCE_CARD_TYPES:
        cards.extend(intelligence_cards.list_cards(env_id, business_id, card_type=ct, limit=100))
    return [c for c in cards if not str(c.get("created_by") or "").startswith("agent:")]


def _compose_agent_card(agent_type: str, matched: list[dict]) -> dict:
    """Build the role-tagged rollup card. Pure function — counts + the top matched card."""
    label = _LABEL[agent_type]
    ids = sorted(str(m["id"]) for m in matched)
    anomalies = [m for m in matched if m.get("anomaly_flag")]
    top = matched[0]  # list_cards order: anomaly, priority, recency
    n = len(matched)
    crit = len(anomalies)
    lead = (top.get("title") or "").strip()

    title = f"{label}: {n} relevant signal{'' if n == 1 else 's'}"
    if crit:
        title += f" ({crit} critical)"
    summary = (
        f"{n} card{'' if n == 1 else 's'} match the {label} lens"
        + (f", {crit} flagged as anomalies" if crit else "")
        + (f". Top: {lead}" if lead else ".")
    )
    priority = round(max((m.get("priority_score") or 0.0) for m in matched), 4)
    return {
        "card_type": "alert" if anomalies else "finding",
        "title": title[:200],
        "summary": summary,
        "source_ref": {
            "type": "agent_rollup",
            "agent_type": agent_type,
            "member_card_ids": ids,
            "member_count": n,
            "anomaly_count": crit,
        },
        "priority_score": priority,
        "anomaly_flag": bool(anomalies),
        "created_by": _CREATED_BY[agent_type],
    }


def run_agent(agent_type: str, env_id: str, business_id: str | UUID) -> dict:
    """Run one role agent: filter existing cards, upsert a role-tagged rollup. No LLM.

    Fail closed: unknown agent -> error dict; no matches -> empty result + reason; an
    upsert failure is reported, not raised.
    """
    started = time.monotonic()
    if agent_type not in AGENT_TYPES:
        return {"agent_type": agent_type, "matched": 0, "card_id": None,
                "null_reason": "unknown_agent_type", "latency_ms": 0}

    biz = business_id if isinstance(business_id, UUID) else UUID(str(business_id))
    pool = _source_cards(env_id, biz)
    matched = [c for c in pool if _PREDICATES[agent_type](c)]

    if not matched:
        return {"agent_type": agent_type, "matched": 0, "card_id": None,
                "null_reason": "no_cards_match_role" if pool else "no_source_cards",
                "latency_ms": int((time.monotonic() - started) * 1000)}

    card_id = None
    null_reason = None
    try:
        card = intelligence_cards.upsert_card(env_id, biz, **_compose_agent_card(agent_type, matched))
        card_id = card.get("id")
    except Exception:  # noqa: BLE001 — report, never raise; nothing fabricated
        null_reason = "agent_card_upsert_failed"

    return {
        "agent_type": agent_type,
        "matched": len(matched),
        "card_id": card_id,
        "null_reason": null_reason,
        "latency_ms": int((time.monotonic() - started) * 1000),
    }


def run_all(env_id: str, business_id: str | UUID) -> dict:
    """Run every agent over the env's cards. Deterministic, no LLM."""
    results = [run_agent(a, env_id, business_id) for a in AGENT_TYPES]
    return {"results": results, "cards_upserted": sum(1 for r in results if r.get("card_id"))}
