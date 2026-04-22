"""Transcription backends for podcast episodes.

Phase 1 ships:
- ``WhisperBackend`` Protocol — swap-in interface
- ``LocalWhisperBackend`` — faster-whisper large-v3 on the local machine
  (dev/laptop). Imported lazily so the module is safe to import without the
  dep installed.
- ``NoopWhisperBackend`` — returns a "transcription_pending" sentinel. Used
  when no local backend is available (e.g. Railway prod).
- ``fetch_youtube_captions`` — pulls VTT auto-captions via yt-dlp. This is
  the primary Phase 1 path because Whisper infra is unresolved.

The transcription_model field on ``podcast_episodes`` records which path
produced the transcript, so downstream consumers can filter by quality.

Hosted Whisper (Replicate, AssemblyAI, Databricks jobs) is Phase 2+.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Protocol

logger = logging.getLogger(__name__)


# Sentinel transcription_model values stored on podcast_episodes.
TRANSCRIPTION_MODEL_WHISPER_LOCAL = "whisper-large-v3-local"
TRANSCRIPTION_MODEL_YOUTUBE_AUTO = "youtube_auto_captions"
TRANSCRIPTION_MODEL_MANUAL = "manual_transcript"
TRANSCRIPTION_MODEL_PENDING = "transcription_pending"


@dataclass
class TranscriptSegment:
    start_seconds: float
    end_seconds: float
    text: str
    speaker: str | None = None  # populated only if diarization ran


@dataclass
class TranscriptResult:
    text: str
    model_name: str
    segments: list[TranscriptSegment] = field(default_factory=list)
    detected_language: str | None = None

    @property
    def is_pending(self) -> bool:
        return self.model_name == TRANSCRIPTION_MODEL_PENDING


class WhisperBackend(Protocol):
    def transcribe(self, audio_path: str | Path) -> TranscriptResult: ...
    def is_available(self) -> bool: ...


class NoopWhisperBackend:
    """Returns a pending sentinel. Used when no audio backend is available."""

    def transcribe(self, audio_path: str | Path) -> TranscriptResult:
        logger.warning(
            "NoopWhisperBackend.transcribe called for %s — no transcription "
            "backend configured, returning pending sentinel",
            audio_path,
        )
        return TranscriptResult(text="", model_name=TRANSCRIPTION_MODEL_PENDING)

    def is_available(self) -> bool:
        return False


class LocalWhisperBackend:
    """faster-whisper large-v3, CPU-friendly via CTranslate2.

    Lazy-imports faster_whisper so the surrounding module is importable
    without the dep. Construct once per process — model load is expensive.
    """

    def __init__(self, model_size: str = "large-v3", compute_type: str = "int8"):
        self.model_size = model_size
        self.compute_type = compute_type
        self._model = None

    def _load(self):
        if self._model is not None:
            return self._model
        try:
            from faster_whisper import WhisperModel  # type: ignore[import-not-found]
        except ImportError as e:
            raise RuntimeError(
                "faster-whisper is not installed. Install with "
                "`pip install faster-whisper` or use NoopWhisperBackend."
            ) from e
        self._model = WhisperModel(self.model_size, compute_type=self.compute_type)
        return self._model

    def is_available(self) -> bool:
        try:
            import faster_whisper  # noqa: F401  # type: ignore[import-not-found]
            return True
        except ImportError:
            return False

    def transcribe(self, audio_path: str | Path) -> TranscriptResult:
        model = self._load()
        segments_iter, info = model.transcribe(str(audio_path), beam_size=5)
        segments: list[TranscriptSegment] = []
        parts: list[str] = []
        for seg in segments_iter:
            segments.append(
                TranscriptSegment(
                    start_seconds=float(seg.start),
                    end_seconds=float(seg.end),
                    text=seg.text.strip(),
                )
            )
            parts.append(seg.text.strip())
        return TranscriptResult(
            text=" ".join(parts),
            model_name=TRANSCRIPTION_MODEL_WHISPER_LOCAL,
            segments=segments,
            detected_language=getattr(info, "language", None),
        )


def get_default_backend() -> WhisperBackend:
    """Local Whisper if faster-whisper is installed, else Noop."""
    local = LocalWhisperBackend()
    if local.is_available():
        return local
    return NoopWhisperBackend()


# ── YouTube auto-caption fetch (VTT → plain text) ─────────────────────────────


def fetch_youtube_captions(url: str) -> TranscriptResult | None:
    """Pull YouTube auto-captions for ``url`` via yt-dlp.

    Returns None if the video has no auto-captions available. Caller is
    expected to fall back to audio download + Whisper in that case.
    """
    try:
        import yt_dlp  # type: ignore[import-not-found]
    except ImportError as e:
        raise RuntimeError(
            "yt-dlp is not installed. Install with `pip install yt-dlp`."
        ) from e

    opts = {
        "skip_download": True,
        "writesubtitles": False,
        "writeautomaticsub": True,
        "subtitleslangs": ["en"],
        "subtitlesformat": "vtt",
        "quiet": True,
        "no_warnings": True,
    }

    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=False)

    auto_caps = (info or {}).get("automatic_captions") or {}
    en_tracks = auto_caps.get("en") or []
    if not en_tracks:
        return None

    # Prefer vtt; yt-dlp returns a list of format dicts with 'url'
    vtt_url = None
    for track in en_tracks:
        if track.get("ext") == "vtt":
            vtt_url = track.get("url")
            break
    if vtt_url is None:
        vtt_url = en_tracks[0].get("url")
    if not vtt_url:
        return None

    import urllib.request

    with urllib.request.urlopen(vtt_url, timeout=30) as resp:
        vtt_text = resp.read().decode("utf-8", errors="replace")

    segments = parse_vtt(vtt_text)
    full_text = " ".join(seg.text for seg in segments if seg.text)
    return TranscriptResult(
        text=full_text,
        model_name=TRANSCRIPTION_MODEL_YOUTUBE_AUTO,
        segments=segments,
        detected_language="en",
    )


_VTT_TIMESTAMP_RE = re.compile(
    r"(\d{2}):(\d{2}):(\d{2})\.(\d{3})\s+-->\s+(\d{2}):(\d{2}):(\d{2})\.(\d{3})"
)
_VTT_TAG_RE = re.compile(r"<[^>]+>")


def parse_vtt(vtt_text: str) -> list[TranscriptSegment]:
    """Parse WEBVTT text into segments, stripping inline tags and dedup lines.

    YouTube auto-caption VTT has heavy overlap between cues (rolling captions);
    we emit one segment per cue and let the chunker handle dedup downstream
    via sentence boundaries.
    """
    segments: list[TranscriptSegment] = []
    lines = vtt_text.splitlines()
    i = 0
    seen_lines: set[str] = set()
    while i < len(lines):
        line = lines[i]
        m = _VTT_TIMESTAMP_RE.search(line)
        if not m:
            i += 1
            continue
        start = _vtt_hms_to_seconds(m.group(1), m.group(2), m.group(3), m.group(4))
        end = _vtt_hms_to_seconds(m.group(5), m.group(6), m.group(7), m.group(8))
        i += 1
        text_parts: list[str] = []
        while i < len(lines) and lines[i].strip() and not _VTT_TIMESTAMP_RE.search(lines[i]):
            cleaned = _VTT_TAG_RE.sub("", lines[i]).strip()
            if cleaned and cleaned not in seen_lines:
                seen_lines.add(cleaned)
                text_parts.append(cleaned)
            i += 1
        text = " ".join(text_parts).strip()
        if text:
            segments.append(
                TranscriptSegment(start_seconds=start, end_seconds=end, text=text)
            )
    return segments


def _vtt_hms_to_seconds(h: str, m: str, s: str, ms: str) -> float:
    return int(h) * 3600 + int(m) * 60 + int(s) + int(ms) / 1000.0


__all__ = [
    "LocalWhisperBackend",
    "NoopWhisperBackend",
    "TRANSCRIPTION_MODEL_MANUAL",
    "TRANSCRIPTION_MODEL_PENDING",
    "TRANSCRIPTION_MODEL_WHISPER_LOCAL",
    "TRANSCRIPTION_MODEL_YOUTUBE_AUTO",
    "TranscriptResult",
    "TranscriptSegment",
    "WhisperBackend",
    "fetch_youtube_captions",
    "get_default_backend",
    "parse_vtt",
]
