"""Podcast Intelligence API routes.

Endpoints:
    POST /api/v1/podcast/ingest/youtube       — single YouTube video
    POST /api/v1/podcast/ingest/rss           — RSS feed (one-shot parse)
    POST /api/v1/podcast/ingest/transcript    — pasted transcript
    GET  /api/v1/podcast/episodes             — list with filters
    GET  /api/v1/podcast/episodes/{id}        — detail with signal counts
    POST /api/v1/podcast/episodes/{id}/extract — trigger extraction (wired in commit 6)

Audio upload (multipart) is intentionally deferred until Phase 2 — local
file storage semantics need to be resolved alongside the hosted-Whisper
infra decision.
"""

from __future__ import annotations

import logging
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query

from app.db import get_cursor
from app.schemas.podcast_intelligence import (
    EpisodeDetail,
    EpisodeListResponse,
    EpisodeSummary,
    ExtractionTriggerResponse,
    IngestEpisodeResponse,
    IngestRssRequest,
    IngestRssResponse,
    IngestTranscriptRequest,
    IngestYoutubeRequest,
)
from app.services.podcast_ingest import (
    ingest_rss,
    ingest_transcript,
    ingest_youtube,
)
from app.services.podcast_runner import run_extraction_in_background

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/podcast", tags=["podcast-intelligence"])


# ── Ingest ────────────────────────────────────────────────────────────────────


@router.post("/ingest/youtube", response_model=IngestEpisodeResponse)
def post_ingest_youtube(req: IngestYoutubeRequest) -> IngestEpisodeResponse:
    try:
        result = ingest_youtube(req.url)
    except RuntimeError as e:
        # Missing yt-dlp — surface clearly to the caller.
        raise HTTPException(status_code=503, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
    return IngestEpisodeResponse(
        episode_id=result.episode_id,
        source_id=result.source_id,
        title=result.title,
        transcription_status=result.transcription_status,
        transcription_model=result.transcription_model,
    )


@router.post("/ingest/rss", response_model=IngestRssResponse)
def post_ingest_rss(req: IngestRssRequest) -> IngestRssResponse:
    try:
        result = ingest_rss(req.feed_url, limit=req.limit)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    return IngestRssResponse(
        source_id=result.source_id,
        episodes_found=result.episodes_found,
        episode_ids=result.episode_ids,
    )


@router.post("/ingest/transcript", response_model=IngestEpisodeResponse)
def post_ingest_transcript(req: IngestTranscriptRequest) -> IngestEpisodeResponse:
    try:
        result = ingest_transcript(
            title=req.title,
            text=req.text,
            source_name=req.source_name,
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
    return IngestEpisodeResponse(
        episode_id=result.episode_id,
        source_id=result.source_id,
        title=result.title,
        transcription_status=result.transcription_status,
        transcription_model=result.transcription_model,
    )


# ── Episodes ──────────────────────────────────────────────────────────────────


@router.get("/episodes", response_model=EpisodeListResponse)
def list_episodes(
    source_id: UUID | None = Query(default=None),
    extraction_status: str | None = Query(default=None),
    transcription_status: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
) -> EpisodeListResponse:
    filters: list[str] = []
    params: list[object] = []
    if source_id is not None:
        filters.append("source_id = %s")
        params.append(source_id)
    if extraction_status:
        filters.append("extraction_status = %s")
        params.append(extraction_status)
    if transcription_status:
        filters.append("transcription_status = %s")
        params.append(transcription_status)
    where = f"WHERE {' AND '.join(filters)}" if filters else ""

    with get_cursor() as cur:
        cur.execute(f"SELECT COUNT(*) AS c FROM public.podcast_episodes {where}", params)
        total = cur.fetchone()["c"]
        cur.execute(
            f"""
            SELECT episode_id, source_id, title, published_at, duration_seconds,
                   transcription_status, extraction_status, transcription_model, created_at
            FROM public.podcast_episodes
            {where}
            ORDER BY created_at DESC
            LIMIT %s OFFSET %s
            """,
            [*params, limit, offset],
        )
        rows = cur.fetchall()

    return EpisodeListResponse(
        episodes=[EpisodeSummary(**row) for row in rows],
        total=total,
    )


@router.get("/episodes/{episode_id}", response_model=EpisodeDetail)
def get_episode(episode_id: UUID) -> EpisodeDetail:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT episode_id, source_id, title, description, published_at,
                   duration_seconds, audio_url, video_url, thumbnail_url,
                   transcription_status, extraction_status, transcription_model,
                   created_at, transcript_raw
            FROM public.podcast_episodes
            WHERE episode_id = %s
            """,
            (episode_id,),
        )
        row = cur.fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="episode not found")

        signal_counts = {}
        for table, key in [
            ("podcast_macro_views", "macro_views"),
            ("podcast_trade_ideas", "trade_ideas"),
            ("podcast_narratives", "narratives"),
            ("podcast_analogs", "analogs"),
            ("podcast_uncertainty_markers", "uncertainty_markers"),
        ]:
            cur.execute(
                f"SELECT COUNT(*) AS c FROM public.{table} WHERE episode_id = %s",
                (episode_id,),
            )
            signal_counts[key] = cur.fetchone()["c"]

    transcript_preview = None
    raw = row.pop("transcript_raw", None)
    if raw:
        transcript_preview = raw[:500]

    return EpisodeDetail(
        **row,
        transcript_preview=transcript_preview,
        signal_counts=signal_counts,
    )


# ── Extraction trigger (stub until commit 6) ──────────────────────────────────


@router.post(
    "/episodes/{episode_id}/extract", response_model=ExtractionTriggerResponse
)
def trigger_extraction(
    episode_id: UUID,
    background_tasks: BackgroundTasks,
) -> ExtractionTriggerResponse:
    """Validate the episode and queue the 4-pass extraction pipeline.

    Returns immediately with status='queued'. The runner swallows exceptions
    and sets extraction_status='failed' on the episode if the pipeline
    crashes — callers poll GET /episodes/{id} for final state.
    """
    with get_cursor() as cur:
        cur.execute(
            "SELECT transcription_status, extraction_status FROM public.podcast_episodes WHERE episode_id = %s",
            (episode_id,),
        )
        row = cur.fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="episode not found")
    if row["transcription_status"] != "completed":
        raise HTTPException(
            status_code=409,
            detail=f"transcription_status={row['transcription_status']}, must be 'completed'",
        )
    if row["extraction_status"] == "processing":
        raise HTTPException(
            status_code=409, detail="extraction already in progress"
        )

    background_tasks.add_task(run_extraction_in_background, episode_id, None)
    return ExtractionTriggerResponse(
        episode_id=episode_id,
        status="queued",
        detail="Extraction pipeline dispatched as background task.",
    )
