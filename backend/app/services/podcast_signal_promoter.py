"""Promote high-quality podcast signals into the trading_signals table.

Meta-prompt Step 4.2. Creates rows in public.trading_signals with:
  - source='podcast' (added to the CHECK constraint in migration 521)
  - evidence jsonb carrying full provenance (episode_id, speaker, statement,
    extraction_model, podcast_source_kind + podcast_source_id)
  - category/direction/strength mapped from the podcast signal fields

Promotion criteria (from the meta-prompt):
  (a) Macro view with confidence_implied >= 70
  (b) Trade idea with conviction='high' AND crowding_tag != 'crowded'
  (c) Narrative with crowding_risk in ('elevated','high','extreme')

Speaker credibility multiplication (confidence * credibility / 100) is
implemented, but since speaker credibility defaults to 50 until Phase 5
track-record scoring lands, we floor the multiplier at 0.7 to avoid
over-dampening solid conviction signals from unscored speakers.

Idempotency: each promotion writes a stable evidence.source_id; re-runs
skip already-promoted rows via an existence check.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from uuid import UUID

from app.db import get_cursor

logger = logging.getLogger(__name__)

MIN_CREDIBILITY_MULTIPLIER = 0.7  # floor to avoid over-dampening unscored speakers
MACRO_CONF_GATE = 70
NARRATIVE_CROWDING_GATE = {"elevated", "high", "extreme"}


_DIRECTION_MAP_MACRO = {
    "bullish": "bullish", "bearish": "bearish", "neutral": "neutral", "mixed": "neutral",
}
_DIRECTION_MAP_TRADE = {
    "long": "bullish", "short": "bearish", "neutral": "neutral",
    "spread": "neutral", "hedge": "bearish",
}
_CATEGORY_MAP = {
    "macro": "macro", "sector": "sector", "asset_class": "macro",
    "geopolitical": "macro", "policy": "macro",
}


@dataclass
class PromotionReport:
    macro_views_promoted: int = 0
    trade_ideas_promoted: int = 0
    narratives_promoted: int = 0
    skipped_existing: int = 0
    skipped_below_gate: int = 0
    signal_ids: list[UUID] = field(default_factory=list)


def _already_promoted(source_kind: str, source_id: UUID) -> bool:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT 1 FROM public.trading_signals
            WHERE evidence->>'podcast_source_kind' = %s
              AND evidence->>'podcast_source_id' = %s
            LIMIT 1
            """,
            (source_kind, str(source_id)),
        )
        return cur.fetchone() is not None


def _insert_signal(
    *,
    tenant_id: UUID | None,
    name: str,
    description: str | None,
    category: str,
    direction: str,
    strength: float,
    asset_class: str | None,
    tickers: list[str],
    evidence: dict,
) -> UUID:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO public.trading_signals (
                tenant_id, name, description, category, direction, strength,
                source, asset_class, tickers, evidence, status
            ) VALUES (%s, %s, %s, %s, %s, %s, 'podcast', %s, %s, %s, 'active')
            RETURNING signal_id
            """,
            (
                tenant_id, name[:200], description, category, direction,
                max(0.0, min(100.0, round(strength, 2))),
                asset_class, tickers or [], json.dumps(evidence),
            ),
        )
        return cur.fetchone()["signal_id"]


def _credibility_multiplier(credibility: float | None) -> float:
    if credibility is None:
        credibility = 50.0
    return max(MIN_CREDIBILITY_MULTIPLIER, float(credibility) / 100.0)


def promote_macro_views(episode_id: UUID | None = None) -> int:
    """(a) confidence_implied >= 70 → promote with strength = conf * credibility."""
    where_episode = "AND mv.episode_id = %s" if episode_id else ""
    params: list = [MACRO_CONF_GATE]
    if episode_id:
        params.append(episode_id)

    with get_cursor() as cur:
        cur.execute(
            f"""
            SELECT mv.view_id, mv.tenant_id, mv.statement, mv.direction, mv.view_type,
                   mv.confidence_implied, mv.time_horizon, mv.asset_classes, mv.tickers,
                   mv.reasoning, mv.extraction_model, mv.episode_id, mv.speaker_id,
                   s.name AS speaker_name, s.credibility_score,
                   e.title AS episode_title
            FROM public.podcast_macro_views mv
            LEFT JOIN public.podcast_speakers s ON s.speaker_id = mv.speaker_id
            LEFT JOIN public.podcast_episodes e ON e.episode_id = mv.episode_id
            WHERE mv.confidence_implied >= %s
              {where_episode}
            """,
            params,
        )
        rows = cur.fetchall()

    promoted = 0
    for r in rows:
        if _already_promoted("macro_view", r["view_id"]):
            continue
        direction = _DIRECTION_MAP_MACRO.get(r["direction"], "neutral")
        category = _CATEGORY_MAP.get(r["view_type"], "macro")
        mult = _credibility_multiplier(r["credibility_score"])
        strength = float(r["confidence_implied"]) * mult
        evidence = {
            "origin": "podcast",
            "podcast_source_kind": "macro_view",
            "podcast_source_id": str(r["view_id"]),
            "episode_id": str(r["episode_id"]),
            "episode_title": r["episode_title"],
            "speaker_id": str(r["speaker_id"]) if r["speaker_id"] else None,
            "speaker_name": r["speaker_name"],
            "statement": r["statement"],
            "reasoning": r["reasoning"],
            "time_horizon": r["time_horizon"],
            "extraction_model": r["extraction_model"],
            "confidence_implied": float(r["confidence_implied"]),
            "speaker_credibility": float(r["credibility_score"] or 50),
        }
        name = f"Podcast macro view: {r['statement'][:120]}"
        asset_class = r["asset_classes"][0] if r["asset_classes"] else None
        _insert_signal(
            tenant_id=r["tenant_id"],
            name=name,
            description=r["reasoning"] or r["statement"],
            category=category,
            direction=direction,
            strength=strength,
            asset_class=asset_class,
            tickers=r["tickers"] or [],
            evidence=evidence,
        )
        promoted += 1
    return promoted


def promote_trade_ideas(episode_id: UUID | None = None) -> int:
    """(b) conviction='high' AND crowding_tag != 'crowded' → promote with strength=80."""
    where_episode = "AND ti.episode_id = %s" if episode_id else ""
    params: list = []
    if episode_id:
        params.append(episode_id)

    with get_cursor() as cur:
        cur.execute(
            f"""
            SELECT ti.idea_id, ti.tenant_id, ti.description, ti.direction, ti.idea_type,
                   ti.asset_classes, ti.tickers, ti.conviction, ti.crowding_tag,
                   ti.narrative_stage, ti.extraction_model,
                   ti.episode_id, ti.speaker_id,
                   s.name AS speaker_name, s.credibility_score,
                   e.title AS episode_title
            FROM public.podcast_trade_ideas ti
            LEFT JOIN public.podcast_speakers s ON s.speaker_id = ti.speaker_id
            LEFT JOIN public.podcast_episodes e ON e.episode_id = ti.episode_id
            WHERE ti.conviction = 'high'
              AND (ti.crowding_tag IS NULL OR ti.crowding_tag != 'crowded')
              {where_episode}
            """,
            params,
        )
        rows = cur.fetchall()

    promoted = 0
    for r in rows:
        if _already_promoted("trade_idea", r["idea_id"]):
            continue
        direction = _DIRECTION_MAP_TRADE.get(r["direction"], "neutral")
        mult = _credibility_multiplier(r["credibility_score"])
        strength = 80.0 * mult  # high-conviction baseline, dampened by credibility
        evidence = {
            "origin": "podcast",
            "podcast_source_kind": "trade_idea",
            "podcast_source_id": str(r["idea_id"]),
            "episode_id": str(r["episode_id"]),
            "episode_title": r["episode_title"],
            "speaker_id": str(r["speaker_id"]) if r["speaker_id"] else None,
            "speaker_name": r["speaker_name"],
            "description": r["description"],
            "idea_type": r["idea_type"],
            "conviction": r["conviction"],
            "crowding_tag": r["crowding_tag"],
            "narrative_stage": r["narrative_stage"],
            "extraction_model": r["extraction_model"],
            "speaker_credibility": float(r["credibility_score"] or 50),
        }
        asset_class = r["asset_classes"][0] if r["asset_classes"] else None
        _insert_signal(
            tenant_id=r["tenant_id"],
            name=f"Podcast trade idea: {r['description'][:120]}",
            description=r["description"],
            category="macro",
            direction=direction,
            strength=strength,
            asset_class=asset_class,
            tickers=r["tickers"] or [],
            evidence=evidence,
        )
        promoted += 1
    return promoted


def promote_crowding_warnings() -> int:
    """(c) Narratives with crowding_risk elevated+ → promote as warning signals."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT velocity_id, tenant_id, narrative_label, mention_count,
                   unique_speakers, conviction_avg, crowding_risk, metadata
            FROM public.podcast_narrative_velocity
            WHERE crowding_risk = ANY(%s)
            """,
            (list(NARRATIVE_CROWDING_GATE),),
        )
        rows = cur.fetchall()

    promoted = 0
    for r in rows:
        if _already_promoted("narrative_velocity", r["velocity_id"]):
            continue
        # Higher crowding_risk → stronger warning (inverse proxy for "this is the
        # consensus trap signal"). 'elevated' → 70, 'high' → 85, 'extreme' → 95.
        strength = {"elevated": 70.0, "high": 85.0, "extreme": 95.0}.get(r["crowding_risk"], 50.0)
        meta = r.get("metadata") or {}
        evidence = {
            "origin": "podcast",
            "podcast_source_kind": "narrative_velocity",
            "podcast_source_id": str(r["velocity_id"]),
            "narrative_label": r["narrative_label"],
            "mention_count": int(r["mention_count"]),
            "unique_speakers": int(r["unique_speakers"]),
            "conviction_avg": float(r["conviction_avg"] or 0),
            "crowding_risk": r["crowding_risk"],
            "cluster_members": meta.get("cluster_members") or [],
            "episode_ids": meta.get("episode_ids") or [],
        }
        _insert_signal(
            tenant_id=r["tenant_id"],
            name=f"Crowded narrative warning: {r['narrative_label'][:120]}",
            description=(
                f"{r['mention_count']} mentions across {len(meta.get('episode_ids') or [])} "
                f"episodes, {r['unique_speakers']} unique speakers, conviction "
                f"{float(r['conviction_avg'] or 0):.0f}, crowding={r['crowding_risk']}. "
                f"Consensus-trap warning — fade or hedge."
            ),
            category="sentiment",
            direction="neutral",  # crowding is a meta-signal, not directional
            strength=strength,
            asset_class=None,
            tickers=[],
            evidence=evidence,
        )
        promoted += 1
    return promoted


def promote_all(episode_id: UUID | None = None) -> PromotionReport:
    report = PromotionReport()
    report.macro_views_promoted = promote_macro_views(episode_id)
    report.trade_ideas_promoted = promote_trade_ideas(episode_id)
    report.narratives_promoted = promote_crowding_warnings()
    logger.info(
        "podcast promotion: macro=%d trade=%d narrative=%d",
        report.macro_views_promoted, report.trade_ideas_promoted, report.narratives_promoted,
    )
    return report


__all__ = [
    "MACRO_CONF_GATE",
    "MIN_CREDIBILITY_MULTIPLIER",
    "NARRATIVE_CROWDING_GATE",
    "PromotionReport",
    "promote_all",
    "promote_crowding_warnings",
    "promote_macro_views",
    "promote_trade_ideas",
]
