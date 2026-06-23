"""Stargate bridge route surface — the four SSE/JSON endpoints + the standalone
laptop app factory.

Two consumers share this:
  - The Railway backend mounts `router` behind STARGATE_BRIDGE_ENABLED
    (app/main.py); its lifespan builds the BridgeState and stashes it at
    `app.state.stargate_bridge`.
  - The laptop wrapper (scripts/streaming/stargate/bridge.py) calls
    `create_app()` for `uvicorn bridge:app`.

Paths stay at /stargate/* (not the repo's /api/{domain} convention) so the one
frontend hook works against both the laptop wrapper and the Railway origin.

Import purity mirrors the core: stdlib + anyio + fastapi only. No app.config /
app.observability (config hard-exits without DATABASE_URL; the laptop venv has
none). The mount in main.py is what gates this on the shared backend.
"""

from __future__ import annotations

import json
import time

import anyio
from fastapi import APIRouter, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from app.services.stargate_bridge import (
    FRAME_INTERVAL_S,
    MAX_POINTS_PER_PRINTER,
    BridgeState,
    downsample_per_printer,
    fixture_path,
    initialize,
    load_fixture_lines,
    replay_capture_forever,
    resolve_autoplay,
    resolve_mode,
)

router = APIRouter(tags=["stargate-bridge"])


def _state(request: Request) -> BridgeState:
    state = getattr(request.app.state, "stargate_bridge", None)
    if state is None:
        raise HTTPException(status_code=503, detail="stargate bridge not initialized")
    return state


@router.get("/stargate/health")
def health(request: Request) -> dict:
    return _state(request).health()


@router.get("/stargate/snapshot")
def snapshot(request: Request) -> dict:
    return _state(request).snapshot()


@router.get("/stargate/dlq")
def dlq(request: Request) -> dict:
    state = _state(request)
    return {"count": len(state.rings["dlq"]), "items": state.rings["dlq"].tail(100)}


@router.post("/stargate/replay/cycle")
async def replay_cycle(request: Request) -> dict:
    """(Re)start the recorded-capture replay loop. Capture mode only.

    The bridge preloads the fixture at boot, but the wall-clock replay task can
    be absent or finished, which leaves the dashboard at "Waiting for stream…".
    This (re)starts ``replay_capture_forever`` so fresh frames flow again. It is
    capture-mode only — broker modes (local/cloud) own their own producer, so we
    fail closed with 409 rather than fabricate a live feed. This never implies a
    live printer: the payload is labeled ``source: recorded_capture``.
    """
    import asyncio

    state = _state(request)
    if state.mode != "capture":
        raise HTTPException(
            status_code=409,
            detail=f"replay/cycle is capture-mode only; bridge mode is '{state.mode}'",
        )
    app_state = request.app.state
    lines = getattr(app_state, "stargate_capture_lines", None)
    if not lines:
        lines = load_fixture_lines(fixture_path())
        app_state.stargate_capture_lines = lines
    old = getattr(app_state, "stargate_autoplay_task", None)
    if old is not None and not old.done():
        old.cancel()
        try:
            await old
        except BaseException:
            pass
    task = asyncio.create_task(replay_capture_forever(state, lines))
    app_state.stargate_autoplay_task = task
    return {
        "ok": True,
        "mode": state.mode,
        "status": "replay_started",
        "source": "recorded_capture",
        "frames": len(lines),
    }


@router.get("/stargate/stream")
async def stream(request: Request, frames: int = 0):
    """SSE. ``frames`` caps emitted frames (tests/curl); 0 = until disconnect."""
    state = _state(request)
    mode = state.mode

    async def gen():
        cursors = {name: 0 for name in state.rings}
        # initial frame: full snapshot so the dashboard paints instantly
        snap = state.snapshot()
        for name in cursors:
            _, cursors[name] = state.rings[name].since(0)
        yield f"data: {json.dumps({'type': 'snapshot', **snap}, separators=(',', ':'))}\n\n"
        emitted = 1
        while not frames or emitted < frames:
            if await request.is_disconnected():
                return
            await anyio.sleep(FRAME_INTERVAL_S)
            frame: dict = {"type": "delta", "server_ts_ms": int(time.time() * 1000), "mode": mode}
            for name in ("telemetry", "agg", "anomalies", "dlq"):
                fresh, cursors[name] = state.rings[name].since(cursors[name])
                frame[name] = (
                    downsample_per_printer(fresh, MAX_POINTS_PER_PRINTER)
                    if name == "telemetry" else fresh
                )
            frame["dlq_count"] = len(state.rings["dlq"])
            frame["health"] = state.health()
            yield f"data: {json.dumps(frame, separators=(',', ':'))}\n\n"
            emitted += 1

    return StreamingResponse(gen(), media_type="text/event-stream", headers={
        "Cache-Control": "no-cache", "X-Accel-Buffering": "no",
    })


def create_app() -> FastAPI:
    """Standalone laptop app (uvicorn bridge:app). Env is read at call time, not
    import time, so per-test create_app() with monkeypatched env stays
    deterministic. Permissive CORS is fine standalone (no credentials)."""
    from contextlib import asynccontextmanager

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        state = BridgeState(resolve_mode())
        app.state.stargate_bridge = state
        app.state.stargate_capture_lines = None
        app.state.stargate_autoplay_task = None
        lines = initialize(state)
        if lines is not None:
            app.state.stargate_capture_lines = lines
            if resolve_autoplay():
                import asyncio

                app.state.stargate_autoplay_task = asyncio.create_task(
                    replay_capture_forever(state, lines)
                )
        try:
            yield
        finally:
            # The replay/cycle endpoint may have replaced this task; cancel
            # whatever is current on app.state.
            task = getattr(app.state, "stargate_autoplay_task", None)
            if task is not None:
                task.cancel()
                try:
                    await task
                except BaseException:
                    pass

    app = FastAPI(title="stargate-bridge", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware, allow_origins=["*"], allow_methods=["GET", "POST"], allow_headers=["*"],
    )
    app.include_router(router)
    return app
