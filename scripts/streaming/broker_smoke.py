#!/usr/bin/env python3
"""Phase 3B smoke: prove publish -> cloud broker -> consume -> BigQuery sink.

Round-trips one execution.completed event through a real Kafka-compatible broker
(Confluent Cloud or local Redpanda), then runs the consumed bytes through the
EXISTING sink path (process_message), and queries the BigQuery receipt back.

This proves the full Phase 3B path with no new streaming abstraction:

    publish_event(...)            # app.events.publisher, unchanged
      -> Kafka broker             # confluent-kafka Producer (transport.py)
      -> consume                  # confluent-kafka Consumer (this script only)
      -> sink.process_message     # app.events.sink, unchanged
      -> BigQuery raw row         # winston_events_raw.events
      -> query by run_id          # acceptance receipt

The consumer lives only in this script — the production sink worker that owns a
long-running consumer loop is a later phase (GKE, Phase 4). Here we consume just
enough to prove the wire path end to end.

Env (none committed; export locally):

  # Broker (Confluent Cloud):
  EVENTS_ENABLED=true
  EVENTS_BROKER_URL=pkc-xxxxx.region.provider.confluent.cloud:9092
  EVENTS_SECURITY_PROTOCOL=SASL_SSL
  EVENTS_SASL_MECHANISM=PLAIN
  EVENTS_SASL_USERNAME=<confluent api key>
  EVENTS_SASL_PASSWORD=<confluent api secret>

  # Broker (local Redpanda) — leave the SASL vars unset:
  EVENTS_ENABLED=true
  EVENTS_BROKER_URL=localhost:9092

  # BigQuery sink (optional — omit to prove broker round-trip only):
  BQ_ENABLED=true
  BQ_PROJECT_ID=<gcp project>
  # ADC: gcloud auth application-default login

Usage:
  python scripts/streaming/broker_smoke.py
  python scripts/streaming/broker_smoke.py --no-bq    # broker round-trip only
"""

from __future__ import annotations

import sys
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

_BACKEND = Path(__file__).resolve().parents[2] / "backend"
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from app.events import EventEnvelope, Topics, publish_event  # noqa: E402
from app.events import config as events_config  # noqa: E402
from app.events import transport as _transport  # noqa: E402


def _sep() -> None:
    print("-" * 60)


def _consumer_config() -> dict[str, object]:
    """Consumer config mirroring the producer's broker + security settings."""
    cfg: dict[str, object] = {
        "bootstrap.servers": events_config.EVENTS_BROKER_URL,
        "group.id": f"phase3b-smoke-{uuid4()}",
        "auto.offset.reset": "earliest",
        "enable.auto.commit": False,
    }
    cfg.update(events_config.producer_security_config())
    return cfg


def main() -> int:
    no_bq = "--no-bq" in sys.argv

    print("Winston Event Streaming -- Phase 3B broker round-trip smoke")
    _sep()

    transport = _transport.get_transport()
    print(f"transport         = {transport.name}")
    print(f"broker            = {events_config.EVENTS_BROKER_URL or '(unset)'}")
    print(f"security.protocol = {events_config.EVENTS_SECURITY_PROTOCOL}")
    if events_config.EVENTS_SECURITY_PROTOCOL != "PLAINTEXT":
        print(f"sasl.mechanism    = {events_config.EVENTS_SASL_MECHANISM}")
        print(f"sasl.username     = {events_config.EVENTS_SASL_USERNAME[:6]}... (redacted)")

    if transport.name == "noop":
        print("\nNOOP: no broker configured. Set EVENTS_ENABLED=true + EVENTS_BROKER_URL.")
        print("Nothing was published. This is the CI / no-broker path.")
        _sep()
        return 0

    # Build one execution.completed envelope.
    run_id = str(uuid4())
    business_id = uuid4()
    envelope = EventEnvelope(
        event_type="execution.completed",
        idempotency_key=f"execution.completed:{run_id}",
        occurred_at=datetime.now(timezone.utc),
        run_id=run_id,
        business_id=business_id,
        source_service="broker_smoke",
        payload={"status": "completed", "execution_type": "phase3b_smoke"},
    )
    wire = envelope.to_wire()

    print("\nEnvelope:")
    print(f"  event_id  = {envelope.event_id}")
    print(f"  run_id    = {run_id}")
    print(f"  topic     = {Topics.EXECUTIONS}")
    print(f"  wire_bytes= {len(wire)}")
    _sep()

    # Step 1: publish through the real broker (best-effort, never raises).
    print(f"Publishing to {Topics.EXECUTIONS} via {transport.name} ...")
    accepted = publish_event(Topics.EXECUTIONS, envelope)
    print(f"published = {accepted}")
    if not accepted:
        print("FAILED: publish not accepted by the live transport.", file=sys.stderr)
        return 1
    _sep()

    # Step 2: consume the same record back off the broker.
    print("Consuming from broker to confirm the round-trip ...")
    try:
        from confluent_kafka import Consumer  # noqa: PLC0415
    except ImportError:
        print("confluent-kafka not installed. pip install confluent-kafka>=2.3", file=sys.stderr)
        return 1

    consumer = Consumer(_consumer_config())
    consumer.subscribe([Topics.EXECUTIONS])

    consumed: bytes | None = None
    deadline_polls = 60  # ~30s at 0.5s poll
    try:
        for _ in range(deadline_polls):
            msg = consumer.poll(0.5)
            if msg is None:
                continue
            if msg.error():
                print(f"  consumer error: {msg.error()}")
                continue
            value = msg.value()
            # Match our event by run_id so we ignore unrelated traffic on the topic.
            if value and run_id.encode() in value:
                consumed = value
                break
    finally:
        consumer.close()

    if consumed is None:
        print("FAILED: did not consume the published event within the poll window.", file=sys.stderr)
        return 1
    print(f"consumed  = {len(consumed)} bytes (run_id matched)")
    _sep()

    if no_bq:
        print("Broker round-trip PASS (--no-bq: skipped BigQuery sink).")
        _sep()
        return 0

    # Step 3: run consumed bytes through the EXISTING sink path.
    from app.events import sink  # noqa: PLC0415

    print(f"BQ_ENABLED    = {sink.BQ_ENABLED}")
    print(f"BQ_PROJECT_ID = {sink.BQ_PROJECT_ID or '(unset)'}")
    if not sink.BQ_ENABLED:
        print("\nBQ_ENABLED=false: broker round-trip proven; BigQuery write skipped.")
        print("Set BQ_ENABLED=true + BQ_PROJECT_ID to complete the receipt.")
        _sep()
        return 0

    print("Running sink.process_message() on the consumed bytes ...")
    result = sink.process_message(consumed)
    print(f"result = {result}")
    if result["status"] != "ok":
        print(f"FAILED: sink returned status={result['status']}", file=sys.stderr)
        return 1
    _sep()

    # Step 4: query the BigQuery receipt back.
    print("Querying BigQuery for the acceptance receipt ...")
    table_fqn = f"`{sink.BQ_PROJECT_ID}.{sink.BQ_DATASET}.{sink.BQ_TABLE}`"
    query = (
        f"SELECT event_id, event_type, run_id, source, ingested_at, dead_letter\n"
        f"  FROM {table_fqn}\n"
        f" WHERE run_id = '{run_id}'\n"
        f" ORDER BY ingested_at DESC LIMIT 5"
    )
    print(f"\n{query}\n")
    try:
        from google.cloud import bigquery  # noqa: PLC0415
        client = bigquery.Client(project=sink.BQ_PROJECT_ID)
        rows = list(client.query(query).result())
    except Exception as exc:
        print(f"BQ query failed: {exc}", file=sys.stderr)
        return 1

    if not rows:
        print("WARNING: 0 rows (streaming insert propagation lag). Re-run the query above.")
        _sep()
        return 0

    print("Acceptance receipt:")
    _sep()
    for r in rows:
        print(f"  event_id    = {r['event_id']}")
        print(f"  event_type  = {r['event_type']}")
        print(f"  run_id      = {r['run_id']}")
        print(f"  source      = {r['source']}")
        print(f"  ingested_at = {r['ingested_at']}")
        print(f"  dead_letter = {r['dead_letter']}")
    _sep()
    print(f"Phase 3B PASS: {len(rows)} row(s) for run_id={run_id} "
          f"(published via {transport.name} -> consumed -> sink -> BigQuery).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
