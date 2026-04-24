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


# ── Review-surface aggregates (for the trading-platform podcast-intel page) ───


@router.get("/overview")
def get_overview() -> dict:
    """One-call stat tiles for the review surface."""
    with get_cursor() as cur:
        cur.execute("SELECT COUNT(*) c FROM public.podcast_episodes")
        episodes = cur.fetchone()["c"]
        cur.execute("SELECT COUNT(*) c FROM public.podcast_macro_views")
        macro_views = cur.fetchone()["c"]
        cur.execute("SELECT COUNT(*) c FROM public.podcast_trade_ideas")
        trade_ideas = cur.fetchone()["c"]
        cur.execute("SELECT COUNT(*) c FROM public.podcast_narratives")
        narratives = cur.fetchone()["c"]
        cur.execute("SELECT COUNT(*) c FROM public.podcast_analogs")
        analogs = cur.fetchone()["c"]
        cur.execute("SELECT COUNT(*) c FROM public.podcast_uncertainty_markers")
        uncertainty = cur.fetchone()["c"]
        cur.execute(
            "SELECT COUNT(*) c FROM public.podcast_speakers "
            "WHERE normalized_name NOT LIKE '\\_\\_unattributed%%'"
        )
        speakers = cur.fetchone()["c"]
        cur.execute(
            "SELECT COUNT(*) c FROM public.podcast_narrative_velocity "
            "WHERE jsonb_array_length(metadata->'episode_ids') >= 2"
        )
        cross_ep = cur.fetchone()["c"]
        cur.execute(
            "SELECT COUNT(*) c FROM public.speaker_predictions "
            "WHERE resolution_status='open'"
        )
        predictions = cur.fetchone()["c"]
        cur.execute(
            "SELECT COUNT(*) c FROM public.trading_signals WHERE source='podcast'"
        )
        promoted = cur.fetchone()["c"]
    return {
        "episodes": episodes,
        "macro_views": macro_views,
        "trade_ideas": trade_ideas,
        "narratives": narratives,
        "analogs": analogs,
        "uncertainty_markers": uncertainty,
        "named_speakers": speakers,
        "cross_episode_narratives": cross_ep,
        "open_predictions": predictions,
        "promoted_signals": promoted,
    }


@router.get("/narrative-velocity")
def get_narrative_velocity(cross_episode_only: bool = True) -> dict:
    with get_cursor() as cur:
        where = "WHERE jsonb_array_length(metadata->'episode_ids') >= 2" if cross_episode_only else ""
        cur.execute(
            f"""
            SELECT velocity_id, narrative_label, mention_count, unique_speakers,
                   conviction_avg, crowding_risk, window_start, window_end, metadata
            FROM public.podcast_narrative_velocity
            {where}
            ORDER BY
                CASE crowding_risk
                    WHEN 'extreme' THEN 1 WHEN 'high' THEN 2
                    WHEN 'elevated' THEN 3 WHEN 'moderate' THEN 4
                    ELSE 5 END,
                mention_count DESC
            """
        )
        rows = cur.fetchall()
    return {"count": len(rows), "narratives": rows}


@router.get("/speakers")
def get_speakers(limit: int = 50) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT s.speaker_id, s.name, s.normalized_name, s.credibility_score,
                   s.bias_profile, s.organization,
                   COALESCE(mv_c.c, 0) AS macro_views,
                   COALESCE(ti_c.c, 0) AS trade_ideas,
                   COALESCE(an_c.c, 0) AS analogs,
                   COALESCE(pred_c.c, 0) AS predictions_open,
                   COALESCE(es_c.c, 0) AS episode_count
            FROM public.podcast_speakers s
            LEFT JOIN (SELECT speaker_id, COUNT(*) c FROM public.podcast_macro_views GROUP BY speaker_id) mv_c ON mv_c.speaker_id = s.speaker_id
            LEFT JOIN (SELECT speaker_id, COUNT(*) c FROM public.podcast_trade_ideas GROUP BY speaker_id) ti_c ON ti_c.speaker_id = s.speaker_id
            LEFT JOIN (SELECT speaker_id, COUNT(*) c FROM public.podcast_analogs GROUP BY speaker_id) an_c ON an_c.speaker_id = s.speaker_id
            LEFT JOIN (SELECT speaker_id, COUNT(*) c FROM public.speaker_predictions WHERE resolution_status='open' GROUP BY speaker_id) pred_c ON pred_c.speaker_id = s.speaker_id
            LEFT JOIN (SELECT speaker_id, COUNT(DISTINCT episode_id) c FROM public.podcast_episode_speakers GROUP BY speaker_id) es_c ON es_c.speaker_id = s.speaker_id
            WHERE s.normalized_name NOT LIKE '\\_\\_unattributed%%'
              AND (COALESCE(mv_c.c,0) + COALESCE(ti_c.c,0) + COALESCE(an_c.c,0)) > 0
            ORDER BY (COALESCE(mv_c.c, 0) + COALESCE(ti_c.c, 0) + COALESCE(an_c.c, 0)) DESC
            LIMIT %s
            """,
            (limit,),
        )
        rows = cur.fetchall()
    return {"count": len(rows), "speakers": rows}


@router.get("/predictions")
def get_predictions(status: str = "open", limit: int = 100) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT p.prediction_id, p.prediction_text, p.predicted_direction,
                   p.target_asset, p.target_date, p.resolution_status,
                   p.brier_score, p.actual_value, p.resolution_date,
                   s.name AS speaker_name, s.credibility_score,
                   e.title AS episode_title, e.episode_id, p.created_at
            FROM public.speaker_predictions p
            LEFT JOIN public.podcast_speakers s ON s.speaker_id = p.speaker_id
            LEFT JOIN public.podcast_episodes e ON e.episode_id = p.episode_id
            WHERE p.resolution_status = %s
            ORDER BY p.target_date ASC
            LIMIT %s
            """,
            (status, limit),
        )
        rows = cur.fetchall()
    return {"count": len(rows), "predictions": rows}


@router.get("/promoted-signals")
def get_promoted_signals(limit: int = 100) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT signal_id, name, category, direction, strength, asset_class,
                   tickers, evidence, status, created_at
            FROM public.trading_signals
            WHERE source = 'podcast'
            ORDER BY strength DESC, created_at DESC
            LIMIT %s
            """,
            (limit,),
        )
        rows = cur.fetchall()
    return {"count": len(rows), "signals": rows}


@router.get("/episodes/{episode_id}/signals")
def get_episode_signals(episode_id: UUID) -> dict:
    """Full signal payload for a single episode — drill-down for the review page."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT episode_id, title, description, published_at, duration_seconds,
                   audio_url, video_url, thumbnail_url, transcription_model,
                   transcription_status, extraction_status, transcript_raw,
                   metadata, created_at
            FROM public.podcast_episodes WHERE episode_id = %s
            """,
            (episode_id,),
        )
        episode = cur.fetchone()
        if not episode:
            raise HTTPException(status_code=404, detail="episode not found")

        cur.execute(
            """
            SELECT mv.*, s.name AS speaker_name
            FROM public.podcast_macro_views mv
            LEFT JOIN public.podcast_speakers s ON s.speaker_id = mv.speaker_id
            WHERE mv.episode_id = %s ORDER BY mv.confidence_implied DESC NULLS LAST, mv.chunk_index
            """,
            (episode_id,),
        )
        macro_views = cur.fetchall()
        cur.execute(
            """
            SELECT ti.*, s.name AS speaker_name
            FROM public.podcast_trade_ideas ti
            LEFT JOIN public.podcast_speakers s ON s.speaker_id = ti.speaker_id
            WHERE ti.episode_id = %s ORDER BY ti.chunk_index
            """,
            (episode_id,),
        )
        trade_ideas = cur.fetchall()
        cur.execute(
            """
            SELECT * FROM public.podcast_narratives WHERE episode_id = %s
            ORDER BY conviction DESC NULLS LAST, novelty_score DESC NULLS LAST
            """,
            (episode_id,),
        )
        narratives = cur.fetchall()
        cur.execute(
            """
            SELECT an.*, s.name AS speaker_name
            FROM public.podcast_analogs an
            LEFT JOIN public.podcast_speakers s ON s.speaker_id = an.speaker_id
            WHERE an.episode_id = %s ORDER BY an.chunk_index
            """,
            (episode_id,),
        )
        analogs = cur.fetchall()
        cur.execute(
            """
            SELECT um.*, s.name AS speaker_name
            FROM public.podcast_uncertainty_markers um
            LEFT JOIN public.podcast_speakers s ON s.speaker_id = um.speaker_id
            WHERE um.episode_id = %s ORDER BY um.chunk_index LIMIT 50
            """,
            (episode_id,),
        )
        uncertainty = cur.fetchall()
        cur.execute(
            "SELECT * FROM public.podcast_adversarial_scores WHERE episode_id = %s",
            (episode_id,),
        )
        adversarial = cur.fetchone()
        cur.execute(
            """
            SELECT es.*, s.name, s.credibility_score
            FROM public.podcast_episode_speakers es
            JOIN public.podcast_speakers s ON s.speaker_id = es.speaker_id
            WHERE es.episode_id = %s AND s.normalized_name NOT LIKE '\\_\\_unattributed%%'
            """,
            (episode_id,),
        )
        speakers = cur.fetchall()

    transcript_preview = (episode.get("transcript_raw") or "")[:5000]
    synthesis = (episode.get("metadata") or {}).get("synthesis")
    episode.pop("transcript_raw", None)
    return {
        "episode": episode,
        "transcript_preview": transcript_preview,
        "synthesis": synthesis,
        "speakers": speakers,
        "macro_views": macro_views,
        "trade_ideas": trade_ideas,
        "narratives": narratives,
        "analogs": analogs,
        "uncertainty_markers": uncertainty,
        "adversarial": adversarial,
    }


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
