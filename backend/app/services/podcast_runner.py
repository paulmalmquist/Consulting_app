"""Async extraction runner — the glue between POST /extract and the pipeline.

Single entrypoint:
    run_extraction_in_background(episode_id, tenant_id)

Swallows all exceptions and writes the failure reason onto the episode's
metadata.last_extraction_error field + sets extraction_status='failed' so
the UI/ops layer can see what went wrong without the runner killing the
FastAPI worker.

Phase 4 will replace the FastAPI BackgroundTasks wiring with a scheduled
task (pod-extraction) that polls for pending episodes. The signature here
is intentionally compatible with both.
"""

from __future__ import annotations

import json
import logging
from uuid import UUID

from app.db import get_cursor
from app.services.podcast_extraction import ExtractionResult, extract_episode

logger = logging.getLogger(__name__)


def run_extraction_in_background(
    episode_id: UUID,
    tenant_id: UUID | None = None,
) -> ExtractionResult | None:
    """Run the extraction pipeline and persist failure state on error.

    Returns the ExtractionResult on success/partial, None on hard failure
    (episode not found, empty transcript, LLM config missing, etc).
    """
    try:
        result = extract_episode(episode_id=episode_id, tenant_id=tenant_id)
    except ValueError as e:
        logger.warning("podcast extraction validation failed for %s: %s", episode_id, e)
        _mark_failed(episode_id, str(e))
        return None
    except Exception as e:  # noqa: BLE001
        logger.exception("podcast extraction crashed for %s", episode_id)
        _mark_failed(episode_id, f"{type(e).__name__}: {e}")
        return None

    logger.info(
        "podcast extraction complete for %s: macro=%d trade=%d narr=%d analog=%d unc=%d err=%d",
        episode_id,
        result.macro_views_written,
        result.trade_ideas_written,
        result.narratives_written,
        result.analogs_written,
        result.uncertainty_markers_written,
        len(result.errors),
    )
    return result


def _mark_failed(episode_id: UUID, reason: str) -> None:
    with get_cursor() as cur:
        cur.execute(
            """
            UPDATE public.podcast_episodes
            SET extraction_status = 'failed',
                metadata = COALESCE(metadata, '{}'::jsonb) || %s::jsonb,
                updated_at = now()
            WHERE episode_id = %s
            """,
            (json.dumps({"last_extraction_error": reason}), episode_id),
        )


__all__ = ["run_extraction_in_background"]
