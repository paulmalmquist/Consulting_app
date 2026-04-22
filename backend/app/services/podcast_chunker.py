"""Transcript chunking for podcast extraction.

Phase 1 uses sentence-boundary + speaker-turn chunking. Embedding-based
semantic chunking (topic-boundary detection via sentence-transformers) is
deferred to Phase 2 to avoid pulling torch into the backend image.

Contract:
    chunk_transcript(text)           → chunks from plain text
    chunk_segments(segments)         → chunks that respect speaker turns
                                       and preserve timestamp ranges

Each chunk targets 800 words (sweet spot for GPT-4o context + extraction
quality). Hard bounds: min_words=400, max_words=1200. Two-sentence overlap
between consecutive chunks preserves context for extraction passes that
reference back-matter from the previous chunk.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from app.services.podcast_transcription import TranscriptSegment

_SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?])\s+(?=[A-Z0-9\"'\(])")
_WORD_RE = re.compile(r"\S+")

DEFAULT_TARGET_WORDS = 800
DEFAULT_MIN_WORDS = 400
DEFAULT_MAX_WORDS = 1200
DEFAULT_OVERLAP_SENTENCES = 2


@dataclass
class PodcastChunk:
    chunk_index: int
    text: str
    word_count: int
    primary_speaker: str | None = None
    start_seconds: float | None = None
    end_seconds: float | None = None
    sentence_count: int = 0


@dataclass
class _Sentence:
    text: str
    word_count: int
    speaker: str | None = None
    start_seconds: float | None = None
    end_seconds: float | None = None


def _split_sentences(text: str) -> list[str]:
    """Regex-based sentence split. Good enough for transcripts — no nltk dep."""
    text = text.strip()
    if not text:
        return []
    raw = _SENTENCE_SPLIT_RE.split(text)
    return [s.strip() for s in raw if s.strip()]


def _word_count(text: str) -> int:
    return len(_WORD_RE.findall(text))


def chunk_transcript(
    text: str,
    target_words: int = DEFAULT_TARGET_WORDS,
    min_words: int = DEFAULT_MIN_WORDS,
    max_words: int = DEFAULT_MAX_WORDS,
    overlap_sentences: int = DEFAULT_OVERLAP_SENTENCES,
) -> list[PodcastChunk]:
    """Chunk plain transcript text with no speaker/timestamp info."""
    sentences = [_Sentence(text=s, word_count=_word_count(s)) for s in _split_sentences(text)]
    return _chunk_sentences(
        sentences=sentences,
        target_words=target_words,
        min_words=min_words,
        max_words=max_words,
        overlap_sentences=overlap_sentences,
    )


def chunk_segments(
    segments: list[TranscriptSegment],
    target_words: int = DEFAULT_TARGET_WORDS,
    min_words: int = DEFAULT_MIN_WORDS,
    max_words: int = DEFAULT_MAX_WORDS,
    overlap_sentences: int = DEFAULT_OVERLAP_SENTENCES,
) -> list[PodcastChunk]:
    """Chunk TranscriptSegments. Preserves speaker turns and timestamp ranges.

    A speaker turn is a soft chunk boundary: if the current chunk has at least
    min_words when the speaker changes, the chunk is flushed even if it hasn't
    hit target_words. This keeps each chunk attributable to a primary speaker,
    which makes downstream speaker-aware extraction easier.
    """
    sentences: list[_Sentence] = []
    for seg in segments:
        for s in _split_sentences(seg.text):
            sentences.append(
                _Sentence(
                    text=s,
                    word_count=_word_count(s),
                    speaker=seg.speaker,
                    start_seconds=seg.start_seconds,
                    end_seconds=seg.end_seconds,
                )
            )
    return _chunk_sentences(
        sentences=sentences,
        target_words=target_words,
        min_words=min_words,
        max_words=max_words,
        overlap_sentences=overlap_sentences,
    )


def _chunk_sentences(
    sentences: list[_Sentence],
    target_words: int,
    min_words: int,
    max_words: int,
    overlap_sentences: int,
) -> list[PodcastChunk]:
    if not sentences:
        return []

    chunks: list[PodcastChunk] = []
    buf: list[_Sentence] = []
    buf_words = 0

    def flush():
        nonlocal buf, buf_words
        if not buf:
            return
        chunk_text = " ".join(s.text for s in buf)
        starts = [s.start_seconds for s in buf if s.start_seconds is not None]
        ends = [s.end_seconds for s in buf if s.end_seconds is not None]
        speakers = [s.speaker for s in buf if s.speaker]
        primary_speaker = _majority_speaker(speakers)
        chunks.append(
            PodcastChunk(
                chunk_index=len(chunks),
                text=chunk_text,
                word_count=buf_words,
                primary_speaker=primary_speaker,
                start_seconds=min(starts) if starts else None,
                end_seconds=max(ends) if ends else None,
                sentence_count=len(buf),
            )
        )
        # Carry overlap sentences into the next buffer.
        if overlap_sentences > 0 and len(buf) > overlap_sentences:
            carryover = buf[-overlap_sentences:]
            buf = list(carryover)
            buf_words = sum(s.word_count for s in buf)
        else:
            buf = []
            buf_words = 0

    for i, sent in enumerate(sentences):
        # Speaker-turn soft boundary — flush if we've hit min and the speaker changed.
        if (
            buf
            and buf_words >= min_words
            and sent.speaker is not None
            and buf[-1].speaker is not None
            and sent.speaker != buf[-1].speaker
        ):
            flush()

        buf.append(sent)
        buf_words += sent.word_count

        # Hard boundary — max_words reached.
        if buf_words >= max_words:
            flush()
            continue

        # Target boundary — hit target and next sentence would push past max.
        if buf_words >= target_words:
            next_words = sentences[i + 1].word_count if i + 1 < len(sentences) else 0
            if buf_words + next_words > max_words or i + 1 == len(sentences):
                flush()

    # Final residue: emit if non-empty, but don't emit a pure-overlap chunk.
    if buf and buf_words > 0:
        # If the residue is only the overlap from the last flush, skip.
        if chunks and buf_words <= sum(
            s.word_count for s in sentences[-overlap_sentences:]
        ) and all(s in sentences[-overlap_sentences:] for s in buf):
            pass
        else:
            flush_final(buf, buf_words, chunks)

    return chunks


def flush_final(
    buf: list[_Sentence], buf_words: int, chunks: list[PodcastChunk]
) -> None:
    chunk_text = " ".join(s.text for s in buf)
    starts = [s.start_seconds for s in buf if s.start_seconds is not None]
    ends = [s.end_seconds for s in buf if s.end_seconds is not None]
    speakers = [s.speaker for s in buf if s.speaker]
    chunks.append(
        PodcastChunk(
            chunk_index=len(chunks),
            text=chunk_text,
            word_count=buf_words,
            primary_speaker=_majority_speaker(speakers),
            start_seconds=min(starts) if starts else None,
            end_seconds=max(ends) if ends else None,
            sentence_count=len(buf),
        )
    )


def _majority_speaker(speakers: list[str]) -> str | None:
    if not speakers:
        return None
    counts: dict[str, int] = {}
    for sp in speakers:
        counts[sp] = counts.get(sp, 0) + 1
    return max(counts.items(), key=lambda kv: kv[1])[0]


__all__ = [
    "DEFAULT_MAX_WORDS",
    "DEFAULT_MIN_WORDS",
    "DEFAULT_OVERLAP_SENTENCES",
    "DEFAULT_TARGET_WORDS",
    "PodcastChunk",
    "chunk_segments",
    "chunk_transcript",
]
