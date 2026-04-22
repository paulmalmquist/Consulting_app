"""Pydantic schemas for the podcast intelligence API."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


# ── Ingest request/response ───────────────────────────────────────────────────


class IngestYoutubeRequest(BaseModel):
    url: str = Field(..., description="YouTube video URL")


class IngestRssRequest(BaseModel):
    feed_url: str = Field(..., description="RSS feed URL")
    limit: int | None = Field(default=25, ge=1, le=200)


class IngestTranscriptRequest(BaseModel):
    title: str = Field(..., min_length=1)
    text: str = Field(..., min_length=1)
    source_name: str = Field(default="Manual Transcript")


class IngestEpisodeResponse(BaseModel):
    episode_id: UUID
    source_id: UUID
    title: str
    transcription_status: str
    transcription_model: str | None


class IngestRssResponse(BaseModel):
    source_id: UUID
    episodes_found: int
    episode_ids: list[UUID]


# ── Episode listing ───────────────────────────────────────────────────────────


class EpisodeSummary(BaseModel):
    episode_id: UUID
    source_id: UUID
    title: str
    published_at: datetime | None
    duration_seconds: int | None
    transcription_status: str
    extraction_status: str
    transcription_model: str | None
    created_at: datetime


class EpisodeListResponse(BaseModel):
    episodes: list[EpisodeSummary]
    total: int


class EpisodeDetail(EpisodeSummary):
    description: str | None
    audio_url: str | None
    video_url: str | None
    thumbnail_url: str | None
    transcript_preview: str | None = Field(
        default=None, description="First 500 chars of transcript"
    )
    signal_counts: dict[str, int] = Field(default_factory=dict)


# ── Extraction trigger ────────────────────────────────────────────────────────


class ExtractionTriggerResponse(BaseModel):
    episode_id: UUID
    status: str = Field(..., description="'queued' when async, 'error' on validation fail")
    detail: str | None = None
