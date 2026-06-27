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

import os
from datetime import datetime, timezone
from uuid import UUID

import psycopg
from fastapi import APIRouter, Header, HTTPException, Query, Request
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.mcp.auth import McpContext
from app.mcp.registry import registry as mcp_registry
from app.mcp.tools.telemetry_tools import (
    SCOPE_DENIED_REASON, TELEMETRY_TOOL_NAMES, telemetry_scoped_call,
)
from app.observability.logger import emit_log
from app.schemas.telemetry import (
    MonitoringResponse, ReceiptEnvelope, RunDetailOut, ScoreRequest, ScoreResponse,
    StreamSourceRequest, TestRunOut,
)
from app.schemas.telemetry_metadata import TelemetryMetadataGraph
from app.services import telemetry_analyzer
from app.services import telemetry_receipts as receipts
from app.services import telemetry_serving as svc

router = APIRouter(prefix="/api/telemetry", tags=["telemetry"])


def _durable_sink_enabled() -> bool:
    return os.environ.get("STARGATE_DURABLE_SINK_ENABLED", "").strip().lower() in (
        "1", "true", "yes", "on")


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


@router.get("/findings")
def findings(env_id: str = Query(...), business_id: UUID = Query(...)):
    """Real telemetry findings for the Spike Inspector.

    Delegates to the telemetry analyzer — the single source of truth — which grounds findings in the
    already-seeded tel_* serving reads (monitoring / model_performance) with rule-based severity. This
    route adds NO numbers of its own and never fabricates: on any analyzer error it fails closed with
    a null_reason and an empty findings list. A provenance block makes the data source auditable.
    """
    def _provenance(rows_evaluated: int | None) -> dict:
        return {
            "surface": "spike_inspector",
            "mode": "real_backend",
            "source": "telemetry_analyzer → telemetry_serving.monitoring/model_performance",
            "tenant": env_id,
            "rows_evaluated": rows_evaluated,
            "last_refresh": datetime.now(timezone.utc).isoformat(),
            "fallback_used": False,
        }

    try:
        result = telemetry_analyzer.analyze(env_id, business_id)
        fnds = result.get("findings", [])
        by_severity = {"info": 0, "warning": 0, "critical": 0}
        for f in fnds:
            sev = f.get("severity")
            if sev in by_severity:
                by_severity[sev] += 1
        # rows_evaluated is the real prediction_count from monitoring; null (never faked) if absent.
        rows_evaluated: int | None = None
        try:
            mon = svc.monitoring(env_id=env_id, business_id=business_id)
            rows_evaluated = mon.get("prediction_count")
        except Exception:  # noqa: BLE001 — provenance is best-effort, never blocks the findings
            rows_evaluated = None
        return {
            "analyzer_type": result.get("analyzer_type", "telemetry"),
            "findings": fnds,
            "null_reasons": result.get("null_reasons", []),
            "by_severity": by_severity,
            "finding_count": len(fnds),
            "provenance": _provenance(rows_evaluated),
            "null_reason": None,
        }
    except Exception as exc:  # noqa: BLE001 — fail closed; never 500 with fabricated data
        emit_log(level="error", service="telemetry", action="findings_failed", message=str(exc), error=exc)
        return {
            "analyzer_type": "telemetry", "findings": [], "null_reasons": [],
            "by_severity": {"info": 0, "warning": 0, "critical": 0}, "finding_count": 0,
            "provenance": _provenance(None), "null_reason": "telemetry_findings_unavailable",
        }


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


# ── Model Workbench receipts (Part I.1) — receipt-driven, DB-free, fail-closed ─────────────────────
# The Workbench REPLAYS committed receipts produced offline by the GCP MLOps pipeline (Part II); it
# never triggers live compute. An absent receipt returns null_reason at HTTP 200 — never a 500, never a
# fabricated value. No env/business params: these are demo artifacts (the /replay precedent), not
# tenant-scoped DB reads.

@router.get("/workbench/experiments", response_model=ReceiptEnvelope)
def workbench_experiments():
    """MLflow/Vertex experiment runs + HPO board (experiment_runs receipt)."""
    try:
        return ReceiptEnvelope(**receipts.load_receipt("experiment_runs"))
    except Exception as exc:  # noqa: BLE001
        raise _to_http(exc)


@router.get("/workbench/feature-manifest", response_model=ReceiptEnvelope)
def workbench_feature_manifest():
    """Feature-set contract A/B/C with leakage notes (feature_manifest receipt)."""
    try:
        return ReceiptEnvelope(**receipts.load_receipt("feature_manifest"))
    except Exception as exc:  # noqa: BLE001
        raise _to_http(exc)


@router.get("/workbench/threshold-sweep", response_model=ReceiptEnvelope)
def workbench_threshold_sweep():
    """MAD_K sweep PR/ROC + confusion + operating point (threshold_sweep receipt)."""
    try:
        return ReceiptEnvelope(**receipts.load_receipt("threshold_sweep"))
    except Exception as exc:  # noqa: BLE001
        raise _to_http(exc)


@router.get("/workbench/error-review", response_model=ReceiptEnvelope)
def workbench_error_review():
    """FP/FN/borderline cases with feature attribution (error_review receipt)."""
    try:
        return ReceiptEnvelope(**receipts.load_receipt("error_review"))
    except Exception as exc:  # noqa: BLE001
        raise _to_http(exc)


@router.get("/workbench/promotion-review", response_model=ReceiptEnvelope)
def workbench_promotion_review():
    """Gate-by-gate promotion decision vs prior champion (promotion_review receipt)."""
    try:
        return ReceiptEnvelope(**receipts.load_receipt("promotion_review"))
    except Exception as exc:  # noqa: BLE001
        raise _to_http(exc)


@router.get("/workbench/parity", response_model=ReceiptEnvelope)
def workbench_parity():
    """GCP-side reproduction of the champion's honest metrics vs the deployed champion (parity receipt)."""
    try:
        return ReceiptEnvelope(**receipts.load_receipt("parity"))
    except Exception as exc:  # noqa: BLE001
        raise _to_http(exc)


@router.get("/workbench/drift", response_model=ReceiptEnvelope)
def workbench_drift():
    """Statistical drift trio (PSI/KS/Wasserstein) per feature (drift_feature_stats receipt; S11)."""
    try:
        return ReceiptEnvelope(**receipts.load_receipt("drift_features"))
    except Exception as exc:  # noqa: BLE001
        raise _to_http(exc)


@router.get("/workbench/embedding-projection", response_model=ReceiptEnvelope)
def workbench_embedding_projection():
    """2-D PCA/latent projection + reconstruction error (embedding_projection receipt; S11)."""
    try:
        return ReceiptEnvelope(**receipts.load_receipt("embedding_projection"))
    except Exception as exc:  # noqa: BLE001
        raise _to_http(exc)


@router.get("/workbench/factory-local-shap", response_model=ReceiptEnvelope)
def workbench_factory_local_shap():
    """Per-prediction SHAP for the factory tree models (factory_local_shap receipt; S11)."""
    try:
        return ReceiptEnvelope(**receipts.load_receipt("factory_local_shap"))
    except Exception as exc:  # noqa: BLE001
        raise _to_http(exc)


@router.get("/summary")
def summary(env_id: str = Query(...), business_id: UUID = Query(...)):
    """Single KPI + serving-inventory contract for the Overview (counts + headline metrics)."""
    try:
        return svc.summary(env_id=env_id, business_id=business_id)
    except Exception as exc:  # noqa: BLE001
        raise _to_http(exc)


@router.get("/stargate/provenance")
def stargate_provenance(
    env_id: str = Query(...),
    business_id: UUID = Query(...),
    topic: str = Query(...),
    partition: int = Query(...),
    offset: int = Query(...),
):
    """Durable Kafka-provenance lookup for the Stargate anomaly inspection drawer.

    The live drawer always has the SSE-carried (capture-mode synthetic) provenance; this route is the
    DURABLE, survives-reload proof read from tel_stream_kafka_rows. The sink that writes that table is
    T2 / cloud-only and default OFF, so this fails closed with TWO distinct, honest reasons the UI
    renders differently:
      - durable_sink_not_enabled : STARGATE_DURABLE_SINK_ENABLED is off (no rows are being written)
      - provenance_not_found     : sink on, but no row matches these Kafka coordinates
    """
    if not _durable_sink_enabled():
        return {"row": None, "null_reason": "durable_sink_not_enabled"}
    try:
        from app.db import get_telemetry_cursor
        from app.services import telemetry_stream_consumer as sink
        with get_telemetry_cursor() as cur:
            row = sink.get_kafka_row_by_coords(
                cur, env_id=env_id, business_id=business_id, topic=topic,
                partition=partition, offset=offset)
    except Exception as exc:  # noqa: BLE001
        raise _to_http(exc)
    if row is None:
        return JSONResponse(status_code=404, content={"row": None, "null_reason": "provenance_not_found"})
    return {"row": jsonable_encoder(row), "null_reason": None}


@router.get("/stargate/anomalies/tail")
def stargate_anomalies_tail(
    env_id: str = Query(...),
    business_id: UUID = Query(...),
    limit: int = Query(50, ge=1, le=200),
):
    """Recent DURABLE anomaly rows with provenance — the survives-reload feed for the drawer/ticker.
    Fails closed with durable_sink_not_enabled when the sink is off (no rows are being written)."""
    if not _durable_sink_enabled():
        return {"rows": [], "null_reason": "durable_sink_not_enabled"}
    try:
        from app.db import get_telemetry_cursor
        from app.services import telemetry_stream_consumer as sink
        with get_telemetry_cursor() as cur:
            rows = sink.tail_kafka_rows(
                cur, env_id=env_id, business_id=business_id, record_kind="anomaly", limit=limit)
    except Exception as exc:  # noqa: BLE001
        raise _to_http(exc)
    return {"rows": jsonable_encoder(rows), "null_reason": None}


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


# ---------------------------------------------------------------------------
# Data Engineering — one real read-only action that leaves an audit receipt
# (Phase 2D). "Profile metadata graph" reads the committed catalog + enrichment
# (no writes to telemetry data) and records ONE audit event. Run Autopsy reads
# these back via /data-engineering/receipts. This lives in the telemetry router,
# NOT in ADE core: it never touches automated_data_engineering.py or the ADE
# package. The only persistence is the audit event itself — nothing fabricated.
# ---------------------------------------------------------------------------

# Audit action namespace for telemetry Data Engineering receipts. The ADE /runs
# endpoint filters action == "mcp.tool_call", so these never collide with it.
_DE_ACTION_PREFIX = "ade.de."
_DE_PROFILE_ACTION = "ade.de.profile_metadata"
_DE_PROFILE_TOOL = "ade.profile_metadata_graph"


def _resolve_actor(request: Request) -> str:
    """Honest actor from the authenticated request; clear fallback if absent."""
    auth = getattr(request.state, "auth", None)
    actor = getattr(auth, "actor", None) if auth else None
    return actor or "telemetry-demo"


class ProfileMetadataResponse(BaseModel):
    receipt_id: str
    actor: str
    action: str
    tool_name: str
    permission_mode: str
    status: str
    input_summary: dict
    result_summary: dict
    created_at: str
    null_reason: str | None = None


@router.post("/data-engineering/profile-metadata", response_model=ProfileMetadataResponse)
def de_profile_metadata(
    request: Request,
    env_id: str = Query(..., min_length=1),
    business_id: UUID = Query(...),
):
    """Read-only: profile the telemetry metadata graph and write ONE real audit receipt.

    Counts nodes/edges, how many declare a grain, and the status breakdown. Writes no telemetry
    data — the sole side effect is the audit event, which Run Autopsy then surfaces.
    """
    from app.services import audit as audit_svc
    from app.services import telemetry_metadata as metadata_svc

    started = datetime.now(timezone.utc)
    actor = _resolve_actor(request)
    success = True
    error_message: str | None = None
    result_summary: dict = {}
    try:
        graph = metadata_svc.get_metadata_graph(env_id=env_id, business_id=business_id)
        nodes = graph.get("nodes", []) or []
        edges = graph.get("edges", []) or []
        with_grain = 0
        status_counts: dict[str, int] = {}
        for node in nodes:
            meta = node.get("metadata") if isinstance(node, dict) else None
            grain = meta.get("grain") if isinstance(meta, dict) else None
            if isinstance(grain, str) and grain.strip():
                with_grain += 1
            status = (node.get("status") if isinstance(node, dict) else None) or "unknown"
            status_counts[status] = status_counts.get(status, 0) + 1
        result_summary = {
            "nodes": len(nodes),
            "edges": len(edges),
            "with_grain": with_grain,
            "status_counts": status_counts,
            "graph_status": graph.get("status"),
        }
    except Exception as exc:  # noqa: BLE001 — record the failed attempt honestly, don't fabricate
        success = False
        error_message = str(exc)[:500]

    latency_ms = int((datetime.now(timezone.utc) - started).total_seconds() * 1000)
    receipt_id = audit_svc.record_event(
        actor=actor,
        action=_DE_PROFILE_ACTION,
        tool_name=_DE_PROFILE_TOOL,
        success=success,
        latency_ms=latency_ms,
        business_id=business_id,
        input_data={"env_id": env_id},
        output_data=result_summary,
        error_message=error_message,
    )
    return ProfileMetadataResponse(
        receipt_id=str(receipt_id),
        actor=actor,
        action=_DE_PROFILE_ACTION,
        tool_name=_DE_PROFILE_TOOL,
        permission_mode="read",
        status="success" if success else "failed",
        input_summary={"env_id": env_id},
        result_summary=result_summary,
        created_at=started.isoformat(),
        null_reason=error_message,
    )


class DeReceiptRow(BaseModel):
    tool_name: str
    action: str
    status: str
    permission_mode: str
    actor: str | None = None
    latency_ms: int | None = None
    created_at: str | None = None
    input_summary: dict
    result_summary: dict
    null_reason: str | None = None


class DeReceiptsResponse(BaseModel):
    runs: list[DeReceiptRow]
    null_reason: str | None = None


@router.get("/data-engineering/receipts", response_model=DeReceiptsResponse)
def de_receipts(env_id: str = Query(..., min_length=1), business_id: UUID = Query(...)):
    """Read the real audit receipts produced by telemetry Data Engineering actions (ade.de.*)."""
    from app.services import audit as audit_svc

    try:
        events = audit_svc.list_events(business_id=business_id, limit=100)
    except Exception:  # noqa: BLE001 — fail closed, never fabricate
        return DeReceiptsResponse(runs=[], null_reason="audit_read_unavailable")

    runs: list[DeReceiptRow] = []
    for e in events:
        action = e.get("action") or ""
        if not action.startswith(_DE_ACTION_PREFIX):
            continue
        created = e.get("created_at")
        created_iso = created.isoformat() if hasattr(created, "isoformat") else (created or None)
        runs.append(
            DeReceiptRow(
                tool_name=e.get("tool_name") or "—",
                action=action,
                status="success" if e.get("success") else "failed",
                permission_mode="read",
                actor=e.get("actor"),
                latency_ms=e.get("latency_ms"),
                created_at=created_iso,
                input_summary=e.get("input_redacted") or {},
                result_summary=e.get("output_redacted") or {},
                null_reason=e.get("error_message"),
            )
        )
    return DeReceiptsResponse(runs=runs, null_reason=None)


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


@router.post("/stream/control")
async def stream_control(request: Request):
    """Start (or restart) the live telemetry ingest worker + ETL loop in this
    process. Backs the Mission Control "Start stream" button: if the worker was
    never started (flag off at boot) or died, this brings it online on demand so
    fresh frames flow again — no redeploy needed. Idempotent: an already-running
    healthy worker is left in place and reported. Capture mode is the safe default
    (deterministic, no network), matching the demo proof path."""
    import asyncio

    from app.config import (
        TELEMETRY_ETL_INTERVAL_SECONDS,
        TELEMETRY_STREAM_BUSINESS_ID,
        TELEMETRY_STREAM_ENV_ID,
        TELEMETRY_STREAM_SOURCE,
    )
    from app.services.telemetry_stream_etl import run_etl_loop
    from app.services.telemetry_stream_ingest import (
        StreamWorker, get_stream_worker, set_stream_worker,
    )

    worker = get_stream_worker()
    app_state = request.app.state
    restarted = False

    # Tear down a stale/stopping worker and its tasks before re-creating.
    existing_task = getattr(app_state, "telemetry_stream_task", None)
    if worker is not None and (worker._stopping or (existing_task is not None and existing_task.done())):
        try:
            await worker.stop()
        except Exception:  # noqa: BLE001
            pass
        for attr in ("telemetry_stream_task", "telemetry_stream_etl_task"):
            t = getattr(app_state, attr, None)
            if t is not None and not t.done():
                t.cancel()
                try:
                    await t
                except BaseException:  # noqa: BLE001
                    pass
        worker = None
        restarted = True

    if worker is None:
        worker = StreamWorker(
            env_id=TELEMETRY_STREAM_ENV_ID,
            business_id=TELEMETRY_STREAM_BUSINESS_ID,
            source=TELEMETRY_STREAM_SOURCE,
        )
        set_stream_worker(worker)
        app_state.telemetry_stream_task = asyncio.create_task(worker.run())
        app_state.telemetry_stream_etl_task = asyncio.create_task(run_etl_loop(
            env_id=TELEMETRY_STREAM_ENV_ID,
            business_id=UUID(TELEMETRY_STREAM_BUSINESS_ID),
            interval_seconds=TELEMETRY_ETL_INTERVAL_SECONDS,
        ))
        emit_log(level="info", service="telemetry", action="stream_control_started",
                 message=f"stream worker started via control (source={worker.source})")
        return {"status": "restarted" if restarted else "started", "source": worker.source,
                "env_id": TELEMETRY_STREAM_ENV_ID}

    return {"status": "already_running", "source": worker.source,
            "env_id": TELEMETRY_STREAM_ENV_ID,
            "last_frame_at": worker.last_frame_at.isoformat() if worker.last_frame_at else None}


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


# ── MCP tool registry (telemetry, read-only) + denied-call demo ────────────────
class McpCheckRequest(BaseModel):
    """Request for the live telemetry MCP scope check (denied/allowed demo)."""
    model_config = {"extra": "forbid"}
    business_id: UUID = Field(description="Tenant business id")
    tool_name: str = Field(description="Tool to attempt (in-scope telemetry tool, or anything else)")
    input: dict | None = Field(default=None, description="Tool input payload")


@router.get("/mcp/tools")
def mcp_tools():
    """Honest view of the telemetry-environment MCP tools: the REAL registered ToolDefs (read-only),
    their permission scope + typed input fields, and the scope policy that denies (and audits) any
    out-of-scope tool call. No telemetry write tools exist."""
    try:
        tools = []
        for t in mcp_registry.list_by_module("telemetry"):
            m = t.manifest()
            tools.append({
                "name": t.name,
                "description": t.description,
                "permission": t.permission,
                "module": t.module,
                "tags": sorted(t.tags),
                "side_effect_class": m.get("side_effect_class"),
                "permission_required": m.get("permission_required"),
                "input_fields": sorted((t.input_schema.get("properties") or {}).keys()),
            })
        return {
            "tools": tools,
            "registered": len(tools),
            "all_read_only": all(t["permission"] == "read" for t in tools) if tools else None,
            "scope_policy": {
                "denied_reason": SCOPE_DENIED_REASON,
                "explanation": ("The telemetry surface may only call tools in the telemetry scope; any "
                                "other tool call is denied and audited. Telemetry registers read tools "
                                "only — there is no telemetry write path."),
                "scope": sorted(TELEMETRY_TOOL_NAMES),
            },
            "null_reason": None if tools else "mcp_registry_unavailable",
        }
    except Exception as exc:  # noqa: BLE001
        raise _to_http(exc)


@router.post("/mcp/check")
def mcp_check(req: McpCheckRequest):
    """Live demo of the telemetry scope policy through the real audited executor. An out-of-scope
    tool returns the NAMED policy reason (tool_not_in_telemetry_scope) with a denied audit receipt;
    an in-scope read tool runs through execute_tool (JSON-Schema validation + audit). Read-only."""
    ctx = McpContext(actor="telemetry_demo", token_valid=True,
                     resolved_scope={"business_id": str(req.business_id)})
    try:
        res = telemetry_scoped_call(req.tool_name, dict(req.input or {}), ctx)
        return {
            "allowed": bool(res.get("allowed")),
            "tool_name": req.tool_name,
            "null_reason": res.get("null_reason"),
            "policy": res.get("policy"),
            "output_present": bool(res.get("output")),
        }
    except Exception as exc:  # noqa: BLE001
        raise _to_http(exc)


# ── Stream lineage / provenance (Ticket 4) ──────────────────────────────────────────────────────────
# Read-only contract over the 10034 serving slice (tel_stream_kafka_rows / _triage_events). Proves
# Kafka detection -> AI triage -> Databricks lake (where mapped) -> Postgres serving row. Fail-closed:
# missing layers return an explicit status + null_reason; no fabricated offsets/triage/Delta pointers.

@router.get("/stream/kafka/rows")
def stream_kafka_rows(env_id: str = Query(...), business_id: UUID = Query(...),
                      kind: str | None = Query(default=None),
                      limit: int = Query(default=50, ge=1, le=200)):
    """Recent rows from tel_stream_kafka_rows (newest first). Optional record_kind filter; bounded limit."""
    from app.services import telemetry_stream_lineage as lineage
    try:
        return lineage.list_kafka_rows(env_id=env_id, business_id=business_id, kind=kind, limit=limit)
    except Exception as exc:  # noqa: BLE001
        raise _to_http(exc)


@router.get("/stream/kafka/provenance/{row_id}")
def stream_kafka_provenance(row_id: UUID, env_id: str = Query(...), business_id: UUID = Query(...)):
    """A single kafka row plus its provenance layers. Fail-closed if the row is absent."""
    from app.services import telemetry_stream_lineage as lineage
    try:
        return lineage.get_provenance(env_id=env_id, business_id=business_id, row_id=row_id)
    except Exception as exc:  # noqa: BLE001
        raise _to_http(exc)


@router.get("/stream/kafka/triage/latest")
def stream_kafka_triage_latest(env_id: str = Query(...), business_id: UUID = Query(...),
                               limit: int = Query(default=50, ge=1, le=200)):
    """Latest triage records from tel_stream_triage_events (newest first)."""
    from app.services import telemetry_stream_lineage as lineage
    try:
        return lineage.latest_triage(env_id=env_id, business_id=business_id, limit=limit)
    except Exception as exc:  # noqa: BLE001
        raise _to_http(exc)


@router.get("/stream/kafka/triage/{anomaly_id}")
def stream_kafka_triage_by_anomaly(anomaly_id: str, env_id: str = Query(...),
                                   business_id: UUID = Query(...)):
    """Triage for one anomaly. Returns status=not_available + null_reason=triage_not_emitted when none."""
    from app.services import telemetry_stream_lineage as lineage
    try:
        return lineage.triage_for_anomaly(env_id=env_id, business_id=business_id, anomaly_id=anomaly_id)
    except Exception as exc:  # noqa: BLE001
        raise _to_http(exc)


@router.get("/stream/lineage/anomaly/{anomaly_id}")
def stream_lineage_anomaly(anomaly_id: str, env_id: str = Query(...), business_id: UUID = Query(...)):
    """Combined lineage for one anomaly: kafka_detection -> agent_triage -> databricks_lake ->
    postgres_serving. Each layer fails closed with an explicit status + null_reason."""
    from app.services import telemetry_stream_lineage as lineage
    try:
        return lineage.anomaly_lineage(env_id=env_id, business_id=business_id, anomaly_id=anomaly_id)
    except Exception as exc:  # noqa: BLE001
        raise _to_http(exc)
