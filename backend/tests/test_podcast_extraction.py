"""Extraction pipeline tests with mocked LLM clients and DB."""

from __future__ import annotations

import uuid
from contextlib import contextmanager
from unittest.mock import patch

import pytest

from app.services.podcast_chunker import PodcastChunk
from app.services.podcast_extraction import (
    ExtractionResult,
    _run_pass1,
    _run_pass2,
    _run_pass4,
    extract_episode,
)
from app.services.podcast_speaker_resolver import SpeakerResolver


class _FakeLLM:
    """Canned-response LLM client for deterministic tests."""

    def __init__(self, responses: list[dict] | dict):
        self.responses = responses if isinstance(responses, list) else [responses]
        self.calls: list[dict] = []

    def complete_json(self, *, system: str, user: str, model: str) -> dict:
        self.calls.append({"system": system, "user": user, "model": model})
        return self.responses[min(len(self.calls) - 1, len(self.responses) - 1)]


class _UniversalFakeCursor:
    """Minimal cursor that handles INSERT/SELECT/UPDATE for all podcast tables."""

    def __init__(self, state: dict):
        self.state = state
        self._pending = None

    def execute(self, sql, params=()):
        s = " ".join(sql.split()).lower()
        # Speaker resolver path
        if "insert into public.podcast_speakers" in s:
            tenant_id, name, normalized = params
            key = ("speaker", tenant_id, normalized)
            if key not in self.state:
                self.state[key] = {
                    "speaker_id": uuid.uuid4(),
                    "name": name,
                    "normalized_name": normalized,
                }
            self._pending = self.state[key]
            return
        # Episode lookup for extract_episode
        if "from public.podcast_episodes" in s and "select" in s and "transcript_raw" in s:
            eid = params[0]
            self._pending = self.state.get(("episode", eid))
            return
        # Signal writers — just count them
        for table in [
            "podcast_macro_views",
            "podcast_trade_ideas",
            "podcast_narratives",
            "podcast_analogs",
            "podcast_uncertainty_markers",
            "podcast_episode_speakers",
            "podcast_adversarial_scores",
        ]:
            if f"insert into public.{table}" in s:
                self.state.setdefault(f"_count_{table}", 0)
                self.state[f"_count_{table}"] += 1
                self._pending = None
                return
        if "update public.podcast_episodes" in s:
            self._pending = None
            return
        self._pending = None

    def fetchone(self):
        return self._pending


@pytest.fixture
def fake_db():
    state: dict = {}

    @contextmanager
    def fake_cursor():
        yield _UniversalFakeCursor(state)

    patches = [
        patch("app.services.podcast_speaker_resolver.get_cursor", fake_cursor),
        patch("app.services.podcast_extraction.get_cursor", fake_cursor),
    ]
    for p in patches:
        p.start()
    yield state
    for p in patches:
        p.stop()


# ── Pass 1 ─────────────────────────────────────────────────────────────────────


def test_pass1_writes_macro_views_and_trade_ideas(fake_db):
    episode_id = uuid.uuid4()
    resolver = SpeakerResolver(tenant_id=None, episode_id=episode_id)
    chunk = PodcastChunk(chunk_index=0, text="sample", word_count=10)
    llm = _FakeLLM({
        "speakers": [
            {"name": "Joe Weisenthal", "role": "host", "is_host": True},
            {"name": "Ozan Tarman", "role": "guest", "is_host": False},
        ],
        "macro_views": [
            {
                "speaker_name": "Ozan",  # short form — resolver must fuzzy-match
                "view_type": "macro",
                "statement": "Steepener trade is attractive",
                "direction": "bullish",
                "confidence_implied": 75,
                "asset_classes": ["rates"],
                "tickers": [],
            }
        ],
        "trade_ideas": [
            {
                "speaker_name": "Tarman",  # last-name only — resolver must fuzzy-match
                "idea_type": "explicit_trade",
                "description": "Long gold",
                "direction": "long",
                "tickers": ["GLD"],
                "conviction": "high",
            }
        ],
    })
    result = ExtractionResult(episode_id=episode_id, tenant_id=None)

    _run_pass1(llm, chunk, resolver, episode_id, None, result)

    assert result.macro_views_written == 1
    assert result.trade_ideas_written == 1
    # Both the macro_view and the trade_idea should have resolved to Ozan Tarman,
    # NOT to new "Ozan" or "Tarman" speaker rows. Count speaker rows:
    speaker_rows = [k for k in fake_db.keys() if isinstance(k, tuple) and k[0] == "speaker"]
    # 2 real speakers (Joe, Ozan) — no duplicates from fuzzy hits.
    real = [k for k in speaker_rows if not k[2].startswith("__unattributed_")]
    assert len(real) == 2
    assert result.errors == []


def test_pass1_llm_error_does_not_crash(fake_db):
    class _BoomLLM:
        def complete_json(self, **kwargs):
            raise RuntimeError("API down")

    resolver = SpeakerResolver(tenant_id=None, episode_id=uuid.uuid4())
    chunk = PodcastChunk(chunk_index=0, text="sample", word_count=10)
    result = ExtractionResult(episode_id=uuid.uuid4(), tenant_id=None)
    _run_pass1(_BoomLLM(), chunk, resolver, uuid.uuid4(), None, result)

    assert result.macro_views_written == 0
    assert len(result.errors) == 1
    assert "pass1" in result.errors[0]


# ── Pass 2 ─────────────────────────────────────────────────────────────────────


def test_pass2_writes_narratives_analogs_uncertainty(fake_db):
    episode_id = uuid.uuid4()
    resolver = SpeakerResolver(tenant_id=None, episode_id=episode_id)
    # Preload so fuzzy match on "Joe" works in the pass2 payload.
    resolver.preload_episode_speakers(["Joe Weisenthal"])
    chunk = PodcastChunk(chunk_index=0, text="sample", word_count=10)
    llm = _FakeLLM({
        "narratives": [
            {
                "narrative_label": "end of US exceptionalism",
                "narrative_type": "emerging",
                "sentiment": "negative",
                "conviction": 80,
                "novelty_score": 70,
                "supporting_quotes": ["the trade is unwinding"],
            }
        ],
        "analogs": [
            {
                "speaker_name": "Joe",
                "referenced_period": "2008 GFC",
                "referenced_year": 2008,
                "reasoning": "credit cycle parallel",
                "rhyme_type": "cyclical",
            }
        ],
        "uncertainty_markers": [
            {
                "speaker_name": "Joe",
                "marker_type": "hedge",
                "raw_text": "I think",
                "inferred_confidence": 60,
            }
        ],
    })
    result = ExtractionResult(episode_id=episode_id, tenant_id=None)

    _run_pass2(llm, chunk, resolver, episode_id, None, result)

    assert result.narratives_written == 1
    assert result.analogs_written == 1
    assert result.uncertainty_markers_written == 1
    assert result.errors == []


# ── Pass 4 ─────────────────────────────────────────────────────────────────────


def test_pass4_writes_adversarial_score(fake_db):
    episode_id = uuid.uuid4()
    llm = _FakeLLM({
        "authenticity_score": 75,
        "originality_score": 70,
        "manipulation_risk": 25,
        "recycled_talking_points": 2,
        "analysis_notes": "Guest made novel claim about rates.",
    })
    result = ExtractionResult(episode_id=episode_id, tenant_id=None)
    _run_pass4(llm, "transcript text", episode_id, None, result)

    assert result.adversarial_score_written is True
    assert result.errors == []


# ── Orchestrator ──────────────────────────────────────────────────────────────


def test_extract_episode_rejects_non_completed_transcription(fake_db):
    eid = uuid.uuid4()
    fake_db[("episode", eid)] = {
        "transcript_raw": "some text",
        "transcript_chunks": [],
        "transcription_status": "pending",
    }
    with pytest.raises(ValueError, match="transcription_status"):
        extract_episode(eid)


def test_extract_episode_end_to_end(fake_db):
    eid = uuid.uuid4()
    # 2 short sentences — will produce one chunk.
    fake_db[("episode", eid)] = {
        "transcript_raw": "Joe Weisenthal hosts the show. Today we talk rates.",
        "transcript_chunks": [],
        "transcription_status": "completed",
    }
    openai = _FakeLLM({
        "speakers": [{"name": "Joe Weisenthal", "is_host": True}],
        "macro_views": [],
        "trade_ideas": [],
    })
    anthropic = _FakeLLM([
        {"narratives": [], "analogs": [], "uncertainty_markers": []},  # Pass 2
        {  # Pass 4
            "authenticity_score": 80,
            "originality_score": 50,
            "manipulation_risk": 10,
            "recycled_talking_points": 0,
            "analysis_notes": "fine",
        },
    ])

    result = extract_episode(eid, openai_client=openai, anthropic_client=anthropic)

    assert result.episode_id == eid
    assert result.adversarial_score_written
    assert result.errors == []
