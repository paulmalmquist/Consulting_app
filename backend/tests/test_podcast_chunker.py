"""Chunker tests — pure logic, no DB or external deps."""

from __future__ import annotations

from app.services.podcast_chunker import (
    chunk_segments,
    chunk_transcript,
)
from app.services.podcast_transcription import TranscriptSegment


def _make_text(word_count: int) -> str:
    """Generate a transcript of exactly `word_count` words across ~15-word sentences.

    Sentences start with capital words so the regex sentence-splitter actually
    splits them — it requires [A-Z0-9"'(] after the period-space.
    """
    sentences = []
    words_left = word_count
    sent_num = 0
    while words_left > 0:
        n = min(15, words_left)
        # First word capitalized so the next sentence boundary is detectable.
        words = [f"Word{sent_num}_{i}" if i == 0 else f"word{sent_num}_{i}" for i in range(n)]
        sentences.append(" ".join(words) + ".")
        words_left -= n
        sent_num += 1
    return " ".join(sentences)


def test_chunk_empty_text():
    assert chunk_transcript("") == []


def test_chunk_short_transcript_produces_single_chunk():
    text = _make_text(200)  # below min_words
    chunks = chunk_transcript(text)
    assert len(chunks) == 1
    assert chunks[0].word_count == 200
    assert chunks[0].chunk_index == 0


def test_chunk_respects_target_word_count():
    text = _make_text(2500)  # ~3 chunks at target 800
    chunks = chunk_transcript(text)
    assert len(chunks) >= 2
    for c in chunks[:-1]:  # last chunk can be smaller
        # Target is 800, max is 1200 — all non-final chunks should be in that band
        # allowing for overlap carry from prior chunk.
        assert 400 <= c.word_count <= 1400


def test_chunk_indices_are_sequential():
    chunks = chunk_transcript(_make_text(3000))
    assert [c.chunk_index for c in chunks] == list(range(len(chunks)))


def test_chunk_overlap_carries_sentences():
    """The first N sentences of chunk k should match the last N sentences of chunk k-1."""
    chunks = chunk_transcript(_make_text(2500), overlap_sentences=2)
    if len(chunks) < 2:
        return  # skip if text was small enough for 1 chunk
    prev_tail = chunks[0].text.split(". ")[-2:]
    # Allow trailing punctuation / spacing differences — just check substring.
    for prev_sentence in prev_tail:
        core = prev_sentence.strip(".").strip()
        if len(core) > 20:  # only check substantive sentences
            assert core in chunks[1].text


def test_chunk_segments_preserves_timestamps():
    segments = [
        TranscriptSegment(start_seconds=0.0, end_seconds=5.0, text="First sentence here."),
        TranscriptSegment(start_seconds=5.0, end_seconds=10.0, text="Second sentence here."),
        TranscriptSegment(start_seconds=10.0, end_seconds=15.0, text="Third sentence here."),
    ]
    chunks = chunk_segments(segments)
    assert len(chunks) == 1
    assert chunks[0].start_seconds == 0.0
    assert chunks[0].end_seconds == 15.0


def test_chunk_segments_respects_speaker_turns():
    """Speaker change after min_words should flush the current chunk."""
    segments: list[TranscriptSegment] = []
    # First speaker: 500+ words (above min=400)
    for i in range(35):
        words = [f"Joe{i}_{j}" if j == 0 else f"joe{i}_{j}" for j in range(15)]
        segments.append(
            TranscriptSegment(
                start_seconds=float(i),
                end_seconds=float(i + 1),
                text=" ".join(words) + ".",
                speaker="joe",
            )
        )
    # Second speaker starts — should trigger a flush
    for i in range(35):
        words = [f"Tracy{i}_{j}" if j == 0 else f"tracy{i}_{j}" for j in range(15)]
        segments.append(
            TranscriptSegment(
                start_seconds=float(35 + i),
                end_seconds=float(36 + i),
                text=" ".join(words) + ".",
                speaker="tracy",
            )
        )
    chunks = chunk_segments(segments)
    assert len(chunks) >= 2
    # First chunk should be primarily Joe
    assert chunks[0].primary_speaker == "joe"
    # Some later chunk should be primarily Tracy
    assert any(c.primary_speaker == "tracy" for c in chunks)


def test_chunk_segments_below_min_no_premature_flush_on_speaker_change():
    """Speaker change below min_words should NOT flush — too small to be useful."""
    segments = [
        TranscriptSegment(start_seconds=0, end_seconds=1, text="Quick joe line.", speaker="joe"),
        TranscriptSegment(start_seconds=1, end_seconds=2, text="Quick tracy line.", speaker="tracy"),
        TranscriptSegment(start_seconds=2, end_seconds=3, text="Back to joe.", speaker="joe"),
    ]
    chunks = chunk_segments(segments)
    # Total is ~9 words, far below min — should be one chunk.
    assert len(chunks) == 1


def test_primary_speaker_majority():
    segments = [
        TranscriptSegment(0, 1, "a.", speaker="joe"),
        TranscriptSegment(1, 2, "b.", speaker="joe"),
        TranscriptSegment(2, 3, "c.", speaker="tracy"),
    ]
    chunks = chunk_segments(segments)
    assert chunks[0].primary_speaker == "joe"


def test_hard_max_respected():
    """No chunk should ever exceed max_words by more than one sentence."""
    chunks = chunk_transcript(_make_text(5000), max_words=1000)
    for c in chunks:
        # Allow some slack for the last-sentence-boundary behavior
        assert c.word_count <= 1200
