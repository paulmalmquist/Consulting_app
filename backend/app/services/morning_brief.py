"""Executive Autopilot — deterministic morning brief (plan PR 16a). NO LLM.

Composes a structured MorningBrief from the intelligence cards already in the feed
(analyzer findings, alerts, reels, agent rollups) plus optional cited memory context, and
persists it as ONE story card per (env, brief_date). Deterministic: every claim traces to a
real card field, a memory citation, or a recorded null_reason — no fabricated numbers, no
invented actions, no model call. This is the safe base layer; an optional single-call LLM
narration is a separate later PR (16b).
"""
from __future__ import annotations

import datetime
from uuid import UUID

from app.observability.logger import emit_log

# A non-anomaly card must clear this priority to be "worth watching" (the analyzer_contract
# informational cutoff). Below it, a finding is noise for the brief.
WATCH_THRESHOLD = 0.5
# Cards that can carry a watch item (high-priority, non-anomaly forward signal).
_WATCH_TYPES = ("finding", "forecast", "story")
# The pool the brief reads (never re-runs an analyzer; derives from persisted cards).
_SOURCE_CARD_TYPES = ("alert", "finding", "story", "forecast")

BRIEF_TYPE = "morning_brief"


def _today() -> str:
    return datetime.date.today().isoformat()


def _read_pool(env_id: str, business_id: str | UUID, null_reasons: list[dict]) -> list[dict]:
    from app.services import intelligence_cards
    cards: list[dict] = []
    for ct in _SOURCE_CARD_TYPES:
        try:
            cards.extend(intelligence_cards.list_cards(env_id, business_id, card_type=ct, limit=100))
        except Exception:  # noqa: BLE001 — fail closed per source, never fabricate
            null_reasons.append({"source": f"list_cards:{ct}", "reason": f"list_{ct}_unavailable"})
    # Exclude any prior brief card so the brief never cites itself.
    return [c for c in cards if (c.get("source_ref") or {}).get("type") != BRIEF_TYPE]


def _actions_from(card: dict) -> list[str]:
    # Read defensively: today to_intel_card DROPS finding.recommendations, so persisted cards
    # carry none. If a future producer writes them into source_ref, this surfaces them with
    # zero code change. We NEVER mint an action from a title or a model.
    ref = card.get("source_ref") or {}
    val = ref.get("recommendations") or ref.get("actions") or []
    return [str(a) for a in val if a]


def _compose_brief(env_id: str, brief_date: str, pool: list[dict],
                   memory: dict, null_reasons: list[dict]) -> dict:
    """Pure assembly from real card fields. No I/O, no clock, no fabrication."""
    cited: set[str] = set()

    # what_changed = anomaly/alert cards (alert == critical severity).
    changed = [c for c in pool if c.get("anomaly_flag") or c.get("card_type") == "alert"]
    what_changed = [
        {"card_id": c["id"], "title": c["title"], "priority_score": c.get("priority_score"),
         "anomaly_flag": bool(c.get("anomaly_flag"))}
        for c in changed
    ]
    # why_it_matters = those cards' STORED summary (verbatim), or their title if summary is null.
    why_it_matters = [
        {"card_id": c["id"], "reason": (c.get("summary") or c["title"])}
        for c in changed
    ]
    for c in changed:
        cited.add(c["id"])
    if not changed:
        null_reasons.append({"source": "what_changed", "reason": "no_anomaly_or_alert_cards"})

    # what_to_watch = high-priority NON-anomaly forward signals.
    watch = [
        c for c in pool
        if c.get("card_type") in _WATCH_TYPES
        and not c.get("anomaly_flag")
        and (c.get("priority_score") or 0.0) >= WATCH_THRESHOLD
    ]
    what_to_watch = [
        {"card_id": c["id"], "title": c["title"], "priority_score": c.get("priority_score")}
        for c in watch
    ]
    for c in watch:
        cited.add(c["id"])
    if not watch:
        null_reasons.append({"source": "what_to_watch", "reason": "no_high_priority_watch_items"})

    # recommended_actions = ONLY actions a card actually carries (none today; forward-compat).
    actions: list[str] = []
    for c in pool:
        a = _actions_from(c)
        if a:
            actions.extend(a)
            cited.add(c["id"])
    if not actions:
        null_reasons.append({"source": "recommended_actions", "reason": "no_card_carries_actions"})

    # confidence = derived categorical label + raw counts (never an invented percentage).
    if changed:
        confidence = "high"
    elif watch:
        confidence = "medium"
    elif pool:
        confidence = "low"
    else:
        confidence = "none"
        null_reasons.append({"source": "brief", "reason": "no_cards_in_feed"})

    return {
        "type": BRIEF_TYPE,
        "env_id": env_id,
        "brief_date": brief_date,
        "source_window": "current intelligence feed (anomaly + priority + recency order)",
        "what_changed": what_changed,
        "why_it_matters": why_it_matters,
        "what_to_watch": what_to_watch,
        "recommended_actions": actions,
        "cited_card_ids": sorted(cited),
        "memory": memory,
        "confidence": confidence,
        "counts": {"anomaly_count": len(changed), "watch_count": len(watch),
                   "cards_scanned": len(pool)},
        "null_reasons": null_reasons,
    }


def _digest(brief: dict) -> str:
    """A short human summary stored on the card. Built from counts + the lead signal only."""
    n, m = brief["counts"]["anomaly_count"], brief["counts"]["watch_count"]
    lead = brief["what_changed"][0]["title"] if brief["what_changed"] else None
    parts = [f"{n} signal{'' if n == 1 else 's'} changed", f"{m} to watch"]
    base = "Morning brief: " + ", ".join(parts) + "."
    return base + (f" Lead: {lead}" if lead else "")


def _memory_context(env_id: str, business_id: str | UUID, lead_title: str | None) -> dict:
    """Optional cited prior context. Citations only, never an answer; never blocks the brief."""
    if not lead_title:
        return {"items": [], "null_reason": "no_query_seed"}
    try:
        from app.services import enterprise_memory
        res = enterprise_memory.search(env_id, business_id, lead_title, top_k=3)
        return {"items": res.get("items", []), "null_reason": res.get("null_reason")}
    except Exception as exc:  # noqa: BLE001 — memory is optional; the brief proceeds from cards
        emit_log(level="warning", service="morning_brief", action="memory_unavailable",
                 message=str(exc), error=exc)
        return {"items": [], "null_reason": "memory_unavailable"}


def generate(env_id: str, business_id: str | UUID, *, brief_date: str | None = None) -> dict:
    """Generate (or refresh) today's morning brief story card for an env. Idempotent per
    (env, brief_date). Deterministic, NO LLM, fail-closed."""
    from app.services import intelligence_cards
    date = brief_date or _today()
    null_reasons: list[dict] = []
    pool = _read_pool(env_id, business_id, null_reasons)

    # Optional memory context seeded from the lead anomaly title (citations only).
    lead_title = None
    for c in pool:
        if c.get("anomaly_flag") or c.get("card_type") == "alert":
            lead_title = c["title"]
            break
    memory = _memory_context(env_id, business_id, lead_title)

    brief = _compose_brief(env_id, date, pool, memory, null_reasons)
    priority = round(max((c.get("priority_score") or 0.0) for c in pool), 4) if pool else 0.0
    anomaly = any(c.get("anomaly_flag") for c in pool)

    # Optional single-call LLM narration (PR 16b). Off by default → deterministic digest used,
    # zero model calls. The wrapper validates the narration adds no uncited facts and falls
    # back to the digest otherwise; it never raises into this path.
    digest = _digest(brief)
    from app.services import morning_brief_summary
    summary_result = morning_brief_summary.summarize_brief(
        brief, env_id=env_id, business_id=business_id, deterministic_digest=digest)
    brief["summary"] = {"used_llm": summary_result["used_llm"], "model": summary_result["model"],
                        "null_reason": summary_result["null_reason"]}
    card_summary = summary_result["summary_text"]

    card_id = None
    try:
        card = intelligence_cards.upsert_card(
            env_id, business_id,
            card_type="story",
            title=f"Morning brief — {date}: {brief['counts']['anomaly_count']} signal(s), "
                  f"{brief['counts']['watch_count']} to watch",
            summary=card_summary,
            source_ref=brief,
            dedup_ref={"type": BRIEF_TYPE, "env_id": env_id, "brief_date": date},
            priority_score=priority,
            anomaly_flag=anomaly,
            created_by="autopilot",
        )
        card_id = card.get("id")
    except Exception as exc:  # noqa: BLE001 — never 500 with fabricated content
        emit_log(level="error", service="morning_brief", action="upsert_failed",
                 message=str(exc), error=exc)
        return {"brief": brief, "card_id": None, "null_reason": "morning_brief_unavailable"}

    return {"brief": brief, "card_id": card_id, "null_reason": None}


def get_brief(env_id: str, business_id: str | UUID, *, brief_date: str | None = None) -> dict:
    """Return today's (or a given date's) brief story card, or an honest null."""
    from app.services import intelligence_cards
    date = brief_date or _today()
    try:
        cards = intelligence_cards.list_cards(env_id, business_id, card_type="story", limit=100)
    except Exception as exc:  # noqa: BLE001
        emit_log(level="error", service="morning_brief", action="get_failed",
                 message=str(exc), error=exc)
        return {"brief": None, "null_reason": "morning_brief_unavailable"}
    for c in cards:
        ref = c.get("source_ref") or {}
        if ref.get("type") == BRIEF_TYPE and ref.get("brief_date") == date:
            return {"brief": ref, "card_id": c["id"], "null_reason": None}
    return {"brief": None, "card_id": None, "null_reason": "no_brief_for_date"}
