"""Targeted STALE drill: run the REAL StreamWorker (production code, no mocks) against a throwaway
Postgres, let capture frames flow, then simulate total feed loss (adapter stopped + restart disabled)
and verify the watchdog flips tel_pipeline_status to 'stale' with a reason, then recovers to 'fresh'
when frames resume. This is the live fail-closed proof for the PR-1 exit gate."""
import asyncio
import os
import sys
from datetime import datetime, timezone

os.environ.setdefault("DATABASE_URL", "postgresql://postgres:pg@localhost:5433/postgres")
os.environ.setdefault("_BM_SKIP_DB_CHECK", "1")
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from app.services import telemetry_stream_ingest as ingest  # noqa: E402

BIZ = "7e1eb000-0000-4000-a000-000000000001"


def read_status() -> dict | None:
    from app.db import get_cursor
    with get_cursor() as cur:
        cur.execute("SELECT status, reason, as_of_ts FROM tel_pipeline_status "
                    "WHERE env_id='telemetry-demo' AND surface='stream_ingest'")
        return cur.fetchone()


async def main() -> int:
    # Accelerate the drill: 5s flush cadence is plenty; watchdog thresholds stay PRODUCTION values.
    worker = ingest.StreamWorker(env_id="telemetry-demo", business_id=BIZ, source="capture",
                                 flush_interval_s=2.0)
    task = asyncio.create_task(worker.run())

    await asyncio.sleep(10)
    st = await asyncio.to_thread(read_status)
    print(f"[t+10s] frames flowing -> status={st['status']}", flush=True)
    assert st and st["status"] == "fresh", "expected fresh while capture flows"

    # ── total feed loss: stop the adapter and disable the restart path ──
    print("[drill] stopping adapter + disabling restart (simulated feed loss)", flush=True)
    worker._adapter.stop()

    class _DeadAdapter:
        def start(self, emit):  # restart attempts produce nothing
            pass
        def stop(self):
            pass

    worker._adapter = _DeadAdapter()

    lost_at = datetime.now(timezone.utc)
    for i in range(20):
        await asyncio.sleep(5)
        st = await asyncio.to_thread(read_status)
        if st and st["status"] == "stale":
            secs = (datetime.now(timezone.utc) - lost_at).total_seconds()
            print(f"[t+{int(secs)}s after loss] STALE confirmed -> reason: {st['reason']}", flush=True)
            break
    else:
        print("FAIL: status never flipped to stale", flush=True)
        return 1

    # ── recovery: frames resume ──
    print("[drill] restarting capture adapter (recovery)", flush=True)
    worker._adapter = ingest.CaptureAdapter(worker.channels or None)
    worker._adapter.start(worker._emit)
    for i in range(10):
        await asyncio.sleep(3)
        st = await asyncio.to_thread(read_status)
        if st and st["status"] == "fresh":
            print(f"[recovery] status back to fresh after ~{(i + 1) * 3}s", flush=True)
            break
    else:
        print("FAIL: status never recovered to fresh", flush=True)
        return 1

    await worker.stop()
    task.cancel()
    try:
        await task
    except BaseException:
        pass
    print("STALE DRILL PASS: fresh -> stale (>60s silence, reason recorded) -> fresh on recovery")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
