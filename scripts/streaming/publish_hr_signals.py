#!/usr/bin/env python3
"""Phase 5A: publish a History Rhymes signal bundle to the HR topic.

Builds a small synthetic HR signal bundle (1-2 signals), maps it to per-signal
EventEnvelopes via app.events.hr_signal_publisher, and publishes them to
history-rhymes.signals.v1. The existing GKE sink worker drains them into
BigQuery winston_events_raw.events.

Uses a dedicated producer with a FULL flush (producer.flush(30)) + delivery
callback, because the bounded best-effort flush (EVENTS_PUBLISH_TIMEOUT_MS=200)
is too short to ack a produce to Confluent Cloud from a developer machine — the
record would never reach the broker (Phase 4 lesson, docs/tips.md).

Env (same broker config as the rest of the backbone):
  EVENTS_BROKER_URL, EVENTS_SECURITY_PROTOCOL, EVENTS_SASL_MECHANISM,
  EVENTS_SASL_USERNAME, EVENTS_SASL_PASSWORD

Usage:
  python scripts/streaming/publish_hr_signals.py [--as-of YYYY-MM-DD]
"""

from __future__ import annotations

import sys
from datetime import datetime, timezone
from pathlib import Path

_BACKEND = Path(__file__).resolve().parents[2] / "backend"
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from app.events import config as events_config  # noqa: E402
from app.events.hr_signal_publisher import bundle_to_envelopes  # noqa: E402
from app.events.topics import Topics  # noqa: E402


def _synthetic_bundle(as_of_date: str) -> dict:
    """A minimal HR bundle — two of the eight signals, real-ish shape."""
    now = datetime.now(timezone.utc).isoformat()
    return {
        "as_of_date": as_of_date,
        "source": "manual_json_bundle",
        "staleness_status": "fresh",
        "signals": {
            "yield_curve_10y2y": {
                "signal_value": -0.42,
                "signal_timestamp": now,
                "units": "pct",
                "confidence": 0.86,
            },
            "credit_spread_hy": {
                "signal_value": 3.15,
                "signal_timestamp": now,
                "units": "pct",
                "confidence": 0.79,
            },
        },
    }


def main() -> int:
    as_of = "2026-06-13"
    if "--as-of" in sys.argv:
        as_of = sys.argv[sys.argv.index("--as-of") + 1]

    bundle = _synthetic_bundle(as_of)
    envelopes = bundle_to_envelopes(bundle)

    print("History Rhymes signal ingestion — Phase 5A publish")
    print("-" * 60)
    print(f"topic     = {Topics.HISTORY_RHYMES_SIGNALS}")
    print(f"as_of     = {as_of}")
    print(f"signals   = {len(envelopes)}")
    print(f"broker    = {events_config.EVENTS_BROKER_URL or '(unset)'}")
    print("-" * 60)

    if not events_config.EVENTS_BROKER_URL:
        print("No broker configured — printing envelopes only (no publish).")
        for env in envelopes:
            print(env.to_wire().decode())
        return 0

    try:
        from confluent_kafka import Producer  # noqa: PLC0415
    except ImportError:
        print("confluent-kafka not installed.", file=sys.stderr)
        return 1

    conf = {"bootstrap.servers": events_config.EVENTS_BROKER_URL}
    conf.update(events_config.producer_security_config())
    producer = Producer(conf)

    results: list[dict] = []

    def _cb(err, msg):
        results.append({
            "err": str(err) if err else None,
            "partition": msg.partition() if msg else None,
            "offset": msg.offset() if msg else None,
        })

    for env in envelopes:
        producer.produce(
            Topics.HISTORY_RHYMES_SIGNALS,
            key=env.idempotency_key,
            value=env.to_wire(),
            callback=_cb,
        )
    producer.flush(30)  # full flush — wait for acks

    ok = 0
    for env, res in zip(envelopes, results):
        name = env.payload.get("signal_name")
        if res["err"] is None:
            ok += 1
            print(f"  delivered {name}: event_id={env.event_id} "
                  f"partition={res['partition']} offset={res['offset']}")
        else:
            print(f"  FAILED {name}: {res['err']}", file=sys.stderr)

    print("-" * 60)
    print(f"delivered {ok}/{len(envelopes)} HR signal events to {Topics.HISTORY_RHYMES_SIGNALS}")
    print("run_id =", envelopes[0].run_id if envelopes else "(none)")
    return 0 if ok == len(envelopes) else 1


if __name__ == "__main__":
    raise SystemExit(main())
