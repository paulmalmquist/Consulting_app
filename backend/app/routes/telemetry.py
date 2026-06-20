"""FastAPI routes for the Telemetry Platform serving slice (Phase 3).

Lean operational contract over the tel_* tables. No databricks/mlflow/pyspark imports — the backend
serves promoted-model metadata + per-prediction receipts; heavy ML lives in Databricks (Phase 2).

Paths follow the repo /api/{domain} convention. Final paths:
    GET  /api/telemetry/health
    POST /api/telemetry/score
    GET  /api/telemetry/runs
    GET  /api/telemetry/run/{run_id}
    GET  /api/telemetry/monitoring
"""
from __future__ import annotations

from uuid import UUID

import psycopg
from fastapi import APIRouter, Header, HTTPException, Query

from app.observability.logger import emit_log
from app.schemas.telemetry import (
    MonitoringResponse, RunDetailOut, ScoreRequest, ScoreResponse, StreamSourceRequest, TestRunOut,
)
from app.schemas.telemetry_metadata import TelemetryMetadataGraph
from app.services import telemetry_serving as svc

router = APIRouter(prefix="/api/telemetry", tags=["telemetry"])


def _to_http(exc: Exception) -> HTTPException:
    if isinstance(exc, (psycopg.errors.UndefinedTable, psycopg.errors.UndefinedColumn)):
        return HTTPException(503, {"error_code": "SCHEMA_NOT_MIGRATED",
                                   "message": "Telemetry serving schema not migrated."})
    if isinstance(exc, LookupError):
        return HTTPException(404, {"error_code": "NOT_FOUND", "message": str(exc)})
    if isinstance(exc, ValueError):
        return HTTPException(400, {"error_code": "VALIDATION_ERROR", "message": str(exc)})
    return HTTPException(500, {"error_code": "INTERNAL_ERROR", "message": str(exc)})


@router.get("/health")
def health():
    try:
        return svc.health()
    except Exception as exc:  # noqa: BLE001
        emit_log(level="error", service="telemetry", action="health_failed", message=str(exc), error=exc)
        raise _to_http(exc)


@router.post("/score", response_model=ScoreResponse)
def score(req: ScoreRequest):
    try:
        result = svc.score_window(
            env_id=req.env_id, business_id=req.business_id, run_key=req.run_key,
            channel_name=req.channel_name, window=[r.model_dump() for r in req.window],
        )
        return ScoreResponse(**result)
    except Exception as exc:  # noqa: BLE001
        emit_log(level="error", service="telemetry", action="score_failed", message=str(exc), error=exc)
        raise _to_http(exc)


@router.get("/runs", response_model=list[TestRunOut])
def runs(env_id: str = Query(...), business_id: UUID = Query(...)):
    try:
        return svc.list_runs(env_id=env_id, business_id=business_id)
    except Exception as exc:  # noqa: BLE001
        raise _to_http(exc)


@router.get("/run/{run_id}", response_model=RunDetailOut)
def run_detail(run_id: UUID, env_id: str = Query(...), business_id: UUID = Query(...)):
    try:
        return RunDetailOut(**svc.get_run(env_id=env_id, business_id=business_id, run_id=run_id))
    except Exception as exc:  # noqa: BLE001
        raise _to_http(exc)


@router.get("/monitoring", response_model=MonitoringResponse)
def monitoring(env_id: str = Query(...), business_id: UUID = Query(...)):
    try:
        return MonitoringResponse(**svc.monitoring(env_id=env_id, business_id=business_id))
    except Exception as exc:  # noqa: BLE001
        raise _to_http(exc)


@router.get("/replay")
def replay():
    """Deterministic replay feed — precomputed real champion outputs (no DB/Databricks at call time)."""
    try:
        return svc.replay_feed()
    except Exception as exc:  # noqa: BLE001
        emit_log(level="error", service="telemetry", action="replay_failed", message=str(exc), error=exc)
        raise _to_http(exc)


@router.get("/model-performance")
def model_performance(env_id: str = Query(...), business_id: UUID = Query(...)):
    """Promoted-model metadata + exact metrics from tel_model_runs (no hardcoded numbers)."""
    try:
        return svc.model_performance(env_id=env_id, business_id=business_id)
    except Exception as exc:  # noqa: BLE001
        raise _to_http(exc)


@router.get("/summary")
def summary(env_id: str = Query(...), business_id: UUID = Query(...)):
    """Single KPI + serving-inventory contract for the Overview (counts + headline metrics)."""
    try:
        return svc.summary(env_id=env_id, business_id=business_id)
    except Exception as exc:  # noqa: BLE001
        raise _to_http(exc)


@router.get("/metadata/graph", response_model=TelemetryMetadataGraph)
def metadata_graph(
    env_id: str = Query(..., min_length=1),
    business_id: UUID = Query(...),
):
    """Reviewed telemetry lineage plus optional, allowlisted serving metadata."""
    from app.services import telemetry_metadata as metadata_svc

    try:
        return metadata_svc.get_metadata_graph(env_id=env_id, business_id=business_id)
    except metadata_svc.MetadataCatalogError:
        emit_log(
            level="error",
            service="telemetry",
            action="metadata_catalog_invalid",
            message="Committed telemetry metadata catalog failed validation.",
        )
        raise HTTPException(
            500,
            {
                "error_code": "INVALID_METADATA_CATALOG",
                "message": "Telemetry metadata catalog failed validation.",
            },
        )
    except Exception as exc:  # noqa: BLE001
        raise _to_http(exc)


@router.get("/fused-vector-info")
def fused_vector_info(env_id: str = Query(...), business_id: UUID = Query(...)):
    """256-d fused state-vector summary (dim, channels, features, alignment caveat). No raw vectors."""
    try:
        return svc.fused_vector_info(env_id=env_id, business_id=business_id)
    except Exception as exc:  # noqa: BLE001
        raise _to_http(exc)


# ── RS Demo: Model Registry console (DISPLAY-ONLY — no mutation routes exist) ──
@router.get("/registry")
def registry(env_id: str = Query(...), business_id: UUID = Query(...)):
    """Registry console read: all tel_model_runs rows (full metrics/gate jsonb incl. the Track A
    honest_gate), real PSI drift history, derived lifecycle timeline. Promotion is an alias update via
    the governed Databricks flow — this API has no POST/PUT/DELETE on purpose."""
    from app.services import telemetry_registry as registry_svc
    try:
        return registry_svc.registry_console(env_id=env_id, business_id=business_id)
    except Exception as exc:  # noqa: BLE001
        raise _to_http(exc)


# ── RS Demo: Factory & NCR Intelligence (display-only mirror of the Databricks pipeline) ──
@router.get("/ncr")
def ncr(env_id: str = Query(...), business_id: UUID = Query(...)):
    """Factory NCR intelligence read: real UMAP/HDBSCAN points + cluster summaries, model-derived
    pareto, and the walk-forward backlog forecast with its backtest metrics. Fail-closed
    (data_not_ingested) when the mirror has not been applied."""
    from app.services import telemetry_factory as factory_svc
    try:
        return factory_svc.ncr_intelligence(env_id=env_id, business_id=business_id)
    except Exception as exc:  # noqa: BLE001
        raise _to_http(exc)


# ── RS Demo: live streaming slice ──────────────────────────────────────────────
@router.get("/stream/live")
def stream_live(env_id: str = Query(...), business_id: UUID = Query(...),
                channels: str | None = Query(default=None)):
    """Live stream read: worker ring buffer (silver tail fallback), server_ts for the latency
    overlay, pipeline status (fail-closed STALE), and recent live model events."""
    from app.services import telemetry_stream_etl as stream_svc
    try:
        chan_list = [c.strip() for c in channels.split(",") if c.strip()] if channels else None
        return stream_svc.stream_live(env_id=env_id, business_id=business_id, channels=chan_list)
    except Exception as exc:  # noqa: BLE001
        emit_log(level="error", service="telemetry", action="stream_live_failed",
                 message=str(exc), error=exc)
        raise _to_http(exc)


@router.get("/stream/health")
def stream_health(env_id: str = Query(...), business_id: UUID = Query(...)):
    """Stream health: per-channel freshness, ingest lag p50/p95, rows/min, DQ assertions,
    pipeline status rows, watermark ages."""
    from app.services import telemetry_stream_etl as stream_svc
    try:
        return stream_svc.stream_health(env_id=env_id, business_id=business_id)
    except Exception as exc:  # noqa: BLE001
        raise _to_http(exc)


@router.post("/stream/source")
def stream_source(req: StreamSourceRequest, x_stream_admin_key: str | None = Header(default=None)):
    """Demo-day adapter switch (iss | capture | adsb). Fail-closed admin gate: requires the
    TELEMETRY_STREAM_ADMIN_KEY env var to be set AND matched — unset means always 403."""
    import os
    from app.services.telemetry_stream_ingest import get_stream_worker
    admin_key = os.getenv("TELEMETRY_STREAM_ADMIN_KEY", "")
    if not admin_key or x_stream_admin_key != admin_key:
        raise HTTPException(403, {"error_code": "FORBIDDEN",
                                  "message": "stream source switch requires the admin key"})
    worker = get_stream_worker()
    if worker is None:
        raise HTTPException(503, {"error_code": "WORKER_NOT_RUNNING",
                                  "message": "stream worker is not running on this instance"})
    try:
        return worker.switch_source(req.source)
    except Exception as exc:  # noqa: BLE001
        raise _to_http(exc)
