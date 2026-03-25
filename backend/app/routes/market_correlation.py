"""BTC-SPX Correlation API Routes.

Endpoints:
  GET  /api/v1/market/correlation/btc-spx/latest   — most recent correlation row
  GET  /api/v1/market/correlation/btc-spx           — historical series (up to 365 days)
  POST /api/v1/market/correlation/btc-spx/compute   — trigger recompute (admin/scheduled)
"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException, Query

from app.services.btc_spx_correlation_service import (
    BtcSpxCorrelationRow,
    compute_btc_spx_correlation,
    get_correlation_history,
    get_latest_correlation,
    _regime_signal_text,
)

router = APIRouter(prefix="/api/v1/market/correlation", tags=["market-correlation"])


def _row_to_dict(row: BtcSpxCorrelationRow) -> dict:
    return {
        "correlation_id": row.correlation_id,
        "calculated_date": row.calculated_date,
        "correlation_30d": row.correlation_30d,
        "btc_return_30d": row.btc_return_30d,
        "spx_return_30d": row.spx_return_30d,
        "zero_crossing": row.zero_crossing,
        "crossing_direction": row.crossing_direction,
        "data_points_used": row.data_points_used,
        "metadata": row.metadata,
    }


@router.get("/btc-spx/latest")
def get_btc_spx_latest(
    tenant_id: UUID | None = Query(default=None),
):
    """Return the most recent BTC-SPX 30-day rolling correlation.

    Falls back to a neutral stub when no rows exist yet (first-run scenario).
    """
    try:
        row = get_latest_correlation(tenant_id=tenant_id)
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch BTC-SPX correlation: {exc}",
        ) from exc

    if row is None:
        # No data yet — return a neutral stub so the frontend degrades gracefully
        return {
            "correlation_id": None,
            "calculated_date": None,
            "correlation_30d": 0.0,
            "btc_return_30d": None,
            "spx_return_30d": None,
            "zero_crossing": False,
            "crossing_direction": None,
            "data_points_used": 0,
            "metadata": {
                "regime_signal": "No data yet. Run the fin-btc-spx-correlation task.",
            },
        }

    return _row_to_dict(row)


@router.get("/btc-spx")
def get_btc_spx_history(
    days: int = Query(default=180, ge=1, le=365),
    tenant_id: UUID | None = Query(default=None),
):
    """Return a historical series of BTC-SPX 30-day rolling correlations.

    Args:
        days: Number of calendar days to look back (1–365, default 180).
        tenant_id: Optional tenant filter.

    Returns:
        JSON with 'series' array and summary fields.
    """
    try:
        history = get_correlation_history(tenant_id=tenant_id, days=days)
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch BTC-SPX correlation history: {exc}",
        ) from exc

    latest_correlation = history[0].correlation_30d if history else 0.0

    return {
        "series": [
            {
                "calculated_date": r.calculated_date,
                "correlation_30d": r.correlation_30d,
                "zero_crossing": r.zero_crossing,
                "crossing_direction": r.crossing_direction,
                "data_points_used": r.data_points_used,
            }
            for r in history
        ],
        "latest_correlation": latest_correlation,
        "regime_signal": _regime_signal_text(latest_correlation),
        "total_rows": len(history),
    }


@router.post("/btc-spx/compute")
def trigger_btc_spx_compute(
    tenant_id: UUID | None = Query(default=None),
):
    """Trigger a new BTC-SPX correlation computation.

    Intended for admin use and scheduled task invocations.
    Returns the newly computed row.
    """
    try:
        row = compute_btc_spx_correlation(tenant_id=tenant_id)
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"BTC-SPX correlation computation failed: {exc}",
        ) from exc

    return {
        "status": "computed",
        "row": _row_to_dict(row),
    }
