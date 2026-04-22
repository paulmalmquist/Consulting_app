"""Ingest dispatcher for podcast episodes.

Four input modes:
    1. YouTube URL    → yt-dlp metadata + auto-captions
    2. RSS feed URL   → feedparser, one episode row per entry
    3. Uploaded audio → stored locally, transcription queued
    4. Pasted text    → stored directly, extraction-ready

All modes create rows in ``podcast_sources`` (if needed) and
``podcast_episodes``, and set ``transcription_status`` / ``transcription_model``
appropriately so the async extraction runner knows what state to resume from.

Heavy deps (yt-dlp, feedparser) are imported lazily inside each function so
importing this module is safe without them installed.
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from app.db import get_cursor
from app.services.podcast_transcription import (
    TRANSCRIPTION_MODEL_MANUAL,
    TRANSCRIPTION_MODEL_PENDING,
    TRANSCRIPTION_MODEL_YOUTUBE_AUTO,
    fetch_youtube_captions,
)

logger = logging.getLogger(__name__)


@dataclass
class IngestResult:
    episode_id: UUID
    source_id: UUID
    title: str
    transcription_status: str
    transcription_model: str | None


@dataclass
class RssIngestResult:
    source_id: UUID
    episodes_found: int
    episode_ids: list[UUID]


# ── Source resolution ─────────────────────────────────────────────────────────


def _get_or_create_source(
    tenant_id: UUID | None,
    source_type: str,
    name: str,
    url: str | None,
) -> UUID:
    """Lookup by (tenant_id, url) else insert. Idempotent."""
    with get_cursor() as cur:
        if url:
            cur.execute(
                """
                SELECT source_id FROM public.podcast_sources
                WHERE tenant_id IS NOT DISTINCT FROM %s AND url = %s
                LIMIT 1
                """,
                (tenant_id, url),
            )
            row = cur.fetchone()
            if row:
                return row["source_id"]
        cur.execute(
            """
            INSERT INTO public.podcast_sources (tenant_id, source_type, name, url)
            VALUES (%s, %s, %s, %s)
            RETURNING source_id
            """,
            (tenant_id, source_type, name, url),
        )
        return cur.fetchone()["source_id"]


def _upsert_episode(
    tenant_id: UUID | None,
    source_id: UUID,
    external_id: str | None,
    title: str,
    description: str | None,
    published_at: datetime | None,
    duration_seconds: int | None,
    audio_url: str | None,
    video_url: str | None,
    thumbnail_url: str | None,
    transcript_raw: str | None,
    transcription_model: str | None,
    transcription_status: str,
    metadata: dict[str, Any] | None = None,
) -> UUID:
    import json

    with get_cursor() as cur:
        # Idempotency: (tenant_id, source_id, external_id) has a unique index.
        if external_id is not None:
            cur.execute(
                """
                SELECT episode_id FROM public.podcast_episodes
                WHERE tenant_id IS NOT DISTINCT FROM %s
                  AND source_id = %s
                  AND external_id = %s
                LIMIT 1
                """,
                (tenant_id, source_id, external_id),
            )
            existing = cur.fetchone()
            if existing:
                return existing["episode_id"]

        cur.execute(
            """
            INSERT INTO public.podcast_episodes (
                tenant_id, source_id, external_id, title, description,
                published_at, duration_seconds, audio_url, video_url, thumbnail_url,
                transcript_raw, transcription_model, transcription_status, metadata
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING episode_id
            """,
            (
                tenant_id,
                source_id,
                external_id,
                title,
                description,
                published_at,
                duration_seconds,
                audio_url,
                video_url,
                thumbnail_url,
                transcript_raw,
                transcription_model,
                transcription_status,
                json.dumps(metadata or {}),
            ),
        )
        return cur.fetchone()["episode_id"]


# ── Mode 1: YouTube ───────────────────────────────────────────────────────────


def ingest_youtube(url: str, tenant_id: UUID | None = None) -> IngestResult:
    """Ingest a single YouTube video. Pulls metadata + auto-captions (if available).

    If auto-captions fail, the episode is created with transcription_status='pending'
    and transcription_model='transcription_pending' — caller is expected to queue
    audio download + Whisper separately (Phase 2+).
    """
    try:
        import yt_dlp  # type: ignore[import-not-found]
    except ImportError as e:
        raise RuntimeError(
            "yt-dlp is not installed. Install with `pip install yt-dlp`."
        ) from e

    with yt_dlp.YoutubeDL({"skip_download": True, "quiet": True, "no_warnings": True}) as ydl:
        info = ydl.extract_info(url, download=False)

    if info is None:
        raise ValueError(f"yt-dlp returned no metadata for {url}")

    channel = info.get("channel") or info.get("uploader") or "YouTube"
    source_id = _get_or_create_source(
        tenant_id=tenant_id,
        source_type="youtube_channel",
        name=channel,
        url=info.get("channel_url") or info.get("uploader_url"),
    )

    transcript: str | None = None
    transcription_model: str | None = None
    transcription_status = "pending"
    try:
        caps = fetch_youtube_captions(url)
    except Exception as e:  # noqa: BLE001
        logger.warning("YouTube caption fetch failed for %s: %s", url, e)
        caps = None
    if caps is not None and caps.text:
        transcript = caps.text
        transcription_model = TRANSCRIPTION_MODEL_YOUTUBE_AUTO
        transcription_status = "completed"
    else:
        transcription_model = TRANSCRIPTION_MODEL_PENDING

    published_at = None
    upload_date = info.get("upload_date")
    if upload_date:
        try:
            published_at = datetime.strptime(upload_date, "%Y%m%d").replace(
                tzinfo=timezone.utc
            )
        except ValueError:
            pass

    episode_id = _upsert_episode(
        tenant_id=tenant_id,
        source_id=source_id,
        external_id=info.get("id"),
        title=info.get("title") or "Untitled",
        description=info.get("description"),
        published_at=published_at,
        duration_seconds=info.get("duration"),
        audio_url=None,
        video_url=info.get("webpage_url") or url,
        thumbnail_url=info.get("thumbnail"),
        transcript_raw=transcript,
        transcription_model=transcription_model,
        transcription_status=transcription_status,
        metadata={"youtube": {"uploader": info.get("uploader")}},
    )

    return IngestResult(
        episode_id=episode_id,
        source_id=source_id,
        title=info.get("title") or "Untitled",
        transcription_status=transcription_status,
        transcription_model=transcription_model,
    )


# ── Mode 2: RSS feed ──────────────────────────────────────────────────────────


def ingest_rss(
    feed_url: str,
    tenant_id: UUID | None = None,
    limit: int | None = 25,
) -> RssIngestResult:
    """Parse an RSS feed and create episode rows for each entry.

    Phase 1: synchronous single-pass parse. Phase 4 adds the scheduled polling
    loop that re-calls this function per stored source.

    Episodes are created with transcription_status='pending' — audio must be
    transcribed separately. External_id = entry.guid or entry.id for idempotency.
    """
    try:
        import feedparser  # type: ignore[import-not-found]
    except ImportError as e:
        raise RuntimeError(
            "feedparser is not installed. Install with `pip install feedparser`."
        ) from e

    parsed = feedparser.parse(feed_url)
    feed_title = (parsed.feed.get("title") if parsed.feed else None) or "RSS Feed"

    source_id = _get_or_create_source(
        tenant_id=tenant_id,
        source_type="rss",
        name=feed_title,
        url=feed_url,
    )

    entries = parsed.entries or []
    if limit is not None:
        entries = entries[:limit]

    episode_ids: list[UUID] = []
    for entry in entries:
        external_id = entry.get("id") or entry.get("guid") or entry.get("link")
        audio_url = None
        for enc in entry.get("enclosures") or []:
            if (enc.get("type") or "").startswith("audio"):
                audio_url = enc.get("href") or enc.get("url")
                break

        published_at = None
        if parsed_time := entry.get("published_parsed"):
            try:
                published_at = datetime(*parsed_time[:6], tzinfo=timezone.utc)
            except (TypeError, ValueError):
                pass

        episode_id = _upsert_episode(
            tenant_id=tenant_id,
            source_id=source_id,
            external_id=external_id,
            title=entry.get("title") or "Untitled",
            description=entry.get("summary"),
            published_at=published_at,
            duration_seconds=_parse_itunes_duration(entry.get("itunes_duration")),
            audio_url=audio_url,
            video_url=None,
            thumbnail_url=None,
            transcript_raw=None,
            transcription_model=TRANSCRIPTION_MODEL_PENDING,
            transcription_status="pending",
        )
        episode_ids.append(episode_id)

    # Stamp fetch time on the source.
    with get_cursor() as cur:
        cur.execute(
            "UPDATE public.podcast_sources SET last_fetched_at = now() WHERE source_id = %s",
            (source_id,),
        )

    return RssIngestResult(
        source_id=source_id,
        episodes_found=len(episode_ids),
        episode_ids=episode_ids,
    )


def _parse_itunes_duration(raw: str | None) -> int | None:
    """'01:23:45' / '23:45' / '1234' → seconds."""
    if not raw:
        return None
    s = str(raw).strip()
    if s.isdigit():
        return int(s)
    parts = s.split(":")
    try:
        parts_i = [int(p) for p in parts]
    except ValueError:
        return None
    if len(parts_i) == 3:
        h, m, sec = parts_i
        return h * 3600 + m * 60 + sec
    if len(parts_i) == 2:
        m, sec = parts_i
        return m * 60 + sec
    return None


# ── Mode 3: Upload ────────────────────────────────────────────────────────────


def ingest_upload(
    title: str,
    audio_path: str,
    tenant_id: UUID | None = None,
    source_name: str = "Manual Upload",
) -> IngestResult:
    """Register an uploaded audio file. Transcription is queued separately.

    Phase 1: the file must already exist on disk at ``audio_path``. The route
    layer is responsible for writing the multipart upload to disk before
    calling this. Phase 2+ moves storage to Supabase Storage.
    """
    source_id = _get_or_create_source(
        tenant_id=tenant_id,
        source_type="manual",
        name=source_name,
        url=None,
    )

    external_id = f"upload_{uuid.uuid4()}"
    episode_id = _upsert_episode(
        tenant_id=tenant_id,
        source_id=source_id,
        external_id=external_id,
        title=title,
        description=None,
        published_at=datetime.now(timezone.utc),
        duration_seconds=None,
        audio_url=audio_path,
        video_url=None,
        thumbnail_url=None,
        transcript_raw=None,
        transcription_model=TRANSCRIPTION_MODEL_PENDING,
        transcription_status="pending",
        metadata={"local_audio_path": audio_path},
    )
    return IngestResult(
        episode_id=episode_id,
        source_id=source_id,
        title=title,
        transcription_status="pending",
        transcription_model=TRANSCRIPTION_MODEL_PENDING,
    )


# ── Mode 4: Pasted transcript ─────────────────────────────────────────────────


def ingest_transcript(
    title: str,
    text: str,
    source_name: str,
    tenant_id: UUID | None = None,
) -> IngestResult:
    """Register a pre-transcribed episode. Marks transcription completed immediately."""
    if not text.strip():
        raise ValueError("transcript text is empty")

    source_id = _get_or_create_source(
        tenant_id=tenant_id,
        source_type="manual",
        name=source_name,
        url=None,
    )

    external_id = f"manual_{uuid.uuid4()}"
    episode_id = _upsert_episode(
        tenant_id=tenant_id,
        source_id=source_id,
        external_id=external_id,
        title=title,
        description=None,
        published_at=datetime.now(timezone.utc),
        duration_seconds=None,
        audio_url=None,
        video_url=None,
        thumbnail_url=None,
        transcript_raw=text,
        transcription_model=TRANSCRIPTION_MODEL_MANUAL,
        transcription_status="completed",
    )
    return IngestResult(
        episode_id=episode_id,
        source_id=source_id,
        title=title,
        transcription_status="completed",
        transcription_model=TRANSCRIPTION_MODEL_MANUAL,
    )


__all__ = [
    "IngestResult",
    "RssIngestResult",
    "ingest_rss",
    "ingest_transcript",
    "ingest_upload",
    "ingest_youtube",
]
