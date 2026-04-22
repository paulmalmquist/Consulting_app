"""Pass 3 — episode-level synthesis.

Takes the full transcript plus the aggregated Pass 1/2 signals and asks
Claude for:
  - A 150-word executive summary
  - The dominant narrative of the episode
  - Agreements between speakers
  - Disagreements between speakers
  - What's novel vs what's crowded / recycled
  - The single most actionable positioning signal

Output is written to podcast_episodes.metadata.synthesis as a JSON blob so
we don't need a new migration for Phase 2. Phase 4 may promote this to a
first-class table.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from uuid import UUID

from app.db import get_cursor
from app.services.podcast_extraction import (
    EXTRACTION_MODEL_CLAUDE,
    LLMClient,
    _AnthropicClient,
)

logger = logging.getLogger(__name__)


_PASS3_SYSTEM = """You are the final synthesis step of a podcast intelligence pipeline.

You receive:
  1. The full episode transcript (truncated if long)
  2. A JSON blob of already-extracted signals: macro_views, trade_ideas,
     narratives, analogs from earlier pipeline passes

Return JSON with these keys (no prose outside the JSON):
  "executive_summary": str — 120-180 words, the episode's thesis in plain English
  "dominant_narrative": str — the single strongest narrative thread
  "agreements": array of str — where speakers converge, cite them by name
  "disagreements": array of str — where speakers differ, cite them by name
  "novel_insights": array of str — actually original framings or data points
  "crowded_takes": array of str — recycled or consensus talking points
  "single_most_actionable": {
      "thesis": str,
      "direction": one of ["long","short","neutral","spread","hedge","avoid"],
      "asset_or_ticker": str,
      "time_horizon": str,
      "conviction": one of ["high","medium","low"],
      "risk_to_thesis": str
  } — the one trade/position idea this episode best supports, or null if none
  "adversarial_red_flags": array of str — anything suggesting speaker is
      talking their book, pushing coordinated narrative, or recycling

Be specific. Cite speakers. Distinguish between what was SAID and what was SHOWN."""


@dataclass
class SynthesisResult:
    episode_id: UUID
    synthesis: dict = field(default_factory=dict)
    error: str | None = None


def _gather_signals(episode_id: UUID) -> dict:
    """Pull the episode's extracted signals for the synthesis prompt."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT mv.statement, mv.direction, mv.confidence_implied, mv.time_horizon,
                   mv.asset_classes, mv.tickers, s.name AS speaker
            FROM public.podcast_macro_views mv
            LEFT JOIN public.podcast_speakers s ON s.speaker_id = mv.speaker_id
            WHERE mv.episode_id = %s
            ORDER BY mv.confidence_implied DESC NULLS LAST
            LIMIT 40
            """,
            (episode_id,),
        )
        macro_views = cur.fetchall()

        cur.execute(
            """
            SELECT ti.description, ti.direction, ti.conviction, ti.crowding_tag,
                   ti.narrative_stage, ti.tickers, ti.asset_classes, s.name AS speaker
            FROM public.podcast_trade_ideas ti
            LEFT JOIN public.podcast_speakers s ON s.speaker_id = ti.speaker_id
            WHERE ti.episode_id = %s
            LIMIT 30
            """,
            (episode_id,),
        )
        trade_ideas = cur.fetchall()

        cur.execute(
            """
            SELECT narrative_label, narrative_type, conviction, novelty_score, sentiment
            FROM public.podcast_narratives
            WHERE episode_id = %s
            ORDER BY conviction DESC NULLS LAST, novelty_score DESC NULLS LAST
            LIMIT 25
            """,
            (episode_id,),
        )
        narratives = cur.fetchall()

        cur.execute(
            """
            SELECT an.referenced_period, an.rhyme_type, an.reasoning, s.name AS speaker
            FROM public.podcast_analogs an
            LEFT JOIN public.podcast_speakers s ON s.speaker_id = an.speaker_id
            WHERE an.episode_id = %s
            LIMIT 20
            """,
            (episode_id,),
        )
        analogs = cur.fetchall()

    def _serialize(rows: list) -> list:
        out = []
        for row in rows:
            out.append({
                k: (float(v) if hasattr(v, "__float__") and not isinstance(v, (bool, int)) else v)
                for k, v in row.items()
            })
        return out

    return {
        "macro_views": _serialize(macro_views),
        "trade_ideas": _serialize(trade_ideas),
        "narratives": _serialize(narratives),
        "analogs": _serialize(analogs),
    }


def synthesize_episode(
    episode_id: UUID,
    anthropic_client: LLMClient | None = None,
    transcript_max_chars: int = 35000,
) -> SynthesisResult:
    """Run Pass 3 synthesis and persist to podcast_episodes.metadata.synthesis."""
    result = SynthesisResult(episode_id=episode_id)
    anthropic_client = anthropic_client or _AnthropicClient()

    with get_cursor() as cur:
        cur.execute(
            "SELECT transcript_raw, title FROM public.podcast_episodes WHERE episode_id = %s",
            (episode_id,),
        )
        row = cur.fetchone()
    if not row:
        result.error = "episode not found"
        return result
    transcript = (row["transcript_raw"] or "")[:transcript_max_chars]
    if not transcript.strip():
        result.error = "empty transcript"
        return result

    signals = _gather_signals(episode_id)
    user_payload = (
        f"# Episode: {row['title']}\n\n"
        f"## Transcript (truncated to {transcript_max_chars} chars)\n\n"
        f"{transcript}\n\n"
        f"## Extracted Signals\n\n"
        f"```json\n{json.dumps(signals, default=str, indent=2)[:20000]}\n```\n"
    )

    try:
        data = anthropic_client.complete_json(
            system=_PASS3_SYSTEM, user=user_payload, model=EXTRACTION_MODEL_CLAUDE
        )
    except Exception as e:  # noqa: BLE001
        result.error = f"{type(e).__name__}: {e}"
        return result

    result.synthesis = data
    _persist_synthesis(episode_id, data)
    return result


def _persist_synthesis(episode_id: UUID, synthesis: dict) -> None:
    payload = {"synthesis": synthesis, "synthesis_model": EXTRACTION_MODEL_CLAUDE}
    with get_cursor() as cur:
        cur.execute(
            """
            UPDATE public.podcast_episodes
            SET metadata = COALESCE(metadata, '{}'::jsonb) || %s::jsonb,
                updated_at = now()
            WHERE episode_id = %s
            """,
            (json.dumps(payload), episode_id),
        )


__all__ = ["SynthesisResult", "synthesize_episode"]
