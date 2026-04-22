"""Extraction pipeline for podcast episodes — Phase 1 implementation.

Four-pass architecture:
    Pass 1 — GPT-4o (structured): macro_views, trade_ideas, speakers, tickers
    Pass 2 — Claude (nuanced):   narratives, analogs, uncertainty_markers
    Pass 3 — Claude (synthesis):  episode-level summary    [Phase 2+]
    Pass 4 — Claude (adversarial): authenticity / originality / manipulation

This module defines the orchestrator + DB writers. LLM calls are behind a
thin client interface so tests can inject fakes without network access.

Every signal writer routes the speaker surface form through
``SpeakerResolver`` so K1/K3 signal loss from Phase 0 does not recur.

Phase 2 will: (a) retune prompts for yield (K2, K8), (b) add prompt
versioning, (c) implement Pass 3, (d) add narrative label normalization
via pgvector similarity.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from typing import Any, Protocol
from uuid import UUID

from app.db import get_cursor
from app.services.podcast_chunker import PodcastChunk, chunk_transcript
from app.services.podcast_speaker_resolver import SpeakerResolver

logger = logging.getLogger(__name__)

EXTRACTION_MODEL_GPT4O = "gpt-4o"
EXTRACTION_MODEL_CLAUDE = "claude-sonnet-4-5"


# Schema enum sets — mirror repo-b/db/schema/425_podcast_intelligence.sql CHECKs.
# LLMs occasionally return values outside these sets; we clamp to a safe default
# rather than losing the whole row to a constraint violation.
_VIEW_TYPES = {"macro", "sector", "asset_class", "geopolitical", "policy"}
_DIRECTIONS_MACRO = {"bullish", "bearish", "neutral", "mixed"}
_TIME_HORIZONS = {"immediate", "1-4_weeks", "1-3_months", "3-12_months", "1y_plus", "structural"}
_IDEA_TYPES = {"explicit_trade", "implied_position", "risk_reward", "hedging", "portfolio_construction"}
_DIRECTIONS_TRADE = {"long", "short", "neutral", "spread", "hedge"}
_CONVICTION = {"high", "medium", "low"}
_CROWDING = {"crowded", "contrarian", "consensus", "early", "late", "unknown"}
_NARRATIVE_STAGE = {"early", "emerging", "mainstream", "crowded", "fading"}
_NARRATIVE_TYPE = {"emerging", "reinforcing", "shifting", "fading", "contrarian"}
_SENTIMENT = {"positive", "negative", "neutral", "mixed"}
_RHYME_TYPE = {"structural", "cyclical", "behavioral", "policy", "technical"}
_MARKER_TYPE = {"hedge", "qualifier", "conditional", "strong_conviction", "admission_of_uncertainty"}


def _clamp(value, allowed: set[str], default: str | None) -> str | None:
    """Return value if in allowed set, else default. Handles None + case/whitespace."""
    if value is None:
        return default
    v = str(value).strip().lower().replace(" ", "_")
    if v in allowed:
        return v
    # Common alternative spellings / synonyms the LLM emits
    synonyms = {
        "equities": "asset_class", "rates": "asset_class", "commodities": "asset_class",
        "fx": "asset_class", "currencies": "asset_class", "credit": "asset_class",
        "mid-term": "1-3_months", "short-term": "1-4_weeks", "long-term": "1y_plus",
        "short_term": "1-4_weeks", "long_term": "1y_plus", "medium_term": "3-12_months",
        "6-12_months": "3-12_months", "12_months": "3-12_months",
        "buy": "long", "sell": "short",
    }
    mapped = synonyms.get(v)
    if mapped in allowed:
        return mapped
    return default


def _clamp_int(value, lo: int = 0, hi: int = 100, default: int = 50) -> int:
    try:
        n = int(float(value))
    except (TypeError, ValueError):
        return default
    return max(lo, min(hi, n))


# ── LLM client interface (injectable for tests) ───────────────────────────────


class LLMClient(Protocol):
    def complete_json(self, *, system: str, user: str, model: str) -> dict: ...


class _OpenAIClient:
    def __init__(self):
        from app.services.ai_client import get_instrumented_sync_client

        self._client = get_instrumented_sync_client()

    def complete_json(self, *, system: str, user: str, model: str) -> dict:
        resp = self._client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            response_format={"type": "json_object"},
        )
        content = resp.choices[0].message.content or "{}"
        return json.loads(content)


class _AnthropicClient:
    def __init__(self):
        from app.services.winston_managed_agent import build_anthropic_client

        self._client = build_anthropic_client()

    def complete_json(self, *, system: str, user: str, model: str) -> dict:
        # Claude doesn't have a JSON mode — we prompt for JSON and parse.
        resp = self._client.messages.create(
            model=model,
            max_tokens=4096,
            system=system,
            messages=[{"role": "user", "content": user}],
        )
        text = "".join(
            block.text for block in resp.content if getattr(block, "type", None) == "text"
        )
        # Claude sometimes wraps JSON in prose — extract the first {...} block.
        start = text.find("{")
        end = text.rfind("}")
        if start == -1 or end == -1:
            raise ValueError(f"No JSON object found in Claude response: {text[:200]}")
        return json.loads(text[start : end + 1])


# ── Prompts (v1 — Phase 2 will version and tune) ──────────────────────────────

_PASS1_SYSTEM = """You are extracting structured trading signals from a podcast transcript chunk.

Return JSON with these keys:
  "speakers": array of {"name": str, "role": str|null, "is_host": bool}
  "macro_views": array of {
      "speaker_name": str,
      "view_type": one of ["macro","sector","asset_class","geopolitical","policy"],
      "statement": str,
      "direction": one of ["bullish","bearish","neutral","mixed"],
      "confidence_implied": int 0-100,
      "time_horizon": one of ["immediate","1-4_weeks","1-3_months","3-12_months","1y_plus","structural"] or null,
      "asset_classes": array of str,
      "tickers": array of str,
      "reasoning": str|null
  }
  "trade_ideas": array of {
      "speaker_name": str,
      "idea_type": one of ["explicit_trade","implied_position","risk_reward","hedging","portfolio_construction"],
      "description": str,
      "direction": one of ["long","short","neutral","spread","hedge"] or null,
      "asset_classes": array of str,
      "tickers": array of str,
      "conviction": one of ["high","medium","low"] or null,
      "crowding_tag": one of ["crowded","contrarian","consensus","early","late","unknown"] or null,
      "narrative_stage": one of ["early","emerging","mainstream","crowded","fading"] or null
  }

Extract views even when framed as questions or embedded in longer reasoning chains.
"I think rates stay higher for longer" is a macro view. "Isn't the real question whether rates stay higher?" is ALSO a macro view.
For implied positioning: phrases like "I like the risk/reward in X", "That's where the opportunity is", "I wouldn't touch that" are trade_ideas.

Return ONLY valid JSON. No prose."""


_PASS2_SYSTEM = """You are extracting nuanced signals from a podcast transcript chunk.

Return JSON with these keys:
  "narratives": array of {
      "narrative_label": str (short canonical phrase),
      "narrative_type": one of ["emerging","reinforcing","shifting","fading","contrarian"],
      "sentiment": one of ["positive","negative","neutral","mixed"],
      "conviction": int 0-100,
      "novelty_score": int 0-100,
      "supporting_quotes": array of str (verbatim short quotes)
  }
  "analogs": array of {
      "speaker_name": str,
      "referenced_period": str (e.g. "2008 GFC", "1970s stagflation", "dot-com bust"),
      "referenced_year": int or null,
      "reasoning": str,
      "missing_differences": str|null (what's different from the analog),
      "asset_classes": array of str,
      "confidence_implied": int 0-100,
      "rhyme_type": one of ["structural","cyclical","behavioral","policy","technical"]
  }
  "uncertainty_markers": array of {
      "speaker_name": str,
      "marker_type": one of ["hedge","qualifier","conditional","strong_conviction","admission_of_uncertainty"],
      "raw_text": str (the hedging phrase, verbatim),
      "inferred_confidence": int 0-100,
      "context_statement": str|null (what was being hedged)
  }

Return ONLY valid JSON. No prose."""


_PASS4_SYSTEM = """You are scoring the adversarial quality of a podcast episode.

You will receive the full transcript. Return JSON:
  "authenticity_score": int 0-100 (genuine analysis vs marketing a book)
  "originality_score": int 0-100 (novel insight vs recycled talking points)
  "manipulation_risk": int 0-100 (likelihood speaker is talking their book)
  "recycled_talking_points": int (count of cliche phrases detected)
  "analysis_notes": str (2-3 sentence justification)

Return ONLY valid JSON."""


# ── Extraction result containers ──────────────────────────────────────────────


@dataclass
class ExtractionResult:
    episode_id: UUID
    tenant_id: UUID | None
    macro_views_written: int = 0
    trade_ideas_written: int = 0
    narratives_written: int = 0
    analogs_written: int = 0
    uncertainty_markers_written: int = 0
    speakers_written: int = 0
    adversarial_score_written: bool = False
    errors: list[str] = field(default_factory=list)


# ── DB writers ────────────────────────────────────────────────────────────────


def _write_macro_view(
    tenant_id: UUID | None,
    episode_id: UUID,
    speaker_id: UUID,
    view: dict,
    chunk_index: int,
    extraction_model: str,
) -> None:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO public.podcast_macro_views (
                tenant_id, episode_id, speaker_id,
                view_type, statement, direction, confidence_implied, time_horizon,
                asset_classes, tickers, reasoning, chunk_index, extraction_model
            ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            """,
            (
                tenant_id, episode_id, speaker_id,
                _clamp(view.get("view_type"), _VIEW_TYPES, "macro"),
                view.get("statement") or "",
                _clamp(view.get("direction"), _DIRECTIONS_MACRO, "neutral"),
                _clamp_int(view.get("confidence_implied")),
                _clamp(view.get("time_horizon"), _TIME_HORIZONS, None),
                view.get("asset_classes") or [],
                view.get("tickers") or [],
                view.get("reasoning"),
                chunk_index,
                extraction_model,
            ),
        )


def _write_trade_idea(
    tenant_id: UUID | None,
    episode_id: UUID,
    speaker_id: UUID,
    idea: dict,
    chunk_index: int,
    extraction_model: str,
) -> None:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO public.podcast_trade_ideas (
                tenant_id, episode_id, speaker_id,
                idea_type, description, direction, asset_classes, tickers,
                conviction, crowding_tag, narrative_stage,
                chunk_index, extraction_model
            ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            """,
            (
                tenant_id, episode_id, speaker_id,
                _clamp(idea.get("idea_type"), _IDEA_TYPES, "implied_position"),
                idea.get("description") or "",
                _clamp(idea.get("direction"), _DIRECTIONS_TRADE, None),
                idea.get("asset_classes") or [],
                idea.get("tickers") or [],
                _clamp(idea.get("conviction"), _CONVICTION, None),
                _clamp(idea.get("crowding_tag"), _CROWDING, None),
                _clamp(idea.get("narrative_stage"), _NARRATIVE_STAGE, None),
                chunk_index,
                extraction_model,
            ),
        )


def _write_narrative(
    tenant_id: UUID | None,
    episode_id: UUID,
    narr: dict,
    chunk_index: int,
    extraction_model: str,
) -> None:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO public.podcast_narratives (
                tenant_id, episode_id, narrative_label, narrative_type, sentiment,
                conviction, novelty_score, supporting_quotes, chunk_indices, extraction_model
            ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            """,
            (
                tenant_id, episode_id,
                narr.get("narrative_label") or "unlabeled",
                _clamp(narr.get("narrative_type"), _NARRATIVE_TYPE, None),
                _clamp(narr.get("sentiment"), _SENTIMENT, None),
                _clamp_int(narr.get("conviction")),
                _clamp_int(narr.get("novelty_score")),
                narr.get("supporting_quotes") or [],
                [chunk_index],
                extraction_model,
            ),
        )


def _write_analog(
    tenant_id: UUID | None,
    episode_id: UUID,
    speaker_id: UUID,
    analog: dict,
    chunk_index: int,
    extraction_model: str,
) -> None:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO public.podcast_analogs (
                tenant_id, episode_id, speaker_id,
                referenced_period, referenced_year, reasoning, missing_differences,
                asset_classes, confidence_implied, rhyme_type,
                chunk_index, extraction_model
            ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            """,
            (
                tenant_id, episode_id, speaker_id,
                analog.get("referenced_period") or "unknown",
                analog.get("referenced_year"),
                analog.get("reasoning") or "",
                analog.get("missing_differences"),
                analog.get("asset_classes") or [],
                _clamp_int(analog.get("confidence_implied")),
                _clamp(analog.get("rhyme_type"), _RHYME_TYPE, None),
                chunk_index,
                extraction_model,
            ),
        )


def _write_uncertainty_marker(
    episode_id: UUID,
    speaker_id: UUID,
    marker: dict,
    chunk_index: int,
) -> None:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO public.podcast_uncertainty_markers (
                episode_id, speaker_id,
                marker_type, raw_text, inferred_confidence, context_statement, chunk_index
            ) VALUES (%s,%s,%s,%s,%s,%s,%s)
            """,
            (
                episode_id, speaker_id,
                _clamp(marker.get("marker_type"), _MARKER_TYPE, "hedge"),
                marker.get("raw_text") or "",
                _clamp_int(marker.get("inferred_confidence")),
                marker.get("context_statement"),
                chunk_index,
            ),
        )


def _write_adversarial_score(
    tenant_id: UUID | None,
    episode_id: UUID,
    score: dict,
) -> None:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO public.podcast_adversarial_scores (
                tenant_id, episode_id,
                authenticity_score, originality_score, manipulation_risk,
                recycled_talking_points, analysis_notes
            ) VALUES (%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT (episode_id) DO UPDATE SET
                authenticity_score = EXCLUDED.authenticity_score,
                originality_score = EXCLUDED.originality_score,
                manipulation_risk = EXCLUDED.manipulation_risk,
                recycled_talking_points = EXCLUDED.recycled_talking_points,
                analysis_notes = EXCLUDED.analysis_notes,
                scored_at = now()
            """,
            (
                tenant_id, episode_id,
                _clamp_int(score.get("authenticity_score")),
                _clamp_int(score.get("originality_score")),
                _clamp_int(score.get("manipulation_risk"), default=0),
                max(0, int(score.get("recycled_talking_points") or 0)),
                score.get("analysis_notes"),
            ),
        )


def _link_episode_speaker(
    episode_id: UUID,
    speaker_id: UUID,
    is_host: bool = False,
) -> None:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO public.podcast_episode_speakers (episode_id, speaker_id, is_host)
            VALUES (%s, %s, %s)
            ON CONFLICT (episode_id, speaker_id) DO NOTHING
            """,
            (episode_id, speaker_id, is_host),
        )


# ── Pass implementations ──────────────────────────────────────────────────────


def _run_pass1(
    openai_client: LLMClient,
    chunk: PodcastChunk,
    resolver: SpeakerResolver,
    episode_id: UUID,
    tenant_id: UUID | None,
    result: ExtractionResult,
) -> None:
    """GPT-4o structured extraction: macro_views + trade_ideas + speakers."""
    try:
        data = openai_client.complete_json(
            system=_PASS1_SYSTEM, user=chunk.text, model=EXTRACTION_MODEL_GPT4O
        )
    except Exception as e:  # noqa: BLE001
        result.errors.append(f"pass1 chunk {chunk.chunk_index}: {e}")
        return

    # Preload speakers from this chunk so fuzzy matching works.
    speakers = data.get("speakers") or []
    speaker_names = [s.get("name") for s in speakers if s.get("name")]
    resolver.preload_episode_speakers(speaker_names)

    for s in speakers:
        name = s.get("name")
        if not name:
            continue
        resolved = resolver.resolve(name)
        _link_episode_speaker(episode_id, resolved.speaker_id, is_host=bool(s.get("is_host")))
        if not resolved.is_unattributed:
            result.speakers_written += 1

    for view in data.get("macro_views") or []:
        resolved = resolver.resolve(view.get("speaker_name"))
        try:
            _write_macro_view(
                tenant_id, episode_id, resolved.speaker_id, view,
                chunk.chunk_index, EXTRACTION_MODEL_GPT4O,
            )
            result.macro_views_written += 1
        except Exception as e:  # noqa: BLE001
            result.errors.append(f"macro_view chunk {chunk.chunk_index}: {e}")

    for idea in data.get("trade_ideas") or []:
        resolved = resolver.resolve(idea.get("speaker_name"))
        try:
            _write_trade_idea(
                tenant_id, episode_id, resolved.speaker_id, idea,
                chunk.chunk_index, EXTRACTION_MODEL_GPT4O,
            )
            result.trade_ideas_written += 1
        except Exception as e:  # noqa: BLE001
            result.errors.append(f"trade_idea chunk {chunk.chunk_index}: {e}")


def _run_pass2(
    anthropic_client: LLMClient,
    chunk: PodcastChunk,
    resolver: SpeakerResolver,
    episode_id: UUID,
    tenant_id: UUID | None,
    result: ExtractionResult,
) -> None:
    """Claude nuanced extraction: narratives + analogs + uncertainty."""
    try:
        data = anthropic_client.complete_json(
            system=_PASS2_SYSTEM, user=chunk.text, model=EXTRACTION_MODEL_CLAUDE
        )
    except Exception as e:  # noqa: BLE001
        result.errors.append(f"pass2 chunk {chunk.chunk_index}: {e}")
        return

    for narr in data.get("narratives") or []:
        try:
            _write_narrative(tenant_id, episode_id, narr, chunk.chunk_index, EXTRACTION_MODEL_CLAUDE)
            result.narratives_written += 1
        except Exception as e:  # noqa: BLE001
            result.errors.append(f"narrative chunk {chunk.chunk_index}: {e}")

    for analog in data.get("analogs") or []:
        resolved = resolver.resolve(analog.get("speaker_name"))
        try:
            _write_analog(
                tenant_id, episode_id, resolved.speaker_id, analog,
                chunk.chunk_index, EXTRACTION_MODEL_CLAUDE,
            )
            result.analogs_written += 1
        except Exception as e:  # noqa: BLE001
            result.errors.append(f"analog chunk {chunk.chunk_index}: {e}")

    for marker in data.get("uncertainty_markers") or []:
        resolved = resolver.resolve(marker.get("speaker_name"))
        try:
            _write_uncertainty_marker(
                episode_id, resolved.speaker_id, marker, chunk.chunk_index
            )
            result.uncertainty_markers_written += 1
        except Exception as e:  # noqa: BLE001
            result.errors.append(f"uncertainty chunk {chunk.chunk_index}: {e}")


def _run_pass4(
    anthropic_client: LLMClient,
    transcript: str,
    episode_id: UUID,
    tenant_id: UUID | None,
    result: ExtractionResult,
) -> None:
    """Claude adversarial scoring at the episode level."""
    try:
        data = anthropic_client.complete_json(
            system=_PASS4_SYSTEM, user=transcript[:50000], model=EXTRACTION_MODEL_CLAUDE
        )
        _write_adversarial_score(tenant_id, episode_id, data)
        result.adversarial_score_written = True
    except Exception as e:  # noqa: BLE001
        result.errors.append(f"pass4: {e}")


# ── Orchestrator ──────────────────────────────────────────────────────────────


def extract_episode(
    episode_id: UUID,
    tenant_id: UUID | None = None,
    openai_client: LLMClient | None = None,
    anthropic_client: LLMClient | None = None,
) -> ExtractionResult:
    """Run the full 4-pass extraction pipeline for an episode.

    The episode must already have transcript_raw populated
    (transcription_status='completed'). Pass 3 (episode-level synthesis) is
    deferred to Phase 2.
    """
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT transcript_raw, transcript_chunks, transcription_status
            FROM public.podcast_episodes
            WHERE episode_id = %s
            """,
            (episode_id,),
        )
        row = cur.fetchone()

    if row is None:
        raise ValueError(f"episode {episode_id} not found")
    if row["transcription_status"] != "completed":
        raise ValueError(
            f"episode {episode_id} has transcription_status={row['transcription_status']}; "
            "extraction requires 'completed'"
        )
    transcript = row["transcript_raw"] or ""
    if not transcript.strip():
        raise ValueError(f"episode {episode_id} has empty transcript_raw")

    chunks = chunk_transcript(transcript)
    logger.info(
        "podcast extraction: episode=%s chunks=%d transcript_words=%d",
        episode_id, len(chunks), len(transcript.split()),
    )

    _mark_extraction_status(episode_id, "processing")

    openai_client = openai_client or _OpenAIClient()
    anthropic_client = anthropic_client or _AnthropicClient()
    resolver = SpeakerResolver(tenant_id=tenant_id, episode_id=episode_id)
    result = ExtractionResult(episode_id=episode_id, tenant_id=tenant_id)

    for chunk in chunks:
        _run_pass1(openai_client, chunk, resolver, episode_id, tenant_id, result)
        _run_pass2(anthropic_client, chunk, resolver, episode_id, tenant_id, result)

    _run_pass4(anthropic_client, transcript, episode_id, tenant_id, result)

    final_status = "partial" if result.errors else "completed"
    _mark_extraction_status(episode_id, final_status)
    return result


def _mark_extraction_status(episode_id: UUID, status: str) -> None:
    with get_cursor() as cur:
        cur.execute(
            "UPDATE public.podcast_episodes SET extraction_status = %s, updated_at = now() WHERE episode_id = %s",
            (status, episode_id),
        )


__all__ = [
    "EXTRACTION_MODEL_CLAUDE",
    "EXTRACTION_MODEL_GPT4O",
    "ExtractionResult",
    "LLMClient",
    "extract_episode",
]
