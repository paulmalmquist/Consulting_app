"""Phase 3A smoke: prove a real BigQuery raw event write.

Builds one execution.completed EventEnvelope, runs it through the sink's
process_message() path with BQ_ENABLED=true, and queries the receipt back.
Prints the acceptance receipt row so the result is verifiable without a UI.

No Kafka broker required — the envelope is handed directly to the sink, not
consumed from a topic. This proves the BQ write path independently.

Usage (credentials required):
  export BQ_ENABLED=true
  export BQ_PROJECT_ID=your-gcp-project
  export BQ_DATASET=winston_events_raw   # default
  export BQ_TABLE=events                  # default
  # Credential options (pick one):
  #   a) Application Default Credentials: run `gcloud auth application-default login`
  #   b) Service account key: export GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json

  python scripts/streaming/bq_smoke.py

Without credentials (or BQ_ENABLED=false):
  python scripts/streaming/bq_smoke.py
  # → prints "BQ_ENABLED=false — no write performed (no-op path)"
"""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from uuid import uuid4

# Make backend/app importable when run from repo root.
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "backend"))

from app.events.envelope import EventEnvelope
from app.events.sink import (
    BQ_DATASET,
    BQ_ENABLED,
    BQ_PROJECT_ID,
    BQ_TABLE,
    process_message,
)


def _separator() -> None:
    print("-" * 60)


def main() -> int:
    print("Winston Event Streaming — Phase 3A BigQuery smoke")
    _separator()

    print(f"BQ_ENABLED    = {BQ_ENABLED}")
    print(f"BQ_PROJECT_ID = {BQ_PROJECT_ID or '(unset)'}")
    print(f"BQ_DATASET    = {BQ_DATASET}")
    print(f"BQ_TABLE      = {BQ_TABLE}")

    if not BQ_ENABLED:
        print("\nBQ_ENABLED=false — no write performed (no-op path).")
        print("Set BQ_ENABLED=true + BQ_PROJECT_ID to run a real write.")
        _separator()
        return 0

    if not BQ_PROJECT_ID:
        print("\nERROR: BQ_PROJECT_ID is not set. Export it and retry.")
        return 1

    # Build a synthetic execution.completed envelope.
    run_id = str(uuid4())
    business_id = uuid4()
    envelope = EventEnvelope(
        event_type="execution.completed",
        idempotency_key=f"execution.completed:{run_id}",
        occurred_at=datetime.now(timezone.utc),
        run_id=run_id,
        business_id=business_id,
        source_service="backend",
        payload={"status": "completed", "execution_type": "smoke_test"},
    )

    print("\nEnvelope built:")
    print(f"  event_id        = {envelope.event_id}")
    print(f"  event_type      = {envelope.event_type}")
    print(f"  idempotency_key = {envelope.idempotency_key}")
    print(f"  run_id          = {run_id}")
    print(f"  business_id     = {business_id}")
    _separator()

    # Run through process_message — same path as a real Kafka consumer.
    raw_bytes = envelope.to_wire()
    print(f"Wire bytes ({len(raw_bytes)} bytes):")
    print(f"  {raw_bytes.decode()}")
    _separator()

    print("Running process_message() → validate → map → write_row_to_bq ...")
    result = process_message(raw_bytes)
    print(f"Result: {json.dumps(result, indent=2)}")
    _separator()

    if result["status"] != "ok":
        print(f"FAILED: process_message returned status={result['status']}")
        print(f"Reason: {result.get('reason', '(none)')}")
        return 1

    # Query back the row to produce the acceptance receipt.
    print("Querying BigQuery for acceptance receipt ...")
    table_fqn = f"`{BQ_PROJECT_ID}.{BQ_DATASET}.{BQ_TABLE}`"
    query = (
        f"SELECT event_id, idempotency_key, event_type, run_id,\n"
        f"       occurred_at, published_at, ingested_at,\n"
        f"       source, dead_letter, dead_letter_reason\n"
        f"  FROM {table_fqn}\n"
        f" WHERE run_id = '{run_id}'\n"
        f" ORDER BY ingested_at DESC\n"
        f" LIMIT 5"
    )
    print(f"\nAcceptance query:\n{query}\n")

    try:
        from google.cloud import bigquery  # noqa: PLC0415
        client = bigquery.Client(project=BQ_PROJECT_ID)
        rows = list(client.query(query).result())
    except ImportError:
        print("google-cloud-bigquery not installed — cannot query back.")
        print("Install with: pip install google-cloud-bigquery>=3.11")
        return 1
    except Exception as exc:
        print(f"BQ query failed: {exc}")
        return 1

    if not rows:
        print("WARNING: query returned 0 rows. BQ streaming inserts have a short")
        print("propagation delay (~seconds). Wait and re-run the acceptance query.")
        _separator()
        print("\nManual acceptance query (run in BigQuery console or bq CLI):")
        print(query)
        return 0

    print("Acceptance receipt:")
    _separator()
    for row in rows:
        print(f"  event_id         = {row['event_id']}")
        print(f"  event_type       = {row['event_type']}")
        print(f"  idempotency_key  = {row['idempotency_key']}")
        print(f"  run_id           = {row['run_id']}")
        print(f"  occurred_at      = {row['occurred_at']}")
        print(f"  published_at     = {row['published_at']}")
        print(f"  ingested_at      = {row['ingested_at']}")
        print(f"  source           = {row['source']}")
        print(f"  dead_letter      = {row['dead_letter']}")
        print(f"  dead_letter_reason = {row['dead_letter_reason']}")
        print()

    _separator()
    print(f"Phase 3A PASS: {len(rows)} row(s) in {table_fqn} for run_id={run_id}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
