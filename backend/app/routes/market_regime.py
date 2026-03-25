"""Market Regime API Routes.

Endpoints:
  GET  /api/v1/market/regime/latest    — most recent regime snapshot
  GET  /api/v1/market/regime/history   — last N days of snapshots
  POST /api/v1/market/regime/compute   — trigger a new computation (admin/scheduled)
"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException, Query

from app.services.market_regime_engine import (
    RegimeSnapshot,
    compute_regime_snapshot,
    get_latest_regime,
    list_regime_history,
)

router = APIRouter(prefix="/api/v1/market/regime", tags=["market-regime"])


def _snapshot_to_dict(s: RegimeSnapshot) -> dict:
    return {
        "snapshot_id": s.snapshot_id,
        "calculated_at": s.calculated_at,
        "regime_label": s.regime_label,
        "confidence": s.confidence,
        "signal_breakdown": s.signal_breakdown,
        "cross_vertical_implications": s.cross_vertical_implications,
        "source_metrics": s.source_metrics,
    }


@router.get("/latest")
def get_latest(
    tenant_id: UUID | None = Query(default=None),
):
    """Return the most recent regime snapshot.

    Falls back to a neutral 'transitional' stub if no snapshots have been
    computed yet (first-run scenario).
    """
    try:
        snapshot = get_latest_regime(tenant_id=tenant_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to fetch regime: {exc}") from exc

    if snapshot is None:
        # No snapshot yet — return a neutral stub so the frontend degrades gracefully
        return {
            "snapshot_id": None,
            "calculated_at": None,
            "regime_label": "transitional",
            "confidence": 0.0,
            "signal_breakdown": {},
            "cross_vertical_implications": {
                "repe": "Regime not yet computed. Run the fin-research-sweep task.",
                "credit": "Regime not yet computed.",
                "pds": "Regime not yet computed.",
            },
            "source_metrics": {},
        }

    return _snapshot_to_dict(snapshot)


@router.get("/history")
def get_history(
    days: int = Query(default=90, ge=1, le=365),
    tenant_id: UUID | None = Query(default=None),
):
    """Return up to `days` worth of daily regime snapshots, newest first."""
    try:
        snapshots = list_regime_history(tenant_id=tenant_id, days=days)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to fetch history: {exc}") from exc

    return {"snapshots": [_snapshot_to_dict(s) for s in snapshots]}


@router.post("/compute")
def trigger_compute(
    tenant_id: UUID | None = Query(default=None),
):
    """Trigger a new regime computation and persist the snapshot.

    Intended for scheduled tasks and admin use — not exposed to end users directly.
    """
    try:
        snapshot = compute_regime_snapshot(tenant_id=tenant_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Regime computation failed: {exc}") from exc

    return {"status": "computed", "snapshot": _snapshot_to_dict(snapshot)}
