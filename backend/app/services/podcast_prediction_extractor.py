"""Extract resolvable speaker predictions from macro_views and trade_ideas.

Meta-prompt Step 3.2. A "resolvable prediction" has:
  - Clear directional call (bullish/bearish/long/short → up/down)
  - Target asset (a ticker or an asset class that maps to a real instrument)
  - Time horizon that maps to a concrete target_date

Vague statements ("things could go either way", "it depends", "structural")
are skipped. Conditional predictions are stored as-is with the condition
preserved in prediction_text — Phase 5 resolver will evaluate the condition.

Every extracted prediction lands in public.speaker_predictions with
resolution_status='open'. Phase 5 resolver reads market data (yfinance / FRED)
and flips the status to correct/incorrect/partially_correct.

Usage:
    extract_predictions(episode_id=None) → ExtractionReport
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta
from uuid import UUID

from app.db import get_cursor

logger = logging.getLogger(__name__)


# Map podcast_macro_views.direction → speaker_predictions.predicted_direction
_MACRO_DIR_TO_PRED = {
    "bullish": "up",
    "bearish": "down",
    "neutral": "flat",
    "mixed": "range",
}
# Map podcast_trade_ideas.direction → speaker_predictions.predicted_direction
_TRADE_DIR_TO_PRED = {
    "long": "up",
    "short": "down",
    "neutral": "flat",
    "spread": None,   # ambiguous — skip
    "hedge": None,    # ambiguous — skip
}

# Time-horizon midpoints (days) used to compute target_date from created_at.
# 'structural' has no concrete target and is skipped.
_HORIZON_DAYS = {
    "immediate": 7,
    "1-4_weeks": 21,
    "1-3_months": 60,
    "3-12_months": 180,
    "1y_plus": 540,
}

# Trade ideas have no time_horizon column — default to 60d (1-3 months) unless
# the description mentions an explicit window.
_TRADE_DEFAULT_DAYS = 60


@dataclass
class ExtractionReport:
    created: int = 0
    skipped_non_resolvable: int = 0
    skipped_already_exists: int = 0


def _horizon_to_target_date(created_at: datetime, horizon: str | None) -> datetime | None:
    if not horizon:
        return None
    days = _HORIZON_DAYS.get(horizon)
    if days is None:
        return None
    return created_at + timedelta(days=days)


def _already_extracted(
    episode_id: UUID, speaker_id: UUID | None, prediction_text: str
) -> bool:
    """Dedup on (episode_id, speaker_id, prediction_text[:200]). Stable across re-runs."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT 1 FROM public.speaker_predictions
            WHERE episode_id = %s
              AND speaker_id IS NOT DISTINCT FROM %s
              AND left(prediction_text, 200) = left(%s, 200)
            LIMIT 1
            """,
            (episode_id, speaker_id, prediction_text),
        )
        return cur.fetchone() is not None


def _insert_prediction(
    tenant_id: UUID | None,
    speaker_id: UUID,
    episode_id: UUID,
    prediction_text: str,
    predicted_direction: str,
    target_asset: str | None,
    target_date: datetime | None,
) -> None:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO public.speaker_predictions (
                tenant_id, speaker_id, episode_id,
                prediction_text, predicted_direction,
                target_asset, target_date, resolution_status
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, 'open')
            """,
            (
                tenant_id, speaker_id, episode_id,
                prediction_text[:500], predicted_direction,
                target_asset, target_date,
            ),
        )


def _pick_asset(tickers: list[str] | None, asset_classes: list[str] | None) -> str | None:
    if tickers:
        return tickers[0]
    if asset_classes:
        return asset_classes[0]
    return None


def extract_predictions(episode_id: UUID | None = None) -> ExtractionReport:
    """Scan macro_views + trade_ideas and create resolvable predictions."""
    report = ExtractionReport()

    where_episode = "AND episode_id = %s" if episode_id else ""
    params: list = []
    if episode_id:
        params.append(episode_id)

    # ── Macro views ──────────────────────────────────────────────────────
    with get_cursor() as cur:
        cur.execute(
            f"""
            SELECT view_id, tenant_id, speaker_id, episode_id, statement, direction,
                   time_horizon, tickers, asset_classes, created_at
            FROM public.podcast_macro_views
            WHERE direction IS NOT NULL
              {where_episode}
            """,
            params,
        )
        macro_rows = cur.fetchall()

    for r in macro_rows:
        if r["speaker_id"] is None:
            report.skipped_non_resolvable += 1
            continue
        predicted_dir = _MACRO_DIR_TO_PRED.get(r["direction"])
        if predicted_dir is None:
            report.skipped_non_resolvable += 1
            continue
        target_asset = _pick_asset(r["tickers"], r["asset_classes"])
        if target_asset is None:
            report.skipped_non_resolvable += 1
            continue
        target_date = _horizon_to_target_date(r["created_at"], r["time_horizon"])
        if target_date is None:
            # Structural / no horizon → skip
            report.skipped_non_resolvable += 1
            continue
        if _already_extracted(r["episode_id"], r["speaker_id"], r["statement"] or ""):
            report.skipped_already_exists += 1
            continue
        _insert_prediction(
            tenant_id=r["tenant_id"],
            speaker_id=r["speaker_id"],
            episode_id=r["episode_id"],
            prediction_text=r["statement"] or "",
            predicted_direction=predicted_dir,
            target_asset=target_asset,
            target_date=target_date,
        )
        report.created += 1

    # ── Trade ideas ──────────────────────────────────────────────────────
    with get_cursor() as cur:
        cur.execute(
            f"""
            SELECT idea_id, tenant_id, speaker_id, episode_id, description, direction,
                   tickers, asset_classes, conviction, created_at
            FROM public.podcast_trade_ideas
            WHERE direction IS NOT NULL
              AND conviction IN ('high', 'medium')
              {where_episode}
            """,
            params,
        )
        trade_rows = cur.fetchall()

    for r in trade_rows:
        if r["speaker_id"] is None:
            report.skipped_non_resolvable += 1
            continue
        predicted_dir = _TRADE_DIR_TO_PRED.get(r["direction"])
        if predicted_dir is None:
            report.skipped_non_resolvable += 1
            continue
        target_asset = _pick_asset(r["tickers"], r["asset_classes"])
        if target_asset is None:
            report.skipped_non_resolvable += 1
            continue
        target_date = r["created_at"] + timedelta(days=_TRADE_DEFAULT_DAYS)
        if _already_extracted(r["episode_id"], r["speaker_id"], r["description"] or ""):
            report.skipped_already_exists += 1
            continue
        _insert_prediction(
            tenant_id=r["tenant_id"],
            speaker_id=r["speaker_id"],
            episode_id=r["episode_id"],
            prediction_text=r["description"] or "",
            predicted_direction=predicted_dir,
            target_asset=target_asset,
            target_date=target_date,
        )
        report.created += 1

    logger.info(
        "predictions: created=%d skipped_non_resolvable=%d skipped_exists=%d",
        report.created, report.skipped_non_resolvable, report.skipped_already_exists,
    )
    return report


__all__ = ["ExtractionReport", "extract_predictions"]
