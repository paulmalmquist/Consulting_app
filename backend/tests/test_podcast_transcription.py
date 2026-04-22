"""Transcription helper tests — pure parser logic, no external deps needed."""

from __future__ import annotations

from app.services.podcast_transcription import (
    NoopWhisperBackend,
    TRANSCRIPTION_MODEL_PENDING,
    parse_vtt,
)


def test_noop_backend_returns_pending_sentinel():
    b = NoopWhisperBackend()
    result = b.transcribe("/tmp/missing.mp3")
    assert result.is_pending
    assert result.model_name == TRANSCRIPTION_MODEL_PENDING
    assert result.text == ""
    assert b.is_available() is False


def test_parse_vtt_basic_cue():
    vtt = """WEBVTT

00:00:01.000 --> 00:00:03.500
Hello, welcome to the show.

00:00:03.500 --> 00:00:06.000
Today we're talking about markets.
"""
    segs = parse_vtt(vtt)
    assert len(segs) == 2
    assert segs[0].start_seconds == 1.0
    assert segs[0].end_seconds == 3.5
    assert segs[0].text == "Hello, welcome to the show."
    assert segs[1].text == "Today we're talking about markets."


def test_parse_vtt_strips_inline_tags():
    vtt = """WEBVTT

00:00:00.000 --> 00:00:02.000
<c.colorE5E5E5>Hello <i>there</i> friend</c>
"""
    segs = parse_vtt(vtt)
    assert segs[0].text == "Hello there friend"


def test_parse_vtt_dedupes_rolling_captions():
    """YouTube rolling captions repeat lines — dedup keeps the transcript clean."""
    vtt = """WEBVTT

00:00:00.000 --> 00:00:02.000
hello world

00:00:02.000 --> 00:00:04.000
hello world
this is new

00:00:04.000 --> 00:00:06.000
this is new
another line
"""
    segs = parse_vtt(vtt)
    full = " ".join(s.text for s in segs)
    # 'hello world' and 'this is new' should each appear exactly once across all segments.
    assert full.count("hello world") == 1
    assert full.count("this is new") == 1
    assert "another line" in full


def test_parse_vtt_skips_empty_cues():
    vtt = """WEBVTT

00:00:00.000 --> 00:00:01.000

00:00:01.000 --> 00:00:02.000
real content
"""
    segs = parse_vtt(vtt)
    assert len(segs) == 1
    assert segs[0].text == "real content"


def test_parse_vtt_handles_no_cues():
    assert parse_vtt("WEBVTT\n\n") == []
