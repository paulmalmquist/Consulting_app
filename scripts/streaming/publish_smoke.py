#!/usr/bin/env python3
"""Phase 1 smoke test: publish one execution event end-to-end.

Run from the repo root:

    # No-op proof (nothing exported) — publishes nothing, exits 0:
    python scripts/streaming/publish_smoke.py

    # Real publish (broker up + client installed):
    EVENTS_ENABLED=true EVENTS_BROKER_URL=localhost:9092 \
        python scripts/streaming/publish_smoke.py

Prints which transport resolved (kafka|noop), the wire bytes, and whether the
publish was accepted. This is the manual proof that the backbone works without
touching any database or production behavior.
"""

from __future__ import annotations

import sys
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

# Make the backend package importable when run from the repo root.
_BACKEND = Path(__file__).resolve().parents[2] / "backend"
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from app.events import EventEnvelope, Topics, publish_event  # noqa: E402
from app.events import transport as _transport  # noqa: E402


def main() -> int:
    run_id = str(uuid4())
    envelope = EventEnvelope(
        event_type="execution.completed",
        idempotency_key=f"execution.completed:{run_id}",
        occurred_at=datetime.now(timezone.utc),
        run_id=run_id,
        source_service="publish_smoke",
        payload={"status": "completed", "smoke": True},
    )

    transport = _transport.get_transport()
    wire = envelope.to_wire()

    print(f"transport={transport.name}")
    print(f"topic={Topics.EXECUTIONS}")
    print(f"run_id={run_id}")
    print(f"wire_bytes={len(wire)}")
    print(wire.decode("utf-8"))

    accepted = publish_event(Topics.EXECUTIONS, envelope)
    print(f"published={accepted}")

    if transport.name == "noop":
        print("NOOP: no broker configured — nothing was published (this is the CI path).")
    elif accepted:
        print(f"OK: published to {Topics.EXECUTIONS}; check the Redpanda console at :8080.")
    else:
        print("WARN: transport is live but the publish was not accepted.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
