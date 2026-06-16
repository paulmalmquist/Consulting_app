"""Analytics Reels (plan PR 12) — deterministic story cards from persisted findings.

A "reel" is a higher-level rollup card (card_type='story') that summarizes a group of
already-persisted analyzer finding/alert cards into one narrative tile. It reads the cards
that the analyzers wrote (intelligence_cards), groups them deterministically by analyzer
type, and composes one story card per group — every reel traces to the real underlying
cards via source_ref.member_card_ids.

Deterministic-first, NO LLM: title/summary are built from counts and the highest-priority
member finding; severity/priority are derived from the members, never invented. Fail
closed: no finding cards -> zero reels + a recorded reason, never a fabricated story.

The story card's `summary` IS the cached hover trailer text (no hover-time call). Idempotent
by source_ref (sorted member ids + analyzer_type), so re-running updates a reel in place.
"""
from __future__ import annotations

import time
from uuid import UUID

from app.services import intelligence_cards

# Cards the analyzers produce that a reel rolls up (not other reels/dashboards).
_FINDING_CARD_TYPES = ("alert", "finding")
# How many member findings a reel may cite in its title math (display only; all are linked).
MAX_REELS_PER_RUN = 8


def _analyzer_of(card: dict) -> str:
    ref = card.get("source_ref") or {}
    return str(ref.get("analyzer_type") or "general")


def _label(analyzer_type: str) -> str:
    return {
        "telemetry": "Telemetry",
        "data_platform": "Data platform",
        "business": "Business",
    }.get(analyzer_type, analyzer_type.replace("_", " ").title() or "General")


def _compose_reel(analyzer_type: str, members: list[dict]) -> dict:
    """Build one story-card upsert dict from a group of finding cards. Pure function."""
    # Members arrive already sorted by the feed order (anomaly, priority, recency).
    top = members[0]
    anomalies = [m for m in members if m.get("anomaly_flag")]
    member_ids = sorted(str(m["id"]) for m in members)
    label = _label(analyzer_type)
    n = len(members)
    crit = len(anomalies)

    if crit:
        title = f"{label}: {crit} critical signal{'' if crit == 1 else 's'} across {n} finding{'' if n == 1 else 's'}"
    else:
        title = f"{label}: {n} open finding{'' if n == 1 else 's'} to review"

    # Summary doubles as the cached hover trailer — grounded in the top finding, no LLM.
    lead = (top.get("title") or "").strip()
    summary = (
        f"{n} {label.lower()} finding{'' if n == 1 else 's'} in the feed"
        + (f", {crit} flagged as anomalies" if crit else "")
        + (f". Leading signal: {lead}" if lead else ".")
    )

    # Priority = the group's strongest member (already in [0,1]); reels never out-rank a
    # live critical card. anomaly_flag only when a member is an anomaly.
    priority = round(max((m.get("priority_score") or 0.0) for m in members), 4)

    return {
        "card_type": "story",
        "title": title[:200],
        "summary": summary,
        "source_ref": {
            "type": "reel",
            "analyzer_type": analyzer_type,
            "member_card_ids": member_ids,
            "member_count": n,
            "anomaly_count": crit,
        },
        "priority_score": priority,
        "anomaly_flag": bool(anomalies),
        "created_by": "system:reels",
    }


def generate_reels(env_id: str, business_id: str | UUID) -> dict:
    """Roll up an env's finding/alert cards into story (reel) cards. Returns a summary.

    Reads only persisted cards (no analyzer run here — run the analyzers first). Fails
    closed: when there are no finding cards, writes nothing and records a reason.
    """
    started = time.monotonic()
    null_reasons: list[dict] = []

    # Pull current finding + alert cards (non-dismissed). Two reads keep the type filter
    # in the indexed query rather than filtering a mixed list in Python.
    findings: list[dict] = []
    for ct in _FINDING_CARD_TYPES:
        try:
            findings.extend(intelligence_cards.list_cards(env_id, business_id, card_type=ct, limit=100))
        except Exception:  # noqa: BLE001 — fail closed per source, never fabricate
            null_reasons.append({"source": f"list_cards:{ct}", "reason": f"list_{ct}_unavailable"})

    if not findings:
        null_reasons.append({"source": "reels", "reason": "no_finding_cards_to_roll_up"})
        return {"env_id": env_id, "reels_upserted": 0, "groups": 0,
                "null_reasons": null_reasons, "latency_ms": int((time.monotonic() - started) * 1000)}

    # Group deterministically by analyzer type, preserving the list_cards ordering within
    # each group (anomaly, priority, recency).
    groups: dict[str, list[dict]] = {}
    for card in findings:
        groups.setdefault(_analyzer_of(card), []).append(card)

    # Stable group order: most-anomalous then largest, then name — so MAX cap is deterministic.
    ordered = sorted(
        groups.items(),
        key=lambda kv: (-sum(1 for c in kv[1] if c.get("anomaly_flag")), -len(kv[1]), kv[0]),
    )[:MAX_REELS_PER_RUN]

    upserted = 0
    for analyzer_type, members in ordered:
        try:
            intelligence_cards.upsert_card(env_id, business_id, **_compose_reel(analyzer_type, members))
            upserted += 1
        except Exception:  # noqa: BLE001 — skip the one reel, keep going
            null_reasons.append({"source": f"reel:{analyzer_type}", "reason": "reel_upsert_failed"})

    return {
        "env_id": env_id,
        "reels_upserted": upserted,
        "groups": len(ordered),
        "null_reasons": null_reasons,
        "latency_ms": int((time.monotonic() - started) * 1000),
    }
